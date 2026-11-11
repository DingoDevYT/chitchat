// plugin-runtime: runs plugins. Deployed with verify_jwt off because the database calls it too; each entry checks its own caller.
//   {type:'command', channel_id, install_id, name, options}  user's JWT     → a slash-command interaction (begin_interaction checks it)
//   {type:'event', server_id, targets:[{id,event}], data}    x-chitchat-secret (from public.plugin_dispatch via pg_net)
//   {type:'ping', install_id}                                manager's JWT  → test delivery to an external bot
// Built-ins live in ./plugins/*.js; external bots get signed POSTs (5 s timeout, retries for events, SSRF-checked).
// See docs/MAINTAINING.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkUrl, isIPLiteral, isPublicIP } from '../link-preview/safe.js'
import { checkOptions, cleanEmbeds, MAX_CONTENT, safeEqual, sign } from './shared.js'
import chef from './plugins/chef.js'
import custom from './plugins/custom.js'

const BUILTINS: Record<string, any> = { chef, 'custom-commands': custom }
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
class Blocked extends Error {}

let secret: string | null = null
async function runtimeSecret() {
  if (!secret) secret = (await db.rpc('plugin_runtime_secret')).data
  return secret
}

async function assertPublic(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const ips = isIPLiteral(host) ? [host] : (await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ])).flat()
  if (!ips.length || !ips.every(isPublicIP)) throw new Blocked('the webhook address points at a private network')
}

// One signed POST to an external bot. Returns the Response, or throws with a short reason.
// shortcut: fetch() re-resolves DNS after our check (same as link-preview); pin the IP if Deno's fetch ever allows it.
async function post(ctx: any, payload: unknown) {
  if (!ctx.plugin.webhook_url) throw new Blocked('no webhook address set')
  const u = checkUrl(ctx.plugin.webhook_url)
  if (u.protocol !== 'https:') throw new Blocked('webhook must be https')
  await assertPublic(u)
  const raw = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000).toString()
  return await fetch(u, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000), body: raw,
    headers: { 'content-type': 'application/json', 'user-agent': 'ChitchatBot/1.0 (+plugins)', 'x-chitchat-timestamp': ts,
      'x-chitchat-signature': 'sha256=' + await sign(ctx.signing_secret || '', ts, raw) },
  })
}

// Events retry (0 s, 1 s, 3 s); a slash command gets one try because someone is waiting.
async function deliver(ctx: any, payload: unknown, tries = 3) {
  let last = ''
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(i === 1 ? 1000 : 3000)
    try {
      const res = await post(ctx, payload)
      if (res.ok) { await db.rpc('plugin_result', { iid: ctx.install.id, err: null }); return res }
      last = `HTTP ${res.status}${res.status >= 300 && res.status < 400 ? ' (redirects are not followed)' : ''}`
      await res.body?.cancel()
      if (res.status < 500 && res.status !== 429) break // a 4xx won't fix itself by retrying
    } catch (e) {
      last = e instanceof Error && e.name === 'TimeoutError' ? 'no answer within 5 seconds' : e instanceof Error ? e.message : String(e)
      if (e instanceof Blocked) break
    }
  }
  await db.rpc('plugin_result', { iid: ctx.install.id, err: last })
  return null
}

async function readReply(res: Response | null) {
  if (!res || res.status === 202 || res.status === 204) return null
  const text = (await res.text()).slice(0, 65536)
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { return null }
}

// A plugin's answer → a message, or an ephemeral reply handed back to the caller.
async function respond(ctx: any, reply: any, room: string, extra: { reply_to?: number, inter?: string } = {}) {
  if (!reply || (typeof reply.content !== 'string' && !reply.embeds)) return null
  const content = String(reply.content ?? '').slice(0, MAX_CONTENT)
  const embeds = cleanEmbeds(reply.embeds)
  if (!content && !embeds.length) return null
  if (reply.ephemeral && extra.inter) return { ephemeral: { content, embeds } }
  const { data, error } = await db.rpc('bot_send', { iid: ctx.install.id, cid: room, body: content, emb: embeds,
    reply: reply.reply_to ?? extra.reply_to ?? null, inter: extra.inter ?? null })
  if (error) throw new Error(error.message)
  return { message: data }
}

const commandDef = (ctx: any) => (ctx.install.commands ?? ctx.plugin.commands ?? []).find((c: any) => c.name === ctx.interaction.command)

async function command(req: Request, body: any) {
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } })
  const { data: ix, error } = await asUser.rpc('begin_interaction', { cid: body.channel_id, iid: body.install_id, cmd: String(body.name ?? ''), opts: body.options ?? {} })
  if (error) return json({ error: error.message }, error.code === 'P0001' ? 429 : error.code === '42501' || /JWT|token/i.test(error.message) ? 403 : 400)
  const { data: ctx } = await db.rpc('plugin_context', { iid: null, ix })
  const def = ctx && commandDef(ctx)
  if (!def) return json({ error: 'That command is gone.' }, 404)
  const { options, error: bad } = checkOptions({ ...def, options: ctx.plugin.id === 'custom-commands' ? [{ name: 'text', type: 'string' }] : def.options }, ctx.interaction.options)
  if (bad) return json({ error: bad }, 400)
  const room = ctx.interaction.channel_id, inter = ctx.interaction.id
  const who = ctx.bot?.display_name || ctx.plugin.name

  try {
    if (ctx.plugin.kind === 'builtin') {
      const handler = BUILTINS[ctx.plugin.id]
      const reply = handler?.command({ name: def.name, def, options, config: ctx.install.config ?? {}, user: ctx.user, server: ctx.server, room: ctx.room, rng: Math.random })
      const out = await respond(ctx, reply, room, { inter })
      return json(out ?? { error: `${who} had nothing to say.` }, out ? 200 : 502)
    }
    const res = await deliver(ctx, {
      type: 'interaction', id: inter, install_id: ctx.install.id, command: def.name, options,
      user: ctx.user, room: ctx.room, server: ctx.server, sent_at: new Date().toISOString(),
    }, 1)
    if (!res) return json({ error: `${who} didn't answer in time. Try again in a bit.` }, 502)
    const reply = await readReply(res)
    if (!reply || reply.deferred) return json({ deferred: true, interaction_id: inter })
    return json((await respond(ctx, reply, room, { inter })) ?? { deferred: true, interaction_id: inter })
  } catch (e) {
    return json({ error: `${who} ran into a problem: ${e instanceof Error ? e.message : e}` }, 502)
  }
}

async function events(body: any) {
  for (const t of body.targets ?? []) {
    try {
      const { data: ctx } = await db.rpc('plugin_context', { iid: t.id, ix: null })
      if (!ctx?.install?.enabled) continue
      if (ctx.plugin.kind === 'builtin') {
        const reply = BUILTINS[ctx.plugin.id]?.event?.({ event: t.event, data: body.data, config: ctx.install.config ?? {}, bot: ctx.bot, server: ctx.server, rng: Math.random })
        const room = body.data?.message?.channel_id ?? body.data?.reaction?.channel_id
        if (reply && room) await respond(ctx, reply, room)
      } else {
        await deliver(ctx, { type: 'event', event: t.event, id: crypto.randomUUID(), install_id: ctx.install.id, server_id: body.server_id,
          data: body.data, sent_at: new Date().toISOString() })
      }
    } catch (e) {
      console.error('plugin event failed', t.id, e)
    }
  }
}

async function ping(req: Request, body: any) {
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } })
  const { data: mine } = await asUser.from('server_plugins').select('id').eq('id', body.install_id).maybeSingle() // RLS: managers only
  if (!mine) return json({ error: 'Bot not found.' }, 404)
  const { data: ctx } = await db.rpc('plugin_context', { iid: body.install_id, ix: null })
  if (ctx?.plugin?.kind !== 'webhook') return json({ error: 'Only external bots can be pinged.' }, 400)
  try {
    const res = await post(ctx, { type: 'ping', install_id: ctx.install.id, sent_at: new Date().toISOString() })
    await res.body?.cancel()
    await db.rpc('plugin_result', { iid: ctx.install.id, err: res.ok ? null : `ping: HTTP ${res.status}` })
    return json({ ok: res.ok, status: res.status })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? 'no answer within 5 seconds' : e instanceof Error ? e.message : String(e)
    await db.rpc('plugin_result', { iid: ctx.install.id, err: `ping: ${msg}` })
    return json({ ok: false, error: msg })
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }

  if (body?.type === 'event') {
    const s = await runtimeSecret()
    if (!s || !safeEqual(req.headers.get('x-chitchat-secret') || '', s)) return json({ error: 'forbidden' }, 403)
    // answer pg_net straight away; webhook retries can take a few seconds
    // @ts-ignore EdgeRuntime is a Supabase global
    EdgeRuntime.waitUntil(events(body))
    return json({ ok: true }, 202)
  }
  if (!(req.headers.get('authorization') || '').startsWith('Bearer ')) return json({ error: 'sign in first' }, 401)
  if (body?.type === 'command') return command(req, body)
  if (body?.type === 'ping') return ping(req, body)
  return json({ error: 'unknown request' }, 400)
})
