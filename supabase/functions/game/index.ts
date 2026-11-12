// game: the referee for stadium games (GAMES.md). Every write to games / game_seats / game_private / game_secret goes through here.
//   { action: 'create', channelId, game }            open a lobby (you sit in seat 0 and host)
//   { action: 'sit' | 'stand', gameId }               take / leave a seat (lobby or after a round)
//   { action: 'bot', gameId, level }                  fill the next empty seat with a Chitbot ('easy' | 'normal' | 'hard')
//   { action: 'unbot', gameId, seat }                 send a Chitbot away
//   { action: 'opts', gameId, opts }                  host: house rules for the next round
//   { action: 'start', gameId }                       host: deal (also "Again?" after a round)
//   { action: 'move', gameId, version, move }         your move; refused unless it's still `version`
//   { action: 'tick', gameId }                        anyone watching, once `deadline` passes: a timeout or a Chitbot's turn
//   { action: 'quit', gameId }                        leave the game, any state: mid-round a Normal Chitbot plays your seat out
//                                                      (src/games/away.js); between rounds it's `stand`
//   { action: 'leave', gameId }                       host or a server admin/mod: close the table, any state (anyone, once it's been idle 10 minutes)
// The rules are the same files the browser uses (src/games/*), bundled at deploy time: see src/games/README.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { GAMES } from '../../../src/games/registry.js'
import { awayOf, quitPlan, settleAway, standIns, withoutAway } from '../../../src/games/away.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
class Nope extends Error { constructor(msg: string, public status = 400) { super(msg) } }

const LEVELS = ['easy', 'normal', 'hard']
const botId = (seat: number) => `bot:${seat}`
const seatIdOf = (s: any) => s.user_id ?? botId(s.seat)
const isBot = (pid: string) => pid.startsWith('bot:')
const isUuid = (x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]
const botWait = () => 900 + Math.floor(Math.random() * 900) // feels like thinking

// The full rules state lives split across tables: pub (games.pub), human hands (game_private), the rest (game_secret).
function stateOf(row: any) {
  const sec = row.secret || {}
  return { pub: row.game.pub, priv: { ...row.priv, ...(sec.bots || {}) }, secret: sec.secret }
}

// Turns a new rules state into the game_save payload: public state, changed human hands, the secret (with bot hands).
// auto: away people a Chitbot is playing for (their turns get the bot's quick clock, not the turn timer).
function payload(R: any, old: any, next: any, seats: any[], extra: Record<string, unknown> = {}, auto: string[] = []) {
  const privs: Record<string, unknown> = {}, bots: Record<string, unknown> = {}
  for (const [pid, hand] of Object.entries(next.priv || {})) {
    if (isBot(pid)) bots[pid] = hand
    else if (JSON.stringify(hand) !== JSON.stringify(old?.priv?.[pid])) privs[pid] = hand
  }
  const won = R.over(next)
  const who = won ? null : R.turn(next)
  const ms = who == null ? null : R.delay?.(next) ?? (isBot(who) || auto.includes(who) ? botWait() : R.meta.turnMs)
  return {
    pub: next.pub, privs, secret: { secret: next.secret, bots },
    status: won ? 'done' : 'playing',
    deadline: ms == null ? null : new Date(Date.now() + ms).toISOString(),
    ...extra,
  }
}

async function handle(req: Request, body: any) {
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  const { data: { user } } = await asUser.auth.getUser(token)
  if (!user) throw new Nope('Sign in first.', 401)
  const uid = user.id
  const action = String(body?.action || '')

  if (action === 'create') {
    if (!isUuid(body.channelId) || !GAMES[body.game] || GAMES[body.game].meta.devOnly) throw new Nope('Unknown game.')
    await load(uid, null)
    if (!(await asUser.rpc('can_view_channel', { cid: body.channelId })).data) throw new Nope("You can't see that stadium.", 403)
    const { data, error } = await db.rpc('game_create', { uid, cid: body.channelId, gkind: body.game })
    if (error) throw new Nope(error.message, error.hint === 'busy' ? 409 : 400)
    if (body.game === 'pillow') await tidyCries(sweepCries())
    return { gameId: data }
  }

  if (!isUuid(body.gameId)) throw new Nope('Which table?')
  const row = await load(uid, body.gameId)
  if (!row) throw new Nope('That table is gone.', 404)
  const g = row.game
  if (!(await asUser.rpc('can_view_channel', { cid: g.channel_id })).data) throw new Nope("You can't see that stadium.", 403)
  const R = GAMES[g.game]
  const seats: any[] = row.seats
  const mine = seats.find(s => s.user_id === uid)
  const between = g.status !== 'playing'
  // Away people (left mid-round, src/games/away.js): their seats stay until the round ends; `auto` are the ones a Chitbot plays.
  const away = awayOf(g.opts), auto = standIns(R.meta, g.opts)
  const save = (p: Record<string, unknown>) => {
    if (p.status === 'done' && away.length) { const s = settleAway(seats, g.opts); p = { ...p, seats: plain(s.seats), opts: s.opts } }
    return saveRaw(p)
  }
  const saveRaw = (p: Record<string, unknown>) => db.rpc('game_save', { gid: g.id, ver: g.version, p }).then(({ data, error }) => {
    if (error) throw new Nope(error.hint === 'conflict' ? 'The table moved on. Try again.' : error.message, error.hint === 'conflict' ? 409 : 400)
    return { version: data }
  })
  const close = async () => {
    const { error } = await db.from('games').delete().eq('id', g.id)
    if (error) throw new Nope(error.message)
    if (g.game === 'pillow') await tidyCries(dropCries(g.id), sweepCries())
    return { closed: true }
  }
  const freeSeat = () => [...Array(R.meta.max).keys()].find(i => !seats.some(s => s.seat === i))
  const plain = (list: any[]) => list.map(s => ({ seat: s.seat, user_id: s.user_id, bot: s.bot }))

  switch (action) {
    case 'sit': {
      if (!between) throw new Nope('Wait for this round to finish.')
      if (mine) return { version: g.version }
      const seat = freeSeat()
      if (seat == null) throw new Nope('The table is full.')
      return save({ seats: plain([...seats, { seat, user_id: uid, bot: null }]) })
    }
    case 'stand': {
      if (!between) throw new Nope('Wait for this round to finish.')
      if (!mine) return { version: g.version }
      return save({ seats: plain(seats.filter(s => s !== mine)) })
    }
    case 'bot': {
      if (!between) throw new Nope('Wait for this round to finish.')
      if (R.meta.noBots) throw new Nope('This game has no Chitbots.')
      if (!mine) throw new Nope('Sit down first.')
      if (!LEVELS.includes(body.level)) throw new Nope('Easy, Normal or Hard?')
      const seat = freeSeat()
      if (seat == null) throw new Nope('The table is full.')
      return save({ seats: plain([...seats, { seat, user_id: null, bot: body.level }]) })
    }
    case 'unbot': {
      if (!between) throw new Nope('Wait for this round to finish.')
      if (!mine) throw new Nope('Sit down first.')
      return save({ seats: plain(seats.filter(s => !(s.bot && s.seat === body.seat))) })
    }
    case 'opts': {
      if (g.host_id !== uid) throw new Nope('Only the host sets house rules.', 403)
      if (!between) throw new Nope('Wait for this round to finish.')
      const o = body.opts || {}
      return save({ opts: Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z]{1,16}$/i.test(k) && typeof v === 'boolean').slice(0, 8)) })
    }
    case 'start': {
      if (g.host_id !== uid) throw new Nope('Only the host can start.', 403)
      if (!between) throw new Nope('Already playing.')
      const players = seats.map(seatIdOf)
      if (players.length < R.meta.min) throw new Nope(`${R.meta.name} needs at least ${R.meta.min} players.`)
      // Real-time games (meta.realtime: Midnight Chitchen) keep a game clock that follows the server's.
      const opts = withoutAway(g.opts)
      const next = R.setup(players, seed(), R.meta.realtime ? { ...opts, now: Date.now() } : opts)
      if (g.game === 'pillow') await tidyCries(dropCries(g.id))
      return save({ ...payload(R, null, next, seats), privs_reset: true, opts })
    }
    case 'move': {
      if (g.status !== 'playing') throw new Nope('No round is running.')
      if (!mine) throw new Nope("You're watching this one.", 403)
      if (away.includes(uid)) throw new Nope('You left this round. Sit down again after it.', 403)
      // Real-time games take moves from everyone at once, so a stale version is fine there: the rules check
      // everything, and game_save still refuses a write that raced another one. Their moves carry the server clock.
      if (body.version !== g.version && !R.meta.realtime) throw new Nope('The table moved on. Try again.', 409)
      const st = stateOf(row)
      let next
      try { next = R.move(st, uid, stamp(R, body.move)) } catch (e) { throw new Nope(e instanceof Error ? e.message : String(e)) }
      return save(payload(R, st, next, seats, {}, auto))
    }
    case 'tick': {
      if (g.status !== 'playing' || !g.deadline) return { version: g.version, idle: true }
      if (Date.now() < Date.parse(g.deadline)) return { version: g.version, early: true }
      const st = stateOf(row)
      const who = R.turn(st)
      let next
      if (isBot(who) || auto.includes(who)) {
        // A Chitbot, or one standing in for someone who left (Normal, playing from that person's own view and hand).
        const level = isBot(who) ? seats.find(s => botId(s.seat) === who)?.bot || 'normal' : 'normal'
        const a = R.bot?.(R.view(st, who), who, level, Math.random)
        try { next = R.move(st, who, stamp(R, a ?? R.timeout(st))) } catch { next = R.move(st, who, stamp(R, R.timeout(st))) }
      } else next = R.move(st, who, stamp(R, R.timeout(st)))
      return save(payload(R, st, next, seats, {}, auto))
    }
    case 'quit': {
      const plan = quitPlan({ status: g.status, seats, hostId: g.host_id, uid, away })
      if (plan.kind === 'none') return { version: g.version }
      if (plan.kind === 'close') return close()
      const p: Record<string, unknown> = plan.kind === 'stand'
        ? { seats: plain(plan.seats) }
        : { opts: { ...(g.opts || {}), away: plan.away } }
      // Quitting on your own turn in a turn-based game: the stand-in moves in a second instead of waiting out your timer.
      if (plan.kind === 'away' && !R.meta.noBots && !R.meta.realtime && g.deadline && R.turn(stateOf(row)) === uid) {
        p.deadline = new Date(Date.now() + botWait()).toISOString()
      }
      const r = await saveRaw(p)
      // game_save never touches host_id, so the referee (service role) hands the table over directly.
      if (plan.host) {
        const { error } = await db.from('games').update({ host_id: plan.host }).eq('id', g.id)
        if (error) console.warn('host handover', error)
      }
      return { ...r, quit: true }
    }
    case 'leave': {
      // The host, anyone once it's been idle 10 minutes, or a server admin/mod (Manage rooms / Manage messages), in any state.
      const idle = Date.now() - Date.parse(g.updated_at) > 10 * 60_000
      if (g.host_id !== uid && !idle && !(await isMod(asUser, g.channel_id))) throw new Nope('Only the host or a server admin can close the game.', 403)
      return close()
    }
  }
  throw new Nope('Unknown action.')
}

// Pillow Chit Fight battle cries live in the private 'battle-cries' bucket at <game id>/<owner>/<round>.<ext>
// (migration 040). They only matter while the table is open: the host closing it, a new round starting, or any new
// Pillow table sweeps them away. Storage objects can only be removed through the Storage API, hence here.
const CRIES = 'battle-cries'
async function dropCries(gid: string) {
  const files: string[] = []
  const { data: owners } = await db.storage.from(CRIES).list(gid, { limit: 100 })
  for (const o of owners || []) {
    const { data } = await db.storage.from(CRIES).list(`${gid}/${o.name}`, { limit: 100 })
    for (const f of data || []) files.push(`${gid}/${o.name}/${f.name}`)
  }
  if (files.length) await db.storage.from(CRIES).remove(files)
}
async function sweepCries() {
  const { data: dirs } = await db.storage.from(CRIES).list('', { limit: 100 })
  const ids = (dirs || []).map((d: any) => d.name).filter(isUuid)
  if (!ids.length) return
  const { data: live } = await db.from('games').select('id').in('id', ids)
  const keep = new Set((live || []).map((g: any) => g.id))
  for (const id of ids) if (!keep.has(id)) await dropCries(id)
}
const tidyCries = (...jobs: Promise<unknown>[]) => Promise.all(jobs).catch(e => console.warn('battle-cries cleanup', e))

// Server admins and mods may close any game in their stadiums (public.has_perm, asked as the caller).
async function isMod(asUser: any, cid: string) {
  const { data: ch } = await db.from('channels').select('server_id').eq('id', cid).maybeSingle()
  if (!ch?.server_id) return false
  for (const perm of ['manage_channels', 'manage_messages']) {
    const { data } = await asUser.rpc('has_perm', { sid: ch.server_id, perm })
    if (data === true) return true
  }
  return false
}

const stamp = (R: any, a: any) => (R.meta.realtime ? { ...(a || {}), now: Date.now() } : a)

async function load(uid: string, gid: string | null) {
  const { data, error } = await db.rpc('game_load', { uid, gid })
  if (error) throw new Nope(error.message, error.hint === 'rate_limited' ? 429 : 400)
  return data
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  try {
    return json(await handle(req, body))
  } catch (e) {
    if (e instanceof Nope) return json({ error: e.message }, e.status)
    console.error('game failed', e)
    return json({ error: 'Something went wrong at the table.' }, 500)
  }
})
