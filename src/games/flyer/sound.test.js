// Chatterflies sound: every cue, the held sounds, ducking and the music bed run on a stub AudioContext.
import test from 'node:test'
import assert from 'node:assert/strict'
import { audioPrefs, makeAudio, streakHz } from './sound.js'

function stub() {
  const made = { osc: 0, src: 0 }
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { this.value = v } })
  const node = () => ({ connect: n => n, start() {}, stop() {}, gain: param(), frequency: param(), Q: param() })
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: {},
    createOscillator: () => (made.osc++, node()), createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    createBufferSource: () => (made.src++, node()),
    createBuffer: (_, n, sampleRate) => ({ sampleRate, getChannelData: () => new Float32Array(n) }),
    resume() {}, suspend() {}, close() {},
  }
  return { ctx, made }
}

test('every effect schedules sound once unlocked, and nothing before', () => {
  const { ctx, made } = stub(), a = makeAudio(() => ctx)
  a.play('bonk')
  assert.equal(made.osc, 0)
  a.unlock()
  for (const k of a.FX) {
    const before = made.osc + made.src
    a.play(k, { i: 3, k: 0.5, dur: 1, won: true })
    assert.ok(made.osc + made.src > before, `${k} made a sound`)
  }
  a.thrust(true); a.thrust(false); a.skid(0.5); a.duck(1); a.duck(0)
  a.close()
})

test('the music bed schedules notes and stops', () => {
  const { ctx, made } = stub(), a = makeAudio(() => ctx)
  a.unlock()
  const before = made.osc
  a.music(true)
  assert.ok(made.osc > before)
  a.music(false)
  a.close()
})

test('sprinkle streaks climb in pitch', () => {
  for (let i = 1; i < 12; i++) assert.ok(streakHz(i) > streakHz(i - 1))
})

test('volume is clamped and mute is remembered for the page', () => {
  audioPrefs.set({ vol: 3 })
  assert.equal(audioPrefs.get().vol, 1)
  audioPrefs.set({ mute: true })
  assert.equal(audioPrefs.get().mute, true)
  audioPrefs.set({ vol: 0.35, mute: false })
})
