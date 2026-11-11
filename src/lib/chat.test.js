import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, isJumbo } from './markdown.js'
import { startsGroup, mergeIncoming, applyReaction, summarizeReactions, overLimit } from './chat.js'

test('overLimit counts code points after trimming, like the DB check', () => {
  assert.equal(overLimit('a'.repeat(4000)), 0)
  assert.equal(overLimit('  ' + 'a'.repeat(4000) + '\n'), 0)
  assert.equal(overLimit('a'.repeat(4005)), 5)
  assert.equal(overLimit('😀'.repeat(4000)), 0) // 8000 UTF-16 units, 4000 code points
})

test('markdown basics', () => {
  assert.deepEqual(tokenize('hi **there**'), [{ t: 'text', v: 'hi ' }, { t: 'b', c: [{ t: 'text', v: 'there' }] }])
  assert.deepEqual(tokenize('`a*b*`'), [{ t: 'code', v: 'a*b*' }])
  assert.deepEqual(tokenize('```js\nx()\n```'), [{ t: 'codeblock', v: 'x()' }])
  assert.equal(tokenize('see https://x.com/a_b, ok')[1].v, 'https://x.com/a_b')
  assert.equal(tokenize('https://en.wikipedia.org/wiki/Foo_(bar)')[0].v, 'https://en.wikipedia.org/wiki/Foo_(bar)')
  assert.equal(tokenize('(see https://x.com/a)')[1].v, 'https://x.com/a')
  assert.equal(tokenize('https://x.com/(a)/b?q=1.')[0].v, 'https://x.com/(a)/b?q=1')
  assert.deepEqual(tokenize('snake_case_name'), [{ t: 'text', v: 'snake_case_name' }])
  assert.deepEqual(tokenize('mail a@b.com'), [{ t: 'text', v: 'mail a@b.com' }])
  assert.deepEqual(tokenize('yo @Sam!')[1], { t: 'mention', v: 'sam' })
  assert.equal(tokenize('||boo||')[0].t, 'spoiler')
})

test('jumbo emoji', () => {
  assert.ok(isJumbo('🎉'))
  assert.ok(isJumbo('👍🏽 ❤️'))
  assert.ok(!isJumbo('hi 🎉'))
  assert.ok(!isJumbo('123'))
})

test('grouping', () => {
  const a = { author_id: 'u', created_at: '2026-01-01T00:00:00Z' }
  assert.ok(startsGroup(null, a))
  assert.ok(!startsGroup(a, { author_id: 'u', created_at: '2026-01-01T00:04:00Z' }))
  assert.ok(startsGroup(a, { author_id: 'u', created_at: '2026-01-01T00:06:00Z' }))
  assert.ok(startsGroup(a, { author_id: 'v', created_at: '2026-01-01T00:01:00Z' }))
})

test('optimistic merge', () => {
  const pending = { id: 'tmp1', key: 'tmp1', pending: true, author_id: 'u', content: 'hey', reactions: [] }
  const merged = mergeIncoming([pending], { id: 5, author_id: 'u', content: 'hey' })
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 5)
  assert.equal(merged[0].key, 'tmp1') // stable key: no re-mount, no re-typing
  assert.equal(mergeIncoming(merged, { id: 5, author_id: 'u', content: 'hey' }), merged)
  const other = mergeIncoming(merged, { id: 6, author_id: 'v', content: 'yo' })
  assert.equal(other.length, 2)
  assert.equal(other[1]._live, true)
})

test('reactions', () => {
  let list = [{ id: 1, reactions: [] }]
  list = applyReaction(list, { message_id: 1, user_id: 'u', emoji: '👍' }, true)
  list = applyReaction(list, { message_id: 1, user_id: 'u', emoji: '👍' }, true) // duplicate ignored
  list = applyReaction(list, { message_id: 1, user_id: 'v', emoji: '👍' }, true)
  assert.deepEqual(summarizeReactions(list[0].reactions, 'u').map(r => [r.emoji, r.count, r.mine]), [['👍', 2, true]])
  list = applyReaction(list, { message_id: 1, user_id: 'u', emoji: '👍' }, false)
  assert.equal(list[0].reactions.length, 1)
})

import { emojiUrl, splitEmoji } from './markdown.js'
test('noto emoji', () => {
  const base = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/svg/'
  assert.equal(emojiUrl('😂'), base + 'emoji_u1f602.svg')
  assert.equal(emojiUrl('❤️'), base + 'emoji_u2764.svg')
  assert.equal(emojiUrl('👍🏽'), base + 'emoji_u1f44d_1f3fd.svg')
  assert.equal(emojiUrl('👨‍👩‍👧'), base + 'emoji_u1f468_200d_1f469_200d_1f467.svg')
  assert.equal(emojiUrl('#️⃣'), base + 'emoji_u0023_20e3.svg')
  assert.equal(emojiUrl('™'), null)
  const parts = splitEmoji('hi 😂👍🏽 ok™')
  assert.deepEqual(parts.map(p => typeof p === 'string' ? p : p.emoji), ['hi ', '😂', '👍🏽', ' ok™'])
})

import { withSkin, searchEmoji, normalize } from './emoji.js'
test('noto flags', () => {
  const flags = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/third_party/region-flags/waved-svg/'
  assert.equal(emojiUrl('🇦🇺'), flags + 'emoji_u1f1e6_1f1fa.svg')
  assert.equal(emojiUrl('🇺🇸'), flags + 'emoji_u1f1fa_1f1f8.svg')
  assert.equal(emojiUrl('🏴󠁧󠁢󠁥󠁮󠁧󠁿'), flags + 'emoji_u1f3f4_e0067_e0062_e0065_e006e_e0067_e007f.svg')
  assert.equal(emojiUrl('🇺🇲'), emojiUrl('🇺🇸')) // Noto symlink alias
  assert.ok(emojiUrl('🏴').includes('/svg/emoji_u1f3f4.svg')) // plain black flag is a normal emoji
  assert.deepEqual(splitEmoji('go 🇦🇺!').map(p => p.emoji || p), ['go ', '🇦🇺', '!'])
})

test('emoji picker logic', () => {
  const thumbs = { label: 'thumbs up', tags: ['+1', 'hand'], unicode: '👍️', hexcode: '1F44D',
    skins: [{ hexcode: '1F44D-1F3FB', unicode: '👍🏻' }, { hexcode: '1F44D-1F3FD', unicode: '👍🏽' }] }
  const shake = { label: 'people holding hands', tags: [], unicode: '🧑‍🤝‍🧑', hexcode: '1F9D1-200D-1F91D-200D-1F9D1',
    skins: [{ hexcode: '1F9D1-1F3FB-200D-1F91D-200D-1F9D1-1F3FD', unicode: 'mixed' }, { hexcode: '1F9D1-1F3FD-200D-1F91D-200D-1F9D1-1F3FD', unicode: 'both' }] }
  const heart = { label: 'red heart', tags: ['love'], unicode: '❤️', hexcode: '2764' }
  assert.equal(withSkin(thumbs, 0), '👍') // FE0F dropped so it matches QUICK_EMOJI '👍'
  assert.equal(withSkin(thumbs, 3), '👍🏽')
  assert.equal(withSkin(thumbs, 5), '👍') // missing variant falls back to default
  assert.equal(withSkin(shake, 3), 'both')
  assert.equal(withSkin(heart, 2), '❤️') // FE0F kept where it's needed
  assert.equal(normalize('🌡️'), '🌡️')
  const list = [thumbs, shake, heart]
  assert.deepEqual(searchEmoji(list, 'love'), [heart])
  assert.deepEqual(searchEmoji(list, 'Thumbs'), [thumbs])
  assert.deepEqual(searchEmoji(list, 'hand'), [thumbs, shake])
  assert.deepEqual(searchEmoji(list, 'red love'), [heart])
  assert.deepEqual(searchEmoji(list, '  '), [])
})

import { mediaLinks } from './chat.js'
test('media links', () => {
  const l = mediaLinks('look https://x.com/a/cat%20pic.PNG?w=2 and https://x.com/song.mp3, https://x.com/page.html')
  assert.deepEqual(l.map(m => [m.type, m.name]), [['image/png', 'cat pic.PNG'], ['audio/mpeg', 'song.mp3']])
  assert.equal(l[0].url, 'https://x.com/a/cat%20pic.PNG?w=2')
  assert.equal(mediaLinks('https://x.com/v.mov https://x.com/v.mov').length, 1) // deduped
  assert.deepEqual(mediaLinks('`https://x.com/a.gif` ||https://x.com/b.gif||'), []) // not in code or spoilers
  assert.equal(mediaLinks('**https://x.com/c.webm**')[0].type, 'video/webm')
  assert.deepEqual(mediaLinks('https://x.com/%E0%A4%A.gif'), []) // bad escape doesn't throw
  assert.deepEqual(mediaLinks(''), [])
})

import { toGif } from './giphy.js'
test('giphy mapping', () => {
  const g = toGif({ id: 'x', title: '', images: {
    fixed_width: { url: 'a.gif', webp: 'a.webp', width: '200', height: '150' },
    downsized: { url: 'b.gif', width: '400', height: '300' }, original: { url: 'c.gif', width: '800', height: '600' } } })
  assert.deepEqual(g, { id: 'x', title: 'GIF', preview: 'a.webp', pw: 200, ph: 150, url: 'b.gif', w: 400, h: 300 })
})

import { level, gateUntil, trackFloor, autoThreshold, keyLabel, missingDevice } from './voice.js'
test('voice gate', () => {
  assert.equal(level(1), 100)
  assert.equal(Math.round(level(0.01)), 60)
  assert.equal(level(0), 0)
  // loud at 0s, then quiet: the gate hangs open for 0.3s after the last loud moment
  let until = gateUntil(70, 50, 0, 0)
  until = gateUntil(20, 50, until, 0.1)
  assert.ok(0.25 < until && 0.35 > until)
  assert.equal(gateUntil(20, 50, 0, 1), 0)
  assert.ok(trackFloor(40, 20) < 40 && trackFloor(40, 90) > 40 && trackFloor(40, 90) < 41) // falls fast, rises slowly
  assert.equal(autoThreshold(40), 55)
  assert.equal(autoThreshold(90), 75)
})
test('voice keys and devices', () => {
  assert.equal(keyLabel('Backquote'), '`')
  assert.equal(keyLabel('KeyV'), 'V')
  assert.equal(keyLabel('Digit3'), '3')
  assert.equal(keyLabel('ShiftLeft'), 'Left Shift')
  assert.equal(keyLabel('F5'), 'F5')
  const ds = [{ kind: 'audioinput', deviceId: 'a' }, { kind: 'audiooutput', deviceId: '' }]
  assert.equal(missingDevice(ds, 'audioinput', 'a'), false)
  assert.equal(missingDevice(ds, 'audioinput', 'gone'), true)
  assert.equal(missingDevice(ds, 'audioinput', ''), false)
  assert.equal(missingDevice(ds, 'audiooutput', 'x'), false) // no permission yet: ids are blank
})
