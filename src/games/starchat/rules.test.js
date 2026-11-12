import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import * as D from './data.js'
import { rng } from '../rng.js'

// A two-player table where a moves first, with any public fields overridden.
const base = (extra = {}, opts = {}, players = ['a', 'b']) => {
  const s = R.setup(players, 7, opts)
  return { ...s, pub: { ...s.pub, order: [...players], turn: 0, star: 4, ...extra } }
}
const bag = (s, pid, items) => ({ ...s, pub: { ...s.pub, satchel: { ...s.pub.satchel, [pid]: items } } })
// Walk exactly n with a Paper Boat.
const boat = (s, n, pid = 'a') => R.move(R.move(bag(s, pid, ['boat', ...s.pub.satchel[pid]]), pid, { type: 'item', item: 'boat', pick: n }), pid, { type: 'roll' })
const evs = s => s.pub.last.ev.map(e => e.e)
// Every move each player could make, until someone has to decide (play out the rest of a round with timeouts).
const toMini = s => { let k = 0; while (s.pub.phase !== 'mini' && k++ < 200) s = R.move(s, R.turn(s), R.timeout(s)); return s }

test('starchat board: a 36-space loop, the one-way bridge, six posts, every space reachable', () => {
  assert.equal(D.SPACES.length, 41)
  assert.equal(D.POSTS.length, 6)
  assert.ok(D.POSTS.every(p => D.SPACES[p].k === 'post'))
  assert.deepEqual(D.SPACES[D.BRIDGE.from].next, [27, D.BRIDGE.to])
  assert.equal(D.SPACES.filter(s => s.next.length > 1).length, 1, 'one fork')
  assert.deepEqual(D.SPACES[40].next, [9])
  assert.equal(D.SPACES[9].k, 'tea', 'the bridge comes ashore at the Tea House')
  for (let i = 0; i < D.SPACES.length; i++) assert.ok(R.dists(i).every(Number.isFinite), `everything reachable from ${i}`)
  assert.equal(R.dists(26, true)[9] < R.dists(26, false)[9], true)
  assert.equal(R.dists(26, false)[9], 19)
  assert.equal(R.dists(26)[9], Math.min(19, 6))
  const loop = D.SPACES.slice(0, D.LOOP).map(s => s.k)
  const n = k => loop.filter(x => x === k).length
  assert.deepEqual([n('glow'), n('drizzle'), n('firefly'), n('bramble'), n('stall'), n('owl'), n('tea'), n('post')], [14, 5, 4, 2, 2, 2, 1, 6])
  for (const id of Object.keys(D.ITEMS)) assert.ok(D.ITEMS[id].name && D.ITEMS[id].price > 0)
})

test('starchat setup: house rules pick the length, star price and bonus mode', () => {
  assert.equal(R.setup(['a', 'b'], 1).pub.maxRounds, 12)
  assert.equal(R.setup(['a', 'b'], 1, { quick: true }).pub.maxRounds, 8)
  assert.equal(R.setup(['a', 'b'], 1, { festival: true }).pub.maxRounds, 16)
  assert.throws(() => R.setup(['a'], 1), /2 to 8/)
  const s = R.setup(['a', 'b', 'c'], 3)
  assert.deepEqual([...s.pub.order].sort(), ['a', 'b', 'c'])
  assert.ok(D.POSTS.includes(s.pub.star))
  assert.equal(s.pub.bonus, null, 'surprise: hidden')
  assert.equal(s.secret.bonus.length, 3)
  assert.equal(R.setup(['a', 'b'], 1, { openBonus: true }).pub.bonus.length, 3)
  assert.deepEqual(R.setup(['a', 'b'], 1, { noBonus: true }).secret.bonus, [])
  assert.equal(R.starPrice(s.pub), 20)
  assert.equal(R.starPrice(R.setup(['a', 'b'], 1, { cheapStars: true }).pub), 10)
  assert.equal(R.starPrice({ ...R.setup(['a', 'b'], 1, { risingPrice: true }).pub, starsBought: 3 }), 35)
})

test('starchat movement: dice, step by step, the fork onto the bridge on even rounds only', () => {
  // plain roll: one die, walk that many
  const s = base({ coins: { a: 0, b: 0 } }) // no coins: no stall or star stops on the way
  const r = R.move(s, 'a', { type: 'roll' })
  assert.equal(r.pub.dice.length, 1)
  assert.equal(r.pub.pos.a, r.pub.dice[0])
  assert.equal(r.pub.stats.walked.a, r.pub.dice[0])
  assert.equal(R.turn(r), 'b', 'the turn passes on by itself')
  // odd round: the gate is shut, straight on along the loop
  const odd = boat(base({ pos: { a: 24, b: 0 }, round: 1 }), 4)
  assert.equal(odd.pub.pos.a, 28)
  assert.deepEqual(odd.pub.last.path, [25, 26, 27, 28])
  // even round with the toll: a fork
  const even = boat(base({ pos: { a: 24, b: 0 }, round: 2, coins: { a: 15, b: 0 } }), 4)
  assert.equal(even.pub.phase, 'fork')
  assert.deepEqual(even.pub.fork, [27, 36])
  assert.equal(even.pub.pos.a, 26)
  assert.deepEqual(R.timeout(even), { type: 'path', to: 27 }, 'a timeout stays on the loop')
  assert.throws(() => R.move(even, 'a', { type: 'path', to: 30 }), /that way/)
  const br = R.move(even, 'a', { type: 'path', to: 36 })
  assert.equal(br.pub.pos.a, 37)
  assert.equal(br.pub.coins.a, 15 - 10, 'toll paid, then the Firefly space gave an item')
  assert.equal(br.pub.satchel.a.length, 1)
  // too poor for the toll: no fork
  assert.equal(boat(base({ pos: { a: 24, b: 0 }, round: 2, coins: { a: 5, b: 0 } }), 4).pub.pos.a, 28)
  // the bridge comes ashore at the Tea House
  const ashore = boat(base({ pos: { a: 39, b: 0 } }), 3)
  assert.deepEqual(ashore.pub.last.path, [40, 9, 10])
  // the loop wraps
  assert.equal(boat(base({ pos: { a: 34, b: 0 } }), 3).pub.pos.a, 1)
  // wrong phase / wrong player
  assert.throws(() => R.move(s, 'b', { type: 'roll' }), /turn/)
  assert.throws(() => R.move(s, 'a', { type: 'path', to: 1 }), /Roll/)
})

test('starchat landing: glow, drizzle, posts, honey pot, firefly, owl stub, mishaps walking back', () => {
  const glow = boat(base({ pos: { a: 0, b: 0 }, pot: 7 }), 1) // 1: glow
  assert.equal(glow.pub.coins.a, 10 + 3 + 7); assert.equal(glow.pub.pot, 0); assert.equal(glow.pub.stats.glow.a, 1)
  const dz = boat(base({ pos: { a: 0, b: 0 } }), 2) // 2: drizzle
  assert.equal(dz.pub.coins.a, 7)
  assert.equal(boat(base({ pos: { a: 0, b: 0 }, coins: { a: 1, b: 0 } }), 2).pub.coins.a, 0, 'never below zero')
  const post = boat(base({ pos: { a: 6, b: 0 }, star: 20 }), 2) // 8: an unlit post
  assert.equal(post.pub.coins.a, 12)
  const owl = boat(base({ pos: { a: 13, b: 0 } }), 2)
  assert.ok(evs(owl).includes('owl'))
  const full = boat(bag(base({ pos: { a: 0, b: 0 } }), 'a', ['jar', 'jar']), 3) // 3: a Firefly space fills the last slot
  assert.equal(full.pub.satchel.a.length, 3)
  const fuller = boat(bag(base({ pos: { a: 0, b: 0 } }), 'a', ['jar', 'jar', 'snail']), 3)
  assert.equal(fuller.pub.satchel.a.length, 3); assert.equal(fuller.pub.coins.a, 10 + D.COINS.fireflyFull)
  // a Bramble: find a seed for each mishap card
  const cards = new Set()
  for (let rs = 0; rs < 400 && cards.size < D.MISHAPS.length; rs++) {
    const s = boat({ ...base({ pos: { a: 11, b: 0 } }), secret: { ...base().secret, rs } }, 2) // 13: bramble
    const m = s.pub.last.ev.find(e => e.e === 'mishap'), c = D.MISHAPS[m.card]
    cards.add(m.card)
    if (c.back) assert.equal(s.pub.pos.a, 10)
    if (c.lose) assert.equal(s.pub.coins.a, 10 - c.lose)
    if (c.each) assert.deepEqual([s.pub.coins.a, s.pub.coins.b], [9, 11])
    assert.equal(s.pub.stats.mishaps.a, c.none ? 0 : 1)
  }
  assert.equal(cards.size, D.MISHAPS.length)
  // the Tea House wheel
  const tea = new Set()
  for (let rs = 0; rs < 200 && tea.size < 4; rs++) {
    const s = boat({ ...base({ pos: { a: 7, b: 30 } }), secret: { ...base().secret, rs } }, 2)
    const t = s.pub.last.ev.find(e => e.e === 'tea')
    tea.add(t.id)
    if (t.id === 'swap') assert.deepEqual([s.pub.pos.a, s.pub.pos.b], [30, 9])
    if (t.id === 'ferry') assert.ok(D.POSTS.includes(s.pub.pos.a))
    if (t.id === 'pot') assert.equal(s.pub.pot, 10)
    if (t.id === 'drift') assert.notEqual(s.pub.star, 4)
  }
  assert.equal(tea.size, 4)
})

test('starchat stars: buy when passing, the star drifts away from the buyer, idle stars wander, Last Lanterns buys two', () => {
  const s = base({ pos: { a: 18, b: 0 }, star: 20, coins: { a: 30, b: 0 } })
  const stop = boat(s, 3)
  assert.equal(stop.pub.phase, 'star'); assert.equal(stop.pub.pos.a, 20)
  assert.deepEqual(R.timeout(stop), { type: 'pass' })
  const bought = R.move(stop, 'a', { type: 'star' })
  assert.equal(bought.pub.stars.a, 1); assert.equal(bought.pub.coins.a, 10 + 3, 'paid 20, then walked on to a Glow')
  assert.equal(bought.pub.pos.a, 21); assert.equal(bought.pub.stats.spent.a, 20)
  assert.ok(![20, 25, 28].includes(bought.pub.star), 'not where it was, nor within 8 spaces ahead')
  assert.ok(evs(bought).includes('star') && evs(bought).includes('drift'))
  const passed = R.move(stop, 'a', { type: 'pass' })
  assert.equal(passed.pub.stars.a, 0); assert.equal(passed.pub.star, 20)
  assert.throws(() => R.move(stop, 'a', { type: 'star', n: 2 }), /Last Lanterns/)
  // too poor: no stop
  assert.equal(boat(base({ pos: { a: 18, b: 0 }, star: 20, coins: { a: 19, b: 0 } }), 3).pub.pos.a, 21)
  // Last Lanterns: two at once
  const ll = boat(base({ pos: { a: 18, b: 0 }, star: 20, coins: { a: 45, b: 0 }, round: 12 }), 3)
  assert.ok(R.legal(R.view(ll), 'a').some(m => m.n === 2))
  const two = R.move(ll, 'a', { type: 'star', n: 2 })
  assert.equal(two.pub.stars.a, 2); assert.equal(two.pub.coins.a, 5 + 6, 'paid 40, doubled Glow')
  // rising price: the second star costs 5 more
  const rise = R.move(boat(base({ pos: { a: 18, b: 0 }, star: 20, coins: { a: 60, b: 0 }, round: 12, starsBought: 1 }, { risingPrice: true }), 3), 'a', { type: 'star', n: 2 })
  assert.equal(rise.pub.stats.spent.a, 25 + 30)
  // nobody buys it for 3 rounds: it drifts after the minigame
  let idle = toMini(base({ starIdle: 2, star: 4 }))
  idle = R.move(idle, 'a', { type: 'mini', guess: 10 }); idle = R.move(idle, 'b', { type: 'mini', guess: 10 })
  assert.notEqual(idle.pub.star, 4); assert.equal(idle.pub.starIdle, 0)
})

test('starchat items: jars, paper boat, snail shell, honey trap, pocket gust, umbrella, comet ticket', () => {
  const s = base({ pos: { a: 0, b: 0 }, coins: { a: 0, b: 0 } })
  const jar = R.move(R.move(bag(s, 'a', ['jar']), 'a', { type: 'item', item: 'jar' }), 'a', { type: 'roll' })
  assert.equal(jar.pub.dice.length, 2); assert.ok(!jar.pub.satchel.a.includes('jar'))
  const big = R.move(R.move(bag(s, 'a', ['bigjar']), 'a', { type: 'item', item: 'bigjar' }), 'a', { type: 'roll' })
  assert.equal(big.pub.dice.length, 3)
  assert.equal(boat(s, 5).pub.pos.a, 5)
  assert.throws(() => R.move(bag(s, 'a', ['boat']), 'a', { type: 'item', item: 'boat', pick: 7 }), /1 to 6/)
  assert.throws(() => R.move(s, 'a', { type: 'item', item: 'jar' }), /have that/)
  const once = R.move(bag(s, 'a', ['jar', 'snail']), 'a', { type: 'item', item: 'jar' })
  assert.throws(() => R.move(once, 'a', { type: 'item', item: 'snail', target: 'b' }), /One item/)
  assert.throws(() => R.move(bag(s, 'a', ['umbrella']), 'a', { type: 'item', item: 'umbrella' }), /by itself/)
  // snail shell: b rolls 1-3 next turn, even with a jar
  assert.throws(() => R.move(bag(s, 'a', ['snail']), 'a', { type: 'item', item: 'snail', target: 'a' }), /someone else/)
  for (let rs = 0; rs < 30; rs++) {
    let t = R.move(bag({ ...s, secret: { ...s.secret, rs } }, 'a', ['snail']), 'a', { type: 'item', item: 'snail', target: 'b' })
    t = R.move(t, 'a', { type: 'roll' })
    t = R.move(R.move(bag(t, 'b', ['bigjar']), 'b', { type: 'item', item: 'bigjar' }), 'b', { type: 'roll' })
    assert.ok(t.pub.last.dice.every(d => d <= 3)); assert.equal(t.pub.snail.b, undefined)
  }
  // honey trap: b lands on it and pays a
  const set = R.move(bag(s, 'a', ['trap']), 'a', { type: 'item', item: 'trap', space: 3 })
  assert.equal(set.pub.traps[3], 'a')
  const mine = boat(base({ pos: { a: 0, b: 0 }, traps: { 3: 'a' } }), 3)
  assert.equal(mine.pub.traps[3], 'a', 'your own trap stays set')
  const hit = boat(base({ pos: { a: 0, b: 0 }, turn: 1, traps: { 3: 'a' }, coins: { a: 0, b: 15 } }), 3, 'b')
  assert.deepEqual([hit.pub.coins.a, hit.pub.coins.b], [10, 5]); assert.ok(evs(hit).includes('trap'))
  assert.equal(hit.pub.traps[3], undefined)
  // pocket gust
  const gust = R.move(bag(s, 'a', ['gust']), 'a', { type: 'item', item: 'gust' })
  assert.notEqual(gust.pub.star, 4); assert.equal(gust.pub.phase, 'roll', 'still your roll')
  // umbrella blocks a Drizzle and is used up
  const um = boat(bag(base({ pos: { a: 0, b: 0 } }), 'a', ['umbrella']), 2)
  assert.equal(um.pub.coins.a, 10); assert.deepEqual(um.pub.satchel.a, []); assert.ok(evs(um).includes('umbrella'))
  // comet ticket: straight to the star, buy it, turn over
  const comet = R.move(bag(base({ pos: { a: 30, b: 0 }, star: 12, coins: { a: 25, b: 0 } }), 'a', ['comet']), 'a', { type: 'item', item: 'comet' })
  assert.equal(comet.pub.phase, 'star'); assert.equal(comet.pub.pos.a, 12)
  const got = R.move(comet, 'a', { type: 'star' })
  assert.equal(got.pub.stars.a, 1); assert.equal(R.turn(got), 'b')
})

test('starchat shop: opens when you pass a stall, three items, coins and slots limit buying, comets wait for round 5', () => {
  const s = base({ pos: { a: 4, b: 0 }, coins: { a: 40, b: 0 } })
  const shop = boat(s, 4) // passes the stall at 6, lands on 8
  assert.equal(shop.pub.phase, 'shop'); assert.equal(shop.pub.pos.a, 6)
  assert.equal(shop.pub.shop.stock.length, 3)
  assert.ok(!shop.pub.shop.stock.includes('comet'), 'no comets in round 1')
  assert.deepEqual(R.timeout(shop), { type: 'leave' })
  const id = shop.pub.shop.stock[0]
  const b = R.move(shop, 'a', { type: 'buy', item: id })
  assert.deepEqual(b.pub.satchel.a, [id]); assert.equal(b.pub.coins.a, 40 - D.ITEMS[id].price); assert.equal(b.pub.stats.spent.a, D.ITEMS[id].price)
  if (b.pub.phase === 'shop') {
    assert.throws(() => R.move(b, 'a', { type: 'buy', item: id }), /not on the stall/)
    const out = R.move(b, 'a', { type: 'leave' })
    assert.equal(out.pub.pos.a, 8); assert.equal(R.turn(out), 'b')
  }
  assert.equal(boat(base({ pos: { a: 4, b: 0 }, coins: { a: 0, b: 0 } }), 4).pub.pos.a, 8, 'broke: the stall stays shut')
  const full = boat(bag(base({ pos: { a: 4, b: 0 }, coins: { a: 40, b: 0 } }), 'a', ['jar', 'jar', 'jar']), 4)
  assert.equal(full.pub.pos.a, 8, 'full satchel: the stall stays shut')
  let comets = 0
  for (let rs = 0; rs < 60; rs++) comets += boat({ ...base({ pos: { a: 4, b: 0 }, coins: { a: 40, b: 0 }, round: 5 }), secret: { ...s.secret, rs } }, 4).pub.shop?.stock.includes('comet') ? 1 : 0
  assert.ok(comets > 0, 'comets from round 5')
})

test('starchat minigame: everyone posts one secret guess, bots first, payout by place, ties share, exact bonus', () => {
  const s = toMini(base({}, {}, ['a', 'bot:1', 'c']))
  assert.equal(s.pub.phase, 'mini'); assert.equal(s.pub.mini.id, 'count')
  assert.equal(R.turn(s), 'bot:1', 'a due bot first')
  const [lo, hi] = s.pub.mini.state.hint, target = s.secret.mini.secret.target
  assert.ok(lo <= target && target <= hi)
  assert.ok(!JSON.stringify(R.view(s)).includes('"target"'))
  // c posts out of turn; the guess is not public
  const c = R.move(s, 'c', { type: 'mini', guess: target })
  assert.ok(c.pub.mini.posted.c); assert.ok(!JSON.stringify(c.pub).includes('"guesses"'))
  assert.throws(() => R.move(c, 'c', { type: 'mini', guess: 1 }), /already/)
  assert.throws(() => R.move(c, 'a', { type: 'mini', guess: 999 }), /whole number/)
  assert.throws(() => R.move(c, 'a', { type: 'timeout' }), /turn/, 'only the named player times out')
  const far = target > 15 ? D.MINIGAMES.count.lo : D.MINIGAMES.count.hi
  let t = R.move(c, 'a', { type: 'mini', guess: far })
  assert.equal(t.pub.phase, 'mini')
  t = R.move(t, 'bot:1', { type: 'timeout' })
  assert.equal(t.pub.phase, 'roll'); assert.equal(t.pub.round, 2); assert.equal(t.pub.mini, null)
  const res = t.pub.miniResult
  assert.deepEqual(res.place, { c: 1, a: 2, 'bot:1': 3 })
  assert.deepEqual(res.coins, { c: 10 + D.MINIGAMES.count.exact, a: 5, 'bot:1': 2 })
  assert.equal(res.reveal.target, target)
  assert.equal(t.pub.stats.mini.c, 15)
  // ties share the place
  let u = R.move(R.move(R.move(s, 'a', { type: 'mini', guess: lo }), 'c', { type: 'mini', guess: lo }), 'bot:1', { type: 'mini', guess: hi })
  if (Math.abs(lo - target) < Math.abs(hi - target)) { assert.equal(u.pub.miniResult.place.a, 1); assert.equal(u.pub.miniResult.place.c, 1); assert.equal(u.pub.miniResult.place['bot:1'], 3) }
  // the module's own contract
  const M = R.MINIS.count
  const b = M.begin(['x'], rng(1), D.MINIGAMES.count)
  assert.equal(b.pub.hint[1] - b.pub.hint[0] + 1, D.MINIGAMES.count.window)
  for (const lv of ['easy', 'normal', 'hard']) { const m = M.bot(b.pub, 'x', lv, rng(2)); assert.doesNotThrow(() => M.submit(b.pub, 'x', m)) }
})

test('starchat Last Lanterns: last place gets a hand, Glow and Drizzle double', () => {
  let s = toMini(base({ round: 9, coins: { a: 50, b: 3 }, stars: { a: 1, b: 0 } })) // 12 rounds: 10-12 are Last Lanterns
  while (s.pub.phase === 'mini') s = R.move(s, R.turn(s), R.timeout(s))
  assert.equal(s.pub.round, 10); assert.ok(R.lastLanterns(s.pub))
  assert.ok(evs(s).includes('lastLanterns'))
  assert.ok(s.pub.satchel.b.includes('jar'))
  const glow = boat({ ...s, pub: { ...s.pub, order: ['a', 'b'], turn: 0, pos: { a: 0, b: 0 }, coins: { a: 0, b: 0 } } }, 1)
  assert.equal(glow.pub.coins.a, 6)
})

test('starchat end: bonus stars (ties share, zero wins nothing, Chatterbox from talk), most stars wins, coins break ties', () => {
  const s = base({ round: 8, maxRounds: 8, stars: { a: 2, b: 2 }, coins: { a: 5, b: 9 } })
  const end = { ...s, secret: { ...s.secret, bonus: ['wanderer', 'chatterbox', 'bramble'] } }
  const e = { ...end, pub: { ...end.pub, stats: { ...end.pub.stats, walked: { a: 30, b: 30 }, mishaps: { a: 0, b: 0 } } } }
  let t = R.move(e, 'a', { type: 'roll', talk: 120 }) // a talks the most (talk rides on any move)
  t = toMini(t)
  assert.equal(R.over(t), null)
  assert.equal(R.view(t).bonus, null, 'surprise bonus stays hidden')
  t = R.move(R.move(t, 'a', { type: 'mini', guess: 10 }), 'b', { type: 'mini', guess: 10 })
  assert.equal(t.pub.phase, 'done')
  const aw = Object.fromEntries(t.pub.awards.map(x => [x.id, x.to]))
  assert.deepEqual(aw.chatterbox, ['a'])
  assert.deepEqual(aw.bramble, [], 'no mishaps: nobody')
  assert.ok(aw.wanderer.length >= 1)
  assert.deepEqual(t.pub.bonus, ['wanderer', 'chatterbox', 'bramble'])
  assert.deepEqual(R.over(t), t.pub.winners)
  const top = R.ranking(t.pub)[0]
  assert.equal(t.pub.winner, top)
  assert.ok(t.pub.players.every(p => t.pub.stars[p] <= t.pub.stars[top]))
  assert.throws(() => R.move(t, 'a', { type: 'roll' }), /over/)
  // bots never get talk credit
  const bt = R.move(base({}, {}, ['bot:0', 'b']), 'bot:0', { type: 'roll', talk: 999 })
  assert.equal(bt.pub.stats.talk['bot:0'], 0)
  // coins break a star tie, a full tie shares the win
  const pub = { ...s.pub, stars: { a: 3, b: 3 }, coins: { a: 4, b: 8 } }
  assert.deepEqual(R.ranking(pub), ['b', 'a'])
})

test('starchat timeouts: every phase has one and a game of timeouts ends', () => {
  let s = R.setup(['a', 'b', 'c'], 4, { quick: true }), k = 0
  const seen = new Set()
  while (!R.over(s) && k++ < 5000) { seen.add(s.pub.phase); const t = R.timeout(s); assert.ok(t, s.pub.phase); s = R.move(s, R.turn(s), t) }
  assert.ok(R.over(s))
  assert.ok(seen.has('roll') && seen.has('mini'))
  for (const ph of ['fork', 'star', 'shop']) assert.ok(R.timeout({ pub: { phase: ph, fork: [1, 2] } }))
})

test('starchat bots: head for the star, buy two in Last Lanterns, use a boat to reach it, keep coins for the star', () => {
  const fork = boat(base({ pos: { a: 24, b: 0 }, round: 2, coins: { a: 15, b: 0 }, star: 12 }), 4)
  assert.deepEqual(R.bot(R.view(fork), 'a', 'normal'), { type: 'path', to: 36 }, 'the bridge is shorter to the star at 12')
  assert.deepEqual(R.bot(R.view({ ...fork, pub: { ...fork.pub, star: 28 } }), 'a', 'hard'), { type: 'path', to: 27 })
  const ll = boat(base({ pos: { a: 18, b: 0 }, star: 20, coins: { a: 45, b: 0 }, round: 12 }), 3)
  assert.deepEqual(R.bot(R.view(ll), 'a', 'hard'), { type: 'star', n: 2 })
  assert.deepEqual(R.bot(R.view(ll), 'a', 'easy'), { type: 'star', n: 1 })
  const near = bag(base({ pos: { a: 16, b: 0 }, star: 20, coins: { a: 25, b: 0 } }), 'a', ['boat'])
  assert.deepEqual(R.bot(R.view(near), 'a', 'normal'), { type: 'item', item: 'boat', pick: 4 })
  const far = bag(base({ pos: { a: 10, b: 0 }, star: 20, coins: { a: 25, b: 0 } }), 'a', ['jar'])
  assert.deepEqual(R.bot(R.view(far), 'a', 'normal'), { type: 'item', item: 'jar' })
  assert.deepEqual(R.bot(R.view(far), 'a', 'easy'), { type: 'roll' })
  assert.equal(R.bot(R.view(far), 'b', 'hard'), null, 'not its turn')
  // shop: keeps 20 coins for a star within 12 spaces
  const shop = { ...base(), pub: { ...base().pub, phase: 'shop', pos: { a: 6, b: 0 }, star: 12, coins: { a: 25, b: 0 }, shop: { at: 6, stock: ['boat', 'jar', 'umbrella'] } } }
  assert.equal(R.bot(R.view(shop), 'a', 'normal').item, 'umbrella')
  assert.deepEqual(R.bot(R.view({ ...shop, pub: { ...shop.pub, coins: { a: 22, b: 0 } } }), 'a', 'normal'), { type: 'leave' })
  assert.equal(R.bot(R.view({ ...shop, pub: { ...shop.pub, coins: { a: 40, b: 0 } } }), 'a', 'normal').item, 'jar')
})

// Whole games over many seeds, every table size, mixed levels: they all finish, every bot move is legal, and the
// stars spread sensibly (hard bots win more than easy ones).
test('starchat bot games finish over many seeds and stay deterministic', () => {
  const lv = ['easy', 'normal', 'hard'], wins = { easy: 0, normal: 0, hard: 0 }
  let stars = 0, games = 0
  const play = (n, seed, opts) => {
    const players = Array.from({ length: n }, (_, i) => `bot:${i}`), levels = players.map((_, i) => lv[(i + seed) % 3])
    const rand = rng(seed + 99)
    let s = R.setup(players, seed, opts), k = 0
    while (!R.over(s) && k++ < 4000) { const w = R.turn(s); s = R.move(s, w, R.bot(R.view(s), w, levels[players.indexOf(w)], rand)) }
    return { s, levels, players }
  }
  for (const n of [2, 3, 4, 5, 6, 7, 8]) for (let seed = 0; seed < 25; seed++) {
    const { s, levels, players } = play(n, seed, { quick: seed % 2 === 0, risingPrice: seed % 5 === 0, openBonus: seed % 3 === 0 })
    assert.ok(R.over(s), `${n} players, seed ${seed}`)
    stars += players.reduce((a, p) => a + s.pub.stars[p], 0)
    games++
    wins[levels[players.indexOf(s.pub.winner)]]++
  }
  assert.ok(stars / games > 2, 'stars get bought')
  assert.ok(wins.hard > wins.easy, `hard beats easy (${JSON.stringify(wins)})`)
  const a = play(4, 42, {}), b = play(4, 42, {})
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s), 'same seed and moves, same game')
  assert.notEqual(JSON.stringify(play(4, 43, {}).s.pub), JSON.stringify(a.s.pub))
})
