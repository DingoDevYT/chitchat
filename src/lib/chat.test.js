import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, isJumbo } from './markdown.js'
import { startsGroup, mergeIncoming, applyReaction, summarizeReactions } from './chat.js'

test('markdown basics', () => {
  assert.deepEqual(tokenize('hi **there**'), [{ t: 'text', v: 'hi ' }, { t: 'b', c: [{ t: 'text', v: 'there' }] }])
  assert.deepEqual(tokenize('`a*b*`'), [{ t: 'code', v: 'a*b*' }])
  assert.deepEqual(tokenize('```js\nx()\n```'), [{ t: 'codeblock', v: 'x()' }])
  assert.equal(tokenize('see https://x.com/a_b, ok')[1].v, 'https://x.com/a_b')
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
