// Lantern Lift, Teacup Tap and Owl Says: replay equals the live sim, the referee corrects a forged score and refuses
// bad logs, bots are deterministic and get better by level, and bots finish each through the rules at every table size.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../rules.js'
import * as D from '../data.js'
import { rng } from '../../rng.js'
import * as Lf from './lift.js'
import * as T from './tap.js'
import * as O from './owl.js'

const toMini = s => { let k = 0; while (s.pub.phase !== 'mini' && k++ < 400) s = R.move(s, R.turn(s), R.timeout(s), 1000); return s }
const table = (mini, players = ['a', 'b'], seed = 5) => toMini(R.setup(players, seed, { mini }))

// The live runs, recorded the way each view records them.
function liveLift(seed, holds) {
  const lans = Lf.makeLanterns(seed), st = Lf.newRun(), log = []
  const want = t => { const k = Math.floor(t / Lf.SEG), s = t - k * Lf.SEG; return s >= 30 && s < 30 + holds[k] ? 1 : 0 }
  while (st.n < Lf.TICKS) {
    const d = want(st.n)
    if (d !== st.down) { st.down = d; log.push([st.n, d]) }
    Lf.step(st, lans)
  }
  return { st, log }
}
function liveTap(seed, off) {
  const chart = T.makeChart(seed), st = T.newRun(), log = []
  chart.forEach((c, i) => { const t = c + ((i * 7) % (2 * off + 1)) - off; if (t > st.last) { T.tap(st, chart, t); log.push(t) } })
  log.push(T.TICKS - 1); T.tap(st, chart, T.TICKS - 1) // one stray at the very end
  return { st: T.settle(st, chart), log }
}
function liveOwl(seed) {
  const sched = O.makeCalls(seed), st = O.newRun(), log = []
  for (let t = 0; t < O.TICKS; t++) {
    O.settle(st, sched, t) // the view settles every frame
    const c = sched.calls.find(x => x.t + 20 === t)
    if (c && c.says) { O.tap(st, sched, t, c.btn); log.push([t, c.btn]) }
    if (c && !c.says && c.t % 2) { O.tap(st, sched, t, 0); log.push([t, 0]) } // fooled by some
    if (t === 30) { O.tap(st, sched, t, 1); log.push([t, 1]) } // a false start before the first call
  }
  return { st: O.settle(st, sched), log }
}

test('lantern lift: lanterns from the seed, integer heights, a longer hold flies higher, too long bursts', () => {
  assert.deepEqual(Lf.makeLanterns(9), Lf.makeLanterns(9))
  for (const l of Lf.makeLanterns(9)) assert.ok(Number.isInteger(l.gold) && l.gold >= 380 && l.gold < 780 && l.puff >= 3 && l.puff <= 5)
  const lan = { gold: 600, puff: 4 }
  let prev = -1
  for (let h = 30; h < 90; h += 10) { const r = Lf.apexFor(lan, h); if (r.burst) break; assert.ok(r.y > prev); prev = r.y }
  assert.equal(Lf.apexFor(lan, 180).burst, 1)
  const best = Lf.bestHold(lan), r = Lf.apexFor(lan, best)
  assert.ok(!r.burst && Math.abs(r.y - 600) <= Lf.BAND && r.p >= 60)
  assert.equal(Lf.points(600, 600, false), 100); assert.equal(Lf.points(640, 600, true), 0)
  assert.ok(Lf.points(200, 600, false) < 50)
})

test('lantern lift: replaying a log equals the live sim, a forged score is corrected, bad logs are refused', () => {
  for (const seed of [1, 7, 99, 123456]) {
    const { st, log } = liveLift(seed, [70, 60, 90])
    const re = Lf.replay(seed, log)
    assert.equal(re.score, st.score); assert.deepEqual(re.res, st.res)
    assert.equal(st.res.length, 3)
  }
  assert.equal(Lf.replay(3, []).score, 0, 'never pressed: nothing')
  let s = table('lift')
  assert.equal(s.pub.mini.kind, 'sim')
  const { st, log } = liveLift(s.pub.mini.state.seed, [75, 75, 75]), after = s.pub.mini.startAt + Lf.duration() + 10
  assert.throws(() => R.move(s, 'a', { type: 'mini', log, score: st.score }, s.pub.mini.startAt + 1000), /still up/)
  for (const bad of [null, 'x', [[5, 1], [5, 0]], [[3, 2]], [[-1, 1]], [[Lf.TICKS, 1]], [[1.5, 1]]]) assert.throws(() => R.move(s, 'a', { type: 'mini', log: bad, score: 0 }, after), /make sense/)
  s = R.move(s, 'a', { type: 'mini', log, score: st.score }, after)
  s = R.move(s, 'b', { type: 'mini', log, score: 300 }, after)
  const runs = s.pub.miniResult.reveal.runs
  assert.equal(runs.a.score, st.score); assert.ok(!runs.a.fixed)
  assert.equal(runs.b.score, st.score, 'the forged 300 became the replayed score'); assert.ok(runs.b.fixed)
})

test('teacup tap: a seeded chart, timing windows, spills, replay equals live, forged scores corrected', () => {
  const c = T.makeChart(4)
  assert.deepEqual(T.makeChart(4), c)
  assert.ok(c.length >= 15 && c.every((t, i) => Number.isInteger(t) && t < T.TICKS && (!i || t - c[i - 1] > 2 * T.GOOD)))
  // windows: on the beat, close, off
  const one = t => { const st = T.newRun(); T.tap(st, [100], t); return st }
  assert.equal(one(102).perfect, 1); assert.equal(one(98).score, 3)
  assert.equal(one(105).good, 1); assert.equal(one(94).score, 2)
  assert.equal(one(107).spill, 1); assert.equal(one(107).score, 0, 'never below 0')
  const st2 = T.newRun(); T.tap(st2, [100, 140], 100); T.tap(st2, [100, 140], 101)
  assert.equal(st2.spill, 1, 'a cup only pours once'); assert.equal(st2.score, 2)
  for (const seed of [2, 11, 4242]) {
    const { st, log } = liveTap(seed, 5)
    const re = T.replay(seed, log)
    assert.equal(re.score, st.score); assert.deepEqual([re.perfect, re.good, re.spill, re.miss], [st.perfect, st.good, st.spill, st.miss])
    assert.equal(st.perfect + st.good + st.miss, T.makeChart(seed).length)
  }
  let s = table('tap')
  const seed = s.pub.mini.state.seed, { st, log } = liveTap(seed, 3), after = s.pub.mini.startAt + T.duration() + 10
  assert.throws(() => R.move(s, 'a', { type: 'mini', log, score: st.score }, s.pub.mini.startAt), /still playing/)
  for (const bad of [null, [5, 5], [-1], [T.TICKS], [2.5], [[1, 2]]]) assert.throws(() => R.move(s, 'a', { type: 'mini', log: bad, score: 0 }, after), /make sense/)
  s = R.move(s, 'a', { type: 'mini', log, score: st.score }, after)
  s = R.move(s, 'b', { type: 'mini', log: T.makeChart(seed), score: 1 }, after)
  const runs = s.pub.miniResult.reveal.runs
  assert.equal(runs.a.score, st.score); assert.ok(!runs.a.fixed)
  assert.equal(runs.b.score, 3 * T.makeChart(seed).length, 'perfect taps score full even when the client undersold them'); assert.ok(runs.b.fixed)
  // mashing every tick is worse than not playing at all
  assert.equal(T.replay(seed, Array.from({ length: 590 }, (_, i) => i * 2)).score < 3 * T.makeChart(seed).length / 2, true)
})

test('owl says: a seeded schedule, right / wrong / fooled / false start, replay equals live, forged scores corrected', () => {
  const sc = O.makeCalls(8)
  assert.deepEqual(O.makeCalls(8), sc)
  assert.deepEqual([...sc.colours].sort(), [...O.COLOURS].sort())
  assert.ok(sc.calls.length >= 10 && sc.calls.some(c => !c.says) && sc.calls.every(c => c.t + O.WINDOW < O.TICKS))
  for (let i = 1; i < sc.calls.length; i++) assert.ok(sc.calls[i].t >= sc.calls[i - 1].t + O.WINDOW)
  const says = sc.calls.find(c => c.says), not = sc.calls.find(c => !c.says)
  const run = taps => { const st = O.newRun(); for (const [t, b] of taps) O.tap(st, sc, t, b); return O.settle(st, sc, says.t + O.WINDOW) }
  assert.equal(run([[says.t, says.btn]]).score, O.PTS.right + O.PTS.speed, 'instant and right: 20')
  assert.equal(run([[says.t + 45, says.btn]]).score, O.PTS.right + 5)
  assert.equal(run([[says.t, (says.btn + 1) % 4]]).wrong, 1)
  assert.equal(run([[says.t - 5, says.btn]]).early, 1, 'before the call is a false start')
  assert.equal(run([[says.t, says.btn], [says.t + 1, says.btn]]).early, 1, 'only the first tap counts')
  const fooled = O.newRun(); O.tap(fooled, sc, not.t + 10, not.btn); assert.equal(fooled.fooled, 1)
  const calm = O.settle(O.newRun(), sc); assert.equal(calm.resist, sc.calls.filter(c => !c.says).length); assert.equal(calm.score, calm.resist * O.PTS.resist)
  for (const seed of [3, 17, 909]) {
    const { st, log } = liveOwl(seed)
    const re = O.replay(seed, log)
    assert.equal(re.score, st.score); assert.deepEqual([re.right, re.wrong, re.fooled, re.early, re.resist], [st.right, st.wrong, st.fooled, st.early, st.resist])
    assert.ok(st.early >= 1 && st.right > 5)
  }
  let s = table('owl')
  const seed = s.pub.mini.state.seed, { st, log } = liveOwl(seed), after = s.pub.mini.startAt + O.duration() + 10
  assert.throws(() => R.move(s, 'a', { type: 'mini', log, score: st.score }, s.pub.mini.startAt), /still calling/)
  for (const bad of [null, [[5, 4]], [[5, 1], [5, 2]], [[O.TICKS, 0]], [[3, -1]], [7]]) assert.throws(() => R.move(s, 'a', { type: 'mini', log: bad, score: 0 }, after), /make sense/)
  s = R.move(s, 'a', { type: 'mini', log, score: st.score }, after)
  s = R.move(s, 'b', { type: 'mini', log, score: 999 }, after)
  const runs = s.pub.miniResult.reveal.runs
  assert.equal(runs.a.score, st.score); assert.ok(!runs.a.fixed)
  assert.equal(runs.b.score, st.score, 'the forged 999 became the replayed score'); assert.ok(runs.b.fixed)
})

test('lift, tap, owl: bot runs follow from (seed, seat, level), replay to their claim, and hard beats easy', () => {
  for (const M of [Lf, T, O]) {
    const tot = { easy: 0, normal: 0, hard: 0 }
    for (let seed = 0; seed < 12; seed++) for (const lv of Object.keys(tot)) {
      const a = M.botLog(seed * 977, 2, lv), b = M.botLog(seed * 977, 2, lv)
      assert.deepEqual(a.log, b.log)
      assert.ok(M.validLog(a.log), `${M.id} ${lv} log`)
      assert.equal(M.replay(seed * 977, a.log).score, a.st.score)
      tot[lv] += a.st.score
    }
    assert.ok(tot.hard > tot.normal && tot.normal > tot.easy, `${M.id} ${JSON.stringify(tot)}`)
    const st = { seed: 77, players: ['bot:0', 'bot:1'] }
    const m = M.bot(st, 'bot:1', 'hard', Math.random)
    assert.deepEqual(m, M.bot(st, 'bot:1', 'hard', () => 0.5), 'rand is ignored: every client draws the same ghost')
    assert.ok(!M.submit(st, 'bot:1', m, { bot: true }).fixed)
  }
})

test('lift, tap, owl: bots finish through the rules at every level with 2, 4 and 8 players', () => {
  for (const id of ['lift', 'tap', 'owl']) for (const n of [2, 4, 8]) for (const lv of ['easy', 'normal', 'hard']) {
    assert.ok(D.MINIGAMES[id].name)
    let s = table(id, Array.from({ length: n }, (_, i) => `bot:${i}`), n * 5), k = 0
    assert.equal(s.pub.mini.id, id)
    const rand = rng(n)
    while (s.pub.phase === 'mini' && k++ < 100) { const w = R.turn(s); s = R.move(s, w, R.bot(R.view(s), w, lv, rand)) }
    assert.notEqual(s.pub.phase, 'mini', `${id} with ${n} ${lv} bots`)
    assert.equal(Object.keys(s.pub.miniResult.place).length, n)
    for (const r of Object.values(s.pub.miniResult.reveal.runs)) assert.ok(r && !r.fixed && Number.isInteger(r.score) && r.score >= 0)
  }
})
