import test from 'node:test'
import assert from 'node:assert/strict'
import { groupChannels, moveId, moveChannel, moveCategory, applyItems, step } from './reorder.js'

const cats = [{ id: 'B', position: 1 }, { id: 'A', position: 0 }]
const chans = [
  { id: 'g', position: 0, category_id: null },
  { id: 'h', position: 1, category_id: 'gone' }, // stale category -> uncategorised
  { id: 'x', position: 2, category_id: 'A' },
  { id: 'y', position: 3, category_id: 'A' },
  { id: 'z', position: 4, category_id: 'B' },
]

test('groupChannels', () => {
  const g = groupChannels(chans, cats)
  assert.deepEqual(g.map(x => [x.cat?.id ?? null, x.channels.map(c => c.id)]), [[null, ['g', 'h']], ['A', ['x', 'y']], ['B', ['z']]])
})

test('moveId', () => {
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', 3), ['b', 'c', 'a'])
  assert.deepEqual(moveId(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b'])
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', 2), ['b', 'a', 'c'])
  assert.deepEqual(moveId(['a', 'b', 'c'], 'b', 1), ['a', 'b', 'c'])
})

test('moveChannel within and across categories', () => {
  const g = groupChannels(chans, cats)
  // y above x: positions swap; h also gets its stale category cleared
  assert.deepEqual(moveChannel(g, 'y', 'A', 0), [
    { id: 'h', position: 1, category_id: null }, { id: 'y', position: 2, category_id: 'A' }, { id: 'x', position: 3, category_id: 'A' }])
  // g to the end of B
  const r = applyItems(chans, moveChannel(g, 'g', 'B', 1))
  assert.deepEqual(groupChannels(r, cats).map(x => x.channels.map(c => c.id)), [['h'], ['x', 'y'], ['z', 'g']])
  // x down past y (index counted with x present)
  const r2 = applyItems(chans, moveChannel(g, 'x', 'A', 2))
  assert.deepEqual(groupChannels(r2, cats)[1].channels.map(c => c.id), ['y', 'x'])
  // into uncategorised top
  const r3 = applyItems(chans, moveChannel(g, 'z', null, 0))
  assert.deepEqual(groupChannels(r3, cats).map(x => x.channels.map(c => c.id)), [['z', 'g', 'h'], ['x', 'y'], []])
  assert.deepEqual(moveChannel(g, 'nope', 'A', 0), [])
})

test('moveCategory', () => {
  assert.deepEqual(moveCategory(cats, 'B', 0), [{ id: 'B', position: 0 }, { id: 'A', position: 1 }])
  assert.deepEqual(moveCategory(cats, 'A', 0), [])
})

test('step wraps and filters', () => {
  const ids = ['a', 'b', 'c', 'd']
  assert.equal(step(ids, 'a', 1), 'b')
  assert.equal(step(ids, 'a', -1), 'd')
  assert.equal(step(ids, 'd', 1), 'a')
  assert.equal(step(ids, 'a', 1, id => id === 'c'), 'c')
  assert.equal(step(ids, 'a', -1, id => id === 'b'), 'b')
  assert.equal(step(ids, 'a', 1, () => false), null)
  assert.equal(step(ids, 'zz', 1), 'a')
  assert.equal(step(ids, 'zz', -1), 'd')
})
