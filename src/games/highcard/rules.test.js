import test from 'node:test'
import assert from 'node:assert/strict'
import { card, move, over, setup, timeout, turn, view } from './rules.js'
import { rng, shuffle } from '../rng.js'

const P = ['a', 'b', 'c']

test('the seeded shuffle is deterministic and a real permutation', () => {
  const d1 = shuffle([...Array(52).keys()], rng(42)), d2 = shuffle([...Array(52).keys()], rng(42))
  assert.deepEqual(d1, d2)
  assert.deepEqual([...d1].sort((x, y) => x - y), [...Array(52).keys()])
  assert.notDeepEqual(d1, shuffle([...Array(52).keys()], rng(43)))
})

test('setup deals one unique hidden card each and keeps the rest secret', () => {
  const s = setup(P, 7)
  const dealt = P.map(p => s.priv[p].card)
  assert.equal(new Set([...dealt, ...s.secret.deck]).size, 52)
  assert.equal(s.secret.deck.length, 49)
  assert.deepEqual(s.pub.discards, [])
  assert.equal(s.pub.reveal, null, 'nothing hidden leaks into the public state')
  assert.equal(turn(s), 'a')
  assert.throws(() => setup(['solo'], 1), /2 to 10/)
  assert.throws(() => setup([...Array(11).keys()].map(String), 1), /2 to 10/)
})

test('turns go in seat order and only the current player may act', () => {
  const s = setup(P, 1)
  assert.throws(() => move(s, 'b', { type: 'keep' }), /not your turn/)
  assert.throws(() => move(s, 'a', { type: 'peek' }), /Keep or swap/)
  const s2 = move(s, 'a', { type: 'keep' })
  assert.equal(turn(s2), 'b')
  assert.equal(s2.priv.a.card, s.priv.a.card)
  assert.equal(s.pub.turn, 0, 'move never mutates the old state')
})

test('swap discards face up and draws the top of the deck', () => {
  const s = setup(P, 3)
  const top = s.secret.deck.at(-1)
  const s2 = move(s, 'a', { type: 'swap' })
  assert.equal(s2.priv.a.card, top)
  assert.deepEqual(s2.pub.discards, [s.priv.a.card])
  assert.equal(s2.secret.deck.length, s.secret.deck.length - 1)
  assert.equal(s.secret.deck.length, 49, 'old deck untouched')
})

test('after everyone acts all cards flip and the highest wins (suit breaks ties)', () => {
  let s = setup(P, 9)
  assert.equal(over(s), null)
  for (const p of P) s = move(s, p, timeout(s))
  assert.equal(turn(s), null)
  assert.deepEqual(Object.keys(s.pub.reveal), P)
  const best = P.reduce((a, b) => (s.priv[b].card > s.priv[a].card ? b : a))
  assert.deepEqual(over(s), [best])
  assert.throws(() => move(s, 'a', { type: 'keep' }), /over/)
  // Same rank, different suit: spades (3) beats hearts (2).
  const tie = { pub: { players: ['x', 'y'], turn: 1, acted: {}, discards: [], reveal: null }, priv: { x: { card: 50 }, y: { card: 51 } }, secret: { deck: [] } }
  assert.deepEqual(over(move(tie, 'y', { type: 'keep' })), ['y'])
})

test('view shows only your own hand; cards read nicely', () => {
  const s = setup(P, 5)
  const v = view(s, 'b')
  assert.deepEqual(v.me, s.priv.b)
  assert.ok(!('priv' in v) && !('secret' in v))
  assert.equal(view({ pub: s.pub, priv: {} }, 'zed').me, null)
  assert.equal(card(51).name, 'Ace of spades')
  assert.equal(card(0).rank, '2')
  assert.equal(card(1).suit.red, true)
})
