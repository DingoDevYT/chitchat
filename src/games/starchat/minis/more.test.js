// Three Lanterns, Last Lantern Standing and Pond Skippers: hidden picks stay secret until the reveal, ties and
// timeouts, out-of-turn secret picks through the rules, the pond's replay contract, and bots at every level and size.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../rules.js'
import * as D from '../data.js'
import { rng } from '../../rng.js'
import { MINIS } from './index.js'
import * as T from './lanterns.js'
import * as S from './standing.js'
import * as P from './pond.js'

const toMini = s => { let k = 0; while (s.pub.phase !== 'mini' && k++ < 400) s = R.move(s, R.turn(s), R.timeout(s), 1000); return s }
const table = (mini, players, seed = 5) => toMini(R.setup(players, seed, { mini }))
const pubJson = s => JSON.stringify(R.view(s))

test('registry: the three new minigames are listed with their numbers, Three Lanterns needs 3', () => {
  for (const id of ['lanterns', 'standing', 'pond']) {
    assert.ok(MINIS[id], id)
    assert.equal(MINIS[id].id, id)
    assert.ok(D.MINIGAMES[id]?.name, id)
  }
  assert.equal(D.MINIGAMES.lanterns.min, 3)
  assert.equal(MINIS.lanterns.kind, 'turn'); assert.equal(MINIS.standing.kind, 'turn'); assert.equal(MINIS.pond.kind, 'sim')
})

test('rotation: Three Lanterns never comes up at a two-player table, and does at three', () => {
  const seen = n => {
    const ids = new Set()
    for (let seed = 1; seed <= 6; seed++) {
      let s = R.setup(Array.from({ length: n }, (_, i) => `bot:${i}`), seed, { quick: true }), k = 0
      while (!R.over(s) && k++ < 6000) {
        if (s.pub.phase === 'mini') ids.add(s.pub.mini.id)
        s = R.move(s, R.turn(s), R.timeout(s), 0)
      }
    }
    return ids
  }
  assert.ok(!seen(2).has('lanterns'))
  assert.ok(seen(3).has('lanterns'))
})

test('three lanterns: the star and the picks stay secret until the reveal, then score find / fool', () => {
  let s = table('lanterns', ['a', 'b', 'c', 'd'])
  const st0 = s.pub.mini.state, hider = st0.hider
  const seekers = st0.order.filter(p => p !== hider)
  assert.equal(R.turn(s), hider)
  assert.throws(() => R.move(s, seekers[0], { type: 'mini', lantern: 0 }), /turn/, 'nobody picks before the star is hidden')
  assert.deepEqual(R.legal(R.view(s), seekers[0]), [])
  s = R.move(s, hider, { type: 'mini', lantern: 2, tease: 0 })
  const v = R.view(s).mini.state
  assert.equal(v.step, 'seek'); assert.equal(v.tease, 0, 'the point is public')
  assert.ok(!pubJson(s).includes('"at"'), 'where it is stays in the secret')
  assert.equal(s.secret.mini.secret.at, 2)
  // seekers pick in any order (out of turn), and their picks stay secret until the last one is in
  const [x, y, z] = seekers
  assert.notEqual(R.turn(s), z)
  s = R.move(s, z, { type: 'mini', lantern: 2 })
  assert.throws(() => R.move(s, z, { type: 'mini', lantern: 1 }), /turn/, 'one pick each')
  assert.throws(() => R.move(s, hider, { type: 'mini', lantern: 1 }), /turn/, 'the hider does not pick')
  s = R.move(s, x, { type: 'mini', lantern: 0 })
  const mid = R.view(s).mini.state
  assert.deepEqual(mid.picked.sort(), [x, z].sort())
  assert.ok(!pubJson(s).includes('"picks"') && mid.history.length === 0, 'no picks in public before the reveal')
  assert.throws(() => R.move(s, y, { type: 'mini', lantern: 7 }), /Pick lantern/)
  s = R.move(s, y, { type: 'mini', lantern: 1 })
  const after = R.view(s).mini.state, h = after.history[0]
  assert.equal(h.at, 2); assert.deepEqual(h.picks, { [z]: 2, [x]: 0, [y]: 1 })
  assert.deepEqual(h.found, [z]); assert.deepEqual(h.fooled.sort(), [x, y].sort())
  assert.equal(after.points[z], D.MINIGAMES.lanterns.find)
  assert.equal(after.points[hider], 2 * D.MINIGAMES.lanterns.fool)
  assert.equal(after.step, 'hide'); assert.notEqual(after.hider, hider, 'the next player hides')
  assert.equal(s.secret.mini.secret.at, null, 'the old spot is cleared')
})

test('three lanterns: timeouts (a random hide, a seeker who never picks), the fool cap, ties share a place', () => {
  const cfg = D.MINIGAMES.lanterns, players = ['a', 'b', 'c', 'd', 'e', 'f']
  let { pub: st, secret } = T.begin(players, rng(1), cfg)
  const r = rng(2)
  ;({ state: st, secret } = T.act(st, secret, st.hider, T.timeoutMove(st), r))
  assert.ok(secret.at >= 0 && secret.at < 3); assert.equal(st.tease, null)
  const at = secret.at, hider = st.hider
  const others = T.seekers(st)
  // one seeker times out, the other four all miss: the hider's take is capped
  ;({ state: st, secret } = T.act(st, secret, others[0], T.timeoutMove(st), r))
  for (const p of others.slice(1)) ({ state: st, secret } = T.act(st, secret, p, { lantern: (at + 1) % 3 }, r))
  const h = st.history[0]
  assert.equal(h.picks[others[0]], null); assert.ok(!h.found.includes(others[0]) && !h.fooled.includes(others[0]), 'no pick: neither found nor fooled')
  assert.equal(h.fooled.length, 4); assert.equal(st.points[hider], cfg.foolMax)
  // play out with timeouts only: every hider still hides, the game ends after min(players, rounds) rounds
  let k = 0
  while (T.whose(st) && k++ < 200) ({ state: st, secret } = T.act(st, secret, T.whose(st), T.timeoutMove(st), r))
  assert.ok(st.done); assert.equal(st.history.length, Math.min(players.length, cfg.rounds))
  assert.equal(new Set(st.history.map(x => x.hider)).size, st.history.length, 'a different hider each round')
  // ties: equal points place equal through the rules
  let s = table('lanterns', ['a', 'b', 'c'])
  while (s.pub.phase === 'mini') s = R.move(s, R.turn(s), { type: 'timeout' })
  const res = s.pub.miniResult
  assert.equal(res.id, 'lanterns')
  assert.deepEqual(Object.values(res.place), [1, 1, 1], 'nobody scored: everyone shares first')
})

test('three lanterns: bots read only the public history (hard trusts honest hiders, hides away from followers)', () => {
  const st = { ...T.begin(['bot:0', 'bot:1', 'bot:2'], rng(1), D.MINIGAMES.lanterns).pub }
  const honest = { ...st, hider: 'bot:0', picked: [], step: 'seek', tease: 1, history: [1, 2, 3].map(i => ({ hider: 'bot:0', at: 0, tease: 0, picks: { 'bot:1': 2 }, found: [], fooled: [] })) }
  for (let i = 0; i < 10; i++) assert.equal(T.bot(honest, 'bot:1', 'hard', rng(i)).lantern, 1)
  const liar = { ...honest, history: honest.history.map(h => ({ ...h, at: 2 })) }
  for (let i = 0; i < 10; i++) assert.notEqual(T.bot(liar, 'bot:1', 'hard', rng(i)).lantern, 1)
  const followers = { ...st, history: [{ hider: 'bot:1', at: 0, tease: 0, picks: { 'bot:0': 0, 'bot:2': 0 }, found: [], fooled: [] }] }
  for (let i = 0; i < 10; i++) { const m = T.bot(followers, st.hider, 'hard', rng(i)); assert.notEqual(m.lantern, m.tease) }
})

test('last lantern standing: the highest unique pick stands, duplicates blow out, all-blown rounds score nothing', () => {
  assert.deepEqual(S.standing({ a: 5, b: 5, c: 3, d: 4, e: 4 }), { value: 3, winner: 'c', out: [4, 5] })
  assert.equal(S.standing({ a: 2, b: 2 }).winner, null)
  assert.equal(S.standing({ a: null, b: 1 }).winner, 'b', 'a skipped pick never collides')
  assert.equal(S.standing({}).winner, null)
})

test('last lantern standing through the rules: picks secret until all are in, any order, timeouts light nothing, ties share', () => {
  let s = table('standing', ['a', 'b', 'bot:2'])
  assert.equal(R.turn(s), 'bot:2', 'the clock waits on bots first')
  s = R.move(s, 'b', { type: 'mini', pick: 5 }) // out of turn: fine, it's a secret pick
  assert.ok(!pubJson(s).includes('"picks"'))
  assert.deepEqual(R.view(s).mini.state.picked, ['b'])
  assert.throws(() => R.move(s, 'b', { type: 'mini', pick: 4 }), /turn/, 'one pick a round')
  assert.throws(() => R.move(s, 'a', { type: 'mini', pick: 6 }), /1 to 5/)
  assert.deepEqual(R.legal(R.view(s), 'a').map(m => m.pick), [1, 2, 3, 4, 5])
  assert.deepEqual(R.legal(R.view(s), 'b'), [])
  s = R.move(s, 'bot:2', { type: 'mini', pick: 5 })
  s = R.move(s, 'a', { type: 'mini', pick: 2 })
  let st = R.view(s).mini.state
  assert.deepEqual(st.history[0], { round: 1, picks: { b: 5, 'bot:2': 5, a: 2 }, winner: 'a', value: 2, out: [5] })
  assert.equal(st.points.a, 2); assert.equal(st.round, 2)
  // a timeout lights nothing; it doesn't blow anyone else out
  s = R.move(s, 'bot:2', { type: 'mini', pick: 4 })
  s = R.move(s, 'a', { type: 'mini', pick: 4 })
  assert.equal(R.turn(s), 'b')
  s = R.move(s, 'b', { type: 'timeout' })
  st = R.view(s).mini.state
  assert.equal(st.history[1].winner, null); assert.equal(st.history[1].picks.b, null)
  // finish with timeouts: 'a' keeps the lead and wins; b and bot:2 tie on 0 and share second
  while (s.pub.phase === 'mini') s = R.move(s, R.turn(s), { type: 'timeout' })
  const res = s.pub.miniResult
  assert.equal(res.place.a, 1); assert.equal(res.place.b, 2); assert.equal(res.place['bot:2'], 2)
  assert.equal(res.reveal.history.length, D.MINIGAMES.standing.rounds)
})

test('pond: the pond and every throw are deterministic integers, aim and power matter', () => {
  assert.deepEqual(P.makePond(9), P.makePond(9))
  const pond = P.makePond(9)
  for (const a of [-90, -20, 0, 35, 70]) for (const p of [10, 55, 100]) {
    const t = P.fling(pond, 30, a, p)
    assert.deepEqual(t, P.fling(pond, 30, a, p))
    for (const h of t.hops) assert.ok(Number.isInteger(h.x) && Number.isInteger(h.y) && Number.isInteger(h.t))
    assert.ok(Number.isInteger(t.score) && t.score >= 0)
    assert.ok(['bank', 'rock', 'reeds', 'sink'].includes(t.end))
  }
  const hard = P.fling({ pads: [], rocks: [] }, 0, 0, 100), soft = P.fling({ pads: [], rocks: [] }, 0, 0, 10)
  assert.ok(hard.dist > soft.dist && hard.skips > soft.skips, 'more power, more skips')
  assert.equal(P.fling({ pads: [], rocks: [] }, 0, 90, 100).end, 'reeds', 'aimed hard sideways it ends in the reeds')
  // a lily pad right where the first hop lands bounces it on (and counts)
  const first = hard.hops[0]
  const padded = P.fling({ pads: [{ y: first.y, bx: first.x, span: 1, sp: 0, ph: 0 }], rocks: [] }, 0, 0, 100)
  assert.equal(padded.pads, 1); assert.ok(padded.score > hard.score)
  const rocked = P.fling({ pads: [], rocks: [{ x: first.x, y: first.y }] }, 0, 0, 100)
  assert.equal(rocked.end, 'rock'); assert.equal(rocked.hops.length, 1)
})

test('pond: the referee keeps the replayed score, a forged one is corrected, bad logs and future throws are refused', () => {
  const s = table('pond', ['a', 'b'])
  assert.equal(s.pub.mini.kind, 'sim')
  const seed = s.pub.mini.state.seed, log = [[40, 0, 80], [120, -10, 70], [300, 12, 95]]
  const real = P.replay(seed, log).score
  const after = s.pub.mini.startAt + P.duration() + 10
  const one = R.move(s, 'a', { type: 'mini', log, score: real }, after)
  assert.ok(!JSON.stringify(one.pub).includes('"runs"'), 'scores stay secret until everyone has posted')
  const done = R.move(one, 'b', { type: 'mini', log, score: 99999 }, after)
  const runs = done.pub.miniResult.reveal.runs
  assert.equal(runs.a.score, real); assert.ok(!runs.a.fixed)
  assert.equal(runs.b.score, real, 'the forged score became the replayed one'); assert.ok(runs.b.fixed)
  assert.equal(done.pub.miniResult.place.b, 1)
  for (const bad of [null, 'x', [[1, 0]], [[10, 0, 50], [20, 0, 50]], [[5, 91, 50]], [[5, 0, 9]], [[5, 0, 101]], [[600, 0, 50]], [[5.5, 0, 50]], [[1, 0, 50], [40, 0, 50], [80, 0, 50], [120, 0, 50]]])
    assert.throws(() => R.move(s, 'a', { type: 'mini', log: bad, score: 0 }, after), /make sense/)
  // a throw stamped well ahead of the referee's clock
  assert.throws(() => R.move(s, 'a', { type: 'mini', log: [[500, 0, 50]], score: 0 }, s.pub.mini.startAt + 1000), /thrown yet/)
  // posting early is fine once your stones are out; no stones at all scores zero
  const early = R.move(s, 'a', { type: 'mini', log: [[10, 0, 50]], score: 0 }, s.pub.mini.startAt + 2000)
  assert.ok(early.pub.mini.posted.a)
  assert.equal(P.submit(s.pub.mini.state, 'a', { log: [], score: 0 }).score, 0)
})

test('pond: bot throws follow from (seed, seat, level), replay to their claimed score, and levels differ', () => {
  const tot = { easy: 0, normal: 0, hard: 0 }
  for (let seed = 0; seed < 12; seed++) for (const lv of Object.keys(tot)) {
    const a = P.botLog(seed * 977, 3, lv)
    assert.deepEqual(a, P.botLog(seed * 977, 3, lv))
    assert.ok(P.validLog(a.log), JSON.stringify(a.log))
    assert.equal(P.replay(seed * 977, a.log).score, a.score)
    tot[lv] += a.score
  }
  assert.ok(tot.hard > tot.easy && tot.normal > tot.easy, JSON.stringify(tot))
  const st = { seed: 77, players: ['bot:0', 'bot:1'] }
  const m = P.bot(st, 'bot:1', 'hard', Math.random)
  assert.deepEqual(m, P.bot(st, 'bot:1', 'hard', () => 0.5), 'rand is ignored: every client draws the same ghost')
  assert.ok(!P.submit(st, 'bot:1', m, { bot: true }).fixed)
})

test('new minigames: bots finish them through the rules at every level with 2, 4 and 8 players (respecting min)', () => {
  for (const id of ['lanterns', 'standing', 'pond']) for (const n of [2, 4, 8]) {
    if (n < D.MINIGAMES[id].min) continue
    for (const lv of ['easy', 'normal', 'hard']) {
      const players = Array.from({ length: n }, (_, i) => `bot:${i}`)
      let s = table(id, players, n * 7), k = 0
      const rand = rng(n + 1)
      while (s.pub.phase === 'mini' && k++ < 2000) { const w = R.turn(s); s = R.move(s, w, R.bot(R.view(s), w, lv, rand)) }
      assert.notEqual(s.pub.phase, 'mini', `${id} with ${n} ${lv} bots`)
      assert.equal(s.pub.miniResult.id, id)
      assert.equal(Object.keys(s.pub.miniResult.place).length, n)
    }
  }
  // with people at the table too, bots go first and the people can still pick out of turn
  let s = table('standing', ['a', 'bot:1', 'b', 'bot:3'])
  assert.equal(R.turn(s), 'bot:1')
  assert.ok(R.delay(s, s.pub.mini.startAt) >= 900)
  s = R.move(s, 'a', R.bot(R.view(s), 'a', 'hard', rng(1)) ?? { type: 'mini', pick: 3 })
  assert.equal(R.turn(s), 'bot:1')
})
