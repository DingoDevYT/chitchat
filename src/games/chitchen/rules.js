// Midnight Chitchen: the night before the Lantern Fair. Bakers do chores to fill the Morning Bake; hidden Nibblers
// tuck bakers in for naps and make mischief. Tea Breaks to talk and vote with teaspoons. Pure JS, refereed by the
// `game` edge function like every other game (see ../README.md).
//
// A real-time game inside the turn-based engine contract:
// - Game time is `pub.clock` (ms since setup). When the referee stamps actions with its own `now` (and setup with
//   `opts.now`), the clock follows the wall clock; without it (tests, replays) a tick jumps straight to the next
//   scheduled event, like a discrete-event simulation. So the same rules run at real speed and at test speed.
// - Walking happens on the clients. Players report a position only when it matters (`pos` on chores, tuck-ins,
//   reports, the bell, fixes) and the referee checks it against their last report and the walking speed.
// - Most moves can come from any player at any time (like catches in Chomp Chat). `turn()` names whoever has the
//   next pending decision: the Chitbot due to act soonest, a bot still to vote, or otherwise a clock keeper.
//   Only that player may send `{ type: 'tick' }` (the timeout), which advances the clock to now / the next event.
// - Chitbots walk deterministic plans ({ pts, t0 } at SPEED), so every client draws them in the same place and the
//   referee range-checks them exactly. They can't hear voice: players `point` at a portrait in a Tea Break instead.
import { rng, shuffle } from '../rng.js'
import { FIX, SPOTS, along, arrival, canSee, dist, roomAt, route, seatPos, spot } from './map.js'

export const meta = {
  id: 'chitchen', name: 'Midnight Chitchen', min: 4, max: 8, turnMs: 30000, realtime: true, devOnly: true,
  blurb: 'Bake through the night before the Lantern Fair, but a Nibbler or two is tucking bakers in for naps. Talk it out over tea.',
}

export const TUCK = 2, CHECK = 1.5 // tuck range, and the tolerance on client-reported positions
export const USE = 2.2 // how close you must be to a chore spot, the bell, the fuse box or a dial
export const REPORT = 3.2 // how close to a napper to report them
export const SIGHT = 7 // what a Chitbot can see (no walls in between)
export const MIN_CHORE = 3000
export const MS = { apron: 10000, tuck: 30000, tuckFirst: 20000, mischief: 50000, calm: 15000, reveal: 7000, flour: 40000, jam: 20000, boil: 45000, candles: 90000 }
export const MISCHIEF = ['candles', 'flour', 'boil', 'jam']
export const BELLS = 1 // tea-bell rings per player per game

const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const fail = msg => { throw new Error(msg) }
const players = st => st.pub.players
const awake = (p, pid) => p.status[pid] === 'awake'

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
      ...(role === 'nibbler' ? { mates: nibblers.filter(x => x !== pid) } : {}),
      ...(isBot(pid) ? { memory: [], witness: [] } : {}),
    }
  }
  const num = (k, d) => (typeof opts[k] === 'number' && opts[k] > 0 ? opts[k] : d)
  const seats = Object.fromEntries(list.map((pid, i) => [pid, seatPos(i, n)]))
  return {
    pub: {
      players: [...list], phase: 'apron', clock: 0, epoch: typeof opts.now === 'number' ? opts.now : null,
      phaseEnds: MS.apron, dawn: num('dawnMs', opts.quick ? 240000 : 540000), dawnTotal: num('dawnMs', opts.quick ? 240000 : 540000),
      talkMs: num('talkMs', opts.quick ? 20000 : 75000), voteMs: num('voteMs', opts.quick ? 15000 : 30000), hideRoles: !!opts.hideRoles,
      nibblers: nib, bakeTotal: (n - nib) * chores, bakeShown: 0,
      status: Object.fromEntries(list.map(p => [p, 'awake'])), seats,
      seen: Object.fromEntries(list.map(p => [p, { x: seats[p][0], y: seats[p][1], t: 0 }])),
      bots: Object.fromEntries(list.filter(isBot).map(p => [p, { pts: [seats[p]], t0: 0, next: null, to: null }])),
      naps: {}, bells: {}, bellReady: 0, mischief: null, mischiefReady: MS.apron + MS.calm,
      meeting: null, votes: {}, points: {}, lines: {}, reveal: null, rounds: 0,
      winner: null, why: null, winners: null, roles: null, last: null,
    },
    priv,
    secret: { bakeDone: 0 },
  }
}

// ---- time ----------------------------------------------------------------------------------------------------
const activeBots = p => p.phase === 'play' ? p.players.filter(x => isBot(x) && p.status[x] !== 'home' && p.bots[x]?.next != null) : []
const unvotedBots = p => p.phase === 'vote' ? p.players.filter(x => isBot(x) && awake(p, x) && !(x in p.votes)) : []
// The next thing that happens by itself: a phase ending, a mischief running out, sunrise.
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
const keeper = p => p.players.find(x => p.status[x] !== 'home') ?? p.players[0]

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
// Where the referee believes someone is at time t: a bot from its plan; a person from their last report.
export function posOf(p, pid, t = p.clock) {
  if (p.bots[pid]) return along(p.bots[pid], t)
  const s = p.seen[pid]
  return s ? [s.x, s.y] : null
}
const fresh = (p, pid, t, ms = 5000) => !!p.bots[pid] || (p.seen[pid] && t - p.seen[pid].t <= ms)
function claim(p, pid, pos, T) {
  if (p.bots[pid]) return along(p.bots[pid], T)
  if (!Array.isArray(pos) || pos.length !== 2 || !pos.every(Number.isFinite)) fail('Where are you? (position missing)')
  if (!roomAt(pos[0], pos[1])) fail("That's outside the bakery.")
  const s = p.seen[pid]
  if (s) {
    const max = (Math.max(0, T - s.t) / 1000) * 3.2 * CHECK + 3
    if (dist([s.x, s.y], pos) > max) fail('You moved faster than anyone can walk.')
  }
  return pos
}
const note = (p, pid, pos, T) => { if (!p.bots[pid]) p.seen[pid] = { x: +pos[0].toFixed(2), y: +pos[1].toFixed(2), t: T } }
function pointOf(p, to, pid) {
  if (typeof to !== 'string') return null
  if (to === 'seat') return p.seats[pid]
  if (to.startsWith('nap:')) { const n = p.naps[to.slice(4)]; return n && [n.x + 0.8, n.y] }
  if (to.startsWith('@')) {
    const who = to.slice(1)
    if (!p.players.includes(who) || p.status[who] === 'home') return null
    const at = p.bots[who] ? p.bots[who].pts[p.bots[who].pts.length - 1] : posOf(p, who)
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
// A bot sets off: walk to `to`, then stand there `wait` ms before deciding again.
function go(st, pid, g, T) {
  const p = st.pub, b = p.bots[pid]
  const from = along(b, T)
  const target = pointOf(p, g?.to, pid)
  const pts = target ? [from, ...route(from, target, p.mischief?.kind === 'jam')] : [from]
  const plan = { pts: pts.map(q => [+q[0].toFixed(2), +q[1].toFixed(2)]), t0: T, to: target ? g.to : null }
  const wait = Math.min(15000, Math.max(300, +g?.wait || 1000))
  p.bots[pid] = { ...plan, next: Math.round(arrival(plan) + wait) }
}
// What a bot notices on each decision: who is near (for Tea Break lines and votes).
function look(st, pid, T) {
  const p = st.pub, me = posOf(p, pid, T), mem = st.priv[pid]?.memory
  if (!mem || !me) return
  const jam = p.mischief?.kind === 'jam', dark = p.mischief?.kind === 'candles'
  for (const o of p.players) {
    if (o === pid || p.status[o] === 'home' || !fresh(p, o, T)) continue
    const q = posOf(p, o, T)
    if (q && canSee(me, q, dark ? SIGHT / 2 : SIGHT, jam)) mem.push({ pid: o, room: roomAt(...q), t: T })
  }
  if (mem.length > 30) mem.splice(0, mem.length - 30)
}

// ---- phases --------------------------------------------------------------------------------------------------
function startShift(st) {
  const p = st.pub, now = p.clock
  p.phase = 'play'; p.phaseEnds = null; p.reveal = null; p.meeting = null; p.votes = {}; p.points = {}; p.lines = {}
  p.bellReady = now + MS.calm
  p.mischiefReady = Math.max(p.mischiefReady, now + MS.calm)
  let i = 0
  for (const pid of p.players) {
    p.seen[pid] = { x: p.seats[pid][0], y: p.seats[pid][1], t: now }
    if (p.bots[pid] && p.status[pid] !== 'home') p.bots[pid] = { pts: [p.seats[pid]], t0: now, to: null, next: now + 500 + 350 * i++ }
    if (st.priv[pid]?.role === 'nibbler') st.priv[pid].ready = now + MS.tuckFirst
    if (st.priv[pid]) st.priv[pid].busy = null
  }
}
function meetingStart(st, by, why, found) {
  const p = st.pub, now = p.clock
  p.rounds++
  p.meeting = { by, why, found: found ?? null, room: found ? p.naps[found].room : 'kitchen', n: p.rounds }
  for (const k of Object.keys(p.naps)) p.naps[k].found = true // everyone napping goes upstairs to the window
  if (p.mischief && p.mischief.kind !== 'boil') p.mischief = null
  p.phase = 'talk'; p.phaseEnds = now + p.talkMs; p.votes = {}; p.points = {}
  p.bakeShown = st.secret.bakeDone // the only moment the Morning Bake bar moves
  p.lines = {}
  for (const pid of p.players) {
    if (p.bots[pid]) p.bots[pid] = { pts: [p.seats[pid]], t0: now, to: null, next: null }
    if (isBot(pid) && awake(p, pid)) p.lines[pid] = lineFor(st, pid)
  }
  p.last = { type: 'meeting', by, why, found: found ?? null }
}
// A Chitbot's Tea Break line, from what it saw (Nibbler bots make something up). The client words it.
function lineFor(st, pid) {
  const p = st.pub, me = st.priv[pid], since = lastMeetingAt(p)
  const r = rng(p.clock + p.players.indexOf(pid) * 7919)
  if (me.role === 'nibbler') {
    const bakers = p.players.filter(x => awake(p, x) && x !== pid && !me.mates.includes(x))
    if (bakers.length && r() < 0.35) return { k: 'near', pid: bakers[(r() * bakers.length) | 0], room: p.meeting.room }
    return { k: 'did', room: spot(me.chores[(r() * me.chores.length) | 0]).room }
  }
  const w = me.witness.filter(x => x.t >= since).pop()
  if (w) return { k: 'saw', pid: w.pid }
  const found = p.meeting.found && p.naps[p.meeting.found]
  if (found) {
    const near = me.memory.filter(m => m.room === found.room && Math.abs(m.t - found.t) < 25000 && m.pid !== p.meeting.found).pop()
    if (near) return { k: 'near', pid: near.pid, room: near.room }
  }
  const did = me.done.length ? spot(me.done[me.done.length - 1]) : null
  return did ? { k: 'did', room: did.room, chore: did.id } : { k: 'hmm' }
}
const lastMeetingAt = p => p.meetingAt ?? 0
function tally(st) {
  const p = st.pub, count = {}
  for (const t of Object.values(p.votes)) count[t] = (count[t] || 0) + 1
  const top = Math.max(0, ...Object.values(count))
  const tops = Object.keys(count).filter(k => count[k] === top)
  const out = top > 0 && tops.length === 1 && tops[0] !== 'skip' ? tops[0] : null
  if (out) p.status[out] = 'home'
  const role = out ? st.priv[out].role : null
  p.reveal = {
    pid: out, role: p.hideRoles ? null : role, tally: count,
    left: p.hideRoles ? null : p.players.filter(x => st.priv[x].role === 'nibbler' && p.status[x] !== 'home').length,
  }
  p.phase = 'reveal'; p.phaseEnds = p.clock + MS.reveal; p.meetingAt = p.clock
  p.last = { type: 'reveal', pid: out }
}
function finish(st, side, why) {
  const p = st.pub
  p.phase = 'end'; p.phaseEnds = null; p.winner = side; p.why = why
  p.winners = p.players.filter(x => (st.priv[x].role === 'nibbler') === (side === 'nibblers'))
  p.roles = Object.fromEntries(p.players.map(x => [x, st.priv[x].role]))
  p.bakeShown = st.secret.bakeDone
  for (const b of Object.keys(p.bots)) p.bots[b].next = null
  p.last = { type: 'end', winner: side, why }
  return true
}
function checkWin(st) {
  const p = st.pub, role = x => st.priv[x].role
  if (st.secret.bakeDone >= p.bakeTotal) return finish(st, 'bakers', 'bake')
  const nib = p.players.filter(x => role(x) === 'nibbler' && p.status[x] !== 'home').length
  if (!nib) return finish(st, 'bakers', 'caught')
  const bakers = p.players.filter(x => role(x) === 'baker' && awake(p, x)).length
  if (nib >= bakers) return finish(st, 'nibblers', 'outnumbered')
  return false
}

// ---- moves ---------------------------------------------------------------------------------------------------
// chore/start { id, pos } · tuck { target, pos, tpos } · report { target, pos } · bell { pos } · mischief { kind }
// fix { what: 'fuse' | 'dialA' | 'dialB', pos } · vote { target | 'skip' } · point { target } · here { pos }
// go { to, wait } (Chitbots only; any bot move may also carry `go`) · tick (the clock keeper's timeout)
export function move(state, pid, action) {
  const a = action && typeof action === 'object' ? action : {}
  if (state.pub.phase === 'end') fail('The night is over.')
  if (!state.pub.players.includes(pid)) fail("You're not in this game.")
  if (a.type === 'tick' && turn(state) !== pid) fail("It's not your turn to keep the clock.")
  const st = structuredClone(state), p = st.pub, me = st.priv[pid]
  const T = Math.round(timeOf(p, pid, a))
  advance(st, T)
  if (p.phase === 'end') return st // the night ended before this arrived
  const play = () => { if (p.phase !== 'play') fail('Not during a Tea Break.') }
  const up = () => { if (!awake(p, pid)) fail(p.status[pid] === 'home' ? "You've gone home on the night tram." : "You're napping.") }
  const near = (pos, at, r) => { if (dist(pos, at) > r) fail('Get closer first.') }
  switch (a.type) {
    case 'tick': {
      const b = p.bots[pid]
      if (b && p.phase === 'play' && b.next != null && b.next <= T) b.next = T + 1500 // a bot with nothing to do idles
      break
    }
    case 'here': {
      play()
      if (p.status[pid] === 'home') fail("You've gone home.")
      note(p, pid, claim(p, pid, a.pos, T), T)
      break
    }
    case 'start':
    case 'chore': {
      play()
      if (p.status[pid] === 'home') fail("You've gone home.")
      const s = spot(a.id)
      if (!s || !me.chores.includes(s.id)) fail("That's not one of your chores.")
      if (me.done.includes(s.id)) fail('Already done.')
      const pos = claim(p, pid, a.pos, T)
      near(pos, [s.x, s.y], USE)
      note(p, pid, pos, T)
      if (a.type === 'start') { me.busy = { id: s.id, t: T }; break }
      const since = p.bots[pid] ? arrival(p.bots[pid]) : me.busy?.id === s.id ? me.busy.t : Infinity
      if (T - since < MIN_CHORE) fail('That chore takes a little longer.')
      me.done.push(s.id); me.busy = null
      if (me.role === 'baker') { st.secret.bakeDone++; checkWin(st) } // a Nibbler's "chore" does nothing at all
      break
    }
    case 'tuck': {
      play(); up()
      if (me.role !== 'nibbler') fail('Only a Nibbler can tuck someone in.')
      const t = a.target
      if (!p.players.includes(t) || t === pid || !awake(p, t)) fail("They can't be tucked in.")
      if (me.mates?.includes(t)) fail("That's your fellow Nibbler.")
      if (T < me.ready) fail('Not yet: you need a moment between tuck-ins.')
      const pos = claim(p, pid, a.pos, T)
      const tpos = p.bots[t] ? along(p.bots[t], T) : claim(p, t, a.tpos, T)
      if (dist(pos, tpos) > TUCK * CHECK) fail("They're too far away.")
      note(p, pid, pos, T); note(p, t, tpos, T)
      p.status[t] = 'nap'
      p.naps[t] = { x: +tpos[0].toFixed(2), y: +tpos[1].toFixed(2), room: roomAt(...tpos), t: T, found: false }
      me.ready = T + MS.tuck
      const jam = p.mischief?.kind === 'jam', dark = p.mischief?.kind === 'candles'
      for (const w of p.players) {
        if (w === pid || w === t || !st.priv[w].witness || !awake(p, w) || st.priv[w].role === 'nibbler') continue
        if (canSee(posOf(p, w, T), pos, dark ? SIGHT / 2 : SIGHT, jam)) st.priv[w].witness.push({ pid, t: T })
      }
      checkWin(st)
      break
    }
    case 'report': {
      play(); up()
      const n = p.naps[a.target]
      if (!n || n.found) fail('Nobody napping there.')
      const pos = claim(p, pid, a.pos, T)
      near(pos, [n.x, n.y], REPORT)
      note(p, pid, pos, T)
      meetingStart(st, pid, 'nap', a.target)
      break
    }
    case 'bell': {
      play(); up()
      if ((p.bells[pid] || 0) >= BELLS) fail("You've already rung the bell tonight.")
      if (T < p.bellReady) fail('The kettle is still cooling: try again in a moment.')
      if (p.mischief?.kind === 'boil') fail('The oven is boiling over: fix it first!')
      const pos = claim(p, pid, a.pos, T)
      near(pos, [FIX.bell.x, FIX.bell.y], USE + 1)
      note(p, pid, pos, T)
      p.bells[pid] = (p.bells[pid] || 0) + 1
      meetingStart(st, pid, 'bell', null)
      break
    }
    case 'mischief': {
      play(); up()
      if (me.role !== 'nibbler') fail('Only a Nibbler makes mischief.')
      if (!MISCHIEF.includes(a.kind)) fail('What mischief?')
      if (p.mischief) fail('Some mischief is already afoot.')
      if (T < p.mischiefReady) fail('Not yet: lie low a little longer.')
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
      const pos = claim(p, pid, a.pos, T)
      near(pos, [FIX[a.what].x, FIX[a.what].y], USE)
      note(p, pid, pos, T)
      if (m.kind === 'candles') { p.mischief = null; p.last = { type: 'fixed', kind: 'candles', by: pid }; break }
      if (m.dials[a.what]) fail('That dial is already turned.')
      const other = a.what === 'dialA' ? 'dialB' : 'dialA'
      if (m.dials[other] === pid) fail('Someone else has to turn the other dial.')
      m.dials[a.what] = pid
      if (m.dials[other]) { p.mischief = null; p.last = { type: 'fixed', kind: 'boil', by: pid } }
      break
    }
    case 'vote': {
      if (p.phase !== 'talk' && p.phase !== 'vote') fail('Votes are for Tea Breaks.')
      up()
      if (pid in p.votes) fail("You've already put your teaspoon in.")
      const t = a.target
      if (t !== 'skip' && (!p.players.includes(t) || !awake(p, t))) fail('Pick someone at the table, or the sugar bowl.')
      p.votes[pid] = t
      if (p.players.every(x => !awake(p, x) || x in p.votes)) tally(st)
      break
    }
    case 'point': {
      if (p.phase !== 'talk' && p.phase !== 'vote') fail('Point during a Tea Break.')
      up()
      if (a.target != null && (!p.players.includes(a.target) || !awake(p, a.target) || a.target === pid)) fail('Point at someone at the table.')
      if (a.target == null) delete p.points[pid]; else p.points[pid] = a.target
      break
    }
    case 'go': {
      if (!p.bots[pid]) fail('Only Chitbots plan walks.')
      if (p.phase !== 'play') fail('Not during a Tea Break.')
      break
    }
    default: fail('Unknown move.')
  }
  // Chitbots: plan the next walk and remember who's about.
  if (p.bots[pid] && p.phase === 'play' && p.status[pid] !== 'home' && a.type !== 'tick') {
    go(st, pid, a.go ?? (a.type === 'go' ? a : null), T)
    look(st, pid, T)
  }
  return st
}

// Your own role and chores (Nibblers also see each other). Everyone else's role stays on the server until the end.
export const view = (state, pid) => ({ ...state.pub, me: state.priv?.[pid] ?? null })
export const over = state => (state.pub.phase === 'end' ? state.pub.winners : null)

// ---- Chitbots ------------------------------------------------------------------------------------------------
// bot(view, me, level, rand) → a move. Sees only its own view (positions are public; roles aren't), plus its memory.
const LV = {
  easy: { mem: 4, sure: 1, forget: 0.5, work: [8000, 14000], fix: 0.5, careful: false, mischief: 0.12, bell: 0, stalk: 0.35 },
  normal: { mem: 12, sure: 2, forget: 0.15, work: [6000, 11000], fix: 0.85, careful: true, mischief: 0.2, bell: 0.6, stalk: 0.5 },
  hard: { mem: 30, sure: 2, forget: 0, work: [5000, 9000], fix: 1, careful: true, mischief: 0.3, bell: 1, stalk: 0.7 },
}
export function bot(v, me, level = 'normal', rand = Math.random) {
  const L = LV[level] || LV.normal, mine = v.me && { memory: [], witness: [], ...v.me } // people (in the lab) have no memory row
  if (!mine || v.phase === 'end') return null
  v = { ...v, me: mine }
  const due = turn({ pub: v }) === me
  if (v.phase === 'vote' || v.phase === 'talk') {
    if (v.phase === 'vote' && v.status[me] === 'awake' && !(me in v.votes)) return { type: 'vote', target: suspect(v, me, L, rand) }
    return { type: 'tick' }
  }
  const b = v.bots[me]
  if (v.phase !== 'play' || !b || b.next == null || !due) return { type: 'tick' }
  const T = Math.max(v.clock, b.next)
  const pos = along(b, T)
  const jam = v.mischief?.kind === 'jam'
  const work = () => L.work[0] + rand() * (L.work[1] - L.work[0])
  const todo = mine.chores.filter(c => !mine.done.includes(c))
  const nextChore = () => {
    const c = todo.filter(x => x !== b.to)
    if (!c.length) return { to: `room:${['kitchen', 'shop', 'garden', 'loft', 'pantry', 'cellar'][(rand() * 6) | 0]}`, wait: 2500 + rand() * 3000 }
    return { to: c[(rand() * c.length) | 0], wait: work() }
  }
  const at = id => { const s = spot(id) || FIX[id]; return s && dist(pos, [s.x, s.y]) <= USE - 0.2 }
  const sees = q => canSee(pos, q, v.mischief?.kind === 'candles' ? SIGHT / 2 : SIGHT, jam)
  const others = v.players.filter(x => x !== me && v.status[x] !== 'home' && fresh(v, x, T))
  const awakeNow = v.status[me] === 'awake'

  // Anyone napping in view? Report it (walk over first if needed). Nibbler bots sometimes "find" their own work.
  if (awakeNow) for (const [t, n] of Object.entries(v.naps)) {
    if (n.found || !sees([n.x, n.y])) continue
    if (mine.role === 'nibbler' && rand() > 0.3) break
    if (dist(pos, [n.x, n.y]) <= REPORT - 0.2) return { type: 'report', target: t }
    return { type: 'go', to: `nap:${t}`, wait: 300 }
  }

  if (mine.role === 'nibbler') {
    // Lie low while a nap is still waiting to be found (only the boldest bots push their luck).
    const lowKey = level !== 'hard' && Object.values(v.naps).some(n => !n.found)
    if (awakeNow && T >= mine.ready && !lowKey) {
      const prey = others.filter(x => v.status[x] === 'awake' && !mine.mates.includes(x))
      const close = prey.filter(x => dist(pos, posOf(v, x, T)) <= TUCK * CHECK - 0.1)
      for (const t of close) {
        const watchers = others.filter(x => x !== t && v.status[x] === 'awake' && !mine.mates.includes(x) && sees(posOf(v, x, T)))
        if (!L.careful || watchers.length === 0) return { type: 'tuck', target: t, ...(v.bots[t] ? {} : { tpos: posOf(v, t, T) }), go: nextChore() }
      }
      if (!v.mischief && T >= v.mischiefReady && rand() < L.mischief) return { type: 'mischief', kind: MISCHIEF[(rand() * MISCHIEF.length) | 0], go: nextChore() }
      if (prey.length && rand() < L.stalk) { const t = prey[(rand() * prey.length) | 0]; return { type: 'go', to: `@${t}`, wait: 400 + rand() * 500 } }
    } else if (awakeNow && !v.mischief && T >= v.mischiefReady && rand() < L.mischief) {
      return { type: 'mischief', kind: MISCHIEF[(rand() * MISCHIEF.length) | 0], go: nextChore() }
    }
    if (b.to && todo.includes(b.to) && at(b.to) && T - arrival(b) >= MIN_CHORE) return { type: 'chore', id: b.to, go: nextChore() }
    return { type: 'go', ...nextChore() }
  }

  // A Baker (or a sleepwalking one, who can only do chores).
  if (awakeNow && v.mischief && rand() < L.fix) {
    const m = v.mischief
    const fixes = m.kind === 'candles' ? ['fuse'] : m.kind === 'boil' ? ['dialA', 'dialB'].filter(d => !m.dials[d] && !Object.values(m.dials).includes(me)) : []
    const here = fixes.find(at)
    if (here) return { type: 'fix', what: here, go: nextChore() }
    if (fixes.length) {
      const f = fixes.reduce((x, y) => dist(pos, [FIX[x].x, FIX[x].y]) <= dist(pos, [FIX[y].x, FIX[y].y]) ? x : y)
      if (b.to !== f) return { type: 'go', to: f, wait: 300 }
    }
  }
  if (awakeNow && (v.bells[me] || 0) < BELLS && T >= v.bellReady && v.mischief?.kind !== 'boil' && mine.witness.some(w => w.t >= (v.meetingAt ?? 0)) && rand() < L.bell) {
    if (at('bell')) return { type: 'bell' }
    if (b.to !== 'bell') return { type: 'go', to: 'bell', wait: 300 }
  }
  if (b.to && todo.includes(b.to) && at(b.to) && T - arrival(b) >= MIN_CHORE) return { type: 'chore', id: b.to, go: nextChore() }
  return { type: 'go', ...nextChore() }
}

// Who a bot spoons at a Tea Break: suspicion from what it saw (memory depth and forgetting by level) and from
// players' Points. Nibbler bots never spoon each other and lean on whoever the table already suspects.
function suspect(v, me, L, rand) {
  const mine = v.me, score = {}
  const cands = v.players.filter(x => x !== me && v.status[x] === 'awake')
  const add = (x, k) => { if (cands.includes(x)) score[x] = (score[x] || 0) + k }
  for (const [from, to] of Object.entries(v.points)) if (from !== me) add(to, mine.role === 'nibbler' ? 1.5 : mine.witness.some(w => w.pid === from) ? 0 : 2)
  if (mine.role === 'nibbler') {
    const pick = cands.filter(x => !mine.mates.includes(x)).sort((a, b) => (score[b] || 0) - (score[a] || 0))[0]
    return pick && (score[pick] || 0) >= 1 ? pick : rand() < 0.3 && pick ? pick : 'skip'
  }
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
