import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotImage, setSlot, cleanLook, imageCount, columnsFor, baseOf, switchPatch, basePatch, copyName } from './avatarLook.js'
import { pickExpression } from './expressions.js'

const U = n => `https://x.supabase.co/storage/v1/object/public/media/u/${n}.png`
const look = { avatar_idle: U('idle'), avatar_talk: U('talk'), avatar_talk_crop: { zoom: 2 }, avatar_states: { muted: { url: U('mute') }, bogus: { url: U('b') } } }

test('slots read and write the profile-shaped look', () => {
  assert.deepEqual(slotImage(look, 'idle'), { url: U('idle'), crop: null })
  assert.deepEqual(slotImage(look, 'talk'), { url: U('talk'), crop: { zoom: 2 } })
  assert.deepEqual(slotImage(look, 'muted'), { url: U('mute'), crop: null })
  assert.equal(slotImage(look, 'typing'), null)
  const n = setSlot(look, 'typing', { url: U('type'), crop: null })
  assert.equal(n.avatar_states.typing.url, U('type'))
  assert.equal(setSlot(n, 'talk', null).avatar_talk, undefined)
  assert.equal(imageCount(n), 4)
})

test('cleanLook drops unknown keys and non-image urls', () => {
  const c = cleanLook({ ...look, avatar_idle: 'javascript:alert(1)', extra: 1 })
  assert.equal(c.avatar_idle, undefined)
  assert.equal(c.extra, undefined)
  assert.equal(c.avatar_states.bogus, undefined)
  assert.ok(c.avatar_states.muted)
  // a look draws like a profile
  assert.equal(pickExpression(cleanLook(look), { talk: true }).src, U('talk'))
})

test('columnsFor nulls every column a look leaves out', () => {
  assert.deepEqual(columnsFor({ avatar_idle: U('a') }), { avatar_idle: U('a'), avatar_crop: null, avatar_talk: null, avatar_talk_crop: null, avatar_states: {} })
})

test('switching on a setup keeps the plain picture, switching off restores it', () => {
  const plain = { id: 'me', avatar_idle: U('pic'), avatar_crop: { zoom: 1.5 }, avatar_states: {} }
  const on = { ...plain, ...switchPatch(plain, { id: 's1', look }) }
  assert.equal(on.avatar_setup, 's1')
  assert.equal(on.avatar_idle, U('idle'))
  assert.equal(on.avatar_talk, U('talk'))
  assert.deepEqual(on.avatar_base, { url: U('pic'), crop: { zoom: 1.5 } })
  assert.deepEqual(baseOf(on), { url: U('pic'), crop: { zoom: 1.5 } })
  const other = { ...on, ...switchPatch(on, { id: 's2', look: { avatar_idle: U('two') } }) }
  assert.deepEqual(other.avatar_base, on.avatar_base) // setup to setup keeps the picture
  assert.equal(other.avatar_talk, null)
  const off = { ...other, ...switchPatch(other, null) }
  assert.equal(off.avatar_setup, null)
  assert.equal(off.avatar_idle, U('pic'))
  assert.deepEqual(off.avatar_crop, { zoom: 1.5 })
  assert.equal(off.avatar_talk, null)
  assert.deepEqual(off.avatar_states, {})
})

test('a critter (no picture) round-trips through a setup', () => {
  const critter = { id: 'me', avatar_idle: null }
  const on = { ...critter, ...switchPatch(critter, { id: 's', look }) }
  assert.equal(on.avatar_base, null)
  assert.equal({ ...on, ...switchPatch(on, null) }.avatar_idle, null)
})

test('changing the plain picture only shows when no setup is on', () => {
  assert.deepEqual(basePatch({ avatar_setup: null }, { url: U('n') }), { avatar_base: null, avatar_idle: U('n'), avatar_crop: null })
  assert.deepEqual(basePatch({ avatar_setup: 's' }, { url: U('n') }), { avatar_base: { url: U('n') } })
  assert.deepEqual(basePatch({ avatar_setup: 's' }, null), { avatar_base: null })
})

test('copyName counts up and stays within 40 characters', () => {
  assert.equal(copyName('Fox'), 'Fox (copy)')
  assert.equal(copyName('Fox (copy)', ['Fox (copy)']), 'Fox (copy 2)')
  assert.equal(copyName('x'.repeat(40)).length, 40)
})
