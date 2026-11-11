import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSearch, highlightParts, hasFilters } from './search.js'

test('parses filters and leaves free text', () => {
  const q = parseSearch('  hello from:@Pip in:#general has:IMAGE world ')
  assert.equal(q.text, 'hello world')
  assert.equal(q.from, 'Pip')
  assert.equal(q.in, 'general')
  assert.equal(q.has, 'image')
})

test('in: takes quoted room names with spaces (and still drops a leading #)', () => {
  const q = parseSearch('hi in:"General   Chat 🍵" from:mochi there')
  assert.equal(q.in, 'General Chat 🍵')
  assert.equal(q.from, 'mochi')
  assert.equal(q.text, 'hi there')
  assert.equal(parseSearch('in:"#memes').in, 'memes') // unclosed quote: runs to the end
  assert.equal(parseSearch('in:""').text, 'in:""')
})

test('dates: before = that midnight, after = next midnight, bad dates stay text', () => {
  const q = parseSearch('before:2026-03-10 after:2026-02-28')
  assert.equal(q.before, new Date(2026, 2, 10).toISOString())
  assert.equal(q.after, new Date(2026, 2, 1).toISOString())
  const bad = parseSearch('before:2026-02-30 after:yesterday has:video')
  assert.equal(bad.before, null)
  assert.equal(bad.after, null)
  assert.equal(bad.has, null)
  assert.equal(bad.text, 'before:2026-02-30 after:yesterday has:video')
})

test('hasFilters', () => {
  assert.equal(hasFilters(parseSearch('   ')), false)
  assert.equal(hasFilters(parseSearch('from:mochi')), true)
})

test('highlightParts marks prefix matches case-insensitively', () => {
  assert.deepEqual(highlightParts('Hello there, hello!', 'hel'), [
    { t: 'Hel', hit: true }, { t: 'lo there, ', hit: false }, { t: 'hel', hit: true }, { t: 'lo!', hit: false },
  ])
  assert.deepEqual(highlightParts('a.b', ''), [{ t: 'a.b', hit: false }])
  assert.deepEqual(highlightParts('x (y)', '(y'), [{ t: 'x (', hit: false }, { t: 'y', hit: true }, { t: ')', hit: false }])
})
