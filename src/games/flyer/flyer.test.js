import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BOT, TOP, START, CHUNK, MAX_TICKS, TICK_MS, PX, LANES, VEHICLE_TICKS, STEAM_CHARGE, CRANE_TRACK, CRANE_LOCK,
  chunkOf, course, makeWorld, metres, newRun, recorder, replay, sin, cos, speed, step,
} from './course.js'
import { botRun, search } from './pilot.js'
import * as R from './rules.js'

// A hand-made tunnel for physics tests: everything empty unless given.
const fake = (extra = {}, opts = {}) => {
  const c = { k: 0, x0: START, x1: START + CHUNK, yarns: [], spr: [], parcels: [], events: [], ...extra }
  const empty = k => ({ k, x0: START + k * CHUNK, x1: START + (k + 1) * CHUNK, yarns: [], spr: [], parcels: [], events: [] })
  return { seed: 0, opts: { whistle: false, strict: false, ...opts }, chunk: k => (k === 0 ? c : empty(k)) }
}
const fly = (st, w, n, held) => { for (let i = 0; i < n; i++) step(st, w, typeof held === 'function' ? held(i) : held); return st }

test('sin and cos match Math to 1e-6 everywhere', () => {
  for (let x = -40; x < 40; x += 0.0137) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-6, `sin ${x}`)
    assert.ok(Math.abs(cos(x) - Math.cos(x)) < 1e-6, `cos ${x}`)
  }
})

test('course: the same seed and chunk always build the same tunnel', () => {
  for (const seed of [1, 99, 123456789]) for (const k of [0, 3, 17]) {
    const a = course(seed, k), b = course(seed, k)
    assert.deepEqual(a, b)
    assert.deepEqual(makeWorld(seed).chunk(k), a)
    for (const list of [a.yarns, a.spr, a.parcels, a.events]) for (let i = 1; i < list.length; i++) assert.ok(list[i].x >= list[i - 1].x)
    for (const y of a.yarns) assert.ok(y.x > a.x0 && y.x < a.x1)
  }
  assert.notDeepEqual(course(1, 2), course(2, 2))
  assert.equal(course(1, -1).yarns.length, 0)
  assert.equal(chunkOf(START - 1), -1)
  assert.equal(chunkOf(START + CHUNK), 1)
})

test('course: harder further in (more spinning yarn, cranes and steam), with a parcel per chunk', () => {
  const count = (ks, f) => ks.reduce((n, k) => n + [1, 2, 3, 4, 5].reduce((m, seed) => m + f(course(seed, k)), 0), 0)
  const early = [0, 1], late = [12, 13]
  const spin = c => c.yarns.filter(y => y.w).length, timed = c => c.events.length
  assert.ok(count(late, spin) > count(early, spin) * 1.5)
  assert.ok(count(late, timed) > count(early, timed))
  for (let k = 0; k < 10; k++) assert.equal(course(7, k).parcels.length, 1)
  assert.equal(course(7, 3, { noParcels: true }).parcels.length, 0)
  for (let k = 0; k < 20; k++) for (const e of course(3, k).events) if (e.type === 'steam') {
    assert.ok(e.lanes.length >= 1 && e.lanes.length <= 3) // at least two lanes always stay clear
    assert.ok(e.lanes.every(y => LANES.includes(y)))
  }
})

test('feel: genre physics (thrust, gravity, inertia, speed curve)', () => {
  const w = fake()
  assert.equal(speed(0), 520)
  assert.ok(Math.abs(speed(2500 * 50) - 1150) < 1e-9)
  assert.equal(speed(9e9), 1150)
  // Holding from the floor reaches the ceiling in well under a second, at the speed cap.
  const st = newRun()
  let t = 0
  while (st.y > TOP && t < 120) { step(st, w, true); t++ }
  assert.ok(t > 20 && t < 50, `climb took ${t} ticks`)
  assert.ok(st.vy >= -900)
  // A quick tap is a small hop; a longer hold a much bigger one.
  const hop = n => { const s = newRun(); let peak = BOT; for (let i = 0; i < 90; i++) { step(s, w, i < n); peak = Math.min(peak, s.y) } return BOT - peak }
  assert.ok(hop(4) > 3 && hop(4) < 40, `tap hop ${hop(4)}`)
  assert.ok(hop(15) > hop(4) * 3, `${hop(15)} vs ${hop(4)}`)
  // Released, you fall back to the floor and run along it.
  fly(st, w, 90, false)
  assert.equal(st.y, BOT)
  assert.equal(st.vy, 0)
  assert.ok(st.alive)
})

test('vehicles: Trotter hops, Brolly floats, Flip-Tub flips; a hit pops the vehicle; Second Brew saves once', () => {
  const at = (kind, x = 40) => fake({ parcels: [{ x: START + x, y: BOT, kind }] })
  const start = w => { const s = newRun(); s.d = START; return fly(s, w, 3, false) }
  // Trotter: on the floor, a tap is a high hop and holding doesn't fly.
  let w = at('trotter'), s = start(w)
  assert.equal(s.veh, 'trotter')
  fly(s, w, 30, true)
  const peakHold = s.y
  assert.ok(peakHold < BOT - 100, 'the first press hops')
  fly(s, w, 60, true)
  assert.equal(s.y, BOT, 'holding does not keep it up')
  // Brolly: falls slowly.
  w = at('brolly'); s = start(w); fly(s, w, 40, true)
  const y0 = s.y; fly(s, w, 30, false)
  assert.ok(s.vy <= 300 && s.y - y0 < 160)
  // Flip-Tub: tap flips gravity to the ceiling and back.
  w = at('flip'); s = start(w)
  fly(s, w, 2, true); fly(s, w, 40, false)
  assert.equal(s.y, TOP)
  fly(s, w, 2, true); fly(s, w, 40, false)
  assert.equal(s.y, BOT)
  // Expires after 12 s.
  fly(s, w, VEHICLE_TICKS, false)
  assert.equal(s.veh, null)
  // A yarn hit pops the vehicle with a second of grace; the next hit bonks.
  const yarn = { x: START + 400, y: 360, len: 600, a0: Math.PI / 2, w: 0 }
  w = fake({ parcels: [{ x: START + 40, y: BOT, kind: 'brolly' }], yarns: [yarn, { ...yarn, x: START + 1400 }] })
  s = start(w); fly(s, w, 40, false)
  assert.ok(s.alive && s.pops === 1 && !s.veh)
  fly(s, w, 120, false)
  assert.ok(!s.alive && s.cause === 'yarn')
  // The Trotter stomps straight through yarn on the ground.
  w = fake({ parcels: [{ x: START + 40, y: BOT, kind: 'trotter' }], yarns: [{ x: START + 400, y: BOT, len: 100, a0: 0, w: 0 }] })
  s = start(w); fly(s, w, 60, false)
  assert.ok(s.alive && s.veh === 'trotter' && s.pops === 0)
  // Second Brew: poured back once.
  w = fake({ parcels: [{ x: START + 40, y: BOT, kind: 'brew' }], yarns: [yarn, { ...yarn, x: START + 1400 }] })
  s = start(w); fly(s, w, 40, false)
  assert.ok(s.alive && s.brews === 1 && !s.brew)
  fly(s, w, 120, false)
  assert.ok(!s.alive)
})

test('cranes track your height, lock, then fly in; steam charges for 1.5 s before it bites', () => {
  let w = fake({ events: [{ x: START + 10, type: 'crane', n: 1 }] })
  let s = newRun(); s.d = START; s.y = 300
  fly(s, w, 2, false)
  assert.equal(s.cr.length, 1)
  fly(s, w, CRANE_TRACK, () => s.y > 200)
  const lockY = s.cr[0].y
  fly(s, w, CRANE_LOCK, false) // you move away during the lock; the crane stays put
  assert.ok(Math.abs(s.cr[0].y - lockY) < 30)
  assert.ok(s.cr[0].sx > PX)
  fly(s, w, 120, false)
  assert.ok(s.alive, 'dodged by moving after the lock')
  // Sitting still in its path is a bonk.
  w = fake({ events: [{ x: START + 10, type: 'crane', n: 1 }] })
  s = newRun(); s.d = START; s.y = BOT
  fly(s, w, 200, false)
  assert.equal(s.cause, 'crane')
  // Steam: safe while charging, a bonk once it fires.
  w = fake({ events: [{ x: START + 10, type: 'steam', lanes: [LANES[4]] }] })
  s = newRun(); s.d = START
  fly(s, w, STEAM_CHARGE - 2, false)
  assert.ok(s.alive)
  fly(s, w, 5, false)
  assert.equal(s.cause, 'steam')
})

test('sprinkles and Kettle Whistle', () => {
  const w = fake({ spr: [{ x: START + 100, y: BOT }, { x: START + 136, y: BOT }, { x: START + 136, y: TOP }] })
  const s = newRun(); s.d = START
  fly(s, w, 30, false)
  assert.equal(s.spr, 2)
  // The whistle only works with the house rule, then needs its cooldown.
  const yarn = { x: START + 300, y: 360, len: 600, a0: Math.PI / 2, w: 0 }
  const off = fake({ yarns: [yarn] }), on = fake({ yarns: [yarn] }, { whistle: true })
  const a = newRun(); a.d = START; step(a, off, false, true); fly(a, off, 60, false)
  assert.ok(!a.alive)
  const b = newRun(); b.d = START; fly(b, on, 20, false); step(b, on, false, true); fly(b, on, 20, false)
  assert.ok(b.alive && b.whistles === 1)
  step(b, on, false, true)
  assert.equal(b.whistles, 1, 'cooldown')
})

// The heart of it: every chunk the generator makes can be flown without touching anything, from the floor, the
// middle or the ceiling at its start. search() returns a path only after simulating it, so a found path is a proof.
test('every generated chunk is survivable (search proves a clean path)', () => {
  for (const seed of [1, 2, 3, 4, 2024]) {
    const world = makeWorld(seed, { noParcels: true, strict: true })
    for (let k = 0; k < 14; k++) for (const y of [TOP, (TOP + BOT) / 2, BOT]) {
      const st = newRun()
      Object.assign(st, { d: START + k * CHUNK, y, ek: k, ei: 0, strict: true })
      const ticks = Math.ceil(CHUNK / speed(st.d) * 60) + 30
      const r = search(world, st, ticks, { maxNodes: 300000 })
      assert.ok(r.ok, `seed ${seed} chunk ${k} from y=${y}: got ${r.path.length * 5}/${ticks} ticks`)
      // And the path really is clean when replayed tick by tick.
      const s = newRun(); Object.assign(s, { d: START + k * CHUNK, y, ek: k, ei: 0, strict: true })
      r.path.forEach(h => fly(s, world, 5, h))
      assert.ok(s.alive && s.d > START + (k + 1) * CHUNK)
    }
  }
})

test('replay: a recorded run replays exactly, and stops early when asked', () => {
  const world = makeWorld(42), st = newRun(), rec = recorder()
  let i = 0
  while (st.alive && i++ < 4000) { const h = (st.n % 37) < 17 && st.y > 300; rec.input(st, h, false); step(st, world, h) }
  const back = replay(42, rec.log)
  assert.equal(back.n, st.n)
  assert.equal(back.d, st.d)
  assert.equal(back.spr, st.spr)
  assert.equal(back.alive, st.alive)
  const part = replay(42, rec.log, {}, 100)
  assert.equal(part.n, 100)
})

test('Chitbots: deterministic, cheap, and better at harder levels', () => {
  const a = botRun(5, 1, 'normal'), b = botRun(5, 1, 'normal')
  assert.equal(a.st.n, b.st.n)
  assert.deepEqual(a.log, b.log)
  assert.equal(replay(5, a.log).n, a.st.n, 'the referee replays a bot to the same tick')
  const med = level => {
    const d = []
    for (let seed = 1; seed <= 6; seed++) for (const seat of [1, 2]) d.push(metres(botRun(seed * 31, seat, level).st))
    return d.sort((x, y) => x - y)[d.length >> 1]
  }
  const t = Date.now(), easy = med('easy'), normal = med('normal'), hard = med('hard')
  assert.ok(easy < normal && normal < hard, `${easy} < ${normal} < ${hard}`)
  assert.ok(Date.now() - t < 6000, 'thirty-six bot runs in a few seconds')
})

test('referee: setup, bots land at the start, people any time, replay keeps the score honest', () => {
  const now = 1_000_000
  let s = R.setup(['me', 'bot:1', 'you'], 77, { now, whistle: true })
  assert.equal(s.pub.startAt, now + R.LEAD_MS)
  assert.equal(R.turn(s), 'bot:1')
  assert.equal(R.delay(s, now), R.LEAD_MS + 400)
  s = R.move(s, 'bot:1', R.bot(R.view(s), 'bot:1', 'hard'), now)
  assert.ok(s.pub.results['bot:1'].m > 0)
  assert.equal(R.turn(s), 'me')
  assert.ok(R.delay(s, now) > MAX_TICKS * TICK_MS)
  // Your own run, any time (not just on your turn); a forged distance is replaced by the replay.
  const world = makeWorld(77, { whistle: true }), st = newRun(), rec = recorder()
  while (st.alive && st.n < 3000) { const h = st.y > 330; rec.input(st, h, false); step(st, world, h) }
  const late = now + R.LEAD_MS + st.n * TICK_MS + 50
  assert.throws(() => R.move(s, 'you', { type: 'run', ticks: st.n, m: 99999, spr: 0, log: rec.log }, now - 30000), /longer than the time/)
  assert.throws(() => R.move(s, 'you', { type: 'run', ticks: st.n, log: { t: [5, 3] } }, late), /log/)
  assert.throws(() => R.move(s, 'you', R.timeout(s), late), /turn/)
  s = R.move(s, 'you', { type: 'run', ticks: st.n, m: 99999, spr: 0, log: rec.log, talk: 250 }, late)
  const mine = s.pub.results.you
  assert.equal(mine.m, metres(st))
  assert.equal(mine.spr, st.spr)
  assert.ok(mine.fixed)
  assert.equal(mine.talk, 100)
  assert.throws(() => R.move(s, 'you', { type: 'run', ticks: 1, log: { t: [] } }, late), /already landed/)
  assert.equal(R.over(s), null)
  // The last person vanished: the timeout lands them on 0 m and the round ends.
  s = R.move(s, 'me', R.timeout(s), late)
  assert.equal(s.pub.results.me.m, 0)
  assert.ok(R.over(s).length >= 1)
  assert.equal(s.pub.winner, R.ranking(s.pub)[0])
  assert.throws(() => R.move(s, 'me', R.timeout(s)), /over/)
})

test('referee: farthest wins, ties go to sprinkles, a dead heat shares the win', () => {
  const pub = { players: ['a', 'b', 'c'], results: { a: { m: 10, spr: 1 }, b: { m: 10, spr: 3 }, c: { m: 4, spr: 9 } } }
  assert.deepEqual(R.ranking(pub), ['b', 'a', 'c'])
  assert.deepEqual(R.over({ pub }), ['b'])
  pub.results.a.spr = 3
  assert.deepEqual(R.over({ pub }), ['a', 'b'])
})
