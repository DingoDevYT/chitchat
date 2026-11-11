// bot-api: the REST API external bots call with "Authorization: Bot <token>". Deployed with verify_jwt off: the token is the auth.
// Tokens are stored as SHA-256 hashes (public.plugin_secrets); every call goes through public.bot_auth (lookup + 120/min rate limit),
// and every action through a service-role-only public.bot_* function that re-checks the bot's permissions and rooms.
// Endpoint reference: docs/bot-api.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cleanCommands, cleanEmbeds, InvalidInput, sha256Hex } from '../plugin-runtime/shared.js'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}
const ok = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...CORS, 'content-type': 'application/json', ...extra } })
const Bad = InvalidInput

// Postgres error → HTTP. The bot_* functions raise with these codes on purpose.
function fromDb(e: { code?: string, message: string, hint?: string }) {
  if (e.code === 'P0002') return fail(404, 'not_found', e.message)
  if (e.code === '42501') return fail(403, e.hint === 'disabled' ? 'disabled' : 'forbidden', e.message)
  if (e.code === '22023' || e.code === '22001' || e.code === '23514' || e.code === '22P02') return fail(400, 'bad_request', e.message)
  if (e.code === 'P0001' && e.hint?.startsWith('slowmode')) return fail(429, 'slowmode', e.message)
  console.error('bot-api db error', e)
  return fail(500, 'server_error', 'Something went wrong on our side. Try again.')
}

async function readBody(req: Request) {
  const text = await req.text()
  if (text.length > 65536) throw new Bad('body is too big (64 KB max)')
  if (!text.trim()) return {}
  try { return JSON.parse(text) } catch { throw new Bad('body must be JSON') }
}

const id = /^\d{1,18}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const token = (req.headers.get('authorization') || '').replace(/^(Bot|Bearer)\s+/i, '').trim()
  if (!token.startsWith('ccb_')) return fail(401, 'unauthorized', 'Send your bot token as "Authorization: Bot ccb_...".')
  const { data: bot, error: authErr } = await db.rpc('bot_auth', { th: await sha256Hex(token) })
  if (authErr) {
    const wait = authErr.hint?.match(/^rate_limited:(\d+)/)?.[1]
    if (wait) return fail(429, 'rate_limited', `Too many requests. Try again in ${wait} s.`, { 'retry-after': wait })
    return fromDb(authErr)
  }
  if (!bot) return fail(401, 'unauthorized', 'That token is not valid (it may have been regenerated).')
  if (!bot.enabled) return fail(403, 'disabled', 'This bot is turned off in its server.')

  const path = new URL(req.url).pathname.replace(/^.*?\/bot-api/, '').replace(/\/+$/, '') || '/'
  const seg = path.split('/').filter(Boolean)
  const m = req.method
  const iid = bot.install_id
  const call = async (fn: string, args: Record<string, unknown>, status = 200) => {
    const { data, error } = await db.rpc(fn, { iid, ...args })
    return error ? fromDb(error) : ok(data ?? {}, status)
  }

  try {
    // GET /me
    if (m === 'GET' && path === '/me') return ok({
      id: bot.bot_user_id, username: bot.username, name: bot.name, install_id: iid,
      server: { id: bot.server_id, name: bot.server_name }, permissions: bot.permissions, events: bot.events,
    })
    // GET /rooms
    if (m === 'GET' && path === '/rooms') return call('bot_rooms', {})
    // GET /rooms/:id/messages?limit=&before=   ·   POST /rooms/:id/messages
    if (seg[0] === 'rooms' && uuid.test(seg[1] || '') && seg[2] === 'messages' && seg.length === 3) {
      if (m === 'GET') {
        const q = new URL(req.url).searchParams
        const before = q.get('before')
        if (before && !id.test(before)) throw new Bad('before must be a message id')
        return call('bot_messages', { cid: seg[1], lim: Math.min(Math.max(Number(q.get('limit')) || 50, 1), 100), before: before ? Number(before) : null })
      }
      if (m === 'POST') {
        const b = await readBody(req)
        if (b.content != null && typeof b.content !== 'string') throw new Bad('content must be text')
        if (b.reply_to != null && !id.test(String(b.reply_to))) throw new Bad('reply_to must be a message id')
        return call('bot_send', { cid: seg[1], body: b.content ?? '', emb: cleanEmbeds(b.embeds), reply: b.reply_to ?? null, inter: null }, 201)
      }
    }
    // PATCH /messages/:id   ·   DELETE /messages/:id
    if (seg[0] === 'messages' && id.test(seg[1] || '') && seg.length === 2) {
      if (m === 'PATCH') {
        const b = await readBody(req)
        if (b.content != null && typeof b.content !== 'string') throw new Bad('content must be text')
        return call('bot_edit', { mid: Number(seg[1]), body: b.content ?? null, emb: b.embeds === undefined ? null : cleanEmbeds(b.embeds) })
      }
      if (m === 'DELETE') {
        const { error } = await db.rpc('bot_delete', { iid, mid: Number(seg[1]) })
        return error ? fromDb(error) : ok(null, 204)
      }
    }
    // PUT|DELETE /messages/:id/reactions/:emoji
    if (seg[0] === 'messages' && id.test(seg[1] || '') && seg[2] === 'reactions' && seg[3] && seg.length === 4 && (m === 'PUT' || m === 'DELETE')) {
      const { error } = await db.rpc('bot_react', { iid, mid: Number(seg[1]), emo: decodeURIComponent(seg[3]), add: m === 'PUT' })
      return error ? fromDb(error) : ok(null, 204)
    }
    // POST /interactions/:id/reply
    if (m === 'POST' && seg[0] === 'interactions' && uuid.test(seg[1] || '') && seg[2] === 'reply' && seg.length === 3) {
      const b = await readBody(req)
      if (b.content != null && typeof b.content !== 'string') throw new Bad('content must be text')
      return call('bot_interaction_reply', { ix: seg[1], body: b.content ?? '', emb: cleanEmbeds(b.embeds), eph: !!b.ephemeral })
    }
    // GET /roles
    if (m === 'GET' && path === '/roles') return call('bot_roles', {})
    // PUT|DELETE /members/:user_id/roles/:role_id
    if (seg[0] === 'members' && uuid.test(seg[1] || '') && seg[2] === 'roles' && uuid.test(seg[3] || '') && seg.length === 4 && (m === 'PUT' || m === 'DELETE')) {
      const { error } = await db.rpc('bot_set_role', { iid, uid: seg[1], rid: seg[3], add: m === 'PUT' })
      return error ? fromDb(error) : ok(null, 204)
    }
    // GET /commands   ·   PUT /commands
    if (path === '/commands') {
      if (m === 'GET') {
        const { data, error } = await db.from('server_plugins').select('commands').eq('id', iid).single()
        return error ? fromDb(error) : ok(data.commands ?? [])
      }
      if (m === 'PUT') {
        const list = cleanCommands(await readBody(req))
        const { error } = await db.rpc('bot_set_commands', { iid, cmds: list })
        return error ? fromDb(error) : ok(list)
      }
    }
    return fail(404, 'not_found', `No endpoint ${m} ${path}. See the Bot API reference in the Chitchat docs.`)
  } catch (e) {
    if (e instanceof InvalidInput) return fail(400, 'bad_request', e.message)
    console.error('bot-api bug', e)
    return fail(500, 'server_error', 'Something went wrong on our side. Try again.')
  }
})
