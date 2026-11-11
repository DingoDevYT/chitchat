import test from 'node:test'
import assert from 'node:assert/strict'
import * as prop from './rules.js'
import { rng } from '../rng.js'

const P = (s, extra) => ({ ...s, pub: { ...s.pub, ...extra } })
const rolls = seed => { const r = rng(seed); return [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)] }
const seedWhere = ok => { let k = 0; while (!ok(rolls(k))) k++; return k }

test('property: classic board, rents, full group doubles, rails, works, even building, bank stock', () => {
  assert.equal(prop.BOARD.length, 40)
  assert.deepEqual(prop.GROUPS.map((_, g) => prop.groupOf(g).length), [2, 3, 3, 3, 3, 3, 3, 2])
  assert.equal(prop.BOARD.filter(b => b.k === 'rail').length, 4)
  assert.equal(prop.DECKS.cookie.cards.length, 16); assert.equal(prop.DECKS.party.cards.length, 16)
  const s = prop.setup(['a', 'b'], 1)
  const pub = { ...s.pub, owner: { 1: 'a', 3: 'a', 5: 'b', 15: 'b', 12: 'b' } }
  assert.equal(prop.rentOf(pub, 1, [1, 2]), 4, 'full group doubles bare rent')
  assert.equal(prop.rentOf({ ...pub, owner: { 1: 'a' } }, 1, [1, 2]), 2)
  assert.equal(prop.rentOf(pub, 5, [1, 1]), 50, 'two trolleys')
  assert.equal(prop.rentOf(pub, 12, [3, 4]), 28, 'one works: 4x dice')
  assert.equal(prop.rentOf({ ...pub, owner: { ...pub.owner, 28: 'b' } }, 12, [3, 4]), 70, 'both works: 10x')
  assert.equal(prop.rentOf({ ...pub, mortgaged: { 5: true } }, 5, [1, 1]), 0, 'mortgaged: no rent')
  assert.ok(prop.canBuild(pub, 'a', 1))
  assert.ok(!prop.canBuild({ ...pub, cottages: { 1: 1 } }, 'a', 1), 'build evenly')
  assert.ok(!prop.canBuild({ ...pub, mortgaged: { 3: true } }, 'a', 1), 'no building with a mortgage in the group')
  assert.equal(prop.rentOf({ ...pub, cottages: { 1: 5, 3: 5 } }, 3, [1, 2]), 450, 'inn')
  assert.ok(prop.canBuild({ ...pub, cottages: { 1: 4, 3: 4 } }, 'a', 1), 'inn after 4 cottages')
  const busy = Object.fromEntries([6, 8, 9, 11, 13, 14, 16, 18].map(i => [i, 4])) // all 32 cottages out
  assert.ok(!prop.canBuild({ ...pub, cottages: busy }, 'a', 1), 'bank out of cottages')
  assert.ok(prop.canSell({ ...pub, cottages: { 1: 2, 3: 2 } }, 'a', 1) && !prop.canSell({ ...pub, cottages: { 1: 1, 3: 2 } }, 'a', 1), 'sell evenly')
  assert.ok(!prop.canMortgage({ ...pub, cottages: { 3: 1 } }, 'a', 1), 'no mortgage while the group has cottages')
  assert.equal(prop.unmortgageCost(1), 33)
  assert.equal(prop.worth({ ...pub, mortgaged: { 3: true } }, 'a'), 1500 + 60 + 30)
})

test('property: three doubles, bail, blanket card, a third failed try pays and walks', () => {
  const s = prop.setup(['a', 'b'], 2)
  const dbl = seedWhere(d => d[0] === d[1]), non = seedWhere(d => d[0] !== d[1])
  const third = prop.move(P({ ...s, secret: { ...s.secret, rs: dbl } }, { doubles: 2 }), 'a', { type: 'roll' })
  assert.equal(third.pub.pos.a, prop.JAIL); assert.ok(third.pub.napping.a); assert.equal(third.pub.phase, 'end')
  const n = P(s, { pos: { a: 10, b: 0 }, napping: { a: 1 } })
  assert.throws(() => prop.move(s, 'a', { type: 'bail' }), /awake/)
  const w = prop.move(n, 'a', { type: 'bail' })
  assert.equal(w.pub.cash.a, 1450); assert.equal(w.pub.napping.a, undefined); assert.equal(w.pub.phase, 'roll')
  const b = prop.move(P(n, { held: { cookie: 'a', party: null } }), 'a', { type: 'blanket' })
  assert.equal(b.pub.held.cookie, null); assert.equal(b.pub.napping.a, undefined)
  const stay = prop.move({ ...n, secret: { ...n.secret, rs: non } }, 'a', { type: 'roll' })
  assert.equal(stay.pub.pos.a, 10); assert.equal(stay.pub.napping.a, 2)
  const out = prop.move({ ...P(n, { napping: { a: 3 } }), secret: { ...n.secret, rs: non } }, 'a', { type: 'roll' })
  assert.equal(out.pub.napping.a, undefined); assert.notEqual(out.pub.pos.a, 10)
  const dOut = prop.move({ ...n, secret: { ...n.secret, rs: dbl } }, 'a', { type: 'roll' })
  assert.equal(dOut.pub.napping.a, undefined); assert.equal(dOut.pub.again, false, 'doubles out of the nook: no second roll')
})

test('property: passing starts an auction, the highest bid wins, everyone folding leaves it unsold', () => {
  const s = prop.setup(['a', 'b', 'c'], 3)
  const buy = P(s, { phase: 'buy', pos: { a: 39, b: 0, c: 0 } })
  let t = prop.move(buy, 'a', { type: 'pass' })
  assert.equal(t.pub.phase, 'auction'); assert.equal(prop.turn(t), 'b')
  t = prop.move(t, 'b', { type: 'bid', amount: 100 })
  assert.throws(() => prop.move(t, 'c', { type: 'bid', amount: 100 }), /more/)
  t = prop.move(t, 'c', { type: 'bid', amount: 150 })
  t = prop.move(t, 'a', { type: 'fold' })
  t = prop.move(t, 'b', { type: 'fold' })
  assert.equal(t.pub.owner[39], 'c'); assert.equal(t.pub.cash.c, 1350); assert.equal(t.pub.phase, 'end'); assert.equal(prop.turn(t), 'a')
  let u = prop.move(buy, 'a', { type: 'pass' })
  for (const p of ['b', 'c', 'a']) u = prop.move(u, p, { type: 'fold' })
  assert.equal(u.pub.owner[39], undefined); assert.equal(u.pub.phase, 'end')
})

test('property: trades swap streets and coins; built groups and out-of-turn answers are refused', () => {
  const s = prop.setup(['a', 'b'], 4)
  const base = P(s, { owner: { 1: 'a', 3: 'b', 39: 'b' } })
  const o = prop.move(base, 'a', { type: 'offer', to: 'b', give: [1], get: [3], cash: 50 })
  assert.equal(o.pub.phase, 'trade'); assert.equal(prop.turn(o), 'b')
  assert.throws(() => prop.move(o, 'a', { type: 'accept' }), /turn/)
  const y = prop.move(o, 'b', { type: 'accept' })
  assert.equal(y.pub.owner[1], 'b'); assert.equal(y.pub.owner[3], 'a'); assert.equal(y.pub.cash.a, 1450); assert.equal(y.pub.phase, 'roll')
  assert.equal(prop.move(o, 'b', { type: 'decline' }).pub.owner[1], 'a')
  assert.throws(() => prop.move(base, 'a', { type: 'offer', to: 'b', give: [39], get: [] }), /not theirs/)
  assert.throws(() => prop.move(P(base, { owner: { 1: 'a', 3: 'a', 39: 'b' }, cottages: { 1: 1, 3: 1 } }), 'a', { type: 'offer', to: 'b', give: [1], get: [39] }), /cottages/)
})

test('property: a debt sells and mortgages first, then bankruptcy hands everything to the creditor', () => {
  const s = prop.setup(['a', 'b'], 5)
  // a lands on Moonbeam Manor with an inn (2000) holding 100 coins and the Mossy pair with a cottage each.
  const poor = P(s, { cash: { a: 100, b: 0 }, pos: { a: 35, b: 0 }, owner: { 37: 'b', 39: 'b', 1: 'a', 3: 'a' }, cottages: { 37: 5, 39: 5, 1: 1, 3: 1 }, held: { cookie: 'a', party: null } })
  const t = prop.move({ ...poor, secret: { ...poor.secret, rs: seedWhere(d => d[0] + d[1] === 4 && d[0] !== d[1]) } }, 'a', { type: 'roll' })
  assert.equal(t.pub.pos.a, 39)
  assert.ok(t.pub.broke.a); assert.equal(t.pub.owner[1], 'b'); assert.equal(t.pub.mortgaged[1], true); assert.equal(t.pub.held.cookie, 'b')
  assert.equal(t.pub.cash.b, 100 + 50 + 30 + 30, 'all a could raise'); assert.equal(t.pub.winner, 'b')
})

test('property bots: buy, bid up to value, judge trades, build, end the turn', () => {
  const s = prop.setup(['me', 'x'], 3)
  const v = { ...s.pub, phase: 'buy', pos: { me: 39, x: 0 } }
  assert.equal(prop.bot(v, 'me', 'normal').type, 'buy')
  assert.equal(prop.bot({ ...v, cash: { me: 400, x: 1500 } }, 'me', 'normal').type, 'pass')
  const au = { ...s.pub, phase: 'auction', auction: { sp: 39, bid: 390, high: 'x', in: ['me', 'x'], at: 0 } }
  assert.equal(prop.bot(au, 'me', 'normal').type, 'fold')
  assert.equal(prop.bot({ ...au, auction: { ...au.auction, bid: 100 } }, 'me', 'normal').type, 'bid')
  const tr = { ...s.pub, phase: 'trade', owner: { 1: 'x', 3: 'me' }, offer: { from: 'x', to: 'me', give: [], get: [3], cash: 20, back: 'roll' } }
  assert.equal(prop.bot(tr, 'me', 'hard').type, 'decline', 'would hand them a set for pennies')
  assert.equal(prop.bot({ ...tr, offer: { ...tr.offer, cash: 400 } }, 'me', 'normal').type, 'decline', 'still completes their set')
  assert.equal(prop.bot({ ...tr, owner: { 3: 'me' }, offer: { ...tr.offer, cash: 200 } }, 'me', 'normal').type, 'accept')
  // me has 2 Sky + 1 Mossy, x has 1 Sky + 1 Mossy: a sweetened swap both bots take.
  const sw = { ...s.pub, owner: { 6: 'me', 8: 'me', 9: 'x', 1: 'me', 3: 'x' }, players: ['me', 'x'] }
  const idea = prop.bot(sw, 'me', 'normal', () => 0.9) // 0.9: skip the coins-for-a-street offer to people
  assert.deepEqual([idea.type, idea.give, idea.get], ['offer', [1], [9]])
  const sent = prop.move({ ...s, pub: sw }, 'me', idea)
  assert.equal(prop.bot(prop.view(sent), 'x', 'hard').type, 'accept')
  const full = { ...s.pub, phase: 'end', owner: { 37: 'me', 39: 'me' } }
  assert.equal(prop.bot(full, 'me', 'hard').type, 'build')
  assert.equal(prop.bot(full, 'me', 'easy').type, 'end')
  assert.equal(prop.bot({ ...s.pub, phase: 'roll' }, 'me', 'easy').type, 'roll')
})
