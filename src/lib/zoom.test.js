import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampPan, zoomAt, toggleAt } from './zoom.js'

const one = { s: 1, x: 0, y: 0 }

test('zoom stays within 1x..5x', () => {
  assert.equal(zoomAt(one, 0.2, 0, 0, 400, 200).s, 1)
  assert.equal(zoomAt(one, 99, 0, 0, 400, 200).s, 5)
})

test('zoomAt keeps the point under the pointer fixed', () => {
  const z = zoomAt(one, 2, 100, 50, 400, 200)
  assert.deepEqual(z, { s: 2, x: -100, y: -50 }) // content point (100,50) -> -100 + 2*100 = 100
  const z2 = zoomAt(z, 4, 100, 50, 400, 200)
  assert.equal(z2.x + 4 * ((100 - z.x) / z.s), 100)
})

test('pan is clamped so the video never leaves the box', () => {
  assert.deepEqual(clampPan({ s: 1, x: 50, y: -20 }, 400, 200), one)
  assert.deepEqual(clampPan({ s: 2, x: 999, y: -999 }, 400, 200), { s: 2, x: 200, y: -100 })
  // zooming at a corner can't push past the edge either
  assert.deepEqual(zoomAt(one, 3, 200, 100, 400, 200), { s: 3, x: -400, y: -200 })
})

test('toggleAt flips between 1x and 2x at the pointer', () => {
  const z = toggleAt(one, -50, 0, 400, 200)
  assert.deepEqual(z, { s: 2, x: 50, y: 0 })
  assert.deepEqual(toggleAt(z, 0, 0, 400, 200), one)
})
