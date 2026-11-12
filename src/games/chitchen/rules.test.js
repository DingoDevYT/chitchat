import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import { FIX, SPOTS, spot, walls, wallsBetween, route, roomAt, seatPos } from './map.js'
import { rng } from '../rng.js'

const P = n => Array.from({ length: n }, (_, i) => `p${i}`)
const roleOf = (s, r) => s.pub.players.filter(x => s.priv[x].role === r)
const tickTo = (s, phase) => { let k = 0; while (s.pub.phase !== phase && k++ < 50) s = R.move(s, R.turn(s), R.timeout(s)); return s }
const at = id => { const x = spot(id) || FIX[id]; return [x.x, x.y] }
// A human walks: report a position step by step so the speed check is happy (clock frozen without `now`, so
// tests use `now` stamps like the referee does).
function stamped(players, seed = 1, opts = {}) { return R.setup(players, seed, { now: 1e6, ...opts }) }
const mv = (s, pid, a, t) => R.move(s, pid, { ...a, now: 1e6 + t })

function playOut(n, levels, seed, cap = 20000) {
  const players = Array.from({ length: n }, (_, i) => `bot:${i}`)
  const rand = rng(seed * 31 + 7)
  let s = R.setup(players, seed), steps = 0
  while (!R.over(s) && steps++ < cap) {
    const who = R.turn(s)
    const a = R.bot(R.view(s, who), who, levels[players.indexOf(who) % levels.length], rand)
    s = R.move(s, who, a ?? R.timeout(s))
  }
  return { s, steps }
}

test('roles: 1 Nibbler at 4–5 players, 2 at 6–8; views reveal only your own role (Nibblers see each other)', () => {
  for (const n of [4, 5, 6, 7, 8]) {
    const s = R.setup(P(n), n)
    const nib = roleOf(s, 'nibbler')
    assert.equal(nib.length, n >= 6 ? 2 : 1)
    assert.equal(s.pub.bakeTotal, (n - nib.length) * 5)
    for (const pid of s.pub.players) {
      const v = R.view(s, pid), txt = JSON.stringify(v)
      assert.equal(v.me.role, s.priv[pid].role)
      assert.ok(!('roles' in v && v.roles))
      for (const o of s.pub.players) if (o !== pid) assert.ok(!txt.includes(`"id":"${o}"`), 'no one else\'s private row')
      if (v.me.role === 'nibbler') assert.deepEqual(v.me.mates, nib.filter(x => x !== pid))
      else assert.ok(!('mates' in v.me))
    }
  }
})

test('map: walls have door gaps, routes go through doors, seats sit in the kitchen', () => {
  assert.equal(wallsBetween([3, 5], [3, 15]), 1) // pantry → shop straight down hits the y=11 wall
  assert.equal(wallsBetween([6, 9], [6, 13]), 0) // …but not through the door at x 5–7
  assert.equal(wallsBetween([6, 9], [6, 13], true), 1) // pantry jam shuts it
  assert.equal(wallsBetween([10, 5], [14, 5], true), 1) // and the loft door too
  assert.ok(walls(false).length >= 10)
  const r = route([3, 3], [32, 20])
  assert.equal(roomAt(...r[r.length - 1]), 'garden')
  for (let i = 1; i < r.length; i++) assert.equal(wallsBetween(i === 1 ? [3, 3] : r[i - 2], r[i - 1]), 0)
  for (let i = 0; i < 8; i++) assert.equal(roomAt(...seatPos(i, 8)), 'kitchen')
  for (const s of SPOTS) assert.equal(roomAt(s.x, s.y), s.room)
})

test('clock: apron, then the night shift; referee `now` stamps drive game time', () => {
  let s = stamped(P(4))
  assert.equal(s.pub.phase, 'apron')
  s = mv(s, R.turn(s), { type: 'tick' }, 10000)
  assert.equal(s.pub.phase, 'play')
  assert.equal(s.pub.clock, 10000)
  s = mv(s, 'p1', { type: 'here', pos: s.pub.seats.p1 }, 12500)
  assert.equal(s.pub.clock, 12500)
  assert.equal(s.pub.dawn, s.pub.dawnTotal - 2500)
  assert.throws(() => mv(s, s.pub.players.find(x => x !== R.turn(s)), { type: 'tick' }, 13000), /turn/)
})

test('chores: on your list, near the spot, started first and long enough; the bar only moves at Tea Breaks', () => {
  let s = tickTo(stamped(P(5), 3), 'play')
  const baker = roleOf(s, 'baker')[0], id = s.priv[baker].chores[0], t0 = s.pub.clock
  const not = SPOTS.find(x => !s.priv[baker].chores.includes(x.id)).id
  // Walk there (speed-checked against the last report).
  assert.throws(() => mv(s, baker, { type: 'start', id, pos: at(id) }, t0 + 100), /faster/)
  s = mv(s, baker, { type: 'start', id, pos: at(id) }, t0 + 20000)
  assert.throws(() => mv(s, baker, { type: 'start', id: not, pos: at(not) }, t0 + 40000), /not one of your chores/)
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 21000), /longer/)
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: [at(id)[0] + 4, at(id)[1]] }, t0 + 24000), /closer/)
  s = mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 24000)
  assert.equal(s.secret.bakeDone, 1)
  assert.equal(s.pub.bakeShown, 0, 'hidden until a Tea Break')
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 30000), /Already/)
  // A Nibbler's chore is accepted but bakes nothing.
  const nib = roleOf(s, 'nibbler')[0], nid = s.priv[nib].chores[0]
  s = mv(s, nib, { type: 'start', id: nid, pos: at(nid) }, t0 + 30000)
  s = mv(s, nib, { type: 'chore', id: nid, pos: at(nid) }, t0 + 34000)
  assert.equal(s.secret.bakeDone, 1)
  // Ring the bell: the bar catches up.
  s = mv(s, baker, { type: 'bell', pos: at('bell') }, t0 + 50000)
  assert.equal(s.pub.phase, 'talk')
  assert.equal(s.pub.bakeShown, 1)
})

test('tuck-ins: Nibblers only, cooldown, range from reported positions, then a nap; parity wins', () => {
  let s = tickTo(stamped(P(4), 5), 'play')
  const [nib] = roleOf(s, 'nibbler'), [b1, b2, b3] = roleOf(s, 'baker'), t0 = s.pub.clock
  const sp = s.pub.seats
  assert.throws(() => mv(s, b1, { type: 'tuck', target: b2, pos: sp[b1], tpos: sp[b2] }, t0 + 20000), /Only a Nibbler/)
  assert.throws(() => mv(s, nib, { type: 'tuck', target: b1, pos: sp[nib], tpos: sp[b1] }, t0 + 1000), /Not yet/)
  // Everyone walks to the pantry corner; the Nibbler stays at the far side of the kitchen.
  for (const b of [b1, b2, b3]) s = mv(s, b, { type: 'here', pos: [4, 4] }, t0 + 9000)
  s = mv(s, nib, { type: 'here', pos: [22, 22] }, t0 + 9000)
  assert.throws(() => mv(s, nib, { type: 'tuck', target: b1, pos: [22, 22], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 1000), /too far/)
  assert.throws(() => mv(s, b1, { type: 'here', pos: [30, 20] }, t0 + 9100), /faster/)
  s = mv(s, nib, { type: 'here', pos: [5, 4] }, t0 + R.MS.tuckFirst + 1000)
  s = mv(s, nib, { type: 'tuck', target: b1, pos: [5, 4], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 2000)
  assert.equal(s.pub.status[b1], 'nap')
  assert.equal(s.pub.naps[b1].room, 'pantry')
  assert.ok(!JSON.stringify(s.pub.naps).includes(nib), 'a nap never says who did it')
  assert.throws(() => mv(s, nib, { type: 'tuck', target: b2, pos: [5, 4], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 5000), /moment/)
  // Sleepwalkers can still do chores but can't ring, report or vote.
  assert.throws(() => mv(s, b1, { type: 'bell', pos: [4, 4] }, t0 + R.MS.tuckFirst + 6000), /napping/)
  s = mv(s, nib, { type: 'tuck', target: b2, pos: [5, 4], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 2000 + R.MS.tuck)
  assert.equal(s.pub.phase, 'end')
  assert.equal(s.pub.winner, 'nibblers')
  assert.equal(s.pub.why, 'outnumbered')
  assert.deepEqual(R.over(s), [nib])
})

test('report a napper, Tea Break, teaspoons, the night tram, then back to work', () => {
  let s = tickTo(stamped(P(6), 2), 'play')
  const nibs = roleOf(s, 'nibbler'), bakers = roleOf(s, 'baker'), t0 = s.pub.clock
  const [n1] = nibs, [v, w] = bakers
  s = mv(s, n1, { type: 'here', pos: [14, 22] }, t0 + 4000)
  s = mv(s, v, { type: 'here', pos: [13.5, 22] }, t0 + 4000)
  s = mv(s, n1, { type: 'tuck', target: v, pos: [14, 22], tpos: [13.5, 22] }, t0 + R.MS.tuckFirst + 10)
  assert.throws(() => mv(s, w, { type: 'report', target: v, pos: s.pub.seats[w] }, t0 + R.MS.tuckFirst + 100), /closer/)
  s = mv(s, w, { type: 'here', pos: [14, 21] }, t0 + R.MS.tuckFirst + 2000)
  s = mv(s, w, { type: 'report', target: v, pos: [14, 21] }, t0 + R.MS.tuckFirst + 3000)
  assert.equal(s.pub.phase, 'talk')
  assert.deepEqual(s.pub.meeting, { by: w, why: 'nap', found: v, room: 'kitchen', n: 1 })
  assert.throws(() => mv(s, v, { type: 'vote', target: n1 }, t0 + 40000), /napping/)
  assert.throws(() => mv(s, w, { type: 'vote', target: v }, t0 + 40000), /Pick someone/)
  s = mv(s, w, { type: 'point', target: n1 }, t0 + 40000)
  assert.equal(s.pub.points[w], n1)
  // Everyone awake spoons n1; n1 spoons w.
  for (const x of s.pub.players.filter(x => s.pub.status[x] === 'awake')) s = mv(s, x, { type: 'vote', target: x === n1 ? w : n1 }, t0 + 40000)
  assert.equal(s.pub.phase, 'reveal')
  assert.equal(s.pub.reveal.pid, n1)
  assert.equal(s.pub.reveal.role, 'nibbler')
  assert.equal(s.pub.reveal.left, 1)
  assert.equal(s.pub.status[n1], 'home')
  s = mv(s, R.turn(s), { type: 'tick' }, t0 + 40000 + R.MS.reveal)
  assert.equal(s.pub.phase, 'play')
  assert.deepEqual([s.pub.seen[w].x, s.pub.seen[w].y], s.pub.seats[w])
  assert.throws(() => mv(s, n1, { type: 'here', pos: [14, 22] }, t0 + 60000), /home/)
})

test('a tied vote or a sugar-bowl majority sends nobody home; the vote times out on its own', () => {
  let s = tickTo(stamped(P(4), 9), 'play')
  const [a, b, c, d] = s.pub.players, t0 = s.pub.clock
  s = mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, t0 + R.MS.calm)
  assert.throws(() => mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, t0 + R.MS.calm + 1), /Tea Break/)
  s = mv(s, a, { type: 'vote', target: b }, t0 + 16000)
  s = mv(s, b, { type: 'vote', target: a }, t0 + 16000)
  s = mv(s, c, { type: 'vote', target: 'skip' }, t0 + 16000)
  void d
  s = tickTo(s, 'reveal') // d never votes: talk → vote → time up
  assert.equal(s.pub.reveal.pid, null)
  s = tickTo(s, 'play')
  assert.throws(() => mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, s.pub.clock - 1e6 + 1e6 + R.MS.calm + 1000), /already rung/)
})

test('mischief: Nibblers only, one at a time; candles fixed at the fuse box; boil-over needs two people', () => {
  let s = tickTo(stamped(P(5), 4), 'play')
  const [nib] = roleOf(s, 'nibbler'), [b1, b2] = roleOf(s, 'baker'), t0 = s.pub.clock
  assert.throws(() => mv(s, b1, { type: 'mischief', kind: 'candles' }, t0 + 20000), /Only a Nibbler/)
  assert.throws(() => mv(s, nib, { type: 'mischief', kind: 'candles' }, t0 + 1000), /lie low/)
  s = mv(s, nib, { type: 'mischief', kind: 'candles' }, t0 + 20000)
  assert.equal(s.pub.mischief.kind, 'candles')
  assert.ok(!JSON.stringify(s.pub.mischief).includes(nib))
  assert.throws(() => mv(s, nib, { type: 'mischief', kind: 'flour' }, t0 + 21000), /afoot/)
  s = mv(s, b1, { type: 'fix', what: 'fuse', pos: at('fuse') }, t0 + 25000)
  assert.equal(s.pub.mischief, null)
  // Boil-over: one person can't turn both dials.
  s = mv(s, nib, { type: 'mischief', kind: 'boil' }, t0 + 20000 + R.MS.mischief)
  const tb = s.pub.clock
  s = mv(s, b1, { type: 'fix', what: 'dialA', pos: at('dialA') }, tb + 3000)
  assert.throws(() => mv(s, b1, { type: 'fix', what: 'dialB', pos: at('dialB') }, tb + 9000), /Someone else/)
  assert.throws(() => mv(s, b2, { type: 'bell', pos: at('bell') }, tb + 4000), /boiling/)
  const fixed = mv(s, b2, { type: 'fix', what: 'dialB', pos: at('dialB') }, tb + 12000)
  assert.equal(fixed.pub.mischief, null)
  // …and left alone it ends the night.
  const lost = mv(s, b2, { type: 'here', pos: s.pub.seats[b2] }, tb + R.MS.boil + 1)
  assert.equal(lost.pub.winner, 'nibblers')
  assert.equal(lost.pub.why, 'boil')
})

test('flour storm and pantry jam run out by themselves; sunrise ends the night for the Nibblers', () => {
  let s = tickTo(stamped(P(4), 6), 'play')
  const [nib] = roleOf(s, 'nibbler'), t0 = s.pub.clock
  s = mv(s, nib, { type: 'mischief', kind: 'jam' }, t0 + 20000)
  assert.equal(R.delay(s), R.MS.jam)
  s = R.move(s, R.turn(s), R.timeout(s))
  assert.equal(s.pub.mischief, null)
  assert.equal(s.pub.last.type, 'calm')
  s = tickTo(s, 'end')
  assert.equal(s.pub.winner, 'nibblers')
  assert.equal(s.pub.why, 'sunrise')
  assert.ok(s.pub.roles, 'roles are shown at the end')
})

test('bots: whole games at 4–8 players and every level end, with both sides winning sometimes', () => {
  const wins = { bakers: 0, nibblers: 0 }, why = {}
  let meetings = 0
  for (let seed = 1; seed <= 40; seed++) {
    const n = 4 + (seed % 5)
    const levels = [['easy', 'normal', 'hard'], ['hard'], ['easy'], ['normal', 'hard']][seed % 4]
    const { s, steps } = playOut(n, levels, seed)
    assert.ok(R.over(s), `seed ${seed} with ${n} ended (${steps} steps)`)
    wins[s.pub.winner]++; why[s.pub.why] = (why[s.pub.why] || 0) + 1
    meetings += s.pub.rounds
  }
  assert.ok(wins.bakers > 0 && wins.nibblers > 0, JSON.stringify({ wins, why }))
  assert.ok(meetings > 0, 'bots call Tea Breaks')
  console.log('    bot games:', JSON.stringify({ wins, why, meetings }))
})

test('bots honour Points: a pointed-at player gets the spoons', () => {
  let s = tickTo(stamped(['a', 'b', 'bot:2', 'bot:3', 'bot:4', 'bot:5'], 8), 'play')
  s = mv(s, 'a', { type: 'bell', pos: s.pub.seats.a }, s.pub.clock + R.MS.calm)
  const nibs = roleOf(s, 'nibbler')
  const target = s.pub.players.find(x => !x.startsWith('bot') && x !== 'a') // b
  s = mv(s, 'a', { type: 'point', target }, s.pub.clock + 1000)
  s = mv(s, target === 'b' ? 'a' : 'b', { type: 'vote', target }, s.pub.clock + 1000)
  s = tickTo(s, 'vote')
  let k = 0
  while (s.pub.phase === 'vote' && k++ < 10) { const w = R.turn(s); if (!w.startsWith('bot')) break; s = R.move(s, w, R.bot(R.view(s, w), w, 'normal', () => 0.5)) }
  const botVotes = Object.entries(s.pub.votes).filter(([x]) => x.startsWith('bot') && !nibs.includes(x))
  assert.ok(botVotes.length > 0)
  assert.ok(botVotes.every(([, t]) => t === target || t === 'skip'))
  assert.ok(botVotes.some(([, t]) => t === target))
})

test('turn/delay: a due Chitbot acts, else a keeper ticks; delay points at the next event', () => {
  let s = tickTo(R.setup(['a', 'bot:1', 'bot:2', 'bot:3'], 2), 'play')
  const who = R.turn(s)
  assert.ok(who.startsWith('bot:'))
  assert.equal(R.delay(s), s.pub.bots[who].next - s.pub.clock)
  // A bot that only ticks idles a moment instead of looping.
  const t = s.pub.bots[who].next
  s = R.move(s, who, { type: 'tick' })
  assert.equal(s.pub.bots[who].next, t + 1500)
  // Bot plans are walkable: positions stay inside the bakery.
  for (let i = 0; i < 300 && !R.over(s); i++) {
    const w = R.turn(s)
    s = R.move(s, w, R.bot(R.view(s, w), w, 'hard', rng(i)) ?? R.timeout(s))
    for (const b of Object.keys(s.pub.bots)) assert.ok(roomAt(...R.posOf(s.pub, b)))
  }
})
