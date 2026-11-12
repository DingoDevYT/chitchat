import test from 'node:test'
import assert from 'node:assert/strict'
import { bestFive, handWords, moveBadge, raiseSizes, showdownText, strength } from './words.js'

// rank 0 = two … 12 = ace; suit 0 clubs, 1 diamonds, 2 hearts, 3 spades
const c = (rank, suit) => rank * 4 + suit
const J = 9, A = 12, K = 11

test('hands read in plain words', () => {
  assert.equal(handWords([c(J, 0), c(J, 2)]), 'Pair of Jacks')
  assert.equal(handWords([c(A, 0), c(3, 0)]), 'High card (Ace)') // two suited cards are not a flush
  assert.equal(handWords([c(J, 0), c(2, 1)], [c(J, 3), c(2, 2), c(K, 0)]), 'Two pair (Jacks and Fours)')
  assert.equal(handWords([c(A, 0), c(0, 1)], [c(1, 2), c(2, 3), c(3, 0), c(K, 1)]), 'Straight (Ace to Five)')
  assert.equal(handWords([c(A, 3), c(K, 3)], [c(10, 3), c(J, 3), c(8, 3)]), 'Royal flush')
  assert.equal(handWords([c(5, 0), c(5, 1)], [c(5, 2), c(2, 3), c(2, 0)]), 'Full house (Sevens and Fours)')
})

test('bestFive finds the cards that make the hand', () => {
  const seven = [c(J, 0), c(J, 2), c(0, 1), c(4, 3), c(J, 3), c(6, 0), c(8, 1)]
  const five = bestFive(seven)
  assert.equal(five.length, 5)
  assert.equal(five.filter(x => x >> 2 === J).length, 3)
})

test('strength and badges', () => {
  assert.equal(strength(0.8, 1).word, 'strong')
  assert.equal(strength(0.3, 3).word, 'okay')
  assert.equal(strength(0.1, 3).word, 'weak')
  assert.equal(moveBadge({ type: 'raise', amt: 120 }), 'Raised to 120')
  assert.equal(moveBadge({ type: 'call', amt: 40 }), 'Called 40')
})

test('raise presets stay legal', () => {
  const r = raiseSizes({ bet: 40, minRaise: 20, pot: 100, put: 0, stack: 500 })
  assert.deepEqual(r, { min: 60, half: 110, pot: 180, max: 500 })
  const short = raiseSizes({ bet: 40, minRaise: 20, pot: 1000, put: 0, stack: 50 })
  assert.deepEqual(short, { min: 50, half: 50, pot: 50, max: 50 })
})

test('showdown says who won, with what, beating whom', () => {
  const nm = p => ({ a: 'Mochi', b: 'Pip', me: 'You' })[p]
  const board = [c(J, 3), c(2, 2), c(K, 0), c(0, 1), c(5, 2)]
  const shown = { a: [c(J, 0), c(2, 1)], b: [c(7, 0), c(7, 1)], me: [c(3, 0), c(6, 1)] }
  assert.deepEqual(showdownText({ results: [{ p: 'a', amt: 300, hand: 'Two pair' }], shown, board }, nm),
    ["Mochi wins 300 acorns with Two pair (Jacks and Fours), beating Pip's Pair of Nines."])
  assert.deepEqual(showdownText({ results: [{ p: 'me', amt: 60, hand: null }], shown: null, board: [] }, nm),
    ['You win 60 acorns because everyone else folded.'])
  const tie = showdownText({ results: [{ p: 'a', amt: 50, hand: 'Pair' }, { p: 'b', amt: 50, hand: 'Pair' }], shown: { a: [c(3, 0), c(1, 1)], b: [c(3, 1), c(1, 2)] }, board }, nm)
  assert.match(tie[0], /tie/)
})
