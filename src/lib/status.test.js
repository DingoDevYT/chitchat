import test from 'node:test'
import assert from 'node:assert/strict'
import { statusOf, effectiveStatus, activeCustom, expiryFor } from './status.js'

test('presence status', () => {
  assert.equal(statusOf(undefined), 'offline')
  assert.equal(statusOf({ status: 'invisible', voice: 'x' }), 'offline')
  assert.equal(statusOf({}), 'online')
  assert.equal(statusOf({ status: 'dnd' }), 'dnd')
})

test('auto idle only from online', () => {
  assert.equal(effectiveStatus('online', true), 'idle')
  assert.equal(effectiveStatus(undefined, true), 'idle')
  assert.equal(effectiveStatus('dnd', true), 'dnd')
  assert.equal(effectiveStatus('invisible', true), 'invisible')
  assert.equal(effectiveStatus('online', false), 'online')
})

test('custom status expiry', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  assert.equal(activeCustom(null), null)
  assert.equal(activeCustom({ text: '', emoji: '' }), null)
  assert.ok(activeCustom({ text: 'hi', expires_at: null }, now))
  assert.equal(activeCustom({ text: 'hi', expires_at: '2026-01-01T11:59:00Z' }, now), null)
  assert.ok(activeCustom({ emoji: '🍵', expires_at: '2026-01-01T12:01:00Z' }, now))
  const d = new Date(now)
  assert.equal(expiryFor('30m', d), '2026-01-01T12:30:00.000Z')
  assert.equal(expiryFor('never', d), null)
  const t = new Date(expiryFor('today', d))
  assert.equal(t.getDate(), d.getDate())
  assert.ok(t > d)
})
