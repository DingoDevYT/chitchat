import test from 'node:test'
import assert from 'node:assert/strict'
import { bubbleMs, clip, isStale, pickVoice, speakable } from './tts.js'
import { NORM, normGain } from './voice.js'

test('stale TTS lines are skipped after 15 s', () => {
  const now = Date.parse('2026-01-01T00:00:20Z')
  assert.equal(isStale('2026-01-01T00:00:10Z', now), false)
  assert.equal(isStale('2026-01-01T00:00:04Z', now), true)
})

test('bubbles last longer for longer text, within limits', () => {
  assert.equal(bubbleMs(''), 3000)
  assert.ok(bubbleMs('a'.repeat(60)) > bubbleMs('hi'))
  assert.equal(bubbleMs('a'.repeat(1000)), 9000)
})

test('clip cuts at a word and adds an ellipsis', () => {
  assert.equal(clip('  hello   there '), 'hello there')
  const c = clip('the quick brown fox jumps over the lazy dog', 20)
  assert.equal(c, 'the quick brown fox…')
})

test('speakable drops links, spoilers, markdown and emoji codes', () => {
  assert.equal(speakable('**hi** see https://x.y/z ||secret|| :party_blob: ok'), 'hi see link ok')
  assert.equal(speakable('at 10:30 ok'), 'at 10:30 ok')
  assert.equal(speakable('a'.repeat(400)).length, 300)
})

test('pickVoice: exact name, then same language, then base language', () => {
  const vs = [{ name: 'A', lang: 'en-US' }, { name: 'B', lang: 'fr-FR' }, { name: 'C', lang: 'en-GB' }]
  assert.equal(pickVoice(vs, 'B', 'fr-FR').name, 'B')
  assert.equal(pickVoice(vs, 'Missing', 'en-GB').name, 'C')
  assert.equal(pickVoice(vs, 'Missing', 'fr-CA').name, 'B')
  assert.equal(pickVoice(vs, 'Missing', 'de-DE'), null)
  assert.equal(pickVoice([], 'A', 'en-US'), null)
})

test('normGain boosts quiet talkers, cuts loud ones, ignores silence', () => {
  let g = 1
  for (let i = 0; i < 500; i++) g = normGain(g, 62) // quiet talker: wants +14 dB, clamped to max
  assert.ok(Math.abs(g - NORM.max) < 0.01)
  g = 1
  for (let i = 0; i < 500; i++) g = normGain(g, 86) // loud: -10 dB, clamped at min 0.5
  assert.ok(Math.abs(g - NORM.min) < 0.01)
  assert.equal(normGain(1.7, 30), 1.7) // silence / noise floor: hold, never boost
  const step = normGain(1, 70) // one tick only moves a little
  assert.ok(step > 1 && step < 1.1)
})

import { chunkSpeech } from './tts.js'
test('chunkSpeech', () => {
  assert.deepEqual(chunkSpeech('hi there. how are you?'), ['hi there. how are you?'])
  const long = 'word '.repeat(100).trim()
  const parts = chunkSpeech(long, 60)
  assert.ok(parts.every(p => p.length <= 60))
  assert.equal(parts.join(' '), long)
  assert.deepEqual(chunkSpeech(''), [])
  assert.deepEqual(chunkSpeech('a'.repeat(30) + '. ' + 'b'.repeat(30) + '.', 40), ['a'.repeat(30) + '.', 'b'.repeat(30) + '.'])
})
