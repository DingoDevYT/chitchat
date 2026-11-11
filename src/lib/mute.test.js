import test from 'node:test'
import assert from 'node:assert/strict'
import { blockedDM, channelMuted, isMuted, muteValue, nextExpiry } from './mute.js'

test('1:1 DM with a blocked person is quiet, group DMs are not', () => {
  const dm = ids => ({ kind: 'dm', channel_members: ids.map(user_id => ({ user_id })) })
  assert.equal(blockedDM({ b: true }, dm(['me', 'b']), 'me'), true)
  assert.equal(blockedDM({ b: true }, dm(['me', 'c']), 'me'), false)
  assert.equal(blockedDM({ b: true }, dm(['me', 'b', 'c']), 'me'), false)
  assert.equal(blockedDM({ b: true }, { kind: 'text', channel_members: [] }, 'me'), false)
  assert.equal(blockedDM({}, null, 'me'), false)
})

test('mute values and expiry', () => {
  assert.equal(muteValue(null, 1000), true)
  assert.equal(muteValue(15, 1000), 1000 + 15 * 60000)
  const m = { a: true, b: 5000, c: 500 }
  assert.equal(isMuted(m, 'a', 1000), true)
  assert.equal(isMuted(m, 'b', 1000), true)
  assert.equal(isMuted(m, 'b', 6000), false)
  assert.equal(isMuted(m, 'c', 1000), false)
  assert.equal(isMuted(m, 'zz', 1000), false)
  assert.equal(isMuted(m, null, 1000), false)
  assert.equal(nextExpiry(m, 1000), 5000)
  assert.equal(nextExpiry(m, 6000), null)
})

test('channel muted via its server', () => {
  const m = { s1: true }
  assert.equal(channelMuted(m, { id: 'c1', server_id: 's1' }), true)
  assert.equal(channelMuted(m, { id: 'c2', server_id: 's2' }), false)
  assert.equal(channelMuted(m, { id: 'dm', server_id: null }), false)
  assert.equal(channelMuted(m, null), false)
})
