import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import { FIX, SPOTS, VENTS, spot, vent, ventLinks, walls, wallsBetween, route, roomAt, seatPos } from './map.js'
import { rng } from '../rng.js'

const P = n => Array.from({ length: n }, (_, i) => `p${i}`)
const roleOf = (s, r) => s.pub.players.filter(x => s.priv[x].role === r)
const tickTo = (s, phase) => { let k = 0; while (s.pub.phase !== phase && k++ < 50) s = R.move(s, R.turn(s), R.timeout(s)); return s }
const at = id => { const x = spot(id) || FIX[id] || vent(id); return [x.x, x.y] }
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
    assert.ok(!('seen' in s.pub) && !('votes' in s.pub), 'positions and votes are not public')
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
  s = mv(s, R.turn(s), { type: 'tick' }, R.MS.apron)
  assert.equal(s.pub.phase, 'play')
  assert.equal(s.pub.clock, R.MS.apron)
  s = mv(s, 'p1', { type: 'here', pos: s.pub.seats.p1 }, 12500)
  assert.equal(s.pub.clock, 12500)
  assert.equal(s.pub.dawn, s.pub.dawnTotal - (12500 - R.MS.apron))
  assert.throws(() => mv(s, s.pub.players.find(x => x !== R.turn(s)), { type: 'tick' }, 13000), /turn/)
})

test('chores: on your list, near the spot, started first and long enough; the shared task bar moves at once', () => {
  let s = tickTo(stamped(P(5), 3), 'play')
  const baker = roleOf(s, 'baker')[0], id = s.priv[baker].chores[0], t0 = s.pub.clock
  const not = SPOTS.find(x => !s.priv[baker].chores.includes(x.id)).id
  // Walk there (speed-checked against the last report).
  assert.throws(() => mv(s, baker, { type: 'start', id, pos: at(id) }, t0 + 100), /faster/)
  s = mv(s, baker, { type: 'start', id, pos: at(id) }, t0 + 20000)
  assert.throws(() => mv(s, baker, { type: 'start', id: not, pos: at(not) }, t0 + 40000), /not one of your tasks/)
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 21000), /longer/)
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: [at(id)[0] + 4, at(id)[1]] }, t0 + 24000), /closer/)
  s = mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 24000)
  assert.equal(s.pub.bakeDone, 1, 'the shared task bar moves at once')
  assert.throws(() => mv(s, baker, { type: 'chore', id, pos: at(id) }, t0 + 30000), /Already/)
  // A Nibbler's chore is accepted but bakes nothing.
  const nib = roleOf(s, 'nibbler')[0], nid = s.priv[nib].chores[0]
  s = mv(s, nib, { type: 'start', id: nid, pos: at(nid) }, t0 + 30000)
  s = mv(s, nib, { type: 'chore', id: nid, pos: at(nid) }, t0 + 34000)
  assert.equal(s.pub.bakeDone, 1)
  // The emergency button.
  s = mv(s, baker, { type: 'bell', pos: at('bell') }, t0 + 50000)
  assert.equal(s.pub.phase, 'talk')
})

test('kills (smash): Nibblers only, cooldown, range from reported positions; ghosts still do tasks; parity wins', () => {
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
  assert.throws(() => mv(s, nib, { type: 'tuck', target: b2, pos: [5, 4], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 5000), /cooling/)
  // Ghosts can still do tasks but can't call meetings, report or vote.
  assert.throws(() => mv(s, b1, { type: 'bell', pos: [4, 4] }, t0 + R.MS.tuckFirst + 6000), /ghost/)
  const gid = s.priv[b1].chores[0]
  s = mv(s, b1, { type: 'start', id: gid, pos: at(gid) }, t0 + R.MS.tuckFirst + 12000)
  s = mv(s, b1, { type: 'chore', id: gid, pos: at(gid) }, t0 + R.MS.tuckFirst + 16000)
  assert.equal(s.pub.bakeDone, 1, "a ghost baker's tasks still count")
  s = mv(s, nib, { type: 'tuck', target: b2, pos: [5, 4], tpos: [4, 4] }, t0 + R.MS.tuckFirst + 2000 + R.MS.tuck)
  assert.equal(s.pub.phase, 'end')
  assert.equal(s.pub.winner, 'nibblers')
  assert.equal(s.pub.why, 'outnumbered')
  assert.deepEqual(R.over(s), [nib])
})

test('report a body, discuss, secret votes with I-voted, ejection, then back to work', () => {
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
  assert.throws(() => mv(s, w, { type: 'vote', target: n1 }, t0 + R.MS.tuckFirst + 4000), /discussion/)
  s = mv(s, w, { type: 'point', target: n1 }, t0 + R.MS.tuckFirst + 4000)
  assert.equal(s.pub.points[w], n1)
  const tv = t0 + R.MS.tuckFirst + 3000 + s.pub.talkMs + 10
  assert.throws(() => mv(s, v, { type: 'vote', target: n1 }, tv), /ghost/)
  assert.throws(() => mv(s, w, { type: 'vote', target: v }, tv), /still in the game/)
  // Everyone awake votes n1; n1 votes w. Votes stay secret until they're counted: only "I voted" shows.
  const awakeNow = s.pub.players.filter(x => s.pub.status[x] === 'awake')
  s = mv(s, w, { type: 'point', target: null }, tv)
  s = mv(s, w, { type: 'vote', target: n1 }, tv)
  assert.deepEqual(s.pub.voted, [w])
  assert.ok(!JSON.stringify(s.pub).includes(`"${w}":"${n1}"`), 'who voted for whom stays secret')
  assert.ok(!JSON.stringify(R.view(s, n1)).includes(`"${w}":"${n1}"`))
  assert.throws(() => mv(s, w, { type: 'vote', target: n1 }, tv), /already/)
  for (const x of awakeNow.filter(x => x !== w)) s = mv(s, x, { type: 'vote', target: x === n1 ? w : n1 }, tv)
  assert.equal(s.pub.phase, 'reveal')
  assert.equal(s.pub.reveal.pid, n1)
  assert.equal(s.pub.reveal.votes[w], n1, 'the votes are shown once counted')
  assert.equal(s.pub.reveal.why, 'out')
  assert.equal(s.pub.reveal.role, 'nibbler')
  assert.equal(s.pub.reveal.left, 1)
  assert.equal(s.pub.status[n1], 'home')
  s = mv(s, R.turn(s), { type: 'tick' }, tv + R.MS.reveal)
  assert.equal(s.pub.phase, 'play')
  assert.deepEqual([s.secret.seen[w].x, s.secret.seen[w].y], s.pub.seats[w])
  assert.throws(() => mv(s, n1, { type: 'tuck', target: w, pos: s.pub.seats[n1], tpos: s.pub.seats[w] }, tv + R.MS.reveal + 60000), /ejected/)
})

test('a tied vote or a sugar-bowl majority sends nobody home; the vote times out on its own', () => {
  let s = tickTo(stamped(P(4), 9), 'play')
  const [a, b, c, d] = s.pub.players, t0 = s.pub.clock
  s = mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, t0 + R.MS.calm)
  assert.throws(() => mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, t0 + R.MS.calm + 1), /meeting/)
  s = tickTo(s, 'vote')
  const tv = s.pub.clock
  s = mv(s, a, { type: 'vote', target: b }, tv)
  s = mv(s, b, { type: 'vote', target: a }, tv)
  s = mv(s, c, { type: 'vote', target: 'skip' }, tv)
  void d
  s = tickTo(s, 'reveal') // d never votes: talk → vote → time up
  assert.equal(s.pub.reveal.pid, null)
  assert.equal(s.pub.reveal.why, 'tie')
  s = tickTo(s, 'play')
  assert.throws(() => mv(s, a, { type: 'bell', pos: s.pub.seats[a] }, s.pub.clock - 1e6 + 1e6 + R.MS.calm + 1000), /already called/)
})

test('mischief: Nibblers only, one at a time; candles fixed at the fuse box; boil-over needs two people', () => {
  let s = tickTo(stamped(P(5), 4), 'play')
  const [nib] = roleOf(s, 'nibbler'), [b1, b2] = roleOf(s, 'baker'), t0 = s.pub.clock
  assert.throws(() => mv(s, b1, { type: 'mischief', kind: 'candles' }, t0 + 20000), /Only a Nibbler/)
  assert.throws(() => mv(s, nib, { type: 'mischief', kind: 'candles' }, t0 + 1000), /cooling/)
  s = mv(s, nib, { type: 'mischief', kind: 'candles' }, t0 + 20000)
  assert.equal(s.pub.mischief.kind, 'candles')
  assert.ok(!JSON.stringify(s.pub.mischief).includes(nib))
  assert.throws(() => mv(s, nib, { type: 'mischief', kind: 'flour' }, t0 + 21000), /already running/)
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
  assert.ok(meetings > 0, 'bots call meetings')
  console.log('    bot games:', JSON.stringify({ wins, why, meetings }))
})

test('bots honour Points: a pointed-at player gets the votes', () => {
  let s = tickTo(stamped(['a', 'b', 'bot:2', 'bot:3', 'bot:4', 'bot:5'], 8), 'play')
  s = mv(s, 'a', { type: 'bell', pos: s.pub.seats.a }, s.pub.clock + R.MS.calm)
  const nibs = roleOf(s, 'nibbler')
  const target = s.pub.players.find(x => !x.startsWith('bot') && x !== 'a') // b
  s = mv(s, 'a', { type: 'point', target }, s.pub.clock + 1000)
  s = tickTo(s, 'vote')
  s = mv(s, target === 'b' ? 'a' : 'b', { type: 'vote', target }, s.pub.clock)
  let k = 0
  while (s.pub.phase === 'vote' && k++ < 10) { const w = R.turn(s); if (!w.startsWith('bot')) break; s = R.move(s, w, R.bot(R.view(s, w), w, 'normal', () => 0.5)) }
  const botVotes = Object.entries(s.secret.votes).filter(([x]) => x.startsWith('bot') && !nibs.includes(x))
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

test('vents: Nibblers only, between linked chutes, from close by; the referee then knows them at the far end', () => {
  let s = tickTo(stamped(P(5), 4), 'play')
  const [nib] = roleOf(s, 'nibbler'), [b1] = roleOf(s, 'baker'), t0 = s.pub.clock
  const from = 'v-kitchen', to = ventLinks(from)[0], far = VENTS.find(v => v.group !== vent(from).group).id
  s = mv(s, nib, { type: 'here', pos: at(from) }, t0 + 5000)
  s = mv(s, b1, { type: 'here', pos: at(from) }, t0 + 5000)
  assert.throws(() => mv(s, b1, { type: 'vent', from, to, pos: at(from) }, t0 + 6000), /Only Nibblers/)
  assert.throws(() => mv(s, nib, { type: 'vent', from, to: far, pos: at(from) }, t0 + 6000), /connect/)
  assert.throws(() => mv(s, nib, { type: 'vent', from: to, to: from, pos: at(from) }, t0 + 6000), /closer/)
  s = mv(s, nib, { type: 'vent', from, to, pos: at(from) }, t0 + 6000)
  assert.deepEqual([s.secret.seen[nib].x, s.secret.seen[nib].y], at(to))
  // …so walking on from the far chute passes the speed check.
  s = mv(s, nib, { type: 'here', pos: [at(to)[0] + 0.5, at(to)[1]] }, t0 + 6500)
})

test('hidden information: no positions, votes or bot destinations in public state; only your own role', () => {
  let s = tickTo(stamped(['a', 'b', 'bot:2', 'bot:3', 'bot:4', 'bot:5'], 3), 'play')
  for (let i = 0; i < 60 && s.pub.phase === 'play'; i++) {
    const w = R.turn(s)
    s = R.move(s, w, w.startsWith('bot:') ? R.bot(R.view(s, w), w, 'hard', rng(i)) ?? R.timeout(s) : R.timeout(s))
  }
  const pub = JSON.stringify(s.pub)
  assert.ok(!('seen' in s.pub) && !('votes' in s.pub))
  for (const b of Object.values(s.pub.bots)) assert.deepEqual(Object.keys(b).sort(), ['next', 'pts', 't0'], 'a bot plan never says where (or who) it is heading for')
  assert.ok(!pub.includes('"role"') && !pub.includes('"mates"') && !pub.includes('"witness"'))
  const va = R.view(s, 'a')
  assert.ok(!('seen' in va), "people never get the referee's positions")
  assert.ok('seen' in R.view(s, 'bot:2'), 'Chitbots (server side) do')
})

test('bots: full games finish with sensible outcomes (bakers report and vote out Nibblers far more than chance)', () => {
  let ejNib = 0, ejBaker = 0, reports = 0, kills = 0, vents = 0, selfReports = 0, share = 0
  const wins = { bakers: 0, nibblers: 0 }
  for (let seed = 1; seed <= 60; seed++) {
    const n = 4 + (seed % 5), lv = ['easy', 'normal', 'hard'][seed % 3]
    const players = Array.from({ length: n }, (_, i) => `bot:${i}`), rand = rng(seed * 13 + 1)
    let s = R.setup(players, seed), k = 0
    share += s.pub.nibblers / n
    while (!R.over(s) && k++ < 30000) {
      const who = R.turn(s), a = R.bot(R.view(s, who), who, lv, rand) ?? R.timeout(s)
      const next = R.move(s, who, a) // a bot never makes an illegal move
      if (a.type === 'tuck') kills++
      if (a.type === 'vent') vents++
      if (a.type === 'report') { reports++; if (s.priv[who].role === 'nibbler') selfReports++ }
      if (next.pub.phase === 'reveal' && s.pub.phase !== 'reveal' && next.pub.reveal.pid) next.priv[next.pub.reveal.pid].role === 'nibbler' ? ejNib++ : ejBaker++
      s = next
    }
    assert.ok(R.over(s), `seed ${seed} finished`)
    assert.ok(['bake', 'caught', 'outnumbered', 'boil', 'sunrise'].includes(s.pub.why))
    wins[s.pub.winner]++
  }
  share /= 60
  assert.ok(kills > 0 && reports > 0 && vents > 0, JSON.stringify({ kills, reports, vents }))
  assert.ok(selfReports > 0 && selfReports < reports / 2, 'Nibblers sometimes report their own work')
  assert.ok(ejNib / (ejNib + ejBaker) > share * 1.6, `ejected Nibblers ${ejNib} vs bakers ${ejBaker} (Nibblers are ${Math.round(share * 100)}% of players)`)
  assert.ok(wins.bakers >= 15 && wins.nibblers >= 15, JSON.stringify(wins))
})
