import test from 'node:test'
import assert from 'node:assert/strict'
import { pickExpression } from './expressions.js'

const p = {
  avatar_idle: 'idle.png', avatar_talk: 'talk.png',
  avatar_states: { typing: { url: 'type.gif' }, muted: { url: 'mute.png', crop: { x: 0 } } },
}

test('expression priority and fallbacks', () => {
  assert.equal(pickExpression(p, {}).key, 'idle')
  assert.equal(pickExpression(p, { talk: true, typing: true }).key, 'talk')
  assert.equal(pickExpression(p, { typing: true, muted: true }).key, 'typing')
  assert.deepEqual(pickExpression(p, { muted: true }), { src: 'mute.png', crop: { x: 0 }, key: 'muted' })
  assert.equal(pickExpression(p, { deafened: true }).key, 'idle') // no deafened image set
  assert.equal(pickExpression({}, { typing: true }), null) // critter
  assert.equal(pickExpression({ avatar_states: { typing: { url: 't.gif' } } }, { typing: true }).key, 'typing')
  assert.equal(pickExpression({ avatar_talk: 't.png' }, { talk: true }).key, 'talk')
  assert.equal(pickExpression({ avatar_talk: 't.png' }, {}), null) // not talking, no idle → critter
})

import { hasBlink, nextBlink } from './expressions.js'
test('blinking', () => {
  const b = { ...p, avatar_states: { ...p.avatar_states, blink: { url: 'blink.png' }, talk_blink: { url: 'tb.png' } } }
  assert.equal(pickExpression(b, { blink: true }).key, 'blink')
  assert.equal(pickExpression(b, { blink: true, talk: true }).key, 'talk_blink')
  assert.equal(pickExpression(b, { blink: true, typing: true }).key, 'typing') // expressions don't blink
  assert.equal(pickExpression(p, { blink: true }).key, 'idle') // no blink image → no blink
  assert.ok(hasBlink(b) && !hasBlink(p))
  const n = nextBlink(() => 0.5)
  assert.ok(n.wait >= 2500 && n.wait <= 6500 && n.double === false)
})
