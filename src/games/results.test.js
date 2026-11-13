// Game results (results.js, migration 043): placings, every game's stats(), and the no-double-record key.
import test from 'node:test'
import assert from 'node:assert/strict'
import { GAMES } from './registry.js'
import { rng } from './rng.js'
import { SCORE, dedupe, orderOf, placings, profileLine, resultRows, roundKey, statsOf } from './results.js'

function playOut(R, players, seed, cap = 20000) {
  const rand = rng(seed + 1)
  let s = R.setup(players, seed, { quick: true }), k = 0
  while (!R.over(s) && k++ < cap) {
    const who = R.turn(s)
    const a = R.bot ? R.bot(R.view(s, who), who, 'normal', rand) : R.timeout(s)
    s = R.move(s, who, a ?? R.timeout(s))
  }
  return s
}
function timeouts(R, players, seed) {
  let s = R.setup(players, seed, { quick: true }), k = 0
  while (!R.over(s) && k++ < 20000) s = R.move(s, R.turn(s), R.timeout(s))
  return s
}

test('placings: winners first, competition ranking for ties, team games place 2', () => {
  assert.deepEqual(placings(['a', 'b', 'c', 'd'], ['a'], () => false), { a: 1, b: 2, c: 3, d: 4 })
  const sc = { a: 9, b: 5, c: 5, d: 1 }
  assert.deepEqual(placings(['a', 'b', 'c', 'd'], ['a'], (x, y) => sc[x] === sc[y]), { a: 1, b: 2, c: 2, d: 4 })
  assert.deepEqual(placings(['a', 'b', 'c'], ['a', 'b'], () => false), { a: 1, b: 1, c: 3 })
  assert.deepEqual(placings(['a', 'b', 'c'], ['c']), { c: 1, a: 2, b: 2 })
  // A winner the order put lower still places 1.
  assert.deepEqual(placings(['b', 'a'], ['a'], () => false), { a: 1, b: 2 })
})

test('orderOf: by score (low first for Card Rush), else the game\'s own ranking', () => {
  const st = { pub: { players: ['a', 'b', 'c'] } }
  assert.deepEqual(orderOf('snack', {}, st, { a: { cards: 3 }, b: { cards: 0 }, c: { cards: 1 } }), ['b', 'c', 'a'])
  assert.deepEqual(orderOf('poker', {}, st, { a: { chips: 0 }, b: { chips: 900 }, c: { chips: 100 } }), ['b', 'c', 'a'])
  assert.deepEqual(orderOf('x', { ranking: () => ['c', 'a', 'b'] }, st, {}), ['c', 'a', 'b'])
})

test('resultRows never records Chitbots and never throws on a broken stats()', () => {
  const R = { over: () => ['u1'], stats: (s, pid) => { if (pid === 'u2') throw new Error('boom'); return { chips: 5, bad: NaN, o: {} } } }
  const rows = resultRows('poker', R, { pub: { players: ['u1', 'bot:1', 'u2'] } })
  assert.deepEqual(rows.map(r => r.user_id), ['u1', 'u2'])
  assert.deepEqual(rows[0], { user_id: 'u1', placing: 1, won: true, score: 5, stats: { chips: 5 } })
  assert.equal(rows[1].won, false)
  assert.equal(rows[1].score, null)
  assert.deepEqual(statsOf({}, {}, 'x'), {})
})

test('the round key stops double recording', () => {
  assert.equal(roundKey('g1', 7), 'g1:7')
  assert.notEqual(roundKey('g1', 7), roundKey('g1', 9))
  const rows = [
    { game_id: 'g1', round: 7, user_id: 'a', placing: 1 },
    { game_id: 'g1', round: 7, user_id: 'a', placing: 2 },
    { game_id: 'g1', round: 7, user_id: 'b', placing: 2 },
    { game_id: 'g1', round: 12, user_id: 'a', placing: 1 },
  ]
  const out = dedupe(rows)
  assert.equal(out.length, 3)
  assert.equal(out[0].placing, 1)
})

const KEYS = {
  flyer: ['distance', 'sprinkles'], starchat: ['stars', 'coins'], pillow: ['points', 'votes', 'streak'], poker: ['chips'],
  property: ['worth'], isle: ['points'], chitchen: ['role', 'side'], snack: ['cards'],
}
for (const [id, keys] of Object.entries(KEYS)) {
  test(`${id}: stats() on a finished game, and the rows it records`, () => {
    const R = GAMES[id]
    assert.equal(typeof R.stats, 'function')
    const players = id === 'snack' ? ['bot:0', 'bot:1', 'bot:2'] : ['a', 'b', 'c', 'd'].slice(0, Math.max(2, R.meta.min))
    const s = id === 'snack' ? playOut(R, players, 4) : timeouts(R, players, 3)
    assert.ok(R.over(s), `${id} finished`)
    for (const pid of players) {
      const st = statsOf(R, s, pid)
      for (const k of keys) assert.ok(k in st, `${id} stats has ${k}`)
    }
    const rows = resultRows(id, R, s)
    assert.equal(rows.length, players.filter(p => !p.startsWith('bot:')).length)
    for (const r of rows) {
      assert.ok(r.placing >= 1 && r.placing <= players.length)
      assert.equal(r.won, R.over(s).includes(r.user_id))
      if (r.won) assert.equal(r.placing, 1)
      if (SCORE[id]) assert.equal(typeof r.score, 'number')
    }
  })
}

test('Card Rush: the winner has no cards left; Impostor stats name the winning side', () => {
  const R = GAMES.snack, s = playOut(R, ['bot:0', 'bot:1'], 8)
  const w = R.over(s)[0]
  assert.equal(R.stats(s, w).cards, 0)
  const C = GAMES.chitchen, n = timeouts(C, ['a', 'b', 'c', 'd'], 5)
  const st = C.stats(n, 'a')
  assert.ok(['nibbler', 'baker'].includes(st.role))
  assert.equal(st.side, n.pub.winner)
})

test('profileLine: totals, favourite game and a held record', () => {
  const rows = [{ game: 'flyer', played: 5, wins: 2, best_score: 3105 }, { game: 'poker', played: 2, wins: 1, best_score: 4000 }]
  const recs = [{ game: 'flyer', key: 'distance', user_id: 'me', value: 3105 }]
  assert.deepEqual(profileLine(rows, recs, 'me'), { wins: 3, played: 7, favourite: 'flyer', standout: 'Longest Jetpack Dash run: 3,105 m' })
  assert.equal(profileLine(rows, [], 'me', g => g).standout, 'Best flyer: 3,105 m')
  assert.equal(profileLine([], [], 'me'), null)
})
