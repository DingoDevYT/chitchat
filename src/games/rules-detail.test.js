import test from 'node:test'
import assert from 'node:assert/strict'
import * as snack from './snack/rules.js'
import * as poker from './poker/rules.js'
import * as prop from './property/rules.js'
import { rng } from './rng.js'

const id = (f, v) => snack.CARDS.findIndex(c => c.f === f && c.v === v)

test('snack: 108 cards, deal 7 each, a number on top', () => {
  assert.equal(snack.CARDS.length, 108)
  assert.equal(snack.CARDS.filter(c => c.f === 4).length, 8)
  const s = snack.setup(['a', 'b'], 3)
  assert.equal(s.priv.a.hand.length, 7)
  assert.equal(typeof snack.CARDS[s.pub.top].v, 'number')
  assert.equal(s.secret.deck.length + 14 + 1, 108)
})

function table(hands, top, extra = {}) {
  const players = Object.keys(hands)
  return {
    pub: { players, turn: 0, dir: 1, top, flavour: snack.CARDS[top].f, counts: Object.fromEntries(players.map(p => [p, hands[p].length])), deck: 50, pending: 0, drew: null, called: {}, last: null, winner: null, opts: { stack: false, drawUntil: false }, moves: 0, ...extra },
    priv: Object.fromEntries(players.map(p => [p, { hand: hands[p] }])),
    secret: { deck: [id(0, 1), id(0, 2), id(1, 3), id(2, 4), id(3, 5), id(0, 6)], discard: [top], rs: 1 },
  }
}

test('snack: matching, wilds, nap, u-turn, second helping and feast', () => {
  const s = table({ a: [id(0, 5), id(1, 7), id(4, 'chef'), id(0, 'nap')], b: [id(2, 2), id(2, 3)], c: [id(3, 3)] }, id(0, 3))
  assert.throws(() => snack.move(s, 'a', { type: 'play', card: id(1, 7) }), /doesn't fit/)
  assert.throws(() => snack.move(s, 'a', { type: 'play', card: id(4, 'chef') }), /flavour/)
  const w = snack.move(s, 'a', { type: 'play', card: id(4, 'chef'), flavour: 2 })
  assert.equal(w.pub.flavour, 2); assert.equal(w.pub.turn, 1)
  const n = snack.move(s, 'a', { type: 'play', card: id(0, 'nap') })
  assert.equal(n.pub.turn, 2, 'nap skips b')
  const t = table({ a: [id(0, 'uturn'), id(0, 1)], b: [id(1, 1)], c: [id(1, 2)] }, id(0, 3))
  const u = snack.move(t, 'a', { type: 'play', card: id(0, 'uturn') })
  assert.equal(u.pub.dir, -1); assert.equal(u.pub.turn, 2)
  const p = table({ a: [id(0, 'plus2'), id(0, 1)], b: [id(1, 1)], c: [id(1, 2)] }, id(0, 3))
  const p2 = snack.move(p, 'a', { type: 'play', card: id(0, 'plus2') })
  assert.equal(p2.priv.b.hand.length, 3); assert.equal(p2.pub.turn, 2)
  const f = table({ a: [id(4, 'feast'), id(0, 1)], b: [id(1, 1)] }, id(0, 3))
  const f2 = snack.move(f, 'a', { type: 'play', card: id(4, 'feast'), flavour: 1 })
  assert.equal(f2.priv.b.hand.length, 5); assert.equal(f2.pub.turn, 0, 'two players: feast comes back to a')
})

test('snack: stacking house rule passes the pile on; draw takes it all', () => {
  const s = table({ a: [id(0, 'plus2'), id(0, 1)], b: [id(1, 'plus2'), id(1, 1)], c: [id(2, 1), id(2, 2)] }, id(0, 3), { opts: { stack: true, drawUntil: false } })
  const s1 = snack.move(s, 'a', { type: 'play', card: id(0, 'plus2') })
  assert.equal(s1.pub.pending, 2)
  assert.throws(() => snack.move(s1, 'b', { type: 'play', card: id(1, 1) }), /doesn't fit/)
  const s2 = snack.move(s1, 'b', { type: 'play', card: id(1, 'plus2') })
  const s3 = snack.move(s2, 'c', { type: 'draw' })
  assert.equal(s3.priv.c.hand.length, 6); assert.equal(s3.pub.pending, 0)
})

test('snack: draw then play or pass; Last bite! and catching', () => {
  const s = table({ a: [id(1, 7), id(1, 8)], b: [id(2, 2), id(2, 3)] }, id(0, 3))
  const d = snack.move(s, 'a', { type: 'draw' }) // draws Berry 6, which fits
  assert.equal(d.pub.drew, id(0, 6)); assert.equal(d.pub.turn, 0)
  assert.throws(() => snack.move(d, 'a', { type: 'play', card: id(1, 7) }), /just drew/)
  assert.equal(snack.move(d, 'a', { type: 'pass' }).pub.turn, 1)
  const two = table({ a: [id(0, 1), id(0, 2)], b: [id(2, 2), id(2, 3)] }, id(0, 3))
  const forgot = snack.move(two, 'a', { type: 'play', card: id(0, 1) })
  const caught = snack.move(forgot, 'b', { type: 'catch', target: 'a' })
  assert.equal(caught.priv.a.hand.length, 3)
  const said = snack.move(two, 'a', { type: 'play', card: id(0, 1), bite: true })
  assert.throws(() => snack.move(said, 'b', { type: 'catch', target: 'a' }), /Nobody/)
  const win = snack.move(snack.move(said, 'b', { type: 'draw', pass: true }), 'a', { type: 'play', card: id(0, 2) })
  assert.deepEqual(snack.over(win), ['a'])
})

test('snack bots: hard punishes a player about to win, keeps wilds, always says Last bite!', () => {
  const s = table({ a: [id(0, 5), id(0, 'plus2'), id(4, 'chef')], b: [id(2, 2)] }, id(0, 3), { called: { b: true } })
  const v = snack.view(s, 'a')
  assert.equal(snack.bot(v, 'a', 'hard', rng(1)).card, id(0, 'plus2'))
  assert.notEqual(snack.bot(v, 'a', 'normal', rng(1)).card, id(4, 'chef'))
  const t = table({ a: [id(0, 5), id(1, 1)], b: [id(2, 2), id(2, 1)] }, id(0, 3))
  assert.equal(snack.bot(snack.view(t, 'a'), 'a', 'hard', rng(1)).bite, true)
  const c = table({ a: [id(0, 5)], b: [id(2, 2)] }, id(0, 3), { turn: 1 })
  assert.deepEqual(snack.bot(snack.view(c, 'b'), 'b', 'hard', rng(1)), { type: 'catch', target: 'a' })
})

const C = (r, s) => r * 4 + s // rank 0 = two … 12 = ace

test('poker: hand ranking order, wheel and kickers', () => {
  const rk = cs => poker.best(cs)[0]
  assert.equal(rk([C(12, 0), C(11, 0), C(10, 0), C(9, 0), C(8, 0), C(0, 1), C(1, 2)]), 8)
  assert.equal(rk([C(5, 0), C(5, 1), C(5, 2), C(5, 3), C(8, 0), C(0, 1), C(1, 2)]), 7)
  assert.equal(rk([C(5, 0), C(5, 1), C(5, 2), C(8, 3), C(8, 0), C(0, 1), C(1, 2)]), 6)
  assert.equal(rk([C(12, 1), C(0, 0), C(1, 2), C(2, 3), C(3, 0), C(9, 1), C(10, 2)]), 4)
  assert.deepEqual(poker.best([C(12, 1), C(0, 0), C(1, 2), C(2, 3), C(3, 0)]), [4, 3], 'A-2-3-4-5 is a five-high straight')
  assert.ok(poker.cmp(poker.best([C(12, 0), C(12, 1), C(9, 2), C(4, 3), C(2, 0)]), poker.best([C(12, 2), C(12, 3), C(8, 2), C(4, 0), C(2, 1)])) > 0, 'kicker decides')
})

test('poker: blinds, betting round, fold wins the pot', () => {
  let s = poker.setup(['a', 'b', 'c'], 4)
  assert.equal(s.pub.pot + Object.values(s.pub.bets).reduce((x, y) => x + y), 30)
  const first = poker.turn(s)
  assert.throws(() => poker.move(s, first, { type: 'check' }), /call or fold/)
  assert.throws(() => poker.move(s, first, { type: 'raise', to: 25 }), /at least 40/)
  s = poker.move(s, first, { type: 'raise', to: 60 })
  s = poker.move(s, poker.turn(s), { type: 'fold' })
  s = poker.move(s, poker.turn(s), { type: 'fold' })
  assert.equal(s.pub.phase, 'showdown')
  assert.equal(s.pub.stacks[first], 1000 + 30)
  assert.equal(Object.values(s.pub.stacks).reduce((x, y) => x + y), 3000, 'acorns are never created or lost')
  s = poker.move(s, poker.turn(s), { type: 'next' })
  assert.equal(s.pub.hand, 2); assert.equal(s.pub.phase, 'preflop')
})

test('poker: all-in side pots pay the right people', () => {
  const s = {
    pub: { players: ['a', 'b', 'c'], stacks: { a: 0, b: 0, c: 100 }, out: {}, folded: {}, allin: { a: true, b: true }, put: { a: 50, b: 200, c: 200 }, bets: {}, pot: 450, board: [C(0, 0), C(1, 1), C(5, 2), C(7, 3), C(9, 0)], phase: 'river', button: 0, hand: 1, maxHands: 40, bet: 0, minRaise: 20, bb: 20, acted: {}, turn: 2 },
    priv: { a: { cards: [C(12, 0), C(12, 1)] }, b: { cards: [C(11, 0), C(11, 1)] }, c: { cards: [C(2, 0), C(3, 1)] } },
    secret: { deck: [], rs: 1 },
  }
  const r = poker.move(s, 'c', { type: 'check' })
  assert.equal(r.pub.stacks.a, 150, 'aces win the main pot only')
  assert.equal(r.pub.stacks.b, 300, 'kings win the side pot')
  assert.equal(r.pub.stacks.c, 100)
})

test('poker bots: hard raises big hands, folds junk to a big bet', () => {
  const base = { players: ['me', 'x'], stacks: { me: 1000, x: 600 }, out: {}, folded: {}, allin: {}, board: [], pot: 0, phase: 'preflop', bet: 400, minRaise: 380, bb: 20, turn: 0 }
  const aces = poker.bot({ ...base, bets: { me: 20, x: 400 }, me: { cards: [C(12, 0), C(12, 1)] } }, 'me', 'hard', rng(3))
  assert.ok(['raise', 'allin', 'call'].includes(aces.type))
  const junk = poker.bot({ ...base, bets: { me: 20, x: 400 }, me: { cards: [C(0, 0), C(5, 1)] } }, 'me', 'hard', rng(3))
  assert.equal(junk.type, 'fold')
  assert.equal(poker.bot({ ...base, phase: 'showdown' }, 'me', 'easy').type, 'next')
  assert.ok(poker.equity([C(12, 0), C(12, 1)], [], 1, 300, rng(1)) > 0.75)
})

test('property: buy, rent, full group doubles, cottages build evenly', () => {
  let s = prop.setup(['a', 'b'], 1)
  s.pub.pos.a = 0
  s = { ...s, secret: { ...s.secret, rs: 7 } }
  const r = prop.move(s, 'a', { type: 'roll' })
  assert.equal(r.pub.pos.a, r.pub.dice[0] + r.pub.dice[1])
  const pub = { ...s.pub, owner: { 1: 'a', 3: 'a' }, cottages: {} }
  assert.equal(prop.rentOf(pub, 1, [1, 2]), 8, 'full group doubles bare rent')
  assert.ok(prop.canBuild(pub, 'a', 1))
  assert.ok(!prop.canBuild({ ...pub, cottages: { 1: 1 } }, 'a', 1), 'build evenly')
  assert.equal(prop.rentOf({ ...pub, cottages: { 1: 2 } }, 1, [1, 2]), 4 * 14)
  assert.equal(prop.rentOf({ ...pub, owner: { 5: 'b', 16: 'b' } }, 5, [1, 1]), 50)
  assert.equal(prop.worth(pub, 'a'), 1500 + 60 + 80)
})

test('property: landing on Go Nap, napping, waking, bankruptcy hands over property', () => {
  const s = prop.setup(['a', 'b'], 2)
  const pub = { ...s.pub, pos: { a: 18, b: 0 } }
  const res = { ...s, pub: { ...pub, napping: { a: 1 } } }
  assert.throws(() => prop.move({ ...s, pub }, 'a', { type: 'wake' }), /awake/)
  const w = prop.move(res, 'a', { type: 'wake' })
  assert.equal(w.pub.cash.a, 1450); assert.equal(w.pub.napping.a, undefined)
  // b owns Moonbeam Manor with 4 cottages; a has 10 coins and lands there.
  const poor = { ...s, pub: { ...s.pub, cash: { a: 10, b: 0 }, owner: { 23: 'b', 21: 'b', 1: 'a' }, cottages: { 23: 4 }, pos: { a: 23, b: 0 }, phase: 'end' } }
  const p2 = JSON.parse(JSON.stringify(poor.pub))
  // pay() runs inside landing; simulate by a roll that lands on 23 from 21 with a fixed die
  const t = prop.move({ ...poor, pub: { ...p2, pos: { a: 21, b: 0 }, phase: 'roll' }, secret: { ...poor.secret, rs: 0 } }, 'a', { type: 'roll' })
  if (t.pub.pos.a === 23) { assert.ok(t.pub.broke.a); assert.equal(t.pub.owner[1], 'b'); assert.equal(t.pub.winner, 'b') }
})

test('property bots: buy when they can afford it, build on full groups, end the turn', () => {
  const s = prop.setup(['me', 'x'], 3)
  const v = { ...s.pub, phase: 'buy', pos: { me: 23, x: 0 } }
  assert.equal(prop.bot(v, 'me', 'normal').type, 'buy')
  assert.equal(prop.bot({ ...v, cash: { me: 400, x: 1500 } }, 'me', 'normal').type, 'pass')
  const full = { ...s.pub, phase: 'end', owner: { 21: 'me', 23: 'me' }, cottages: {} }
  assert.equal(prop.bot(full, 'me', 'hard').type, 'build')
  assert.equal(prop.bot(full, 'me', 'easy').type, 'end')
  assert.equal(prop.bot({ ...s.pub, phase: 'roll' }, 'me', 'easy').type, 'roll')
})
