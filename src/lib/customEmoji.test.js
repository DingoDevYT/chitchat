import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, isJumbo } from './markdown.js'
import { emojiName, encodeEmoji, acQuery, parseCustom, toToken } from './customEmoji.js'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

test('tokenize custom emoji', () => {
  assert.deepEqual(tokenize(`hi <:party_cat:${ID}>!`), [
    { t: 'text', v: 'hi ' }, { t: 'cemoji', name: 'party_cat', id: ID, animated: false }, { t: 'text', v: '!' }])
  assert.deepEqual(tokenize(`<a:dance:${ID}>`), [{ t: 'cemoji', name: 'dance', id: ID, animated: true }])
  assert.deepEqual(tokenize(`\`<:x1:${ID}>\``), [{ t: 'code', v: `<:x1:${ID}>` }])
  assert.equal(tokenize('<:a:nope>')[0].t, 'text')
})

test('isJumbo counts custom emoji', () => {
  assert.equal(isJumbo(`<:cat:${ID}>`), true)
  assert.equal(isJumbo(`<:cat:${ID}> 😀`), true)
  assert.equal(isJumbo(`<:cat:${ID}> hi`), false)
  assert.equal(isJumbo(`<:cat:${ID}>`.repeat(7)), false)
  assert.equal(isJumbo('😀'), true)
})

test('emojiName', () => {
  assert.equal(emojiName('Party Parrot (1).gif'), 'party_parrot_1')
  assert.equal(emojiName('x.png'), 'emoji')
  assert.equal(emojiName('cat.png', new Set(['cat', 'cat_2'])), 'cat_3')
  assert.equal(emojiName('a'.repeat(40) + '.png', new Set(['a'.repeat(32)])), 'a'.repeat(30) + '_2')
})

test('encodeEmoji', () => {
  const byName = new Map([['cat', { name: 'cat', id: ID, animated: false }], ['dance', { name: 'dance', id: ID, animated: true }]])
  assert.equal(encodeEmoji('hi :cat: :dance: :nope:', byName), `hi <:cat:${ID}> <a:dance:${ID}> :nope:`)
  assert.equal(encodeEmoji(`<:cat:${ID}>`, byName), `<:cat:${ID}>`)
  assert.equal(encodeEmoji('12:30:45', byName), '12:30:45')
})

test('acQuery and tokens', () => {
  assert.equal(acQuery('hey :Par'), 'par')
  assert.equal(acQuery(':p'), null)
  assert.equal(acQuery('12:30'), null)
  assert.equal(acQuery('hey :cat: '), null)
  const e = { name: 'cat', id: ID, animated: true }
  assert.deepEqual(parseCustom(toToken(e)), e)
  assert.equal(parseCustom('😀'), null)
})
