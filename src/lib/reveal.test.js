import test from 'node:test'
import assert from 'node:assert/strict'
import { revealTokens } from './reveal.js'

test('reveal tokens keep words whole and track string positions', () => {
  const t = revealTokens('hi 👍🏽  yo')
  assert.deepEqual(t.map(x => x.space ? `[${x.text}]` : x.chars.map(c => c.text).join('|')), ['h|i', '[ ]', '👍🏽', '[  ]', 'y|o'])
  assert.equal(t[2].chars.length, 1) // skin-toned emoji is one grapheme
  assert.ok(t[2].chars[0].emoji)
  assert.equal(t.at(-1).end, 'hi 👍🏽  yo'.length)
  assert.deepEqual(revealTokens(''), [])
  assert.equal(revealTokens('a\nb')[1].text, '\n')
})

test('custom emoji codes reveal as one piece', () => {
  const code = '<:blob:123e4567-e89b-12d3-a456-426614174000>'
  const s = `hi ${code}${code}!`
  const w = revealTokens(s)[2].chars
  assert.deepEqual(w.map(c => c.emoji), [true, true, false])
  assert.equal(w[0].text, code)
  assert.equal(w.at(-1).end, s.length)
})
