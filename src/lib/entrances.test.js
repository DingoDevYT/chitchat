import test from 'node:test'
import assert from 'node:assert/strict'
import { ENTRANCES, FX_MS, MAX_AT_ONCE, animOf, nextEnd, normAnim, stepArrivals } from './entrances.js'

test('animation list: unique ids, both variants described', () => {
  assert.ok(ENTRANCES.length >= 6 && ENTRANCES.length <= 8)
  assert.equal(new Set(ENTRANCES.map(e => e.id)).size, ENTRANCES.length)
  for (const e of ENTRANCES) assert.ok(/^[a-z]{1,20}$/.test(e.id) && e.name && e.in && e.out, e.id) // ids fit 038's check
  assert.ok(ENTRANCES.some(e => e.id === 'anvil') && ENTRANCES.some(e => e.id === 'ufo'))
})

test('saved values: unknown or missing means the default', () => {
  assert.equal(normAnim('ufo'), 'ufo')
  assert.equal(normAnim('nope'), null)
  assert.equal(normAnim(null), null)
  assert.equal(animOf({ entrance_anim: 'anvil', exit_anim: 'pie' }, 'in'), 'anvil')
  assert.equal(animOf({ entrance_anim: 'anvil', exit_anim: 'pie' }, 'out'), 'pie')
  assert.equal(animOf(undefined, 'in'), null)
})

test('joins play in, leavers are held while they play out, then dropped', () => {
  let s = { order: ['a', 'b'], fx: {} }
  s = stepArrivals(s, ['a', 'b', 'c'], 1000)
  assert.deepEqual(s.order, ['a', 'b', 'c'])
  assert.equal(s.fx.c.phase, 'in')
  s = stepArrivals(s, ['b', 'c'], 1100)
  assert.deepEqual(s.order, ['a', 'b', 'c'], 'a keeps its seat while leaving')
  assert.equal(s.fx.a.phase, 'out')
  s = stepArrivals(s, ['b', 'c'], 1100 + FX_MS.out + 1)
  assert.deepEqual(s.order, ['b', 'c'])
  assert.deepEqual(s.fx, {})
})

test('coming back mid-exit plays the entrance again', () => {
  let s = stepArrivals({ order: ['a'], fx: {} }, [], 0)
  s = stepArrivals(s, ['a'], 200)
  assert.equal(s.fx.a.phase, 'in')
  assert.deepEqual(s.order, ['a'])
})

test('settling or a mass change just snaps', () => {
  let s = stepArrivals({ order: ['a'], fx: {} }, ['b'], 0, false)
  assert.deepEqual(s.order, ['b'])
  assert.deepEqual(s.fx, {})
  const many = Array.from({ length: MAX_AT_ONCE + 1 }, (_, i) => 'u' + i)
  s = stepArrivals({ order: [], fx: {} }, many, 0)
  assert.deepEqual(s.fx, {})
  assert.deepEqual(s.order, many)
})

test('next end', () => {
  assert.equal(nextEnd({}, 0), null)
  assert.equal(nextEnd({ a: { until: 500 }, b: { until: 300 } }, 100), 200)
})
