import test from 'node:test'
import assert from 'node:assert/strict'
import { peaks, cleanWave, nextSpeed, fmtDur } from './voicenote.js'

test('peaks: one bar per bucket, loudest = 100, silence floored', () => {
  const s = new Float32Array(400)
  s[10] = -0.5; s[150] = 0.25
  const w = peaks(s, 4)
  assert.deepEqual(w, [100, 50, 4, 4])
  assert.equal(peaks(new Float32Array(10), 48).length, 48)
  assert.ok(peaks(new Float32Array(10), 48).every(v => v === 4))
})

test('cleanWave clamps untrusted input', () => {
  assert.deepEqual(cleanWave([0, 50.4, 999, 'x', -3]), [4, 50, 100, 4, 4])
  assert.equal(cleanWave('nope'), null)
  assert.equal(cleanWave([]), null)
  assert.equal(cleanWave(Array(100).fill(50)).length, 64)
})

test('speed cycle and duration text', () => {
  assert.equal(nextSpeed(1), 1.5)
  assert.equal(nextSpeed(1.5), 2)
  assert.equal(nextSpeed(2), 1)
  assert.equal(fmtDur(0), '0:00')
  assert.equal(fmtDur(299.6), '4:59')
})
