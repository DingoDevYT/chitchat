import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FONTS, cleanRoomName, iconKind, inkFor, isMediaUrl, roomAccent, fmtSlow, fmtLeft, slowUntil, shrinkOf, fontHref } from './rooms.js'

const MEDIA = 'https://nilludyavkfqwastghmw.supabase.co/storage/v1/object/public/media/u/x/banner.webp'

test('cleanRoomName keeps case, emoji and punctuation; trims and collapses whitespace', () => {
  assert.equal(cleanRoomName('  General   Chat\n\n🍵  '), 'General Chat 🍵')
  assert.equal(cleanRoomName("Pip's #1 Room!"), "Pip's #1 Room!")
  assert.equal(cleanRoomName('   '), '')
  assert.equal([...cleanRoomName('🌸'.repeat(80))].length, 64) // counts characters, not UTF-16 units
})

test('iconKind accepts emoji, custom emoji and media urls only', () => {
  assert.equal(iconKind('🌸'), 'emoji')
  assert.equal(iconKind('👩‍👩‍👧‍👦'), 'emoji')
  assert.equal(iconKind('<a:party:0a1b2c3d-0000-4000-8000-000000000000>'), 'custom')
  assert.equal(iconKind(MEDIA), 'image')
  assert.equal(iconKind('https://evil.example/x.png'), null)
  assert.equal(iconKind('hello world'), null)
  assert.equal(iconKind(null), null)
  assert.equal(isMediaUrl(MEDIA + '"onerror'), false)
})

test('accent falls back to the server, ink contrasts', () => {
  assert.equal(roomAccent({ accent: '#112233' }, { accent: '#ffffff' }), '#112233')
  assert.equal(roomAccent({ accent: 'red' }, { accent: '#ffffff' }), '#ffffff')
  assert.equal(roomAccent({}, {}), null)
  assert.equal(inkFor('#ffd166'), '#2a1a10')
  assert.equal(inkFor('#3b2a7a'), '#ffffff')
  assert.equal(inkFor('nope'), null)
})

test('slowmode formatting and next-send time', () => {
  assert.deepEqual([0, 5, 30, 60, 300, 3600, 90].map(fmtSlow), ['Off', '5s', '30s', '1m', '5m', '1h', '90s'])
  assert.equal(fmtLeft(9.2), '0:10')
  assert.equal(fmtLeft(299), '4:59')
  assert.equal(fmtLeft(3600), '1:00:00')
  const msgs = [
    { author_id: 'me', created_at: '2026-01-01T00:00:00Z' },
    { author_id: 'you', created_at: '2026-01-01T00:00:05Z' },
    { author_id: 'me', created_at: '2026-01-01T00:00:10Z', failed: true },
  ]
  assert.equal(slowUntil(msgs, 'me', 10), Date.parse('2026-01-01T00:00:10Z'))
  assert.equal(slowUntil(msgs, 'me', 0), null)
  assert.equal(slowUntil(msgs, 'nobody', 10), null)
})

test('banner shrink follows the column-reverse scroll', () => {
  assert.equal(shrinkOf(0), 0)
  assert.equal(shrinkOf(-70), 0.5)
  assert.equal(shrinkOf(-999), 1)
  assert.equal(shrinkOf(20), 0)
})

test('font list matches the database CHECK and builds swap urls', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/026_rooms.sql', import.meta.url), 'utf8')
  const inCheck = sql.match(/font in \(([^)]*)\)/s)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))
  assert.deepEqual(FONTS.map(f => f.name), inCheck)
  assert.equal(fontHref(FONTS[10]), 'https://fonts.googleapis.com/css2?family=Press+Start+2P:wght@400&display=swap')
})
