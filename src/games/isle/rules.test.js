import test from 'node:test'
import assert from 'node:assert/strict'
import * as I from './rules.js'
import { rng } from '../rng.js'

const { TILES, VERTS, EDGES } = I
const zero = () => Object.fromEntries(I.RES.map(k => [k, 0]))
const P = (s, extra) => ({ ...s, pub: { ...s.pub, ...extra } })
// An rs seed whose first roll makes `sum`.
const rsFor = sum => { for (let k = 0; ; k++) { const r = rng(k); if (2 + Math.floor(r() * 6) + Math.floor(r() * 6) === sum) return k } }
// A game past placement: a and b each own one cottage, with chosen resources, a's turn in `phase`.
function midGame(extra = {}, players = ['a', 'b']) {
  const s = I.setup(players, 4)
  return P(s, { phase: 'main', place: null, res: Object.fromEntries(players.map(p => [p, zero()])), ...extra })
}
const edgeBetween = (u, v) => VERTS[u].e.find(e => I.other(e, u) === v)

test('isle: island shape, tiles, numbers and docks', () => {
  assert.equal(TILES.length, 19); assert.equal(VERTS.length, 54); assert.equal(EDGES.length, 72)
  assert.equal(I.COAST.length, 30)
  assert.equal(I.DOCK_EDGES.length, 8)
  const dockVerts = I.DOCK_EDGES.flatMap(e => [EDGES[e].a, EDGES[e].b])
  assert.equal(new Set(dockVerts).size, 16, 'no two docks share a corner')
  assert.ok(VERTS.every(v => v.t.length >= 1 && v.t.length <= 3 && v.v.length >= 2 && v.v.length <= 3))
  for (const seed of [1, 2, 3, 77]) {
    const s = I.setup(['a', 'b', 'c'], seed), t = s.pub.tiles
    for (const [k, d] of Object.entries(I.KINDS)) assert.equal(t.filter(x => x.k === k).length, d.n)
    assert.deepEqual(t.filter(x => x.n).map(x => x.n).sort((a, b) => a - b), [...I.NUMBERS].sort((a, b) => a - b))
    assert.ok(t.every(x => (x.k === 'pond') === !x.n), 'only ponds have no number')
    t.forEach((x, i) => TILES[i].n.forEach(j => {
      assert.ok(!([6, 8].includes(x.n) && [6, 8].includes(t[j].n)), 'busy numbers never touch')
      if (x.n) assert.notEqual(x.n, t[j].n, 'equal numbers never touch')
    }))
    assert.equal(t[s.pub.raccoon].k, 'pond', 'the raccoon starts napping at a pond')
    assert.equal(s.pub.docks.filter(d => d.k === 'any').length, 3)
    assert.deepEqual(s.pub.docks.filter(d => d.k !== 'any').map(d => d.k).sort(), [...I.RES].sort())
  }
  assert.deepEqual(I.setup(['a', 'b'], 9).pub, I.setup(['a', 'b'], 9).pub, 'same seed, same island')
  assert.notDeepEqual(I.setup(['a', 'b'], 9).pub.tiles, I.setup(['a', 'b'], 10).pub.tiles)
  assert.throws(() => I.setup(['a'], 1), /2 to 4/)
  assert.throws(() => I.setup(['a', 'b', 'c', 'd', 'e'], 1), /2 to 4/)
})

test('isle: snake-order placement, distance rule, second cottage pays out', () => {
  let s = I.setup(['a', 'b', 'c'], 3)
  assert.deepEqual(s.pub.place.order, [0, 1, 2, 2, 1, 0])
  const seen = []
  while (s.pub.phase === 'place') {
    const who = I.turn(s)
    if (s.pub.place.at == null) seen.push(who)
    if (s.pub.place.at == null && seen.length === 1) {
      assert.throws(() => I.move(s, who, { type: 'path', e: 0 }), /cottage/)
      const v = 0
      const s2 = I.move(s, who, { type: 'cottage', v })
      assert.throws(() => I.move(s2, who, { type: 'path', e: EDGES.findIndex(e => e.a !== v && e.b !== v) }), /cottage you just placed/)
      assert.throws(() => I.move(I.move(s2, who, { type: 'path', e: VERTS[v].e[0] }), 'b', { type: 'cottage', v: VERTS[v].v[0] }), /Too close/)
    }
    s = I.move(s, who, I.timeout(s))
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'c', 'b', 'a'])
  assert.equal(s.pub.phase, 'roll'); assert.equal(I.turn(s), 'a')
  for (const p of ['a', 'b', 'c']) {
    assert.equal(Object.values(s.pub.homes).filter(h => h.p === p).length, 2)
    assert.equal(Object.values(s.pub.paths).filter(x => x === p).length, 2)
    assert.equal(I.score(s.pub, p), 2)
    const second = Object.keys(s.pub.homes).map(Number).filter(v => s.pub.homes[v].p === p).pop()
    const want = VERTS[second].t.map(t => I.KINDS[s.pub.tiles[t].k].res).filter(Boolean).length
    assert.equal(I.total(s.pub.res[p]), want, 'one resource per tile around the second cottage')
  }
})

test('isle: rolls produce for every home on a matching tile, lodges make two, the raccoon nibbles', () => {
  const s0 = midGame({ phase: 'roll' })
  const t = s0.pub.tiles.findIndex((x, i) => x.n === 8 && i !== s0.pub.raccoon), [v1, , v3] = TILES[t].v
  const res = I.KINDS[s0.pub.tiles[t].k].res
  let s = { ...P(s0, { homes: { [v1]: { p: 'a', l: 1 }, [v3]: { p: 'b', l: 2 } } }), secret: { ...s0.secret, rs: rsFor(8) } }
  const r = I.move(s, 'a', { type: 'roll' })
  assert.equal(r.pub.dice[0] + r.pub.dice[1], 8)
  assert.equal(r.pub.phase, 'main')
  assert.ok(r.pub.res.a[res] >= 1 && r.pub.res.b[res] >= 2)
  assert.equal(r.pub.gains.a[res], r.pub.res.a[res])
  const blocked = I.move(P(s, { raccoon: t }), 'a', { type: 'roll' })
  assert.equal(blocked.pub.res.a[res], r.pub.res.a[res] - 1, 'nothing from the tile the raccoon sits on')
  assert.ok(blocked.pub.last.nibbled)
  assert.throws(() => I.move(r, 'a', { type: 'roll' }), /roll/)
  assert.throws(() => I.move(s, 'a', { type: 'end' }), /Roll first/)
})

test('isle: a 7 makes big baskets put back half, then the raccoon moves and takes one', () => {
  const s0 = midGame({ phase: 'roll' }, ['a', 'b', 'c'])
  const t = s0.pub.tiles.findIndex((x, i) => i !== s0.pub.raccoon && x.n)
  const v = TILES[t].v[0]
  let s = { ...P(s0, { homes: { [v]: { p: 'b', l: 1 } }, res: { a: { ...zero(), twig: 9 }, b: { ...zero(), wool: 3 }, c: { ...zero(), clay: 8 } } }), secret: { ...s0.secret, rs: rsFor(7) } }
  s = I.move(s, 'a', { type: 'roll' })
  assert.equal(s.pub.phase, 'discard')
  assert.deepEqual(s.pub.discard, { a: 4, c: 4 })
  assert.equal(I.turn(s), 'a', 'the roller puts back first')
  assert.throws(() => I.move(s, 'a', { type: 'discard', give: { twig: 3 } }), /exactly 4/)
  assert.throws(() => I.move(s, 'a', { type: 'discard', give: { clay: 4 } }), /don't have/)
  s = I.move(s, 'a', { type: 'discard', give: { twig: 4 } })
  assert.equal(I.turn(s), 'c')
  s = I.move(s, 'c', I.timeout(s))
  assert.equal(s.pub.res.c.clay, 4)
  assert.equal(s.pub.phase, 'raccoon'); assert.equal(I.turn(s), 'a')
  assert.throws(() => I.move(s, 'a', { type: 'raccoon', tile: s.pub.raccoon }), /different tile/)
  assert.throws(() => I.move(s, 'a', { type: 'raccoon', tile: t }), /who the raccoon takes from/)
  assert.deepEqual(I.victims(s.pub, 'a', t), ['b'])
  s = I.move(s, 'a', { type: 'raccoon', tile: t, from: 'b' })
  assert.equal(s.pub.raccoon, t)
  assert.equal(s.pub.res.b.wool, 2); assert.equal(s.pub.res.a.wool, 1); assert.equal(s.pub.last.took, 'wool')
  assert.equal(s.pub.phase, 'main')
})

test('isle: building costs and placement rules', () => {
  const v0 = 20, e0 = VERTS[v0].e[0], v1 = I.other(e0, v0)
  const e1 = VERTS[v1].e.find(e => e !== e0), v2 = I.other(e1, v1)
  const rich = { twig: 9, wool: 9, clay: 9, berry: 9, tea: 9 }
  let s = midGame({ homes: { [v0]: { p: 'a', l: 1 } }, paths: { [e0]: 'a' }, res: { a: { ...rich }, b: zero() } })
  assert.throws(() => I.move(s, 'a', { type: 'build', kind: 'cottage', v: v1 }), /Too close/)
  assert.throws(() => I.move(s, 'a', { type: 'build', kind: 'cottage', v: v2 }), /end of one of your paths/)
  assert.throws(() => I.move(s, 'a', { type: 'build', kind: 'path', e: EDGES.findIndex(e => ![e.a, e.b].some(v => [v0, v1].includes(v))) }), /join your own/)
  s = I.move(s, 'a', { type: 'build', kind: 'path', e: e1 })
  assert.equal(s.pub.res.a.twig, 8); assert.equal(s.pub.res.a.clay, 8)
  s = I.move(s, 'a', { type: 'build', kind: 'cottage', v: v2 })
  assert.deepEqual(s.pub.homes[v2], { p: 'a', l: 1 })
  assert.deepEqual(s.pub.res.a, { twig: 7, wool: 8, clay: 7, berry: 8, tea: 9 })
  assert.throws(() => I.move(s, 'a', { type: 'build', kind: 'lodge', v: v1 }), /your cottages/)
  s = I.move(s, 'a', { type: 'build', kind: 'lodge', v: v2 })
  assert.equal(s.pub.homes[v2].l, 2)
  assert.deepEqual(s.pub.res.a, { twig: 7, wool: 7, clay: 7, berry: 7, tea: 6 })
  assert.equal(I.score(s.pub, 'a'), 3)
  // someone else's home cuts your path: you can't build on through it
  const s2 = midGame({ homes: { [v1]: { p: 'b', l: 1 } }, paths: { [e0]: 'a' }, res: { a: { ...rich }, b: zero() } })
  assert.match(I.whyNot(s2.pub, 'a', 'path', e1), /join your own/)
  assert.throws(() => I.move(midGame({ homes: { [v0]: { p: 'a', l: 1 } }, res: { a: zero(), b: zero() } }), 'a', { type: 'build', kind: 'path', e: e0 }), /Not enough/)
  // limits
  const five = Object.fromEntries([0, 10, 20, 30, 40].map(v => [v, { p: 'a', l: 1 }]))
  assert.match(I.whyNot({ ...s.pub, homes: five }, 'a', 'cottage', 50, true), /five/)
  assert.deepEqual(I.left({ ...s.pub, homes: five, paths: {} }, 'a'), { path: 15, cottage: 0, lodge: 4 })
})

test('isle: harbour rates 4, 3 at an any-dock, 2 at the matching dock', () => {
  const s = midGame({ res: { a: { ...zero(), twig: 4, wool: 3, clay: 2 }, b: zero() } })
  const any = s.pub.docks.find(d => d.k === 'any'), wd = s.pub.docks.find(d => d.k === 'clay')
  assert.equal(I.rate(s.pub, 'a', 'twig'), 4)
  let r = I.move(s, 'a', { type: 'bank', give: 'twig', get: 'tea' })
  assert.deepEqual([r.pub.res.a.twig, r.pub.res.a.tea], [0, 1])
  assert.throws(() => I.move(s, 'a', { type: 'bank', give: 'wool', get: 'tea' }), /wants 4/)
  const docked = P(s, { homes: { [EDGES[any.e].a]: { p: 'a', l: 1 }, [EDGES[wd.e].b]: { p: 'a', l: 1 } } })
  assert.equal(I.rate(docked.pub, 'a', 'wool'), 3)
  assert.equal(I.rate(docked.pub, 'a', 'clay'), 2)
  r = I.move(docked, 'a', { type: 'bank', give: 'clay', get: 'berry' })
  assert.deepEqual([r.pub.res.a.clay, r.pub.res.a.berry], [0, 1])
  assert.throws(() => I.move(s, 'a', { type: 'bank', give: 'twig', get: 'twig' }), /Pick/)
})

test('isle: offers make the other player the one to answer, accept swaps, three a turn', () => {
  let s = midGame({ res: { a: { ...zero(), twig: 3 }, b: { ...zero(), tea: 2 }, c: zero() } }, ['a', 'b', 'c'])
  assert.throws(() => I.move(s, 'a', { type: 'offer', to: 'b', give: { tea: 1 }, get: { tea: 1 } }), /don't have/)
  assert.throws(() => I.move(s, 'a', { type: 'offer', to: 'a', give: { twig: 1 }, get: { tea: 1 } }), /someone/)
  assert.throws(() => I.move(s, 'a', { type: 'offer', to: 'b', give: { twig: 1 }, get: {} }), /something/)
  s = I.move(s, 'a', { type: 'offer', to: 'b', give: { twig: 2 }, get: { tea: 1 } })
  assert.equal(s.pub.phase, 'trade'); assert.equal(I.turn(s), 'b')
  assert.throws(() => I.move(s, 'a', { type: 'end' }), /turn/)
  const yes = I.move(s, 'b', { type: 'accept' })
  assert.deepEqual([yes.pub.res.a.twig, yes.pub.res.a.tea, yes.pub.res.b.twig, yes.pub.res.b.tea], [1, 1, 2, 1])
  assert.equal(yes.pub.phase, 'main'); assert.equal(I.turn(yes), 'a')
  let no = I.move(s, 'b', I.timeout(s))
  assert.equal(no.pub.last.type, 'decline'); assert.equal(no.pub.res.a.twig, 3)
  const poor = I.move(P(no, {}), 'a', { type: 'offer', to: 'c', give: { twig: 1 }, get: { wool: 1 } })
  assert.throws(() => I.move(poor, 'c', { type: 'accept' }), /don't have/)
  no = I.move(I.move(no, 'a', { type: 'offer', to: 'c', give: { twig: 1 }, get: { wool: 1 } }), 'c', { type: 'decline' })
  no = I.move(I.move(no, 'a', { type: 'offer', to: 'c', give: { twig: 1 }, get: { wool: 1 } }), 'c', { type: 'decline' })
  assert.throws(() => I.move(no, 'a', { type: 'offer', to: 'b', give: { twig: 1 }, get: { tea: 1 } }), /Three offers/)
})

test('isle: cozy cards: buy, wait a turn, one a turn, each card does its thing', () => {
  const s0 = midGame({ res: { a: { ...zero(), wool: 2, berry: 2, tea: 2 }, b: { ...zero(), clay: 3 }, c: { ...zero(), clay: 1 } } }, ['a', 'b', 'c'])
  let s = { ...s0, secret: { ...s0.secret, deck: ['paw', 'gossip', 'picnic', 'paths', 'keep'] } }
  s = I.move(s, 'a', { type: 'buy' })
  assert.deepEqual(s.priv.a.hand, [{ k: 'paw', at: 0 }])
  assert.equal(s.pub.cards.a, 1); assert.equal(s.pub.deck, 4)
  assert.ok(!JSON.stringify(I.view(s, 'b')).includes('"paw"'), 'cards stay secret')
  assert.throws(() => I.move(s, 'a', { type: 'play', card: 'paw' }), /next turn/)
  s = I.move(s, 'a', { type: 'buy' })
  // next turn for a
  s = P(s, { turns: 3, played: false })
  const paw = I.move(s, 'a', { type: 'play', card: 'paw' })
  assert.equal(paw.pub.phase, 'raccoon'); assert.equal(paw.pub.back, 'main'); assert.equal(paw.pub.helped.a, 1)
  assert.throws(() => I.move(P(paw, { phase: 'main' }), 'a', { type: 'play', card: 'gossip', res: 'clay' }), /One cozy card/)
  const goss = I.move(s, 'a', { type: 'play', card: 'gossip', res: 'clay' })
  assert.deepEqual([goss.pub.res.a.clay, goss.pub.res.b.clay, goss.pub.res.c.clay], [3, 1, 0])
  assert.equal(goss.pub.last.got, 3)
  const pic = I.move(P(s, { phase: 'roll' }), 'a', { ...{ type: 'play', card: 'paw' } })
  assert.equal(pic.pub.back, 'roll', 'a paw before rolling comes back to the roll')
  const s3 = { ...s, priv: { a: { hand: [{ k: 'picnic', at: 0 }, { k: 'paths', at: 0 }, { k: 'keep', at: 0 }] } } }
  const p2 = I.move(s3, 'a', { type: 'play', card: 'picnic', res: ['tea', 'clay'] })
  assert.deepEqual([p2.pub.res.a.tea, p2.pub.res.a.clay], [1, 1], 'two bought cards spent both tea leaves; the basket brings one back')
  assert.throws(() => I.move(s3, 'a', { type: 'play', card: 'picnic', res: ['tea'] }), /two/)
  assert.throws(() => I.move(s3, 'a', { type: 'play', card: 'keep' }), /hidden/)
  // Path Party: two free paths
  const v0 = 20, e0 = VERTS[v0].e[0]
  let pp = I.move(P(s3, { homes: { [v0]: { p: 'a', l: 1 } } }), 'a', { type: 'play', card: 'paths' })
  assert.equal(pp.pub.free, 2)
  const e1 = VERTS[v0].e[1]
  pp = I.move(I.move(pp, 'a', { type: 'build', kind: 'path', e: e0 }), 'a', { type: 'build', kind: 'path', e: e1 })
  assert.equal(pp.pub.free, 0)
  assert.deepEqual(pp.pub.res.a, s3.pub.res.a, 'free paths cost nothing')
})

test('isle: longest path and kindest neighbour bonuses, hidden keepsakes win on your own turn', () => {
  // a chain of 5 sides along the coast
  const chain = I.COAST.slice(0, 6)
  const s0 = midGame()
  const run = (n, extraHomes = {}) => ({ ...s0.pub, paths: Object.fromEntries(chain.slice(0, n).map(e => [e, 'a'])), homes: extraHomes })
  const n5 = I.longest(run(6), 'a')
  assert.ok(n5 >= 5, `coast chain is long (${n5})`)
  const pub = run(6)
  const mids = chain.slice(1, 5).map(e => [EDGES[e].a, EDGES[e].b]).flat()
  const cut = mids.find(v => chain.slice(0, 6).filter(e => EDGES[e].a === v || EDGES[e].b === v).length === 2)
  assert.ok(I.longest({ ...pub, homes: { [cut]: { p: 'b', l: 1 } } }, 'a') < n5, "someone else's home breaks the run")
  assert.equal(I.longest({ ...pub, homes: { [cut]: { p: 'a', l: 1 } } }, 'a'), n5, 'your own home does not')
  // the bonus goes to a path of 5+ when a path is built
  const v = EDGES[chain[0]].a
  let s = midGame({ paths: Object.fromEntries(chain.slice(0, 4).map(e => [e, 'a'])), homes: { [v]: { p: 'a', l: 1 } }, res: { a: { ...zero(), twig: 5, clay: 5 }, b: zero() } })
  const next = chain.slice(4).find(e => !I.whyNot(s.pub, 'a', 'path', e))
  s = I.move(s, 'a', { type: 'build', kind: 'path', e: next ?? chain[4] })
  assert.equal(s.pub.bonus.path, 'a'); assert.equal(I.score(s.pub, 'a'), 3)
  // kindest neighbour after 3 helping paws
  let h = midGame({ helped: { a: 2, b: 0 }, priv: undefined })
  h = { ...h, priv: { a: { hand: [{ k: 'paw', at: 0 }] } } }
  h = I.move(P(h, { turns: 2 }), 'a', { type: 'play', card: 'paw' })
  assert.equal(h.pub.bonus.help, 'a')
  // keepsakes: 8 public points + 2 hidden = a win the moment a's move lands
  const homes = Object.fromEntries([0, 10, 20, 30].map(x => [x, { p: 'a', l: 2 }]))
  let w = midGame({ homes, res: { a: { ...zero(), wool: 1, berry: 1, tea: 1 }, b: zero() } })
  w = { ...w, priv: { a: { hand: [{ k: 'keep', at: 0 }] } }, secret: { ...w.secret, deck: ['keep'] } }
  assert.equal(I.points(w, 'a'), 9)
  assert.equal(I.view(w, 'b').winner, null)
  w = I.move(w, 'a', { type: 'buy' })
  assert.deepEqual(I.over(w), ['a'])
  assert.deepEqual(w.pub.reveal, { a: 2, b: 0 })
  assert.throws(() => I.move(w, 'b', { type: 'end' }), /over/)
})

test('isle: every phase has a timeout that is a legal move', () => {
  let s = I.setup(['a', 'b', 'c'], 21)
  const phases = new Set()
  for (let k = 0; k < 3000 && !I.over(s); k++) {
    phases.add(s.pub.phase)
    s = I.move(s, I.turn(s), I.timeout(s)) // throws if a timeout is ever illegal
  }
  for (const p of ['place', 'roll', 'main', 'discard', 'raccoon']) assert.ok(phases.has(p), p)
  const t = midGame({ res: { a: { ...zero(), twig: 1 }, b: zero() } })
  const off = I.move(t, 'a', { type: 'offer', to: 'b', give: { twig: 1 }, get: { tea: 1 } })
  assert.deepEqual(I.timeout(off), { type: 'decline' })
})

test('isle: Chitbots finish whole games at every level and size, without one illegal move', () => {
  for (const [players, levels, seed] of [
    [['bot:0', 'bot:1'], ['easy', 'hard'], 1], [['bot:0', 'bot:1'], ['easy', 'easy'], 2],
    [['bot:0', 'bot:1', 'bot:2'], ['normal', 'normal', 'normal'], 3], [['bot:0', 'bot:1', 'bot:2'], ['easy', 'normal', 'hard'], 4],
    [['bot:0', 'bot:1', 'bot:2', 'bot:3'], ['hard', 'hard', 'hard', 'hard'], 5], [['bot:0', 'bot:1', 'bot:2', 'bot:3'], ['easy', 'easy', 'normal', 'hard'], 6],
  ]) {
    const rand = rng(seed * 7)
    let s = I.setup(players, seed), k = 0
    while (!I.over(s) && k++ < 5000) {
      const who = I.turn(s)
      s = I.move(s, who, I.bot(I.view(s, who), who, levels[players.indexOf(who)], rand)) // throws on an illegal bot move
    }
    const w = I.over(s)?.[0]
    assert.ok(w, `${players.length} bots (${levels}) finished`)
    assert.ok(I.points(s, w) >= 10, 'the winner reached 10 points')
    assert.ok(s.pub.round < s.pub.maxRounds, 'won on points, not the round cap')
  }
})

test('isle: the bank holds 19 of each; when it runs short, several owed get none, one owed gets what is left', () => {
  const s0 = midGame({ phase: 'roll' }, ['a', 'b', 'c'])
  const t = s0.pub.tiles.findIndex((x, i) => x.n === 8 && i !== s0.pub.raccoon), [v1, , v3] = TILES[t].v
  const k = I.KINDS[s0.pub.tiles[t].k].res
  const other8 = s0.pub.tiles.findIndex((x, i) => x.n === 8 && i !== t)
  const homes = { [v1]: { p: 'a', l: 1 }, [v3]: { p: 'b', l: 2 } }
  const roll = res => I.move({ ...P(s0, { homes, raccoon: other8 >= 0 ? other8 : s0.pub.raccoon, res }), secret: { ...s0.secret, rs: rsFor(8) } }, 'a', { type: 'roll' })
  const full = roll({ a: zero(), b: zero(), c: zero() })
  assert.equal(I.bankLeft(full.pub, k), I.BANK - 3)
  const two = roll({ a: zero(), b: zero(), c: { ...zero(), [k]: 17 } }) // 2 left, 3 owed to two players
  assert.equal(two.pub.res.a[k] + two.pub.res.b[k], 0, 'not enough for everyone: nobody gets it')
  assert.deepEqual(two.pub.last.short, [k])
  const solo = I.move({ ...P(s0, { homes: { [v3]: { p: 'b', l: 2 } }, raccoon: other8 >= 0 ? other8 : s0.pub.raccoon, res: { a: zero(), b: zero(), c: { ...zero(), [k]: 18 } } }), secret: { ...s0.secret, rs: rsFor(8) } }, 'a', { type: 'roll' })
  assert.equal(solo.pub.res.b[k], 1, 'only one owed: they get the last one')
  // harbour and picnic can't take what the bank doesn't have
  const empty = midGame({ res: { a: { ...zero(), twig: 4 }, b: { ...zero(), tea: 19 } } })
  assert.throws(() => I.move(empty, 'a', { type: 'bank', give: 'twig', get: 'tea' }), /no tea left/)
  const pic = { ...empty, priv: { a: { hand: [{ k: 'picnic', at: -1 }] } } }
  assert.throws(() => I.move(pic, 'a', { type: 'play', card: 'picnic', res: ['tea', 'wool'] }), /run out/)
  assert.equal(I.move(pic, 'a', { type: 'play', card: 'picnic', res: ['wool', 'wool'] }).pub.res.a.wool, 2)
})

test('isle: house rules: quick to 8, friendly raccoon, big baskets', () => {
  assert.equal(I.setup(['a', 'b'], 1, { quick: true }).pub.target, 8)
  assert.deepEqual(I.setup(['a', 'b'], 1).pub.opts, { quick: false, friendly: false, bigBaskets: false })
  // friendly: b has 1 point, so tiles touching b are off limits for a
  const s = midGame({ phase: 'raccoon', back: 'main', opts: { friendly: true } })
  const t = s.pub.tiles.findIndex((x, i) => i !== s.pub.raccoon && x.n)
  const st = P(s, { homes: { [TILES[t].v[0]]: { p: 'b', l: 1 } }, res: { a: zero(), b: { ...zero(), wool: 2 } } })
  assert.ok(!I.raccoonSpots(st.pub, 'a').includes(t))
  assert.throws(() => I.move(st, 'a', { type: 'raccoon', tile: t, from: 'b' }), /friendly/)
  assert.ok(I.raccoonSpots(P(st, { opts: {} }).pub, 'a').includes(t), 'off: anywhere')
  const big = homes => P(st, { homes, opts: { friendly: true } }).pub
  const far = VERTS.findIndex((_, i) => !TILES[t].v.includes(i))
  const lots = { [TILES[t].v[0]]: { p: 'b', l: 2 }, [far]: { p: 'b', l: 1 } }
  assert.ok(I.raccoonSpots(big(lots), 'a').includes(t), '3 points: fair game')
  assert.equal(I.move(st, 'a', I.timeout(st)).pub.phase, 'main', 'the timeout picks an allowed tile')
  // big baskets: 9 is safe, 10 puts back 5
  const r = midGame({ phase: 'roll', res: { a: { ...zero(), twig: 9 }, b: { ...zero(), wool: 10 } }, opts: { bigBaskets: true } })
  const seven = I.move({ ...r, secret: { ...r.secret, rs: rsFor(7) } }, 'a', { type: 'roll' })
  assert.deepEqual(seven.pub.discard, { b: 5 })
})

test('isle: house-rule games finish with bots too', () => {
  for (const opts of [{ friendly: true }, { bigBaskets: true, quick: true }, { friendly: true, bigBaskets: true }]) {
    const players = ['bot:0', 'bot:1', 'bot:2'], rand = rng(3)
    let s = I.setup(players, 12, opts), k = 0
    while (!I.over(s) && k++ < 5000) { const who = I.turn(s); s = I.move(s, who, I.bot(I.view(s, who), who, ['easy', 'normal', 'hard'][players.indexOf(who)], rand)) }
    assert.ok(I.over(s), JSON.stringify(opts))
  }
})

test('isle: bots answer trades sensibly', () => {
  const s = midGame({ phase: 'trade', offer: { from: 'a', to: 'b', give: { twig: 3 }, get: { tea: 1 } }, res: { a: { ...zero(), twig: 3 }, b: { ...zero(), tea: 0 } } })
  assert.deepEqual(I.bot(I.view(s, 'b'), 'b', 'hard', Math.random), { type: 'decline' }, "can't pay: no")
  const s2 = P(s, { res: { a: { ...zero(), twig: 3 }, b: { ...zero(), tea: 5, clay: 1, wool: 1, berry: 1 } } })
  assert.deepEqual(I.bot(I.view(s2, 'b'), 'b', 'normal', Math.random), { type: 'accept' }, '3 twigs it needs for a spare tea leaf: yes')
  assert.equal(I.bot(I.view(s2, 'a'), 'a', 'normal', Math.random), null, 'not its turn')
})
