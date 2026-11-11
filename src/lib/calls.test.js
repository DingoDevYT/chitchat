import test from 'node:test'
import assert from 'node:assert/strict'
import { callKey, dmCalls, newRings, callLength } from './calls.js'

test('call keys differ per person and per DM, and are stable', () => {
  assert.equal(callKey('dm1', 'a'), callKey('dm1', 'a'))
  assert.notEqual(callKey('dm1', 'a'), callKey('dm1', 'b'))
  assert.notEqual(callKey('dm1', 'a'), callKey('dm2', 'a'))
  assert.match(callKey('dm1', 'a'), /^call:[0-9a-z]+$/)
})

test('dmCalls finds members in a call per DM, ignoring stadiums and other DMs', () => {
  const chans = [
    { id: 'd1', kind: 'dm', channel_members: [{ user_id: 'a' }, { user_id: 'b' }] },
    { id: 'd2', kind: 'dm', channel_members: [{ user_id: 'a' }, { user_id: 'c' }] },
    { id: 'v1', kind: 'voice' },
  ]
  const online = { a: { voice: callKey('d1', 'a') }, b: { voice: callKey('d1', 'b') }, c: { voice: 'v1' } }
  assert.deepEqual(dmCalls(online, chans), { d1: 'a,b' })
  assert.deepEqual(dmCalls({ c: { voice: callKey('d1', 'c') } }, chans), {}) // c isn't in d1
})

test('rings only for new calls you are not in, and not from people you blocked', () => {
  assert.deepEqual(newRings({}, { d1: 'a' }, 'me'), ['d1'])
  assert.deepEqual(newRings({ d1: 'a' }, { d1: 'a,b' }, 'me'), [])
  assert.deepEqual(newRings({}, { d1: 'a,me' }, 'me'), [])
  assert.deepEqual(newRings({}, { d1: 'a' }, 'me', { a: true }), [])
  assert.deepEqual(newRings({}, { d1: 'a,b' }, 'me', { a: true }), ['d1'])
})

test('call lengths read naturally', () => {
  assert.equal(callLength(42), '42s')
  assert.equal(callLength(12 * 60 + 10), '12m')
  assert.equal(callLength(3600 + 5 * 60), '1h 5m')
})
