import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CUES, LOOPS } from './sfx.js'

// A stub AudioContext that records what gets started, enough to run every cue.
function stubCtx() {
  const started = []
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} })
  const node = extra => ({ connect: x => x, disconnect() {}, ...extra })
  const src = kind => node({ type: '', frequency: param(), buffer: null, start: t => started.push([kind, t]), stop() {} })
  return {
    started, currentTime: 1, sampleRate: 8000,
    createOscillator: () => src('osc'),
    createBufferSource: () => src('noise'),
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  }
}

test('every Chitchen cue schedules sound at or after its start time', () => {
  for (const [name, cue] of Object.entries(CUES)) {
    const c = stubCtx()
    cue(c, {}, 2, 0.05)
    assert.ok(c.started.length > 0, `${name} made no sound`)
    assert.ok(c.started.every(([, t]) => t >= 2), `${name} started early`)
  }
})

test('the sabotage loop starts and stops cleanly', () => {
  const c = stubCtx()
  const stop = LOOPS.sabotage(c, {}, 0.05)
  assert.ok(c.started.length >= 2)
  assert.doesNotThrow(stop)
})
