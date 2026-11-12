import test from 'node:test'
import assert from 'node:assert/strict'
import { moveIn, sortByOrder } from './emojiOrder.js'

test('emoji server order: saved order first, new servers after in natural order; moves', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ id }))
  assert.deepEqual(sortByOrder(items, ['c', 'a']).map(x => x.id), ['c', 'a', 'b', 'd'])
  assert.deepEqual(sortByOrder(items).map(x => x.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(moveIn(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b'])
  assert.deepEqual(moveIn(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'])
  assert.deepEqual(moveIn(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
  assert.deepEqual(moveIn(['a', 'b'], 'a', -1), ['a', 'b'], 'already first')
})
