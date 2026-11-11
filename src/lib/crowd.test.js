import test from 'node:test'
import assert from 'node:assert/strict'
import { crowdLayout, fitCrowd } from './crowd.js'

test('front row starts beside you and flows left; back rows stagger half a seat', () => {
  const seats = crowdLayout(7, 500, 100, 120)
  assert.deepEqual(seats.filter(s => s.row === 0).map(s => s.x), [120, 202, 284, 366]) // 120 + k * 82 while a seat still fits in 500
  assert.deepEqual(seats.filter(s => s.row === 1).map(s => s.x), [41, 123, 205]) // half a step over
  assert.ok(seats.every(s => s.x + 100 <= 500))
})

test('always seats everyone, even when the space is tiny', () => {
  assert.equal(crowdLayout(5, 0, 100).length, 5)
  assert.deepEqual(crowdLayout(0, 500, 100), [])
})

test('shrinks seats until the crowd fits the height', () => {
  const big = fitCrowd(2, 1000, 400, true)
  assert.equal(big.s, 116)
  const packed = fitCrowd(40, 600, 300, true)
  assert.ok(packed.s < 116 && packed.height <= 300)
  assert.equal(fitCrowd(500, 300, 100, true).s, 56) // gives up at the smallest size rather than hiding people
})
