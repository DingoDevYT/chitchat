import test from 'node:test'
import assert from 'node:assert/strict'
import { timeAgo, activeThreads, replies } from './threads.js'

test('timeAgo', () => {
  const now = Date.parse('2026-01-02T12:00:00Z')
  assert.equal(timeAgo('2026-01-02T11:59:50Z', now), 'just now')
  assert.equal(timeAgo('2026-01-02T11:57:00Z', now), '3m ago')
  assert.equal(timeAgo('2026-01-02T10:00:00Z', now), '2h ago')
  assert.equal(timeAgo('2025-12-30T12:00:00Z', now), '3d ago')
  assert.equal(timeAgo('2026-01-02T12:00:10Z', now), 'just now') // clock skew
})

test('activeThreads', () => {
  const cs = [
    { id: 'a', kind: 'thread', parent_channel_id: 'p', created_at: '2026-01-01', last_reply_at: '2026-01-03' },
    { id: 'b', kind: 'thread', parent_channel_id: 'p', created_at: '2026-01-04', last_reply_at: null },
    { id: 'c', kind: 'thread', parent_channel_id: 'p', created_at: '2026-01-05', archived: true },
    { id: 'd', kind: 'thread', parent_channel_id: 'q', created_at: '2026-01-05' },
    { id: 'p', kind: 'text' },
  ]
  assert.deepEqual(activeThreads(cs, 'p').map(c => c.id), ['b', 'a'])
  assert.equal(replies(1), '1 reply')
  assert.equal(replies(0), '0 replies')
})
