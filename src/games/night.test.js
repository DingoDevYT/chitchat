import test from 'node:test'
import assert from 'node:assert/strict'
import { GAMES } from './registry.js'
import { META, QUEUEABLE } from './meta.js'
import {
  joinQueue, leaveQueue, placings, planNext, pointsFor, queueOf, scoreGame, seatsFor, setRest, settleRound, standings, tally, upcoming, votersOf,
} from './night.js'
import { withoutAway } from './away.js'
import { rng } from './rng.js'

// ── the meta map ──
test('meta.js matches every rules module (min, max, noBots) and lists every game', () => {
  assert.deepEqual(Object.keys(META).sort(), Object.keys(GAMES).sort())
  for (const [id, R] of Object.entries(GAMES)) {
    assert.equal(META[id].min, R.meta.min, `${id} min`)
    assert.equal(META[id].max, R.meta.max, `${id} max`)
    assert.equal(!!META[id].noBots, !!R.meta.noBots, `${id} noBots`)
    assert.equal(META[id].name, R.meta.name, `${id} name`)
  }
})
test('only listed games can be queued (High Card is hidden)', () => {
  assert.deepEqual([...QUEUEABLE].sort(), ['chitchen', 'flyer', 'isle', 'pillow', 'poker', 'property', 'snack', 'starchat'])
  assert.ok(!QUEUEABLE.includes('highcard'))
})
test('meta.js stays tiny: it imports nothing', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./meta.js', import.meta.url), 'utf8')
  assert.ok(!/\bimport\b/.test(src))
})

// ── seats and away handling ──
const S = (seat, user_id, bot = null) => ({ seat, user_id, bot })
test('Join next round: the queue has no duplicates and can be left; house rules survive', () => {
  let o = { quick: true }
  o = joinQueue(o, 'a'); o = joinQueue(o, 'a'); o = joinQueue(o, 'b')
  assert.deepEqual(queueOf(o), ['a', 'b'])
  assert.equal(o.quick, true)
  assert.deepEqual(queueOf(leaveQueue(o, 'a')), ['b'])
  assert.deepEqual(queueOf(null), [])
  assert.deepEqual(queueOf({ queue: ['x', 4] }), ['x'])
  assert.deepEqual(withoutAway({ quick: true, queue: ['a'], away: ['b'] }), { quick: true })
})
test('a round ending frees away seats, then seats the queue in order while seats last', () => {
  const seats = [S(0, 'h'), S(1, 'gone'), S(2, null, 'easy')]
  const r = settleRound(seats, { quick: true, away: ['gone'], queue: ['w1', 'w2', 'h'] }, 4)
  assert.deepEqual(r.seats, [S(0, 'h'), S(1, 'w1'), S(2, null, 'easy'), S(3, 'w2')])
  assert.deepEqual(r.opts, { quick: true })
  // full table: the rest of the queue just watches
  const full = settleRound([S(0, 'a'), S(1, 'b')], { queue: ['c'] }, 2)
  assert.deepEqual(full.seats.map(s => s.user_id), ['a', 'b'])
  assert.deepEqual(full.opts, {})
  // someone who left mid-round and queued again gets a seat back
  const back = settleRound([S(0, 'a'), S(1, 'b')], { away: ['b'], queue: ['b'] }, 2)
  assert.deepEqual(back.seats, [S(0, 'a'), S(1, 'b')])
})
test('voters are seated people who have not left', () => {
  assert.deepEqual(votersOf([S(0, 'a'), S(1, null, 'hard'), S(2, 'b')], { away: ['b'] }), ['a'])
})
test('switching games keeps people first, drops Chitbots where there are none, renumbers seats', () => {
  const seats = [S(0, 'a'), S(1, null, 'easy'), S(3, 'b'), S(5, null, 'hard'), S(6, 'c')]
  assert.deepEqual(seatsFor(seats, META.flyer).seats, [S(0, 'a'), S(1, 'b'), S(2, 'c')])
  assert.deepEqual(seatsFor(seats, META.snack).seats, [S(0, 'a'), S(1, null, 'easy'), S(2, 'b'), S(3, null, 'hard'), S(4, 'c')])
  const isle = seatsFor(seats, META.isle) // 4 seats: all three people and the first bot
  assert.deepEqual(isle.seats, [S(0, 'a'), S(1, null, 'easy'), S(2, 'b'), S(3, 'c')])
  const many = seatsFor([S(0, 'a'), S(1, 'b'), S(2, 'c'), S(3, 'd'), S(4, 'e')], META.isle)
  assert.deepEqual(many.stood, ['e'])
})

// ── the vote ──
test('tally: a strict majority of current voters wins; stale votes do not count', () => {
  const voters = ['a', 'b', 'c']
  assert.equal(tally({ a: 'next' }, voters).win, null)
  assert.equal(tally({ a: 'next', b: 'next' }, voters).win, 'next')
  assert.equal(tally({ a: 'again', b: 'skip', c: 'next' }, voters).win, null)
  assert.equal(tally({ a: 'again', b: 'again', z: 'skip' }, ['a', 'b']).win, 'again')
  assert.equal(tally({ a: 'next', b: 'skip' }, ['a', 'b']).win, null) // 1 of 2 is not a majority
  assert.equal(tally({ a: 'bogus' }, ['a']).win, null)
  assert.equal(tally({}, []).win, null)
  assert.deepEqual(tally({ a: 'next', x: 'next' }, ['a', 'b']).counts, { next: 1, again: 0, skip: 0 })
  assert.equal(tally({ a: 'next', x: 'next' }, ['a', 'b']).cast, 1)
  assert.equal(tally({ a: 'skip' }, ['a']).win, 'skip')
})
test('planNext: next, skip jumps one, again stays, past the end the night ends', () => {
  const n = { list: ['snack', 'pillow', 'starchat'], at: 0 }
  assert.deepEqual(planNext(n, 'again'), { kind: 'again' })
  assert.deepEqual(planNext(n, 'next'), { kind: 'switch', at: 1, game: 'pillow' })
  assert.deepEqual(planNext(n, 'skip'), { kind: 'switch', at: 2, game: 'starchat' })
  assert.deepEqual(planNext({ ...n, at: 1 }, 'skip'), { kind: 'end' })
  assert.deepEqual(planNext({ ...n, at: 2 }, 'next'), { kind: 'end' })
  assert.equal(upcoming(n), 'pillow')
  assert.equal(upcoming({ ...n, at: 2 }), null)
  assert.equal(upcoming({ ...n, ended: true }), null)
})

// ── scoring ──
test('the scoring table: 3, 2, 1, then nothing', () => {
  assert.deepEqual([1, 2, 3, 4, 0].map(pointsFor), [3, 2, 1, 0, 0])
})
test('placings: winners share 1st, the rest by score with competition ranking', () => {
  const score = { a: 10, b: 7, c: 7, d: 1 }
  assert.deepEqual(placings(['w', 'a', 'b', 'c', 'd'], ['w'], p => score[p]), [['w', 1], ['a', 2], ['b', 3], ['c', 3]])
  assert.deepEqual(placings(['w1', 'w2', 'a', 'b'], ['w1', 'w2'], p => score[p]), [['w1', 1], ['w2', 1], ['a', 3]])
  assert.deepEqual(placings(['w', 'a'], ['w'], null), [['w', 1]]) // a team game places only its winners
  assert.deepEqual(placings(['w', 'a', 'b'], ['w'], p => (p === 'a' ? null : 5)), [['w', 1], ['b', 2]])
})
test('scoreGame adds night points per game and remembers Chitbot levels', () => {
  let n = setRest(null, 'pillow', ['snack'])
  const pub = { players: ['a', 'bot:1', 'b', 'c'], scores: { a: 9, 'bot:1': 4, b: 6, c: 1 }, phase: 'end' }
  n = scoreGame({ ...n, votes: { a: 'next' } }, 'pillow', pub, ['a'], GAMES.pillow, [S(0, 'a'), S(1, null, 'hard')])
  assert.deepEqual(n.scores, { a: 3, b: 2, 'bot:1': 1 })
  assert.deepEqual(n.who, { 'bot:1': 'hard' })
  assert.deepEqual(n.votes, {})
  assert.equal(n.played.length, 1)
  const snack = { players: ['a', 'b', 'c'], counts: { a: 0, b: 2, c: 5 }, winner: 'a' }
  n = scoreGame(n, 'snack', snack, ['a'], GAMES.snack)
  assert.deepEqual(standings(n), [['a', 6], ['b', 4], ['bot:1', 1], ['c', 1]])
  // Impostor: the winning team all take 1st, nobody else places
  const imp = scoreGame(setRest(null, 'chitchen', ['snack']), 'chitchen', { players: ['a', 'b', 'c', 'd'] }, ['a', 'b'], GAMES.chitchen)
  assert.deepEqual(imp.scores, { a: 3, b: 3 })
})
test('every registered game produces sensible places from a real finished game', () => {
  const finished = []
  for (const [id, R] of Object.entries(GAMES)) {
    if (id === 'flyer') continue // flown from logs; covered by its own tests
    const players = ['bot:0', 'bot:1', 'bot:2', 'bot:3'].slice(0, Math.max(R.meta.min, Math.min(4, R.meta.max)))
    const rand = rng(7)
    let s = R.setup(players, 7, { quick: true })
    for (let i = 0; i < 20000 && !R.over(s); i++) {
      const who = R.turn(s)
      let m = R.bot?.(R.view(s, who), who, 'normal', rand)
      try { s = R.move(s, who, m ?? R.timeout(s)) } catch { s = R.move(s, who, R.timeout(s)) }
    }
    if (!R.over(s)) continue
    const n = scoreGame(setRest(null, id, ['snack']), id, s.pub, R.over(s), R)
    const pts = Object.values(n.scores)
    assert.ok(pts.length >= 1, `${id}: someone scores`)
    assert.ok(pts.every(p => [1, 2, 3].includes(p)), `${id}: points are 1 to 3`)
    for (const w of R.over(s)) assert.equal(n.scores[w], 3, `${id}: winners get 3`)
    finished.push(id)
  }
  assert.ok(finished.length >= 5, `only ${finished} finished`)
})

// ── the playlist ──
test('setRest: a fresh night starts with the game on the table; edits keep what was played', () => {
  assert.equal(setRest(null, 'snack', []), null)
  const n = setRest(null, 'snack', ['pillow', 'nope', 'highcard', 'starchat'])
  assert.deepEqual(n.list, ['snack', 'pillow', 'starchat'])
  assert.equal(n.at, 0)
  const later = setRest({ ...n, at: 1, scores: { a: 3 }, played: [{ game: 'snack', places: [] }], ended: true }, 'pillow', ['poker'])
  assert.deepEqual(later.list, ['snack', 'pillow', 'poker'])
  assert.deepEqual(later.scores, { a: 3 })
  assert.equal(later.ended, false)
  assert.equal(setRest(n, 'snack', Array(20).fill('poker')).list.length, 9)
})
