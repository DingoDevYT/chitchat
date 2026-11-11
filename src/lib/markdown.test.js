import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, fmtTimestamp, linkMismatch } from './markdown.js'

const txt = v => ({ t: 'text', v })

test('headers, subtext and plain lines around them', () => {
  assert.deepEqual(tokenize('# Big\nhello'), [{ t: 'h', n: 1, c: [txt('Big')] }, txt('hello')])
  assert.deepEqual(tokenize('hi\n### **small**'), [txt('hi'), { t: 'h', n: 3, c: [{ t: 'b', c: [txt('small')] }] }])
  assert.deepEqual(tokenize('-# psst'), [{ t: 'sub', c: [txt('psst')] }])
  assert.deepEqual(tokenize('#nope'), [txt('#nope')])
  assert.deepEqual(tokenize('#### four'), [txt('#### four')])
  assert.deepEqual(tokenize('a # b'), [txt('a # b')])
})

test('lists', () => {
  assert.deepEqual(tokenize('- a\n* b\nafter'), [{ t: 'ul', c: [{ t: 'li', d: 0, c: [txt('a')] }, { t: 'li', d: 0, c: [txt('b')] }] }, txt('after')])
  assert.deepEqual(tokenize('3. x\n4. y'), [{ t: 'ol', start: 3, c: [{ t: 'li', d: 0, c: [txt('x')] }, { t: 'li', d: 0, c: [txt('y')] }] }])
  assert.equal(tokenize('- a\n  - nested')[0].c[1].d, 1)
  assert.deepEqual(tokenize('- a\n1. b').map(t => t.t), ['ul', 'ol'])
  assert.deepEqual(tokenize('*not a list*'), [{ t: 'i', c: [txt('not a list')] }])
})

test('quotes', () => {
  assert.deepEqual(tokenize('> one\n> two\nthree'), [{ t: 'quote', c: [txt('one\ntwo')] }, txt('three')])
  assert.deepEqual(tokenize('hey\n>>> all\nof this'), [txt('hey'), { t: 'quote', c: [txt('all\nof this')] }])
  assert.deepEqual(tokenize('> # title')[0].c[0].t, 'h')
  assert.deepEqual(tokenize('>no space'), [txt('>no space')])
})

test('code fences keep their lines as text', () => {
  assert.deepEqual(tokenize('```\n# not a header\n- nor a list\n```'), [{ t: 'codeblock', v: '# not a header\n- nor a list' }])
  assert.deepEqual(tokenize('# h\n```\n> x\n```').map(t => t.t), ['h', 'codeblock'])
})

test('plain text and old inline markdown are untouched', () => {
  assert.deepEqual(tokenize('hi **there**\nnext line'), [txt('hi '), { t: 'b', c: [txt('there')] }, txt('\nnext line')])
  assert.deepEqual(tokenize('a - b\n1.5 apples'), [txt('a - b\n1.5 apples')])
  assert.deepEqual(tokenize('**multi\nline**'), [{ t: 'b', c: [txt('multi\nline')] }])
  // a block elsewhere in the message doesn't change how the other lines parse
  assert.deepEqual(tokenize('**multi\nline**\n# h').slice(0, 1), [{ t: 'b', c: [txt('multi\nline')] }])
})

test('masked links', () => {
  assert.deepEqual(tokenize('see [the docs](https://x.com/a_(b)) ok'), [txt('see '), { t: 'link', v: 'https://x.com/a_(b)', c: [txt('the docs')] }, txt(' ok')])
  assert.deepEqual(tokenize('[x](javascript:alert(1))').some(t => t.t === 'link'), false)
  assert.equal(linkMismatch('click me', 'https://evil.com'), null)
  assert.equal(linkMismatch('good.com', 'https://www.good.com/x'), null)
  assert.equal(linkMismatch('https://good.com', 'https://evil.com/login'), 'evil.com')
})

test('timestamps', () => {
  assert.deepEqual(tokenize('at <t:1700000000:R>!'), [txt('at '), { t: 'time', v: 1700000000, f: 'R' }, txt('!')])
  assert.deepEqual(tokenize('<t:1700000000>')[0], { t: 'time', v: 1700000000, f: 'f' })
  assert.deepEqual(tokenize('<t:1700000000:F>')[0].f, 'F')
  const now = 1700000000 * 1000
  assert.equal(fmtTimestamp(1700000000 + 300, 'R', now, 'en'), 'in 5 minutes')
  assert.equal(fmtTimestamp(1700000000 - 7200, 'R', now, 'en'), '2 hours ago')
  assert.equal(fmtTimestamp(1700000000 - 86400, 'R', now, 'en'), 'yesterday')
  assert.match(fmtTimestamp(1700000000, 'D', now, 'en'), /November 1[45], 2023/)
  assert.match(fmtTimestamp(1700000000, 'F', now, 'en'), /day, November 1[45], 2023/)
})
