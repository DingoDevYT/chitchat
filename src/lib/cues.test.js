import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstUnreadId, lastSeenText, mentionsMe, mergeRecent, previewText, shouldMarkSeen, SEEN_EVERY } from './cues.js'

test('mentionsMe matches whole @username only', () => {
  for (const s of ['hey @pip look', '@PIP!', 'bye @pip.', '(@pip)', '@pip']) assert.equal(mentionsMe(s, 'pip'), true, s)
  for (const s of ['@pipx no', 'mail a@pip', '@pip.other', 'pip', '@@pip', '']) assert.equal(mentionsMe(s, 'pip'), false, s)
  assert.equal(mentionsMe('hi @mo.chi', 'mo.chi'), true)
  assert.equal(mentionsMe('hi @moXchi', 'mo.chi'), false) // the dot is literal
})

test('firstUnreadId', () => {
  const msgs = [{ id: 5, author_id: 'a' }, { id: 7, author_id: 'me' }, { id: 9, author_id: 'a' }, { id: 'tmp-1', author_id: 'me', pending: true }]
  assert.equal(firstUnreadId(msgs, 5, 'me', true), 9)       // skips my own message
  assert.equal(firstUnreadId(msgs, 9, 'me', true), null)    // all read
  assert.equal(firstUnreadId(msgs, null, 'me', false), null) // no read state
  assert.equal(firstUnreadId(msgs, 2, 'me', true), null)    // boundary not loaded yet
  assert.equal(firstUnreadId(msgs, 2, 'me', false), 5)      // whole history loaded
})

test('mergeRecent keeps contiguous history and unsent rows', () => {
  const r = id => ({ id })
  const tmp = { id: 'tmp-1', pending: true }, bad = { id: 'tmp-2', failed: true }
  assert.deepEqual(mergeRecent([r(1), r(2), r(3), tmp, bad], [r(3), r(4)]).map(m => m.id), [1, 2, 3, 4, 'tmp-1', 'tmp-2'])
  assert.deepEqual(mergeRecent([r(1), r(2)], [r(8), r(9)]).map(m => m.id), [8, 9]) // gap: drop the stale older part
  assert.deepEqual(mergeRecent(null, [r(1)]).map(m => m.id), [1])
  assert.deepEqual(mergeRecent([r(1), tmp], []).map(m => m.id), [1, 'tmp-1'])
})

test('previewText strips markdown and emoji, labels attachments', () => {
  assert.equal(previewText({ content: '**hi** <:wave:00000000-0000-0000-0000-000000000000> `x` ||secret||' }), 'hi :wave: x ▒▒▒')
  assert.equal(previewText({ content: 'line\n\nbreak' }), 'line break')
  assert.equal(previewText({ content: '', attachments: [{ type: 'image/png' }] }), '📎 image')
  assert.equal(previewText({ content: '', attachments: [{ type: 'image/gif', gif: true }, { type: 'application/pdf' }] }), '📎 GIF +1')
  assert.equal(previewText({ content: '', attachments: [{ type: 'application/pdf' }] }), '📎 file')
  assert.equal(previewText({ content: 'x'.repeat(100) }, 10), 'xxxxxxxxx…')
  assert.equal(previewText(null), '')
})

test('lastSeenText', () => {
  const now = Date.parse('2026-11-12T12:00:00Z'), ago = s => new Date(now - s * 1000).toISOString()
  assert.equal(lastSeenText(ago(30), now), 'last seen just now')
  assert.equal(lastSeenText(ago(600), now), 'last seen 10m ago')
  assert.equal(lastSeenText(ago(7200), now), 'last seen 2h ago')
  assert.equal(lastSeenText(ago(86400 * 1.2), now), 'last seen yesterday')
  assert.equal(lastSeenText(ago(86400 * 5), now), 'last seen 5d ago')
  assert.equal(lastSeenText(null, now), '')
})

test('shouldMarkSeen throttles and respects invisible', () => {
  assert.equal(shouldMarkSeen('online', 0, 1e9), true)
  assert.equal(shouldMarkSeen('online', 1e9 - 1000, 1e9), false)
  assert.equal(shouldMarkSeen('idle', 1e9 - SEEN_EVERY, 1e9), true)
  assert.equal(shouldMarkSeen('online', 1e9 - 1000, 1e9, true), true)
  assert.equal(shouldMarkSeen('invisible', 0, 1e9, true), false)
})
