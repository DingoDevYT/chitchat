import test from 'node:test'
import assert from 'node:assert/strict'
import { postBlock, timedOut, leftText, relTime, inviteState, usesText, describeAudit, fieldList } from './moderation.js'
import { canModerate, sortRoles, PERMS } from './roles.js'

const now = Date.parse('2026-11-12T12:00:00Z')
const iso = s => new Date(now + s * 1000).toISOString()

test('timeouts and rules screening mirror post_block', () => {
  const server = { screening_at: iso(-3600), rules: 'Be kind.' }
  assert.equal(timedOut({ timeout_until: iso(30) }, now), true)
  assert.equal(timedOut({ timeout_until: iso(-1) }, now), false)
  assert.equal(postBlock(server, { role: 'member', timeout_until: iso(30), joined_at: iso(-99999) }, false, now), 'timeout')
  assert.equal(postBlock(server, { role: 'member', joined_at: iso(-60) }, false, now), 'rules') // joined after screening
  assert.equal(postBlock(server, { role: 'member', joined_at: iso(-7200) }, false, now), null) // joined before: grandfathered
  assert.equal(postBlock(server, { role: 'member', joined_at: iso(-60), rules_agreed_at: iso(-10) }, false, now), null)
  assert.equal(postBlock(server, { role: 'owner', joined_at: iso(-60) }, false, now), null)
  assert.equal(postBlock(server, { role: 'member', joined_at: iso(-60) }, true, now), null) // manage_server
  assert.equal(postBlock({ ...server, rules: '  ' }, { role: 'member', joined_at: iso(-60) }, false, now), null) // no rules written
  assert.equal(postBlock({ rules: 'x' }, { role: 'member', joined_at: iso(-60) }, false, now), null) // screening off
  assert.equal(postBlock(server, undefined, false, now), null)
})

test('countdowns and relative times', () => {
  assert.equal(leftText(45_000), '45s')
  assert.equal(leftText(245_000), '4m 05s')
  assert.equal(leftText(7_800_000), '2h 10m')
  assert.equal(leftText(3 * 86400_000 + 4 * 3600_000), '3d 4h')
  assert.equal(leftText(-5), '0s')
  assert.equal(relTime(iso(-10), now), 'just now')
  assert.equal(relTime(iso(-300), now), '5 minutes ago')
  assert.equal(relTime(iso(3 * 3600), now), 'in 3 hours')
  assert.equal(relTime(iso(-86400), now), 'yesterday')
  assert.equal(relTime(iso(7 * 86400), now), 'in 7 days')
})

test('invite state and uses', () => {
  assert.deepEqual(inviteState({ uses: 0 }, now), { live: true, label: 'Never expires' })
  assert.deepEqual(inviteState({ uses: 1, expires_at: iso(1800) }, now), { live: true, label: 'Expires in 30 minutes' })
  assert.equal(inviteState({ uses: 0, expires_at: iso(-1) }, now).label, 'Expired')
  assert.equal(inviteState({ uses: 5, max_uses: 5 }, now).label, 'Used up')
  assert.equal(usesText({ uses: 2, max_uses: 10 }), '2 of 10 uses')
  assert.equal(usesText({ uses: 1 }), '1 use')
  assert.equal(usesText({ uses: 0 }), '0 uses')
})

test('audit lines read like sentences', () => {
  const name = id => ({ m: 'mochi' })[id] || 'someone'
  assert.equal(describeAudit({ action: 'member_ban', target_id: 'm', details: { deleted: 3 } }, name), 'banned mochi and cleared 3 messages')
  assert.equal(describeAudit({ action: 'member_timeout', target_id: 'm', details: { secs: 600 } }, name), 'timed out mochi for 10 minutes')
  assert.equal(describeAudit({ action: 'member_nickname', target_id: 'm', details: {} }, name), "cleared mochi's nickname")
  assert.equal(describeAudit({ action: 'channel_update', details: { name: 'Hangout', kind: 'voice', changed: ['topic', 'slowmode_sec'] } }, name),
    'edited the stadium Hangout (topic, slowmode)')
  assert.equal(describeAudit({ action: 'channel_update', details: { name: 'chill', from: 'general', kind: 'text', changed: ['name'] } }, name),
    'renamed the room general to chill')
  assert.equal(describeAudit({ action: 'server_update', details: { changed: ['icon_url', 'icon_crop', 'name'] } }, name), 'changed server settings (icon, name)')
  assert.equal(describeAudit({ action: 'message_delete', target_id: 'x', details: { room: 'general' } }, name), 'deleted a message by someone in general')
  assert.equal(describeAudit({ action: 'something_new', details: {} }, name), 'something new')
  assert.equal(fieldList(['members_can_invite', 'rules']), 'who can invite, rules')
})

test('moderation rank rules mirror public.can_moderate', () => {
  const roles = sortRoles([
    { id: 'mod', position: 10, permissions: ['ban_members', 'timeout_members'], created_at: '1' },
    { id: 'low', position: 1, permissions: [], created_at: '2' },
  ])
  const data = { roles, byUser: { a: ['mod'], b: ['low'], c: ['mod'] } }
  assert.equal(canModerate(data, 'member', 'a', 'b', 'member', 'ban_members'), true)
  assert.equal(canModerate(data, 'member', 'a', 'gone', undefined, 'ban_members'), true) // ban a non-member by id
  assert.equal(canModerate(data, 'member', 'a', 'c', 'member', 'ban_members'), false) // equal rank
  assert.equal(canModerate(data, 'member', 'a', 'b', 'member', 'manage_nicknames'), false) // lacks the perm
  assert.equal(canModerate(data, 'member', 'a', 'x', 'admin', 'ban_members'), false)
  assert.equal(canModerate(data, 'admin', 'z', 'a', 'member', 'timeout_members'), true)
  assert.equal(canModerate(data, 'owner', 'z', 'x', 'admin', 'timeout_members'), true)
  assert.equal(canModerate(data, 'owner', 'z', 'y', 'owner', 'ban_members'), false)
  assert.equal(canModerate(data, 'owner', 'z', 'z', 'owner', 'ban_members'), false)
  assert.equal(canModerate(data, undefined, 'q', 'b', 'member', 'ban_members'), false) // not in the server
  for (const p of ['ban_members', 'timeout_members', 'manage_nicknames', 'manage_invites', 'view_audit_log'])
    assert.ok(PERMS.some(([k]) => k === p), p)
})
