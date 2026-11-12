// Midnight Chitchen: a social-deduction night in a bakery, played exactly like the classic "crew vs hidden impostor"
// game. TV-head Bakers do tasks to fill the Morning Bake; one or two hidden Nibblers (the impostors) smash bakers'
// TVs, sabotage and hop through crumb chutes (vents). Find a smashed TV and report it, or ring the tea bell for an
// emergency meeting; then talk, vote, and someone rides the night tram (ejected). Pure JS, refereed by the `game`
// edge function like every other game (see ../README.md).
//
// A real-time game inside the turn-based engine contract:
// - Game time is `pub.clock` (ms since setup). When the referee stamps actions with its own `now` (and setup with
//   `opts.now`), the clock follows the wall clock; without it (tests, replays) a tick jumps straight to the next
//   scheduled event, like a discrete-event simulation. So the same rules run at real speed and at test speed.
// - Walking happens on the clients. Players report a position only when it matters (`pos` on tasks, kills,
//   reports, the bell, fixes, vents) and the referee checks it against their last report and the walking speed.
// - Most moves can come from any player at any time. `turn()` names whoever has the next pending decision: the
//   Chitbot due to act soonest, a bot still to vote, or otherwise a clock keeper, who can only send `{ type: 'tick' }`.
// - Chitbots walk deterministic plans ({ pts, t0 } at SPEED), so every client draws them in the same place.
//
// Hidden information (what the stadium can read in games.pub is public to everyone watching):
// - Roles, task lists, bot memories and where each bot is heading live in priv (bots' priv is game_secret).
// - People's last reported positions and the votes cast in a meeting live in `secret` until the votes are counted.
// - Public: who is still awake (proximity voice needs it to keep ghosts quiet), bots' walk plans (every client draws
//   bots from them; clients only show the ones inside your vision), bodies, the task bar, sabotage.
import { rng, shuffle } from '../rng.js'
import { FIX, SPOTS, along, arrival, canSee, dist, roomAt, route, seatPos, spot, sightOf, vent, ventLinks, VENTS } from './map.js'

export const meta = {
  id: 'chitchen', name: 'Midnight Chitchen', min: 4, max: 8, turnMs: 30000, realtime: true,
  blurb: 'Bakers do tasks; hidden Nibblers (the impostors) smash TVs, sabotage and vent. Report bodies, call meetings, vote someone onto the night tram.',
}

export const TUCK = 2, CHECK = 1.5 // kill range, and the tolerance on client-reported positions
export const USE = 2.2 // how close you must be to a task, the bell, a fix spot or a vent
export const REPORT = 3.2 // how close to a body to report it
export const MIN_CHORE = 3000
export const MS = { apron: 8000, tuck: 25000, tuckFirst: 15000, mischief: 40000, calm: 15000, reveal: 8000, flour: 35000, jam: 15000, boil: 45000, candles: 90000, vent: 1200 }
export const MISCHIEF = ['candles', 'flour', 'boil', 'jam']
export const BELLS = 1 // emergency meetings per player per game

const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const fail = msg => { throw new Error(msg) }
const awake = (p, pid) => p.status[pid] === 'awake'
export const isGhost = s => s === 'nap' || s === 'home'

export function setup(list, seed, opts = {}) {
  if (list.length < 2 || list.length > meta.max) throw new Error(`Midnight Chitchen needs ${meta.min} to ${meta.max} players.`)
  const rand = rng(seed), n = list.length
  const nib = n >= 6 ? 2 : 1
  const order = shuffle(list, rand)
  const nibblers = order.slice(0, nib)
  const chores = opts.quick ? 3 : 5
  const priv = {}
  for (const pid of list) {
    const role = nibblers.includes(pid) ? 'nibbler' : 'baker'
    priv[pid] = {
      id: pid, role, chores: shuffle(SPOTS.map(s => s.id), rand).slice(0, chores), done: [], busy: null, ready: 0,
      ...(role === 'nibbler' ? { mates: nibblers.filter(x => x !== pid), vented: 0 } : {}),
      ...(isBot(pid) ? { memory: [], witness: [], to: null } : {}),
    }
  }
  const num = (k, d) => (typeof opts[k] === 'number' && opts[k] > 0 ? opts[k] : d)
  const seats = Object.fromEntries(list.map((pid, i) => [pid, seatPos(i, n)]))
  const dawn = num('dawnMs', opts.quick ? 360000 : 720000)
  return {
    pub: {
      players: [...list], phase: 'apron', clock: 0, epoch: typeof opts.now === 'number' ? opts.now : null,
      phaseEnds: MS.apron, dawn, dawnTotal: dawn,
      talkMs: num('talkMs', opts.quick ? 15000 : 30000), voteMs: num('voteMs', opts.quick ? 25000 : 45000), hideRoles: !!opts.hideRoles,
      nibblers: nib, bakeTotal: (n - nib) * chores, bakeDone: 0,
      status: Object.fromEntries(list.map(p => [p, 'awake'])), seats,
      bots: Object.fromEntries(list.filter(isBot).map(p => [p, { pts: [seats[p]], t0: 0, next: null }])),
      naps: {}, bells: {}, bellReady: 0, mischief: null, mischiefReady: MS.apron + MS.calm,
      meeting: null, voted: [], points: {}, lines: {}, reveal: null, rounds: 0, meetingAt: 0,
      winner: null, why: null, winners: null, roles: null, last: null,
    },
    priv,
    secret: { seen: Object.fromEntries(list.map(p => [p, { x: seats[p][0], y: seats[p][1], t: 0 }])), votes: {} },
  }
}

// ---- time ----------------------------------------------------------------------------------------------------
const activeBots = p => p.phase === 'play' ? p.players.filter(x => isBot(x) && p.bots[x]?.next != null) : []
const unvotedBots = p => p.phase === 'vote' ? p.players.filter(x => isBot(x) && awake(p, x) && !p.voted.includes(x)) : []
// The next thing that happens by itself: a phase ending, a sabotage running out, sunrise.
function timedEvent(p) {
  const t = []
  if (p.phaseEnds != null) t.push(p.phaseEnds)
  if (p.mischief) t.push(p.mischief.ends)
  if (p.phase === 'play') t.push(p.clock + p.dawn)
  return t.length ? Math.min(...t) : null
}
const VOTE_GAP = 1400 // a bot votes this long after the vote opens / the last bot vote
export function nextEvent(p) {
  const t = [timedEvent(p), ...activeBots(p).map(b => p.bots[b].next)]
  if (unvotedBots(p).length) t.push(p.clock + VOTE_GAP)
  const ok = t.filter(x => x != null)
  return ok.length ? Math.min(...ok) : null
}
function earliestBot(p) {
  let best = null
  for (const b of activeBots(p)) if (!best || p.bots[b].next < p.bots[best].next) best = b
  return best
}
const keeper = p => p.players.find(x => !isBot(x) && p.status[x] !== 'home') ?? p.players.find(x => p.status[x] !== 'home') ?? p.players[0]

// Whose decision is pending: a due Chitbot, a bot still to vote, else the clock keeper (who only ever ticks).
export function turn(state) {
  const p = state.pub
  if (p.phase === 'end') return null
  if (p.phase === 'play') {
    const b = earliestBot(p), e = timedEvent(p)
    if (b && (e == null || p.bots[b].next < e)) return b
  }
  const v = unvotedBots(p)
  if (v.length) return v[0]
  return keeper(p)
}
// How long until the referee should tick (ms), from the pending event.
export function delay(state) {
  const p = state.pub
  if (p.phase === 'end') return null
  const e = nextEvent(p)
  return e == null ? meta.turnMs : Math.max(150, Math.min(meta.turnMs, e - p.clock))
}
export const timeout = () => ({ type: 'tick' })

function setClock(st, t) {
  const p = st.pub
  if (t <= p.clock) return
  if (p.phase === 'play') p.dawn = Math.max(0, p.dawn - (t - p.clock))
  p.clock = t
}
function advance(st, T) {
  for (let guard = 0; guard < 100 && st.pub.phase !== 'end'; guard++) {
    const e = timedEvent(st.pub)
    if (e == null || e > T) break
    setClock(st, e)
    fire(st)
  }
  if (st.pub.phase !== 'end') setClock(st, T)
}
function fire(st) {
  const p = st.pub, now = p.clock
  if (p.mischief && p.mischief.ends <= now) {
    if (p.mischief.kind === 'boil') return finish(st, 'nibblers', 'boil')
    p.last = { type: 'calm', kind: p.mischief.kind }
    p.mischief = null
    return
  }
  if (p.phase === 'play' && p.dawn <= 0) return finish(st, 'nibblers', 'sunrise')
  if (p.phaseEnds == null || p.phaseEnds > now) return
  if (p.phase === 'apron') return startShift(st)
  if (p.phase === 'talk') { p.phase = 'vote'; p.phaseEnds = now + p.voteMs; return }
  if (p.phase === 'vote') return tally(st)
  if (p.phase === 'reveal') { if (!checkWin(st)) startShift(st) }
}

// When an action happens in game time: the referee's `now` if it stamped one; a due bot's scheduled time;
// a tick's next event; otherwise the clock as it stands.
function timeOf(p, pid, a) {
  if (p.epoch != null && typeof a.now === 'number') return Math.max(p.clock, a.now - p.epoch)
  if (a.type === 'tick') return Math.max(p.clock, nextEvent(p) ?? p.clock)
  if (isBot(pid) && p.phase === 'play' && p.bots[pid]?.next != null) return Math.max(p.clock, p.bots[pid].next)
  return p.clock
}

// ---- positions -----------------------------------------------------------------------------------------------
// Where someone is at time t: a bot from its (public) plan; a person from their last report (`seen`: the referee's
// secret, or a bot's view). Clients only ever ask about bots.
export function posOf(p, pid, t = p.clock, seen = p.seen) {
  if (p.bots[pid]) return along(p.bots[pid], t)
  const s = seen?.[pid]
  return s ? [s.x, s.y] : null
}
const fresh = (p, seen, pid, t, ms = 5000) => !!p.bots[pid] || (seen?.[pid] && t - seen[pid].t <= ms)
function claim(st, pid, pos, T) {
  const p = st.pub
  if (p.bots[pid]) return along(p.bots[pid], T)
  if (!Array.isArray(pos) || pos.length !== 2 || !pos.every(Number.isFinite)) fail('Where are you? (position missing)')
  if (!roomAt(pos[0], pos[1])) fail("That's outside the bakery.")
  const s = st.secret.seen[pid]
  if (s) {
    const max = (Math.max(0, T - s.t) / 1000) * 3.2 * CHECK + 3
    if (dist([s.x, s.y], pos) > max) fail('You moved faster than anyone can walk.')
  }
  return pos
}
const note = (st, pid, pos, T) => { if (!st.pub.bots[pid]) st.secret.seen[pid] = { x: +pos[0].toFixed(2), y: +pos[1].toFixed(2), t: T } }
function pointOf(st, to, pid) {
  const p = st.pub
  if (typeof to !== 'string') return null
  if (to === 'seat') return p.seats[pid]
  if (to.startsWith('nap:')) { const n = p.naps[to.slice(4)]; return n && [n.x + 0.8, n.y] }
  if (to.startsWith('v-')) { const v = vent(to); return v && [v.x, v.y] }
  if (to.startsWith('@')) {
    const who = to.slice(1)
    if (!p.players.includes(who) || !awake(p, who)) return null
    const at = p.bots[who] ? p.bots[who].pts[p.bots[who].pts.length - 1] : posOf(p, who, p.clock, st.secret.seen)
    return at && [at[0] + 0.8, at[1]]
  }
  if (to.startsWith('room:')) {
    const r = to.slice(5), s = SPOTS.find(x => x.room === r)
    return s ? [s.x + 1.5, s.y + 1.5] : null
  }
  const s = spot(to) || FIX[to]
  if (!s) return null
  const k = p.players.indexOf(pid) // a small offset so bots at the same spot don't stack
  return [s.x + ((k % 3) - 1) * 0.5, s.y + (((k / 3) | 0) % 2) * 0.5]
}
// A bot sets off: walk to `to`, then stand there `wait` ms before deciding again. Where it's heading stays private.
function go(st, pid, g, T) {
  const p = st.pub, b = p.bots[pid]
  const from = along(b, T)
  const target = pointOf(st, g?.to, pid)
  const pts = target ? [from, ...route(from, target, p.mischief?.kind === 'jam')] : [from]
  const plan = { pts: pts.map(q => [+q[0].toFixed(2), +q[1].toFixed(2)]), t0: T }
  const wait = Math.min(15000, Math.max(300, +g?.wait || 1000))
  p.bots[pid] = { ...plan, next: Math.round(arrival(plan) + wait) }
  st.priv[pid].to = target ? g.to : null
}
const darkFor = (st, pid) => st.pub.mischief?.kind === 'candles' && st.priv[pid]?.role !== 'nibbler'
const sightFor = (st, pid) => sightOf(st.priv[pid]?.role, darkFor(st, pid))
// What a bot notices on each decision: who is near (for meeting lines and votes).
function look(st, pid, T) {
  const p = st.pub, seen = st.secret.seen, me = posOf(p, pid, T, seen), mem = st.priv[pid]?.memory
  if (!mem || !me || !awake(p, pid)) return
  const jam = p.mischief?.kind === 'jam', R = sightFor(st, pid)
  for (const o of p.players) {
    if (o === pid || !awake(p, o) || !fresh(p, seen, o, T)) continue
    const q = posOf(p, o, T, seen)
    if (q && canSee(me, q, R, jam)) mem.push({ pid: o, room: roomAt(...q), t: T })
  }
  if (mem.length > 30) mem.splice(0, mem.length - 30)
}
// Awake baker bots who can see `at` right now remember `pid` doing something (a kill, a vent hop).
function witnesses(st, pid, at, T, what) {
  const p = st.pub, jam = p.mischief?.kind === 'jam'
  for (const w of p.players) {
    const m = st.priv[w]
    if (w === pid || !m.witness || !awake(p, w) || m.role === 'nibbler') continue
    if (at.some(q => canSee(posOf(p, w, T, st.secret.seen), q, sightFor(st, w), jam))) m.witness.push({ pid, t: T, what })
  }
}

// ---- phases --------------------------------------------------------------------------------------------------
const choresLeft = (st, pid) => st.priv[pid].chores.some(c => !st.priv[pid].done.includes(c))
function startShift(st) {
  const p = st.pub, now = p.clock
  p.phase = 'play'; p.phaseEnds = null; p.reveal = null; p.meeting = null; p.voted = []; p.points = {}; p.lines = {}
  st.secret.votes = {}
  p.bellReady = now + MS.calm
  p.mischiefReady = Math.max(p.mischiefReady, now + MS.calm)
  let i = 0
  for (const pid of p.players) {
    st.secret.seen[pid] = { x: p.seats[pid][0], y: p.seats[pid][1], t: now }
    if (p.bots[pid]) {
      const on = awake(p, pid) || choresLeft(st, pid) // ghosts keep doing their tasks, then rest
      p.bots[pid] = { pts: [p.seats[pid]], t0: now, next: on ? now + 500 + 350 * i++ : null }
      st.priv[pid].to = null
    }
    if (st.priv[pid]?.role === 'nibbler') st.priv[pid].ready = now + MS.tuckFirst
    if (st.priv[pid]) st.priv[pid].busy = null
  }
}
function meetingStart(st, by, why, found) {
  const p = st.pub, now = p.clock
  p.rounds++
  p.meeting = { by, why, found: found ?? null, room: found ? p.naps[found].room : 'kitchen', n: p.rounds }
  for (const k of Object.keys(p.naps)) p.naps[k].found = true // bodies are cleared away once a meeting sees them
  if (p.mischief && p.mischief.kind !== 'boil') p.mischief = null
  p.phase = 'talk'; p.phaseEnds = now + p.talkMs; p.voted = []; p.points = {}
  st.secret.votes = {}
  p.lines = {}
  for (const pid of p.players) {
    if (p.bots[pid]) { p.bots[pid] = { pts: [p.seats[pid]], t0: now, next: null }; st.priv[pid].to = null }
    if (isBot(pid) && awake(p, pid)) p.lines[pid] = lineFor(st, pid)
  }
  p.last = { type: 'meeting', by, why, found: found ?? null }
}
// A Chitbot's meeting line, from what it saw (Nibbler bots make something up). The client words it.
function lineFor(st, pid) {
  const p = st.pub, me = st.priv[pid], since = p.meetingAt ?? 0
  const r = rng(p.clock + p.players.indexOf(pid) * 7919)
  if (me.role === 'nibbler') {
    const bakers = p.players.filter(x => awake(p, x) && x !== pid && !me.mates.includes(x))
    if (p.meeting.by === pid && p.meeting.found) return { k: 'found', room: p.meeting.room }
    if (bakers.length && r() < 0.35) return { k: 'near', pid: bakers[(r() * bakers.length) | 0], room: p.meeting.room }
    return { k: 'did', room: spot(me.chores[(r() * me.chores.length) | 0]).room }
  }
  const w = me.witness.filter(x => x.t >= since && awake(p, x.pid)).pop()
  if (w) return { k: w.what === 'vent' ? 'vent' : 'saw', pid: w.pid }
  const found = p.meeting.found && p.naps[p.meeting.found]
  if (found) {
    const near = me.memory.filter(m => m.room === found.room && Math.abs(m.t - found.t) < 25000 && m.pid !== p.meeting.found && awake(p, m.pid)).pop()
    if (near) return { k: 'near', pid: near.pid, room: near.room }
    if (p.meeting.by === pid) return { k: 'found', room: p.meeting.room }
  }
  const did = me.done.length ? spot(me.done[me.done.length - 1]) : null
  return did ? { k: 'did', room: did.room, chore: did.id } : { k: 'hmm' }
}
function tally(st) {
  const p = st.pub, count = {}, votes = st.secret.votes
  for (const t of Object.values(votes)) count[t] = (count[t] || 0) + 1
  const top = Math.max(0, ...Object.values(count))
  const tops = Object.keys(count).filter(k => count[k] === top)
  const out = top > 0 && tops.length === 1 && tops[0] !== 'skip' ? tops[0] : null
  if (out) p.status[out] = 'home'
  const role = out ? st.priv[out].role : null
  p.reveal = {
    pid: out, role: p.hideRoles ? null : role, tally: count, votes: { ...votes },
    why: out ? 'out' : top === 0 ? 'none' : tops.length > 1 ? 'tie' : 'skip',
    left: p.hideRoles ? null : p.players.filter(x => st.priv[x].role === 'nibbler' && p.status[x] !== 'home').length,
  }
  st.secret.votes = {}
  p.phase = 'reveal'; p.phaseEnds = p.clock + MS.reveal; p.meetingAt = p.clock
  p.last = { type: 'reveal', pid: out }
}
function finish(st, side, why) {
  const p = st.pub
  p.phase = 'end'; p.phaseEnds = null; p.winner = side; p.why = why
  p.winners = p.players.filter(x => (st.priv[x].role === 'nibbler') === (side === 'nibblers'))
  p.roles = Object.fromEntries(p.players.map(x => [x, st.priv[x].role]))
  for (const b of Object.keys(p.bots)) p.bots[b].next = null
  p.last = { type: 'end', winner: side, why }
  return true
}
function checkWin(st) {
  const p = st.pub, role = x => st.priv[x].role
  if (p.bakeDone >= p.bakeTotal) return finish(st, 'bakers', 'bake')
  const nib = p.players.filter(x => role(x) === 'nibbler' && awake(p, x)).length
  if (!nib) return finish(st, 'bakers', 'caught')
  const bakers = p.players.filter(x => role(x) === 'baker' && awake(p, x)).length
  if (nib >= bakers) return finish(st, 'nibblers', 'outnumbered')
  return false
}

// ---- moves ---------------------------------------------------------------------------------------------------
// chore/start { id, pos } · tuck { target, pos, tpos } (the kill) · report { target, pos } · bell { pos }
// mischief { kind } (sabotage) · fix { what: 'fuse' | 'dialA' | 'dialB', pos } · vent { from, to, pos }
// vote { target | 'skip' } · point { target } · here { pos } · go { to, wait } (Chitbots only; any bot move may
// also carry `go`) · tick (the clock keeper's timeout)
export function move(state, pid, action) {
  const a = action && typeof action === 'object' ? action : {}
  if (state.pub.phase === 'end') fail('The night is over.')
  if (!state.pub.players.includes(pid)) fail("You're not in this game.")
  if (a.type === 'tick' && turn(state) !== pid) fail("It's not your turn to keep the clock.")
  const st = structuredClone(state), p = st.pub, me = st.priv[pid]
  st.secret ||= { seen: {}, votes: {} }
  st.secret.seen ||= {}; st.secret.votes ||= {}
  const T = Math.round(timeOf(p, pid, a))
  advance(st, T)
  if (p.phase === 'end') return st // the night ended before this arrived
  const play = () => { if (p.phase !== 'play') fail('Not during a meeting.') }
  const up = () => { if (!awake(p, pid)) fail(p.status[pid] === 'home' ? "You were ejected: you're a ghost now." : "Your TV is smashed: you're a ghost now.") }
  const near = (pos, at, r) => { if (dist(pos, at) > r) fail('Get closer first.') }
  switch (a.type) {
    case 'tick': {
      const b = p.bots[pid]
      if (b && p.phase === 'play' && b.next != null && b.next <= T) b.next = T + 1500 // a bot with nothing to do idles
      break
    }
    case 'here': {
      play()
      note(st, pid, claim(st, pid, a.pos, T), T)
      break
    }
    case 'start':
    case 'chore': {
      play() // ghosts finish their tasks too
      const s = spot(a.id)
      if (!s || !me.chores.includes(s.id)) fail("That's not one of your tasks.")
      if (me.done.includes(s.id)) fail('Already done.')
      const pos = claim(st, pid, a.pos, T)
      near(pos, [s.x, s.y], USE)
      note(st, pid, pos, T)
      if (a.type === 'start') { me.busy = { id: s.id, t: T }; break }
      const since = p.bots[pid] ? arrival(p.bots[pid]) : me.busy?.id === s.id ? me.busy.t : Infinity
      if (T - since < MIN_CHORE) fail('That task takes a little longer.')
      me.done.push(s.id); me.busy = null
      if (me.role === 'baker') { p.bakeDone++; checkWin(st) } // a Nibbler's "task" does nothing at all
      if (p.bots[pid] && !awake(p, pid) && !choresLeft(st, pid)) { p.bots[pid].next = null; return st } // a ghost bot rests
      break
    }
    case 'tuck': {
      play(); up()
      if (me.role !== 'nibbler') fail('Only a Nibbler can smash a TV.')
      const t = a.target
      if (!p.players.includes(t) || t === pid || !awake(p, t)) fail("They can't be smashed.")
      if (me.mates?.includes(t)) fail("That's your fellow Nibbler.")
      if (T < me.ready) fail('Not yet: your kill is cooling down.')
      const pos = claim(st, pid, a.pos, T)
      const tpos = p.bots[t] ? along(p.bots[t], T) : claim(st, t, a.tpos, T)
      if (dist(pos, tpos) > TUCK * CHECK) fail("They're too far away.")
      note(st, pid, pos, T); note(st, t, tpos, T)
      p.status[t] = 'nap'
      p.naps[t] = { x: +tpos[0].toFixed(2), y: +tpos[1].toFixed(2), room: roomAt(...tpos), t: T, found: false }
      if (p.bots[t]) { p.bots[t] = { pts: [[+tpos[0].toFixed(2), +tpos[1].toFixed(2)]], t0: T, next: choresLeft(st, t) ? T + 2500 : null }; st.priv[t].to = null }
      me.ready = T + MS.tuck
      witnesses(st, pid, [pos], T, 'kill')
      checkWin(st)
      break
    }
    case 'vent': {
      play(); up()
      if (me.role !== 'nibbler') fail('Only Nibblers fit down the crumb chutes.')
      const from = vent(a.from), to = vent(a.to)
      if (!from || !to || !ventLinks(from.id).includes(to.id)) fail("Those chutes don't connect.")
      if (T < (me.vented || 0) + MS.vent) fail('Catch your breath first.')
      const pos = claim(st, pid, a.pos, T)
      near(pos, [from.x, from.y], USE)
      witnesses(st, pid, [pos, [to.x, to.y]], T, 'vent')
      if (p.bots[pid]) p.bots[pid] = { pts: [[to.x, to.y]], t0: T, next: T + 1000 }
      note(st, pid, [to.x, to.y], T)
      me.vented = T
      break
    }
    case 'report': {
      play(); up()
      const n = p.naps[a.target]
      if (!n || n.found) fail('Nobody to report there.')
      const pos = claim(st, pid, a.pos, T)
      near(pos, [n.x, n.y], REPORT)
      note(st, pid, pos, T)
      meetingStart(st, pid, 'nap', a.target)
      break
    }
    case 'bell': {
      play(); up()
      if ((p.bells[pid] || 0) >= BELLS) fail("You've already called your emergency meeting.")
      if (T < p.bellReady) fail('The bell is cooling down: try again in a moment.')
      if (p.mischief?.kind === 'boil') fail('The oven is boiling over: fix it first!')
      const pos = claim(st, pid, a.pos, T)
      near(pos, [FIX.bell.x, FIX.bell.y], USE + 1)
      note(st, pid, pos, T)
      p.bells[pid] = (p.bells[pid] || 0) + 1
      meetingStart(st, pid, 'bell', null)
      break
    }
    case 'mischief': {
      play(); up()
      if (me.role !== 'nibbler') fail('Only a Nibbler can sabotage.')
      if (!MISCHIEF.includes(a.kind)) fail('What sabotage?')
      if (p.mischief) fail('A sabotage is already running.')
      if (T < p.mischiefReady) fail('Sabotage is cooling down.')
      p.mischief = { kind: a.kind, t: T, ends: T + MS[a.kind], ...(a.kind === 'boil' ? { dials: { dialA: null, dialB: null } } : {}) }
      p.mischiefReady = T + MS.mischief
      p.last = { type: 'mischief', kind: a.kind }
      break
    }
    case 'fix': {
      play(); up()
      const m = p.mischief
      const ok = m && ((m.kind === 'candles' && a.what === 'fuse') || (m.kind === 'boil' && (a.what === 'dialA' || a.what === 'dialB')))
      if (!ok) fail('Nothing to fix there.')
      const pos = claim(st, pid, a.pos, T)
      near(pos, [FIX[a.what].x, FIX[a.what].y], USE)
      note(st, pid, pos, T)
      if (m.kind === 'candles') { p.mischief = null; p.last = { type: 'fixed', kind: 'candles', by: pid }; break }
      if (m.dials[a.what]) fail('That dial is already turned.')
      const other = a.what === 'dialA' ? 'dialB' : 'dialA'
      if (m.dials[other] === pid) fail('Someone else has to turn the other dial.')
      m.dials[a.what] = pid
      if (m.dials[other]) { p.mischief = null; p.last = { type: 'fixed', kind: 'boil', by: pid } }
      break
    }
    case 'vote': {
      if (p.phase === 'talk') fail('Voting opens when the discussion ends.')
      if (p.phase !== 'vote') fail('Votes are for meetings.')
      up()
      if (p.voted.includes(pid)) fail("You've already voted.")
      const t = a.target
      if (t !== 'skip' && (!p.players.includes(t) || !awake(p, t))) fail('Vote for someone still in the game, or skip.')
      st.secret.votes[pid] = t
      p.voted.push(pid)
      if (p.players.every(x => !awake(p, x) || p.voted.includes(x))) tally(st)
      break
    }
    case 'point': {
      if (p.phase !== 'talk' && p.phase !== 'vote') fail('Point during a meeting.')
      up()
      if (a.target != null && (!p.players.includes(a.target) || !awake(p, a.target) || a.target === pid)) fail('Point at someone at the table.')
      if (a.target == null) delete p.points[pid]; else p.points[pid] = a.target
      break
    }
    case 'go': {
      if (!p.bots[pid]) fail('Only Chitbots plan walks.')
      if (p.phase !== 'play') fail('Not during a meeting.')
      break
    }
    default: fail('Unknown move.')
  }
  // Chitbots: plan the next walk and remember who's about.
  if (p.bots[pid] && p.phase === 'play' && p.bots[pid].next != null && a.type !== 'tick') {
    go(st, pid, a.go ?? (a.type === 'go' ? a : null), T)
    look(st, pid, T)
  }
  return st
}

// Your own role and tasks (Nibblers also know each other). Everyone else's role stays hidden until the end.
// Chitbots (server side only) also get the referee's last-known positions of people, to look around with.
export function view(state, pid) {
  const v = { ...state.pub, me: state.priv?.[pid] ?? null }
  if (isBot(pid) && state.secret?.seen) v.seen = state.secret.seen
  return v
}
export const over = state => (state.pub.phase === 'end' ? state.pub.winners : null)

// ---- Chitbots ------------------------------------------------------------------------------------------------
// bot(view, me, level, rand) → a move. Sees only its own view (no roles), plus its memory, and only "sees" the
// people within its own vision radius (walls block it), like a player would.
const LV = {
  easy: { mem: 4, sure: 1, forget: 0.5, work: [12000, 20000], fix: 0.5, careful: false, mischief: 0.1, bell: 0.3, stalk: 0.35, selfReport: 0.15, vent: 0.3 },
  normal: { mem: 12, sure: 2, forget: 0.15, work: [10000, 17000], fix: 0.85, careful: true, mischief: 0.15, bell: 0.7, stalk: 0.5, selfReport: 0.25, vent: 0.6 },
  hard: { mem: 30, sure: 2, forget: 0, work: [8000, 14000], fix: 1, careful: true, mischief: 0.2, bell: 1, stalk: 0.7, selfReport: 0.35, vent: 0.9 },
}
const ROOM_IDS = ['kitchen', 'shop', 'garden', 'loft', 'pantry', 'cellar']
export function bot(v, me, level = 'normal', rand = Math.random) {
  const L = LV[level] || LV.normal, mine = v.me && { memory: [], witness: [], to: null, ...v.me } // people (in the lab) have no memory row
  if (!mine || v.phase === 'end') return null
  v = { ...v, me: mine }
  const due = turn({ pub: v }) === me
  if (v.phase === 'vote' || v.phase === 'talk') {
    if (v.phase === 'vote' && v.status[me] === 'awake' && !v.voted.includes(me)) return { type: 'vote', target: suspect(v, me, L, rand) }
    return { type: 'tick' }
  }
  const b = v.bots[me]
  if (v.phase !== 'play' || !b || b.next == null || !due) return { type: 'tick' }
  const T = Math.max(v.clock, b.next)
  const pos = along(b, T)
  const jam = v.mischief?.kind === 'jam', dark = v.mischief?.kind === 'candles'
  const work = () => L.work[0] + rand() * (L.work[1] - L.work[0])
  const todo = mine.chores.filter(c => !mine.done.includes(c))
  const nextChore = () => {
    const c = todo.filter(x => x !== mine.to)
    if (c.length && !mine.to?.startsWith('room:') && rand() < 0.3) return { to: `room:${ROOM_IDS[(rand() * 6) | 0]}`, wait: 1500 + rand() * 2500 } // wander a little, like people do
    if (!c.length) return { to: `room:${ROOM_IDS[(rand() * 6) | 0]}`, wait: 2500 + rand() * 3000 }
    return { to: c[(rand() * c.length) | 0], wait: work() }
  }
  const at = id => { const s = spot(id) || FIX[id] || vent(id); return s && dist(pos, [s.x, s.y]) <= USE - 0.2 }
  const R = sightOf(mine.role, dark)
  const sees = q => !!q && canSee(pos, q, R, jam)
  const where = x => posOf(v, x, T, v.seen)
  const others = v.players.filter(x => x !== me && v.status[x] === 'awake' && fresh(v, v.seen, x, T))
  const awakeNow = v.status[me] === 'awake'
  const doChore = () => mine.to && todo.includes(mine.to) && at(mine.to) && T - arrival(b) >= MIN_CHORE

  // A ghost just finishes its tasks.
  if (!awakeNow) {
    if (doChore()) return { type: 'chore', id: mine.to, go: nextChore() }
    return todo.length ? { type: 'go', ...nextChore() } : { type: 'tick' }
  }

  // A body in view? Report it (walk over first if needed). Nibbler bots only sometimes "find" their own work.
  for (const [t, n] of Object.entries(v.naps)) {
    if (n.found || !sees([n.x, n.y])) continue
    if (mine.role === 'nibbler' && rand() > L.selfReport) break
    if (dist(pos, [n.x, n.y]) <= REPORT - 0.2) return { type: 'report', target: t }
    return { type: 'go', to: `nap:${t}`, wait: 300 }
  }

  if (mine.role === 'nibbler') {
    const bakersIn = x => v.status[x] === 'awake' && !mine.mates.includes(x)
    const watchers = skip => others.filter(x => x !== skip && bakersIn(x) && sees(where(x)))
    // Standing on a chute I headed for: hop through it if nobody's looking.
    if (mine.to?.startsWith('v-') && at(mine.to) && watchers().length === 0) {
      const links = ventLinks(mine.to)
      return { type: 'vent', from: mine.to, to: links[(rand() * links.length) | 0], go: nextChore() }
    }
    // Lie low while a body is still waiting to be found (only the boldest bots push their luck).
    const lowKey = level !== 'hard' && Object.values(v.naps).some(n => !n.found)
    if (T >= mine.ready && !lowKey) {
      const prey = others.filter(bakersIn)
      const close = prey.filter(x => dist(pos, where(x)) <= TUCK * CHECK - 0.1)
      for (const t of close) {
        if (L.careful && watchers(t).length) continue
        // After a kill: make for the nearest chute when there's one handy, else wander off to a "task".
        const ch = VENTS.map(x => [x, dist(pos, [x.x, x.y])]).sort((x, y) => x[1] - y[1])[0]
        const away = ch && ch[1] < 7 && rand() < L.vent ? { to: ch[0].id, wait: 300 } : nextChore()
        return { type: 'tuck', target: t, ...(v.bots[t] ? {} : { tpos: where(t) }), go: away }
      }
      if (!v.mischief && T >= v.mischiefReady && rand() < L.mischief) return { type: 'mischief', kind: MISCHIEF[(rand() * MISCHIEF.length) | 0], go: nextChore() }
      // Stalk someone I can see, or wander towards someone I last knew about.
      const seen = prey.filter(x => sees(where(x)))
      const pool = seen.length ? seen : prey
      if (pool.length && rand() < L.stalk) { const t = pool[(rand() * pool.length) | 0]; return { type: 'go', to: `@${t}`, wait: 400 + rand() * 500 } }
    } else if (!v.mischief && T >= v.mischiefReady && rand() < L.mischief) {
      return { type: 'mischief', kind: MISCHIEF[(rand() * MISCHIEF.length) | 0], go: nextChore() }
    }
    if (doChore()) return { type: 'chore', id: mine.to, go: nextChore() } // a fake task: stands there, bakes nothing
    return { type: 'go', ...nextChore() }
  }

  // A Baker.
  if (v.mischief && rand() < L.fix) {
    const m = v.mischief
    const fixes = m.kind === 'candles' ? ['fuse'] : m.kind === 'boil' ? ['dialA', 'dialB'].filter(d => !m.dials[d] && !Object.values(m.dials).includes(me)) : []
    const here = fixes.find(at)
    if (here) return { type: 'fix', what: here, go: nextChore() }
    if (fixes.length) {
      const f = fixes.reduce((x, y) => dist(pos, [FIX[x].x, FIX[x].y]) <= dist(pos, [FIX[y].x, FIX[y].y]) ? x : y)
      if (mine.to !== f) return { type: 'go', to: f, wait: 300 }
    }
  }
  // Saw a kill or a vent hop and nobody's found the body: run to the bell.
  const saw = mine.witness.some(w => w.t >= (v.meetingAt ?? 0) && v.status[w.pid] === 'awake')
  if (saw && (v.bells[me] || 0) < BELLS && T >= v.bellReady && v.mischief?.kind !== 'boil' && rand() < L.bell) {
    if (at('bell')) return { type: 'bell' }
    if (mine.to !== 'bell') return { type: 'go', to: 'bell', wait: 300 }
  }
  if (doChore()) return { type: 'chore', id: mine.to, go: nextChore() }
  return { type: 'go', ...nextChore() }
}

// Who a bot votes for in a meeting: from what it saw (memory depth and forgetting by level), what other bots
// said, and players' Points. Nibbler bots never vote for each other and lean on whoever the table suspects.
function suspect(v, me, L, rand) {
  const mine = v.me, score = {}
  const cands = v.players.filter(x => x !== me && v.status[x] === 'awake')
  const add = (x, k) => { if (cands.includes(x)) score[x] = (score[x] || 0) + k }
  const accusedMe = new Set()
  for (const [from, to] of Object.entries(v.points || {})) {
    if (from === me) continue
    if (to === me) accusedMe.add(from)
    add(to, mine.role === 'nibbler' ? 1.5 : mine.witness.some(w => w.pid === from) ? 0 : 2.5)
  }
  for (const [from, l] of Object.entries(v.lines || {})) {
    if (from === me || !l?.pid) continue
    if (l.pid === me) { accusedMe.add(from); continue }
    add(l.pid, l.k === 'saw' || l.k === 'vent' ? 3 : 1)
  }
  if (mine.role === 'nibbler') {
    for (const x of accusedMe) add(x, 2) // turn it around on the accuser
    const pick = cands.filter(x => !mine.mates.includes(x)).sort((a, b) => (score[b] || 0) - (score[a] || 0))[0]
    return pick && (score[pick] || 0) >= 1.5 ? pick : rand() < 0.25 && pick ? pick : 'skip'
  }
  for (const x of accusedMe) add(x, 2) // I know I'm innocent, so whoever accuses me is suspicious
  const since = v.meetingAt ?? 0
  for (const w of mine.witness) if (w.t >= since && rand() >= L.forget) add(w.pid, 10)
  const found = v.meeting?.found && v.naps[v.meeting.found]
  for (const m of mine.memory.slice(-L.mem)) {
    if (rand() < L.forget) continue
    if (found && m.room === found.room && Math.abs(m.t - found.t) < 25000) add(m.pid, 2)
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])
  if (!best.length || best[0][1] < L.sure || (best[1] && best[1][1] === best[0][1])) return 'skip'
  return best[0][0]
}
