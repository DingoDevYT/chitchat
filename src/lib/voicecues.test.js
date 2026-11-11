import test from 'node:test'
import assert from 'node:assert/strict'
import { peerStatus, diffMembers, stadiumLabel, playChime, CHIME } from './voicecues.js'

test('peer status from connection / ICE state', () => {
  assert.equal(peerStatus('new'), 'connecting')
  assert.equal(peerStatus('connecting', 'checking'), 'connecting')
  assert.equal(peerStatus('connected', 'checking'), 'connected')
  assert.equal(peerStatus('disconnected'), 'connecting')
  assert.equal(peerStatus('failed'), 'failed')
  assert.equal(peerStatus('closed'), null)
  assert.equal(peerStatus(undefined, 'completed'), 'connected')
  assert.equal(peerStatus(undefined, 'failed'), 'failed')
})

test('member diff ignores the first snapshot and yourself', () => {
  assert.deepEqual(diffMembers(null, ['me', 'a'], 'me'), { joined: [], left: [] })
  assert.deepEqual(diffMembers(['me', 'a'], ['me', 'b'], 'me'), { joined: ['b'], left: ['a'] })
  assert.deepEqual(diffMembers(['a'], ['a', 'me'], 'me'), { joined: [], left: [] })
})

test('stadium label: name when visible, generic otherwise', () => {
  const chans = [{ id: 'v1', name: 'Hangout', server_id: 's1' }]
  assert.equal(stadiumLabel(null, chans), null)
  assert.deepEqual(stadiumLabel('v1', chans), { text: 'in Hangout', serverId: 's1', channelId: 'v1' })
  assert.deepEqual(stadiumLabel('v9', chans), { text: 'in a stadium' })
  assert.equal(stadiumLabel('call:abc', chans), null) // DM calls aren't shown as stadiums
})

test('chime plays two quiet notes in order', () => {
  const freqs = [], peaks = []
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime(v) { peaks.push(v) }, exponentialRampToValueAtTime() {} })
  const node = () => ({ connect: n => n })
  const ctx = {
    currentTime: 0,
    createOscillator: () => { const o = { ...node(), frequency: param(), start() {}, stop() {} }; freqs.push(o.frequency); return o },
    createGain: () => ({ ...node(), gain: param() }),
  }
  playChime(ctx, {}, 'leave')
  assert.deepEqual(freqs.map(f => f.value), CHIME.leave)
  assert.ok(CHIME.join[1] > CHIME.join[0] && CHIME.leave[1] < CHIME.leave[0])
  assert.ok(peaks.every(p => p <= 0.1))
})
