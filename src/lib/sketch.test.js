import test from 'node:test'
import assert from 'node:assert/strict'
import { hash, sketch } from './sketch.js'
import { ICONS } from '../icons/paths.js'

test('every icon sketches into finite M/Q/C/L path data, the same way every time', () => {
  for (const [name, d] of Object.entries(ICONS)) {
    const out = sketch(d, hash(name))
    assert.match(out, /^M/, name)
    assert.doesNotMatch(out, /NaN|Infinity|[^MQCL\d .-]/, name)
    assert.equal(out, sketch(d, hash(name)), name)
  }
})

test('wobble stays small and Z closes back near the start', () => {
  const out = sketch('M4 4L20 4L20 20Z', 1)
  const nums = out.match(/-?\d*\.?\d+/g).map(Number)
  assert.ok(nums.every(v => v > 2.5 && v < 21.5))
  assert.ok(Math.hypot(nums.at(-2) - 4, nums.at(-1) - 4) < 2.5) // overshoot ends just past the start
})

test('malformed path data throws instead of looping', () => {
  assert.throws(() => sketch('M1 1Z 3 4', 1))
  assert.throws(() => sketch('M1 1A2 2 0 0 1 3 3', 1))
})
