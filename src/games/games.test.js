// Every game in the registry: Chitbots of each level play whole games to the end without an illegal move,
// and the engine contract (setup/turn/move/view/over/timeout/bot) holds.
import test from 'node:test'
import assert from 'node:assert/strict'
import { GAMES } from './registry.js'
import { rng } from './rng.js'

function playOut(R, players, levels, seed, cap = 20000) {
  const rand = rng(seed + 1)
  let s = R.setup(players, seed, { quick: true }) // Property Tycoon defaults to the full game; quick keeps the test bounded
  let steps = 0
  while (!R.over(s) && steps++ < cap) {
    // Any bot may act out of turn (catches); otherwise the player whose turn it is.
    const who = R.turn(s)
    const lv = levels[players.indexOf(who)]
    const a = R.bot ? R.bot(R.view(s, who), who, lv, rand) : R.timeout(s)
    s = R.move(s, who, a ?? R.timeout(s))
  }
  return { s, steps }
}

for (const [id, R] of Object.entries(GAMES)) {
  test(`${id}: bots finish whole games at every level`, () => {
    for (const [n, levels, seed] of [[2, ['easy', 'hard'], 1], [3, ['normal', 'normal', 'hard'], 2], [4, ['hard', 'easy', 'normal', 'hard'], 3]]) {
      const players = levels.map((_, i) => `bot:${i}`)
      const { s, steps } = playOut(R, players.slice(0, n), levels, seed)
      assert.ok(R.over(s), `${id} with ${n} players ended (took ${steps} steps)`)
      assert.ok(players.includes(R.over(s)[0]))
    }
  })

  // Card Rush never ends if nobody plays a card (a timeout only draws), so it's checked by its own tests.
  if (id !== 'snack') test(`${id}: timeouts alone also finish the game`, () => {
    let s = R.setup(['a', 'b'], 11, { quick: true }), k = 0
    while (!R.over(s) && k++ < 20000) s = R.move(s, R.turn(s), R.timeout(s))
    assert.ok(R.over(s))
  })

  test(`${id}: view never carries the secret or other hands`, () => {
    const s = R.setup(['a', 'b', 'c'], 5)
    const v = JSON.stringify(R.view(s, 'a'))
    assert.ok(!v.includes('"secret"') && !v.includes('"priv"'))
    for (const p of ['b', 'c']) if (s.priv[p]) assert.ok(!v.includes(JSON.stringify(s.priv[p])))
  })

  test(`${id}: out-of-turn moves are refused`, () => {
    const s = R.setup(['a', 'b'], 9)
    const other = R.turn(s) === 'a' ? 'b' : 'a'
    assert.throws(() => R.move(s, other, R.timeout(s)), /turn/)
  })
}
