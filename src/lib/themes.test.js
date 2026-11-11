import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, THEME_IDS, isTheme, isScene, normIntensity, resolveTheme, scatter, themeMeta } from './themes.js'

const S = 'srv'
const room = (theme, extra) => ({ id: 'c', kind: 'text', server_id: S, theme, ...extra })

test('inheritance: room → category → server → none', () => {
  assert.deepEqual(resolveTheme({ channel: room('beach'), category: { theme: 'snow' }, server: { theme: 'night' } }), { id: 'beach', from: 'channel' })
  assert.deepEqual(resolveTheme({ channel: room(null), category: { theme: 'snow' }, server: { theme: 'night' } }), { id: 'snow', from: 'category' })
  assert.deepEqual(resolveTheme({ channel: room(null), category: { theme: null }, server: { theme: 'night' } }), { id: 'night', from: 'server' })
  assert.deepEqual(resolveTheme({ channel: room(null), category: undefined, server: { theme: null } }), { id: 'none', from: null })
  assert.deepEqual(resolveTheme({ channel: room(null), server: null }), { id: 'none', from: null })
})

test("an explicit 'none' stops inheritance", () => {
  assert.equal(resolveTheme({ channel: room('none'), category: { theme: 'snow' }, server: { theme: 'night' } }).id, 'none')
  assert.equal(resolveTheme({ channel: room(null), category: { theme: 'none' }, server: { theme: 'night' } }).from, 'category')
})

test('stadiums inherit too; DMs and threads never get a theme', () => {
  assert.equal(resolveTheme({ channel: room(null, { kind: 'voice' }), server: { theme: 'campfire' } }).id, 'campfire')
  assert.equal(resolveTheme({ channel: { kind: 'dm', server_id: null, theme: 'beach' }, server: { theme: 'night' } }).id, 'none')
  assert.equal(resolveTheme({ channel: room('beach', { kind: 'thread' }), server: { theme: 'night' } }).id, 'none')
})

test('unknown ids are ignored (an old client meeting a new theme falls through to the next level)', () => {
  assert.equal(resolveTheme({ channel: room('lava'), server: { theme: 'sea' } }).id, 'sea')
  assert.equal(isTheme('lava'), false)
  assert.equal(isTheme('toString'), false)
  assert.equal(isTheme(null), false)
  assert.equal(themeMeta('lava').id, 'none')
})

test('none and gradient are not scenes; every scene has 3 colours', () => {
  assert.equal(isScene('none'), false)
  assert.equal(isScene('gradient'), false)
  for (const t of THEMES.filter(t => isScene(t.id))) assert.equal(t.colors.length, 3, t.id)
  assert.equal(new Set(THEME_IDS).size, THEME_IDS.length)
})

test('theme ids match the CHECK constraint in migration 027', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/027_themes.sql', import.meta.url), 'utf8')
  const ids = sql.match(/t in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1))
  assert.deepEqual([...ids].sort(), [...THEME_IDS].sort())
})

test('intensity setting defaults to full', () => {
  assert.equal(normIntensity(undefined), 'full')
  assert.equal(normIntensity('subtle'), 'subtle')
  assert.equal(normIntensity('off'), 'off')
  assert.equal(normIntensity('loud'), 'full')
})

test('scatter is deterministic and in [0, 1)', () => {
  assert.deepEqual(scatter(5, 3), scatter(5, 3))
  assert.notDeepEqual(scatter(5, 3), scatter(5, 4))
  for (const p of scatter(200, 9)) for (const v of Object.values(p)) assert.ok(v >= 0 && v < 1)
})
