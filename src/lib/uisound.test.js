import test from 'node:test'
import assert from 'node:assert/strict'
import { playUi, UI_TONES, UI_GAP } from './uisound.js'

// Stub AudioContext: records notes, never makes a sound.
function stubCtx() {
  const notes = [], peaks = []
  const param = () => ({ setValueAtTime(v) { this.v = v }, exponentialRampToValueAtTime(v) { peaks.push(v) } })
  return {
    notes, peaks, currentTime: 100, destination: {},
    createOscillator: () => ({ frequency: { setValueAtTime: f => notes.push(f) }, connect: n => n, start() {}, stop() {} }),
    createGain: () => ({ gain: param(), connect: n => n }),
  }
}

test('ui sounds: quiet, throttled, never stacked', () => {
  const ctx = stubCtx()
  assert.equal(playUi(ctx, 'open', 1), true)
  assert.deepEqual(ctx.notes, UI_TONES.open)
  assert.ok(Math.max(...ctx.peaks) <= 0.05)
  assert.equal(playUi(ctx, 'close', 1), false, 'a second cue right away is dropped')
  ctx.currentTime += UI_GAP + 0.01
  assert.equal(playUi(ctx, 'got', 0.5), true)
  assert.equal(ctx.notes.length, UI_TONES.open.length + UI_TONES.got.length)
})

test('ui sounds: silent at zero volume, unknown cue or no context', () => {
  const ctx = stubCtx()
  ctx.currentTime = 500
  assert.equal(playUi(ctx, 'open', 0), false)
  assert.equal(playUi(ctx, 'nope', 1), false)
  assert.equal(playUi(null, 'open', 1), false)
  assert.equal(ctx.notes.length, 0)
})
