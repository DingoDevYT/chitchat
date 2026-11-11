import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acTrigger, bigPing, defaultLevel, effectiveLevel, encodeRooms, mentionItems, pingCounts, roleHandle, roomItems, roomToken, shouldNotify } from './notify.js'
import { tokenize } from './markdown.js'
import { previewText } from './cues.js'

const ID = '11111111-2222-3333-4444-555555555555'

test('levels: room > category > server > default; post discussions follow their gallery; DMs default to all', () => {
  const room = { id: 'r', server_id: 's', category_id: 'k', kind: 'text' }
  assert.equal(effectiveLevel({}, room, { s: 3 }), 'all')
  assert.equal(effectiveLevel({}, room, { s: 16 }), 'mentions')
  assert.equal(defaultLevel({ id: 'd', kind: 'dm' }, {}), 'all')
  assert.equal(effectiveLevel({ s: { level: 'none' } }, room, {}), 'none')
  assert.equal(effectiveLevel({ s: { level: 'none' }, k: { level: 'mentions' } }, room, {}), 'mentions')
  assert.equal(effectiveLevel({ k: { level: 'mentions' }, r: { level: 'all' } }, room, {}), 'all')
  assert.equal(effectiveLevel({ k: { level: 'mentions' }, r: { level: 'all' } }, room, {}, undefined, true), 'mentions')
  assert.equal(effectiveLevel({ s: { suppress_everyone: true } }, room, {}), 'all') // a server row with no level inherits
  const post = { id: 't', server_id: 's', kind: 'post', parent_channel_id: 'r' }
  assert.equal(effectiveLevel({ r: { level: 'none' } }, post, {}, id => id === 'r' ? room : null), 'none')
  assert.equal(effectiveLevel({ d: { level: 'mentions' } }, { id: 'd', kind: 'dm' }, {}), 'mentions')
})

test('pingCounts honours suppress switches', () => {
  assert.equal(pingCounts('user', { suppress_everyone: true, suppress_roles: true }), true)
  assert.equal(pingCounts('everyone', { suppress_everyone: true }), false)
  assert.equal(pingCounts('here', { suppress_everyone: true }), false)
  assert.equal(pingCounts('role', { suppress_roles: true }), false)
  assert.equal(pingCounts('role', undefined), true)
  assert.equal(pingCounts(null, {}), false)
})

test('shouldNotify', () => {
  const base = { level: 'all', pinged: false, ageMs: 1000 }
  assert.equal(shouldNotify(base), true)
  assert.equal(shouldNotify({ ...base, level: 'mentions' }), false)
  assert.equal(shouldNotify({ ...base, level: 'mentions', pinged: true }), true)
  assert.equal(shouldNotify({ ...base, level: 'none', pinged: true }), false)
  for (const k of ['mine', 'dnd', 'muted', 'blocked', 'here']) assert.equal(shouldNotify({ ...base, [k]: true }), false, k)
  assert.equal(shouldNotify({ ...base, ageMs: 5 * 60000 }), false) // old news after a reconnect
  assert.equal(shouldNotify({ ...base, ageMs: undefined }), false)
})

test('roleHandle mirrors public.role_handle', () => {
  assert.equal(roleHandle('Cringe Creature'), 'cringe_creature')
  assert.equal(roleHandle('  HOUSE  MD!! '), 'house_md')
  assert.equal(roleHandle('mods.team'), 'mods.team')
  assert.equal(roleHandle('Café'), 'caf')
  assert.equal(roleHandle('x'.repeat(40)).length, 32)
})

test('bigPing', () => {
  assert.equal(bigPing('hey @everyone!'), 'everyone')
  assert.equal(bigPing('@here.'), 'here')
  assert.equal(bigPing('mail me@everyone.com'), null)
  assert.equal(bigPing('@everyones'), null)
  assert.equal(bigPing(''), null)
})

test('acTrigger', () => {
  assert.deepEqual(acTrigger('hi @pi'), { kind: '@', q: 'pi', start: 3 })
  assert.deepEqual(acTrigger('@'), { kind: '@', q: '', start: 0 })
  assert.deepEqual(acTrigger('see ~Gam'), { kind: '~', q: 'gam', start: 4 })
  assert.equal(acTrigger('a@b'), null) // email
  assert.equal(acTrigger('~~strike'), null)
  assert.equal(acTrigger('hi @pip '), null)
})

test('mentionItems: big pings and roles only when allowed', () => {
  const people = [{ id: 'a', username: 'pip', display_name: 'Pip' }, { id: 'b', username: 'mochi' }, { id: 'c', username: 'hermes' }]
  const roles = [{ id: 'r1', name: 'Helpers' }, { id: 'r2', name: 'X' }]
  assert.deepEqual(mentionItems('', { people, roles }).map(x => x.insert), ['@pip', '@mochi', '@hermes'])
  const all = mentionItems('he', { people, roles, canPing: true }).map(x => x.insert)
  assert.deepEqual(all, ['@here', '@helpers', '@hermes'])
  assert.ok(!mentionItems('', { people, roles, canPing: true }).some(x => x.insert === '@x')) // 1-letter handles can't be typed
  assert.deepEqual(mentionItems('och', { people }).map(x => x.insert), ['@mochi'])
})

test('roomItems and room tokens', () => {
  const rooms = [{ id: '1', name: 'Pixel Arcade 👾', kind: 'text' }, { id: '2', name: 'general', kind: 'text' }, { id: '3', name: 'Hangout', kind: 'voice' }]
  assert.deepEqual(roomItems('arc', rooms).map(c => c.id), ['1'])
  assert.deepEqual(roomItems('pixela', rooms).map(c => c.id), ['1']) // spaces ignored
  assert.deepEqual(roomItems('', rooms).map(c => c.id), ['2', '1'])
  assert.equal(roomItems('hang', rooms).length, 0) // stadiums aren't linkable
  const r = { id: ID, name: 'games' }, rn = { id: ID.replace('1', '9'), name: 'games night' }
  assert.equal(roomToken({ id: ID, name: 'a<b>' }), `<~ab:${ID}>`)
  assert.equal(encodeRooms('go ~games night and ~games', [r, rn]), `go ${roomToken(rn)} and ${roomToken(r)}`)
  assert.equal(encodeRooms('~nope', [r]), '~nope')
  assert.deepEqual(tokenize(`see <~Movie: Night:${ID}>!`), [{ t: 'text', v: 'see ' }, { t: 'room', v: 'Movie: Night', id: ID }, { t: 'text', v: '!' }])
  assert.equal(previewText({ content: `come to ${roomToken({ id: ID, name: 'games' })}` }), 'come to games')
})
