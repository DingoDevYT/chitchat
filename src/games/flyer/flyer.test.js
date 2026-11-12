import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BOT, TOP, MIDY, START, CHUNK, MAX_TICKS, TICK_MS, PX, LANES, VEHICLE_TICKS, STEAM_CHARGE, CRANE_TRACK, CRANE_LOCK,
  LOOM_CHARGE, LOOM_FIRE, SPIN_TICKS, BUBBLE_TICKS, REVIVE_GRACE, CEIL, FLOOR, VEHICLES, MISSIONS,
  bubbleAt, chunkOf, course, makeWorld, metres, missionMask, newRun, pickMissions, recorder, replay, sin, cos, speed, step,
  touches, yarnEnds,
} from './course.js'
import { botRun, search } from './pilot.js'
import * as R from './rules.js'

// A hand-made tunnel for physics tests: everything empty unless given.
const fake = (extra = {}, opts = {}, seed = 0) => {
  const c = { k: 0, x0: START, x1: START + CHUNK, yarns: [], spr: [], parcels: [], events: [], ...extra }
  const empty = k => ({ k, x0: START + k * CHUNK, x1: START + (k + 1) * CHUNK, yarns: [], spr: [], parcels: [], events: [] })
  return { seed, opts: { whistle: false, flock: false, strict: false, ...opts }, chunk: k => (k === 0 ? c : empty(k)) }
}
// A wall of yarn from ceiling to floor at START + x (nothing gets past it).
const wall = x => ({ x: START + x, y: 360, len: 600, a0: Math.PI / 2, w: 0 })
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
  for (let k = 0; k < 10; k++) assert.equal(course(7, k).parcels.filter(p => p.kind !== 'token').length, 1)
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
  const seen = {}
  for (const seed of [1, 2, 3, 4, 5, 6, 2024]) {
    const world = makeWorld(seed, { noParcels: true, strict: true })
    for (let k = 0; k < 16; k++) {
      const c = world.chunk(k)
      for (const e of c.events) { const key = e.type === 'loom' ? 'loom:' + e.pat : e.type === 'crane' && e.home ? `homing×${e.n}` : e.type; seen[key] = (seen[key] || 0) + 1 }
      seen.slidingGate = (seen.slidingGate || 0) + c.yarns.filter(y => y.amp).length
    }
    for (let k = 0; k < 16; k++) for (const y of [TOP, (TOP + BOT) / 2, BOT]) {
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
  // The proof really covered every kind of hazard, new ones included.
  for (const key of ['crane', 'steam', 'gate', 'loom:pair', 'loom:cage', 'loom:sweep', 'homing×2', 'homing×3', 'slidingGate']) assert.ok(seen[key] > 0, `no ${key} in the proven chunks`)
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

test('course: looms, strand gates and homing volleys appear (more further in), and brew tokens ride along', () => {
  const tally = ks => { const o = { loom: 0, gate: 0, home: 0, tok: 0 }; for (let seed = 1; seed <= 6; seed++) for (const k of ks) { const c = course(seed, k); for (const e of c.events) { if (e.type === 'loom') o.loom++; if (e.type === 'gate') o.gate++; if (e.type === 'crane' && e.home) o.home++ } o.tok += c.parcels.filter(p => p.kind === 'token').length } return o }
  const early = tally([0, 1, 2]), late = tally([12, 13, 14])
  assert.ok(late.loom > early.loom && late.home > early.home, JSON.stringify({ early, late }))
  assert.ok(early.gate > 0 && late.tok + early.tok > 0)
  for (let seed = 1; seed <= 4; seed++) for (let k = 0; k < 16; k++) {
    const c = course(seed, k)
    for (const e of c.events) if (e.type === 'loom') {
      assert.ok(e.beams.every(b => b.y >= TOP && b.y <= BOT))
      // Somewhere in the corridor there is always a band wider than the flyer that no strand of the loom covers.
      const ys = [TOP - 40, ...e.beams.map(b => b.y).sort((a, b) => a - b), BOT + 40]
      assert.ok(ys.some((y, i) => i && y - ys[i - 1] > 2 * 28 + 24), `loom ${e.pat} leaves no gap`)
    }
    // Gate strands come in pairs at one x: the gap between them is never under 175 px.
    const gates = c.yarns.filter(y => y.a0 === Math.PI / 2 && (y.y - y.len / 2 < CEIL || y.y + y.len / 2 > FLOOR) && y.len > 0)
    for (let i = 0; i + 1 < gates.length; i++) if (gates[i].x === gates[i + 1].x) {
      const [top, bot] = gates[i].y < gates[i + 1].y ? [gates[i], gates[i + 1]] : [gates[i + 1], gates[i]]
      for (const n of [0, 37, 200]) { const a = yarnEnds(top, n), b = yarnEnds(bot, n); assert.ok(Math.min(b[1], b[3]) - Math.max(a[1], a[3]) >= 175) }
    }
  }
})

test('vehicles 2: the Teacup bounces, the Rocket Kettle dashes, the Sponge flaps and soaks', () => {
  const at = kind => fake({ parcels: [{ x: START + 40, y: BOT, kind }], spr: [{ x: START + 1300, y: BOT - 200 }] })
  const start = w => { const s = newRun(); s.d = START; return fly(s, w, 3, false) }
  // Teacup: never rests on the floor; holding through the fall slams down for a higher bounce.
  let w = at('cup'), s = start(w)
  assert.equal(s.veh, 'cup')
  let floorRun = 0, maxRun = 0
  for (let i = 0; i < 240; i++) { step(s, w, false); floorRun = s.y >= BOT ? floorRun + 1 : 0; maxRun = Math.max(maxRun, floorRun) }
  assert.ok(maxRun <= 1, 'it bounces straight off the floor')
  const peak = held => { const q = start(at('cup')); let p = BOT; for (let i = 0; i < 200; i++) { step(q, w, held && q.vy > 0); if (i > 120) p = Math.min(p, q.y) } return BOT - p }
  assert.ok(peak(true) > peak(false) + 80, `slam ${peak(true)} vs float ${peak(false)}`)
  assert.ok(peak(true) > 400, 'a big bounce reaches near the ceiling')
  // Rocket Kettle: holding dashes forward 60% faster and climbs gently.
  w = at('rocket')
  const run = held => { const q = start(w); const d0 = q.d; fly(q, w, 60, held); return { dd: q.d - d0, q } }
  const dash = run(true), coast = run(false)
  assert.ok(dash.dd > coast.dd * 1.5, `${dash.dd} vs ${coast.dd}`)
  assert.ok(dash.q.vy >= -440 && dash.q.y < BOT)
  // Sprinkle Sponge: a tap is an instant flap; holding doesn't keep you up; sprinkles 200 px away get soaked up.
  w = at('sponge'); s = start(w)
  assert.equal(s.veh, 'sponge')
  step(s, w, true)
  assert.ok(s.vy < -700, 'flap')
  fly(s, w, 40, true)
  assert.equal(s.y, BOT, 'holding is not flying')
  fly(s, w, 160, false)
  assert.ok(s.y === BOT && s.spr === 1, 'soaked up from 200 px away')
  assert.ok(VEHICLES.length === 6)
})

test('yarn looms tremble then snap tight; strand gates slide; homing cranes follow you', () => {
  // Loom: safe while it charges, a bonk on its line once it fires, and outlasting it counts.
  const loom = beams => fake({ events: [{ x: START + 10, type: 'loom', pat: 'pair', beams, dur: LOOM_CHARGE + LOOM_FIRE }] })
  let w = loom([{ y: BOT, at: 0 }]), s = newRun(); s.d = START
  fly(s, w, LOOM_CHARGE - 1, false)
  assert.ok(s.alive)
  fly(s, w, 3, false)
  assert.equal(s.cause, 'loom')
  w = loom([{ y: 300, at: 0 }]); s = newRun(); s.d = START
  fly(s, w, LOOM_CHARGE + LOOM_FIRE + 10, false)
  assert.ok(s.alive && s.looms === 1)
  // Gate: through the gap is fine (and counts), the strand is a bonk.
  const gate = (amp = 0) => fake({
    yarns: [{ x: START + 600, y: (CEIL - 30 + 300) / 2, len: 300 - CEIL + 30, a0: Math.PI / 2, w: 0, amp, om: 2, ph: 0 },
      { x: START + 600, y: (500 + FLOOR + 30) / 2, len: FLOOR + 30 - 500, a0: Math.PI / 2, w: 0, amp, om: 2, ph: 0 }],
    events: [{ x: START + 640, type: 'gate' }],
  })
  s = newRun(); s.d = START; s.y = 400; w = gate()
  fly(s, w, 90, () => s.y > 400)
  assert.ok(s.alive && s.gates === 1)
  s = newRun(); s.d = START; w = gate()
  fly(s, w, 90, false)
  assert.equal(s.cause, 'yarn')
  const slide = gate(80).chunk(0).yarns[0]
  assert.ok(Math.abs(yarnEnds(slide, 0)[1] - yarnEnds(slide, 47)[1]) > 60, 'the gap slides')
  // Homing: after the lock, a homing crane keeps easing towards you; a plain one flies straight. Dodged ones count.
  const drift = home => {
    const ww = fake({ events: [{ x: START + 10, type: 'crane', n: 1, home }] })
    const q = newRun(); q.d = START; q.y = 300
    fly(q, ww, CRANE_TRACK + CRANE_LOCK + 2, () => q.y > 300)
    const y0 = q.cr[0].y
    fly(q, ww, 12, false) // drop towards the floor
    return { moved: q.cr[0].y - y0, q, ww }
  }
  assert.ok(drift(true).moved > 25 && drift(false).moved === 0)
  const { q, ww } = drift(false)
  fly(q, ww, 120, false)
  assert.ok(q.alive && q.dodged === 1)
})

test('Second Brew spin: brew tokens pull the reels at a bonk; three teapots fly on, the rest pay sprinkles', () => {
  let revived = 0, landed = 0
  for (let seed = 0; seed < 60 && (!revived || !landed); seed++) {
    const w = fake({ parcels: [{ x: START + 40, y: BOT, kind: 'token' }, { x: START + 80, y: BOT, kind: 'token' }], yarns: [wall(500), wall(5000)] }, {}, seed)
    const s = newRun(); s.d = START
    fly(s, w, 5, false)
    assert.equal(s.tok, 2)
    while (s.alive && !s.spin) step(s, w, false)
    assert.ok(s.spin && s.alive && s.cause === 'yarn')
    const d = s.d, n0 = s.n, pulls = s.spin.pulls.length, spr0 = s.spr
    assert.equal(s.tok, 2 - pulls)
    fly(s, w, 10, true)
    assert.equal(s.d, d, 'the flight waits for the reels')
    while (s.spin) step(s, w, false)
    assert.ok(s.n - n0 <= pulls * SPIN_TICKS)
    if (s.alive) { revived++; assert.ok(s.revives === 1 && s.grace > REVIVE_GRACE - 3 && s.cr.length === 0) } else { landed++; assert.ok(s.spr > spr0 && s.spun === s.spr - spr0 && s.cause === 'yarn') }
  }
  assert.ok(revived && landed, `revived ${revived}, landed ${landed}`)
})

test('Flock bubbles: a bonk floats on in a bubble for 8 s; a rescue revives once; Chitbots get none', () => {
  const w = fake({ yarns: [wall(500), wall(3000)] }, { flock: true })
  let s = newRun(); s.d = START
  while (!s.bub) step(s, w, false)
  const b = { ...s.bub }
  for (let i = 0; i < 100; i++) step(s, w, false)
  const p = bubbleAt(b, s.n)
  assert.ok(s.alive && s.d === p.d && s.y === p.y, 'the bubble is where bubbleAt says')
  assert.ok(touches(b, s.n, p.d, p.y + 60) && !touches(b, s.n, p.d, p.y + 120))
  while (s.alive) step(s, w, false)
  assert.ok(s.n - b.n0 === BUBBLE_TICKS && s.d === b.d0 && s.cause === 'yarn', 'nobody came: you land where you bonked')
  // Rescued: back in the air with grace, once.
  s = newRun(); s.d = START
  while (!s.bub) step(s, w, false)
  fly(s, w, 50, false); step(s, w, false, false, true)
  assert.ok(s.alive && !s.bub && s.rescued && s.bubLog.nR === s.n && s.grace > 0)
  while (s.alive) step(s, w, false)
  assert.ok(!s.bub && s.d > START + 2900, 'the second bonk is the last')
  const bot = newRun({ bot: true }); bot.d = START
  while (bot.alive) step(bot, w, false)
  assert.equal(bot.bubLog, null)
})

test('replays: bots that whistle, spin and dodge looms replay to the same tick and the same sprinkles', () => {
  let whistled = 0
  for (const seed of [31, 62, 93]) for (const opts of [{ whistle: true }, { whistle: true, flock: true }]) {
    const a = botRun(seed, 1, 'hard', opts)
    whistled += a.log.w.length
    const back = replay(seed, a.log, opts, MAX_TICKS, { bot: true })
    assert.deepEqual([back.n, back.d, back.spr, back.revives, back.looms, back.gates], [a.st.n, a.st.d, a.st.spr, a.st.revives, a.st.looms, a.st.gates])
  }
  assert.ok(whistled > 0, 'Chitbots blow the Kettle Whistle')
  assert.equal(botRun(31, 1, 'hard', {}).log.w.length, 0, 'not without the house rule')
})

test('missions: three per round from the seed, read from the replay', () => {
  const a = pickMissions(5), b = pickMissions(5)
  assert.deepEqual(a, b)
  assert.equal(new Set(a.map(m => m.k)).size, 3)
  assert.ok(a.every(m => MISSIONS[m.k].n.includes(m.n)))
  const st = newRun(); st.d = 1000 * 50; st.spr = 45; st.gates = 9
  assert.equal(missionMask([{ k: 'far', n: 900 }, { k: 'spr', n: 70 }, { k: 'gate', n: 4 }], st), 0b101)
})

test('referee: Flock rescue claims hold only if the rescuer really flew through the bubble', () => {
  const seed = 4242, opts = { flock: true }, now = 1_000_000
  // A sits on the floor until something gets them; C does the same (and so can't save anyone).
  const lazy = replay(seed, { t: [] }, opts, MAX_TICKS, { noRescue: true })
  const bub = { n0: lazy.bubLog.n0, d0: lazy.bubLog.d0, y0: lazy.bubLog.y0 }
  // B flies cleanly (the look-ahead), steering for the bubble once it's out.
  const world = makeWorld(seed, opts), st = newRun(), rec = recorder()
  let touchAt = -1, h = false
  while (st.alive && st.n < bub.n0 + 200) {
    if (st.n % 5 === 0) { const tgt = st.n >= bub.n0 ? bubbleAt(bub, st.n + 10).y : MIDY; const r = search(world, st, 60, { target: tgt, maxNodes: 4000 }); h = r.path.length ? r.path[0] : st.y > tgt }
    rec.input(st, h, false); step(st, world, h)
    if (touchAt < 0 && st.alive && touches(bub, st.n, st.d, st.y)) touchAt = st.n
  }
  assert.ok(st.alive && touchAt > 0, `B touched the bubble at ${touchAt}`)
  const bLog = rec.log, bTicks = st.n
  const aLog = { t: [], r: [touchAt + 12], rb: 'B' }
  const a = replay(seed, aLog, opts)
  assert.ok(a.rescued && metres(a) > metres(lazy))
  const late = now + R.LEAD_MS + MAX_TICKS * TICK_MS
  let s = R.setup(['A', 'B', 'C'], seed, { now, flock: true })
  s = R.move(s, 'A', { type: 'run', ticks: a.n, m: metres(a), spr: a.spr, log: aLog }, late)
  assert.equal(s.pub.results.A.resc.ok, null, 'waits for the rescuer')
  s = R.move(s, 'B', { type: 'run', ticks: bTicks, m: metres(st), spr: st.spr, log: bLog }, late)
  assert.equal(s.pub.results.A.resc.ok, true)
  assert.equal(s.pub.results.A.m, metres(a))
  s = R.move(s, 'C', { type: 'run', ticks: lazy.n, m: metres(lazy), spr: lazy.spr, log: { t: [] } }, late)
  assert.equal(s.pub.flock, metres(a) + metres(st) + metres(lazy))
  assert.ok(s.pub.winner)
  // The same claim naming C (who never came near) is replayed without the rescue.
  let f = R.setup(['A', 'B', 'C'], seed, { now, flock: true })
  f = R.move(f, 'C', { type: 'run', ticks: lazy.n, m: metres(lazy), spr: lazy.spr, log: { t: [] } }, late)
  f = R.move(f, 'A', { type: 'run', ticks: a.n, m: metres(a), spr: a.spr, log: { ...aLog, rb: 'C' } }, late)
  assert.equal(f.pub.results.A.resc.ok, false)
  assert.equal(f.pub.results.A.m, metres(lazy))
  // Without the Flock rule a rescue claim is ignored outright.
  let n = R.setup(['A', 'B'], seed, { now })
  n = R.move(n, 'A', { type: 'run', ticks: a.n, m: metres(a), spr: a.spr, log: aLog }, late)
  assert.ok(!n.pub.results.A.resc && n.pub.results.A.m < metres(a))
})
