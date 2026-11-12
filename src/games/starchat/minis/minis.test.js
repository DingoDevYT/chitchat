// Starchat minigames: Wishfall Catch's replay contract, Hot Bun's hidden timer and edge cases, Firefly Count's jar,
// bots finishing every minigame through the rules, and the rotation.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../rules.js'
import * as D from '../data.js'
import { rng } from '../../rng.js'
import { MINIS } from './index.js'
import * as C from './catch.js'
import * as B from './bun.js'
import * as F from './count.js'

const toMini = s => { let k = 0; while (s.pub.phase !== 'mini' && k++ < 400) s = R.move(s, R.turn(s), R.timeout(s), 1000); return s }
const table = (mini, players = ['a', 'bot:1', 'bot:2'], seed = 5) => toMini(R.setup(players, seed, { mini }))

// A human-ish run: chase whatever lands next, recorded the way the client records it.
function liveRun(seed) {
  const sky = C.makeSky(seed), st = C.newRun(), log = []
  while (st.n < C.TICKS) {
    const next = sky.find(o => o.arr > st.n && o.k !== 'cloud')
    const tgt = next ? next.x : st.tgt
    if (st.n % 4 === 0 && tgt !== st.tgt) { st.tgt = tgt; log.push([st.n, tgt]) }
    C.step(st, sky)
  }
  return { st, log }
}

test('wishfall: the sky is deterministic, integer-only and fits in the half minute', () => {
  const a = C.makeSky(42), b = C.makeSky(42)
  assert.deepEqual(a, b)
  assert.notDeepEqual(C.makeSky(43), a)
  assert.ok(a.length > 50, 'a busy sky')
  for (const o of a) {
    assert.ok(Number.isInteger(o.x) && Number.isInteger(o.t0) && Number.isInteger(o.arr))
    assert.ok(o.arr < C.TICKS && o.t0 < o.arr && ['big', 'dust', 'cloud'].includes(o.k))
  }
  for (const k of ['big', 'dust', 'cloud']) assert.ok(a.some(o => o.k === k), k)
})

test('wishfall: replaying a log equals the live sim, tick for tick', () => {
  for (const seed of [1, 7, 99, 123456]) {
    const { st, log } = liveRun(seed)
    const re = C.replay(seed, log)
    assert.equal(re.score, st.score)
    assert.deepEqual([re.big, re.dust, re.cloud, re.x], [st.big, st.dust, st.cloud, st.x])
    assert.ok(st.score > 0, 'the chaser catches something')
  }
  // an empty log sits in the middle for the whole game
  assert.equal(C.replay(3, []).x, C.W / 2)
})

test('wishfall: the referee keeps the replayed score, a forged one gets corrected, bad logs are refused', () => {
  let s = table('catch', ['a', 'b'])
  assert.equal(s.pub.mini.kind, 'sim')
  const seed = s.pub.mini.state.seed, { st, log } = liveRun(seed)
  const after = s.pub.mini.startAt + C.duration() + 10
  const honest = R.move(s, 'a', { type: 'mini', log, score: st.score }, after)
  assert.ok(!JSON.stringify(honest.pub).includes('"runs"'), 'scores stay secret until everyone has posted')
  const done = R.move(honest, 'b', { type: 'mini', log, score: 9999 }, after)
  const runs = done.pub.miniResult.reveal.runs
  assert.equal(runs.a.score, st.score); assert.ok(!runs.a.fixed)
  assert.equal(runs.b.score, st.score, 'the forged 9999 became the replayed score'); assert.ok(runs.b.fixed)
  assert.equal(done.pub.miniResult.place.a, 1); assert.equal(done.pub.miniResult.place.b, 1, 'same run, shared first')
  // too early: the stars are still falling
  assert.throws(() => R.move(s, 'a', { type: 'mini', log, score: st.score }, s.pub.mini.startAt + 2000), /still falling/)
  for (const bad of [null, [[5, 10], [5, 20]], [[-1, 3]], [[3, 2000]], [[1.5, 3]], 'x', [[900, 1]]]) assert.throws(() => R.move(s, 'a', { type: 'mini', log: bad, score: 0 }, after), /make sense/)
})

test('wishfall: bot runs follow from (seed, seat, level), replay to their claimed score, and levels differ', () => {
  const tot = { easy: 0, normal: 0, hard: 0 }
  for (let seed = 0; seed < 12; seed++) for (const lv of Object.keys(tot)) {
    const a = C.botLog(seed, 2, lv), b = C.botLog(seed, 2, lv)
    assert.deepEqual(a.log, b.log)
    assert.ok(C.validLog(a.log))
    assert.equal(C.replay(seed, a.log).score, a.st.score)
    tot[lv] += a.st.score
  }
  assert.ok(tot.hard > tot.easy, JSON.stringify(tot))
  const st = { seed: 77, players: ['bot:0', 'bot:1'] }
  const m = C.bot(st, 'bot:1', 'hard', Math.random)
  assert.deepEqual(m, C.bot(st, 'bot:1', 'hard', () => 0.5), 'rand is ignored: every client draws the same ghost')
  assert.ok(!C.submit(st, 'bot:1', m, { bot: true }).fixed)
})

test('hot bun: hidden pop, puffs, bonus coins, a fresh bun after a pop, last one standing', () => {
  const cfg = D.MINIGAMES.bun
  let { pub: st, secret } = B.begin(['a', 'b', 'c'], rng(3), cfg)
  assert.ok(!JSON.stringify(st).includes('pop'), 'the pop number is not public')
  assert.ok(secret.pop >= cfg.lo && secret.pop <= cfg.hi)
  const r = rng(9), first = B.whose(st)
  assert.throws(() => B.act(st, secret, st.order.find(p => p !== first), { puff: 1 }, r), /holding/)
  for (const bad of [0, 4, '2', null]) assert.throws(() => B.act(st, secret, first, { puff: bad }, r), /Puff/)
  // below lo nothing can pop; a 3 banks 2 coins and passes to the next seat
  ;({ state: st, secret } = B.act(st, secret, first, { puff: 3 }, r))
  assert.equal(st.steam, 3); assert.equal(st.banked[first], 2); assert.notEqual(B.whose(st), first)
  // force the pop: exactly reaching the hidden number pops it
  secret = { pop: 10 }
  st = { ...st, steam: 7 }
  const holder = B.whose(st)
  ;({ state: st, secret } = B.act(st, secret, holder, { puff: 3 }, r))
  assert.deepEqual(st.out, [holder]); assert.equal(st.steam, 0, 'a fresh bun'); assert.equal(st.bun, 2)
  assert.equal(st.log.at(-1).pop, 10, 'the old pop number is revealed when it goes')
  assert.ok(st.order.includes(B.whose(st)) && B.whose(st) !== holder, 'the popped player is skipped')
  assert.ok(secret.pop >= cfg.lo && secret.pop <= cfg.hi)
  // risk from the public steam
  assert.equal(B.risk({ ...st, steam: 5 }, 3), 0)
  assert.equal(B.risk({ ...st, steam: 19 }, 1), 1)
  assert.equal(B.risk({ ...st, steam: 9 }, 1), 1 / 11)
  // play it out: the last one standing wins and places first
  let k = 0
  while (B.whose(st) && k++ < 200) ({ state: st, secret } = B.act(st, secret, B.whose(st), { puff: 1 }, r))
  assert.equal(B.alive(st).length, 1); assert.ok(st.done)
  const f = B.finish(st)
  assert.equal(f.scores[f.reveal.winner], 3)
  assert.equal(f.scores[st.out[0]], 0, 'first out places last')
})

test('hot bun through the rules: only the holder moves, timeouts puff 1, payout by survival plus brave coins', () => {
  let s = table('bun', ['a', 'b'])
  assert.equal(s.pub.mini.kind, 'turn')
  const who = R.turn(s), other = who === 'a' ? 'b' : 'a'
  assert.throws(() => R.move(s, other, { type: 'mini', puff: 1 }), /turn/)
  assert.ok(!JSON.stringify(R.view(s)).includes('"pop"'))
  assert.deepEqual(R.legal(R.view(s), who).map(m => m.puff), [1, 2, 3])
  assert.deepEqual(R.legal(R.view(s), other), [])
  s = R.move(s, who, { type: 'timeout' })
  assert.equal(s.pub.mini.state.steam, 1)
  let k = 0
  while (s.pub.phase === 'mini' && k++ < 100) s = R.move(s, R.turn(s), { type: 'mini', puff: 2 })
  const res = s.pub.miniResult
  assert.equal(res.id, 'bun')
  const winner = res.reveal.winner, loser = res.reveal.out[0]
  assert.equal(res.place[winner], 1); assert.equal(res.place[loser], 2)
  assert.equal(res.coins[winner], D.MINI_PRIZES[0] + (res.reveal.banked[winner] || 0))
  assert.ok(Object.values(res.reveal.banked).some(c => c > 0), 'puffing 2 banked coins')
})

test('hot bun: two players, every seat count, timeouts alone finish it', () => {
  for (const n of [2, 3, 5, 8]) {
    const players = Array.from({ length: n }, (_, i) => `p${i}`)
    let { pub: st, secret } = B.begin(players, rng(n), D.MINIGAMES.bun)
    const r = rng(n + 1)
    let k = 0
    while (B.whose(st) && k++ < 500) ({ state: st, secret } = B.act(st, secret, B.whose(st), B.timeoutMove(st), r))
    assert.ok(st.done, `${n} players`)
    assert.equal(st.out.length, n - 1)
    assert.equal(new Set(st.out).size, n - 1, 'nobody pops twice')
  }
})

test('firefly count: a blinking jar from the seed, the count stays secret, fireflies blink 1-3 times', () => {
  const cfg = D.MINIGAMES.count
  const { pub, secret } = F.begin(['a'], rng(4), cfg)
  assert.deepEqual(F.begin(['a'], rng(4), cfg).pub, pub)
  assert.ok(!JSON.stringify(pub).includes('target') && !('hint' in pub))
  assert.ok(pub.blinks.length >= secret.target && pub.blinks.length <= 3 * secret.target)
  for (const b of pub.blinks) {
    assert.ok(Number.isInteger(b.t) && b.t >= 0 && b.t + F.BLINK_MS <= cfg.showMs)
    assert.ok(b.x >= 10 && b.x <= 90 && b.y >= 18 && b.y <= 90)
  }
  assert.ok(pub.blinks.every((b, i) => !i || pub.blinks[i - 1].t <= b.t), 'in time order')
  // bots guess round half the blinks, inside the range
  for (const lv of ['easy', 'normal', 'hard']) for (let i = 0; i < 20; i++) {
    const g = F.bot(pub, 'a', lv, rng(i)).guess
    assert.ok(g >= cfg.lo && g <= cfg.hi)
    if (lv === 'hard') assert.ok(Math.abs(g - Math.round(pub.blinks.length / 2)) <= 2)
  }
  const f = F.finish(pub, secret, { a: secret.target, b: null })
  assert.equal(f.bonus.a, cfg.exact); assert.equal(f.scores.a, 0); assert.ok(f.scores.b < -100)
})

test('every minigame: bots finish it through the rules at every level and table size', () => {
  for (const id of Object.keys(MINIS)) for (const n of [2, 4, 8]) for (const lv of ['easy', 'normal', 'hard']) {
    const players = Array.from({ length: n }, (_, i) => `bot:${i}`)
    let s = table(id, players, n * 3), k = 0
    assert.equal(s.pub.mini.id, id)
    const rand = rng(n)
    while (s.pub.phase === 'mini' && k++ < 1000) { const w = R.turn(s); s = R.move(s, w, R.bot(R.view(s), w, lv, rand)) }
    assert.notEqual(s.pub.phase, 'mini', `${id} with ${n} ${lv} bots`)
    assert.equal(s.pub.miniResult.id, id)
    assert.equal(Object.keys(s.pub.miniResult.place).length, n)
  }
})

test('rotation: the engine picks from the available minigames, never twice running, and delay() paces it', () => {
  let s = R.setup(['a', 'b', 'c'], 1, { quick: true }), seen = [], k = 0
  while (!R.over(s) && k++ < 5000) {
    if (s.pub.phase === 'mini' && seen.at(-1)?.round !== s.pub.round) seen.push({ id: s.pub.mini.id, round: s.pub.round })
    s = R.move(s, R.turn(s), R.timeout(s), 0)
  }
  assert.equal(seen.length, 8)
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i].id, seen[i - 1].id)
  assert.ok(new Set(seen.map(x => x.id)).size >= 2)
  // a one-player table never gets Hot Bun (min 2) -- setup refuses one player, so check the filter directly
  assert.equal(D.MINIGAMES.bun.min, 2)
  // pacing: bots just after the start, people at the end of the play window, the board waits for the reveal
  const m = table('catch', ['a', 'bot:1'])
  const now = m.pub.mini.startAt - 3000
  assert.equal(R.turn(m), 'bot:1')
  assert.equal(R.delay(m, now), 3400)
  const human = R.move(m, 'bot:1', R.bot(R.view(m), 'bot:1', 'normal'), now)
  assert.equal(R.delay(human, now), 3000 + C.duration() + D.MINI_GRACE_MS)
  const after = R.move(human, 'a', { type: 'timeout' }, now + 1000)
  assert.equal(after.pub.phase, 'roll')
  assert.ok(R.delay(after, now + 1000) >= D.MINI_RESULTS_MS)
  assert.equal(R.delay(after, now + 1000 + D.MINI_RESULTS_MS + 1), undefined)
  const bun = table('bun', ['a', 'bot:1'])
  assert.ok(R.delay(bun, bun.pub.mini.startAt) >= 900)
})
