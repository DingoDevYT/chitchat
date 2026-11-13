// Jetpack Dash: the Long Burrow and the flight physics. Pure and deterministic, shared by the browser, the referee
// (src/games/flyer/rules.js, bundled into the `game` edge function) and the Chitbot pilots.
//
// - course(seed, k): chunk k of the tunnel (400 m): static/spinning yarn, strand gates, sprinkles, gift parcels, brew
//   tokens, and the crane, steam and yarn-loom triggers. Everything is keyed to distance, so every client builds the
//   same tunnel and no level data is sent.
// - step(st, world, held, whistle, rescue): one fixed 60 Hz tick of one flyer (thrust, gravity, vehicles, pickups,
//   hits, the Second Brew spin and the Flock's rescue bubble). It mutates `st` in place (it runs tens of thousands of
//   times per run, so no allocation per tick), but has no hidden inputs: the same seed and the same input log always
//   give the same run, which is what lets the referee replay a thrust log and the tests prove every chunk can be flown.
// - Only + - * / and Math.floor are used in anything that decides a collision (sin/cos are our own polynomials, no
//   Math.sin or Math.sqrt), so the browser and the edge function agree to the last bit on every engine.
import { rng } from '../rng.js'

export const HZ = 60, DT = 1 / HZ, TICK_MS = 1000 / HZ
// The view: 1280 x 720 logical px. Corridor 560 px between ceiling and floor; the flyer is pinned 22% from the left.
export const VIEW_W = 1280, VIEW_H = 720, CEIL = 80, FLOOR = 640, PX = 282
export const R = 24 // flyer hit radius (the drawn flyer is ~70 px; hits are a little forgiving, like the genre)
export const TOP = CEIL + R, BOT = FLOOR - R, MIDY = (TOP + BOT) / 2
export const PPM = 50 // px per metre
export const START = 1600 // hazard-free runway before chunk 0
export const CHUNK = 400 * PPM
export const MAX_TICKS = 6 * 60 * HZ // a run never lasts longer than six minutes
export const VEHICLE_TICKS = 12 * HZ, POP_GRACE = HZ, BREW_GRACE = 90, WHISTLE_TICKS = 90, WHISTLE_COOL = 20 * HZ, FLUFF_TICKS = 6 * HZ
export const CRANE_TRACK = 72, CRANE_LOCK = 24, CRANE_GAP = 30 // ticks: tracks your height 1.2 s, locks 0.4 s, flocks 0.5 s apart
export const HOME_STEP = 3, HOME_STOP = 220 // homing cranes steer 3 px a tick (180 px/s) until 220 px from you
export const STEAM_CHARGE = 90, STEAM_FIRE = 60 // 1.5 s charge, 1 s blast
export const STEAM_HALF = 36 // drawn half-height of a steam blast
export const LANES = [136, 248, 360, 472, 584] // steam lane centres
// Yarn looms: thin taut strands strung wall to wall that tremble for 0.9 s, then snap tight for 0.8 s.
export const LOOM_CHARGE = 54, LOOM_FIRE = 48, LOOM_HALF = 9, LOOM_HIT = LOOM_HALF + R - 5
export const YARN_W = 9, BALL_R = 15
export const SPIN_TICKS = 96, TOKENS_MAX = 3 // the Second Brew spin: one pull per brew token, 1.6 s each
export const BUBBLE_TICKS = 8 * HZ, BUBBLE_R = 56, REVIVE_GRACE = 150 // Flock rescue bubbles float for 8 s
export const DASH = 0.6 // the Rocket Kettle's dash: +60% speed while held
export const PARCELS = ['trotter', 'brolly', 'flip', 'cup', 'rocket', 'sponge', 'brew', 'fluff']
const PARCEL_W = [2, 2, 2, 2, 2, 2, 1.4, 1.6]
export const VEHICLES = ['trotter', 'brolly', 'flip', 'cup', 'rocket', 'sponge']

// Scroll speed by distance: 520 px/s, easing up to 1150 px/s by 2,500 m.
export function speed(d) {
  const x = Math.min(1, Math.max(0, d) / (2500 * PPM))
  return 520 + 630 * x * (2 - x)
}
export const metres = st => Math.floor(st.d / PPM)

// Deterministic sine/cosine: range-reduce, then a Taylor polynomial (error < 1e-7 on [-pi/2, pi/2]).
const PI = 3.141592653589793, TAU = 2 * PI, HALF = PI / 2
export function sin(x) {
  x -= Math.floor(x / TAU) * TAU
  if (x > PI) x -= TAU
  if (x > HALF) x = PI - x
  else if (x < -HALF) x = -PI - x
  const q = x * x
  return x * (1 - q / 6 * (1 - q / 20 * (1 - q / 42 * (1 - q / 72 * (1 - q / 110 * (1 - q / 156))))))
}
export const cos = x => sin(x + HALF)

const mix = (seed, k) => ((seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0
export const chunkOf = x => (x < START ? -1 : Math.floor((x - START) / CHUNK))
export const difficulty = x => Math.min(1, Math.max(0, x / PPM - 80) / 3000)

// Sprinkle patterns, drawn as little grids ('#' = a sprinkle), 36 px apart.
const SHAPES = {
  heart: [' ## ## ', '#######', '#######', ' ##### ', '  ###  ', '   #   '],
  arrow: ['#    ', ' #   ', '  #  ', '   # ', '  #  ', ' #   ', '#    '],
  block: ['######', '######', '######'],
  diamond: ['  #  ', ' ### ', '#####', ' ### ', '  #  '],
  chit: ['### # # ### ###', '#   # #  #   # ', '#   ###  #   # ', '#   # #  #   # ', '### # # ###  # '],
}
const SP = 36

// One 400 m chunk of the Long Burrow. Breathers open and close every chunk, so chunks never interact.
export function course(seed, k, opts = {}) {
  const out = { k, x0: START + k * CHUNK, x1: START + (k + 1) * CHUNK, yarns: [], spr: [], parcels: [], events: [] }
  if (k < 0) return out
  const rand = rng(mix(seed, k))
  const r = (a, b) => a + (b - a) * rand(), ri = (a, b) => Math.floor(r(a, b + 1)), chance = p => rand() < p
  const pick = l => l[Math.floor(rand() * l.length)]
  const { x0, x1 } = out
  let x = x0 + speed(x0) * 1.1
  const parcelAt = opts.noParcels ? Infinity : x0 + r(0.2, 0.7) * CHUNK
  let parcel = false, run = 0, breathe = ri(3, 5)

  const line = (sx, y, n, dy = 0) => { for (let i = 0; i < n; i++) out.spr.push({ x: sx + i * SP, y: y + i * dy }) }
  const shape = (sx, cy, name) => {
    const g = SHAPES[name], h = (g.length - 1) * SP
    g.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') out.spr.push({ x: sx + i * SP, y: cy - h / 2 + j * SP }) }))
    return g[0].length * SP
  }
  const wave = (sx, cy, n, amp) => { for (let i = 0; i < n; i++) out.spr.push({ x: sx + i * SP, y: cy + amp * sin(i * 0.55) }) }
  const clampY = (y, m = 0) => Math.min(BOT - m, Math.max(TOP + m, y))
  // A strand gate: one long strand from the ceiling, one from the floor, a gap between (sliding up and down further in).
  const gate = (gx, gc, G, amp, om, ph) => {
    const a = gc - G / 2, b = gc + G / 2, t0 = CEIL - 30 - amp, b1 = FLOOR + 30 + amp
    out.yarns.push({ x: gx, y: (t0 + a) / 2, len: a - t0, a0: HALF, w: 0, amp, om, ph })
    out.yarns.push({ x: gx, y: (b + b1) / 2, len: b1 - b, a0: HALF, w: 0, amp, om, ph })
    out.events.push({ x: gx + 40, type: 'gate' })
  }

  while (true) {
    const v = speed(x), diff = difficulty(x)
    // Everything (steam blasts, looms and cranes included) is over before `end`, so the closing breather is clean.
    const end = x1 - v * 1.2, room = end - x
    if (room < v * 0.8) break
    // A breather now and then: a wave of sprinkles and nothing to dodge.
    if (run >= breathe) {
      run = 0; breathe = ri(3, 5)
      const n = Math.max(3, Math.min(ri(8, 14), Math.floor((room - v * 0.6) / SP)))
      wave(x + v * 0.3, r(TOP + 90, BOT - 90), n, r(40, 80))
      x += v * 0.6 + n * SP
      continue
    }
    // A gift parcel, once per chunk, in open air.
    if (!parcel && (x >= parcelAt || (parcelAt < Infinity && room < v * 3))) {
      parcel = true
      const tot = PARCEL_W.reduce((a, b) => a + b, 0)
      let u = rand() * tot, i = 0
      while (u > PARCEL_W[i]) u -= PARCEL_W[i++]
      out.parcels.push({ x: x + v * 0.4, y: r(TOP + 60, BOT - 60), kind: PARCELS[i] })
      x += v * 0.9
      continue
    }
    run++
    const roll = rand()
    const pCrane = 0.1 + 0.1 * diff, pSteam = 0.04 + 0.07 * diff, pLoom = 0.03 + 0.09 * diff, pGate = 0.05 + 0.07 * diff
    const pShape = 0.12 - 0.06 * diff
    let acc = 0
    let kind = roll < (acc += pCrane) ? 'crane' : roll < (acc += pSteam) ? 'steam' : roll < (acc += pLoom) ? 'loom'
      : roll < (acc += pGate) ? 'gate' : roll < (acc += pShape) ? 'shape' : 'yarn'
    if (kind === 'crane' && x < START + 500 * PPM * (1 - diff)) kind = 'yarn' // no cranes in the first stretch
    if (kind === 'loom' && x < START + 300 * PPM) kind = 'gate'
    const home = diff > 0.3 && chance(0.2 + 0.5 * diff)
    const flock = home ? (diff > 0.6 && chance(0.5) ? 3 : 2) : diff > 0.25 && chance(0.2 + 0.4 * diff) ? 3 : 1
    const craneT = (CRANE_TRACK + CRANE_LOCK + (flock - 1) * CRANE_GAP) / HZ + (VIEW_W + 140 - PX) / (2 * v) + 0.35
    if (kind === 'crane' && room < v * craneT) kind = 'yarn'
    if (kind === 'steam' && room < v * ((STEAM_CHARGE + STEAM_FIRE) / HZ + 0.35)) kind = 'yarn'
    if (kind === 'loom' && room < v * ((48 + LOOM_CHARGE + LOOM_FIRE) / HZ + 0.35)) kind = 'yarn'
    if (kind === 'gate' && room < v * 1.4) kind = 'yarn'
    if (kind === 'crane') {
      out.events.push({ x, type: 'crane', n: flock, home })
      // Further in, cranes come in over a yarn cluster instead of on their own.
      if (diff > 0.35 && chance(diff * 0.6)) { x += v * 0.4; kind = 'yarn' }
      else x += v * craneT
    }
    if (kind === 'crane') {
      // on its own: placed above
    } else if (kind === 'steam') {
      const n = Math.min(3, ri(1, 1 + Math.round(2 * diff)))
      const slots = [0, 1, 2, 3, 4]
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[slots[i], slots[j]] = [slots[j], slots[i]] }
      const lanes = slots.slice(0, n).sort((a, b) => a - b).map(i => LANES[i])
      out.events.push({ x, type: 'steam', lanes })
      const free = LANES.filter(y => !lanes.includes(y))
      line(x + v * 0.6, pick(free), ri(5, 9))
      x += v * ((STEAM_CHARGE + STEAM_FIRE) / HZ + 0.35)
    } else if (kind === 'loom') {
      // pair: two strands far apart · cage: strands every 104 px but one wide gap · sweep: four snap tight in turn.
      const pat = pick(diff > 0.45 ? ['pair', 'cage', 'cage', 'sweep', 'sweep'] : ['pair', 'pair', 'cage', 'sweep'])
      const beams = []
      let gap = MIDY
      if (pat === 'pair') {
        const y1 = r(TOP + 20, BOT - 20)
        const y2 = y1 > MIDY ? r(TOP + 20, y1 - 180) : r(y1 + 180, BOT - 20)
        beams.push({ y: Math.min(y1, y2), at: 0 }, { y: Math.max(y1, y2), at: 0 })
        gap = (y1 + y2) / 2
      } else if (pat === 'cage') {
        gap = r(TOP + 90, BOT - 90)
        for (let by = TOP + 10; by <= BOT - 10; by += 104) if (Math.abs(by - gap) > 95) beams.push({ y: by, at: 0 })
      } else {
        const down = chance(0.5)
        for (let i = 0; i < 4; i++) beams.push({ y: down ? TOP + 20 + i * 120 : BOT - 20 - i * 120, at: i * 16 })
        gap = down ? BOT - 40 : TOP + 40
      }
      const last = beams.reduce((m, b) => Math.max(m, b.at), 0)
      const dur = last + LOOM_CHARGE + LOOM_FIRE
      out.events.push({ x, type: 'loom', pat, beams, dur })
      line(x + v * 0.5, clampY(gap, 10), ri(4, 7))
      x += v * (dur / HZ + 0.35)
    } else if (kind === 'gate') {
      // Strand gates: a gap of 180-250 px, sliding up and down further in; a slalom of two now and then.
      const G = r(200, 250) - 20 * diff
      const amp = diff > 0.2 && chance(0.3 + 0.5 * diff) ? r(40, 60 + 60 * diff) : 0
      const om = r(1.4, 2.4), ph = r(0, TAU)
      const lo = TOP + G / 2 + amp + 10, hi = BOT - G / 2 - amp - 10
      const gc = r(lo, hi)
      gate(x, gc, G, amp, om, ph)
      if (chance(0.15 + 0.35 * diff) && room > v * 2.2) {
        const gc2 = Math.min(hi, Math.max(lo, gc + (gc > MIDY ? -1 : 1) * r(120, 200)))
        gate(x + v * 0.6, gc2, G, amp, om, ph + PI)
        line(x + v * 0.15, (gc + gc2) / 2, 3)
        x += v * 0.6
      } else line(x - SP * 3, gc, 3)
      x += v * 0.5
    } else if (kind === 'shape') {
      let name = pick(['heart', 'arrow', 'block', 'diamond', 'chit', 'heart'])
      if (SHAPES[name][0].length * SP > room) name = 'arrow'
      const h = (SHAPES[name].length - 1) * SP
      x += shape(x, r(TOP + h / 2 + 10, BOT - h / 2 - 10), name) + v * 0.2
    } else {
      // A cluster of yarn: still strands at an angle, and (more often further in) spinning ones.
      const n = ri(2, 3 + Math.round(3 * diff))
      for (let i = 0; i < n && x < end - v * 0.3; i++) {
        const spin = chance(0.08 + 0.35 * diff)
        const len = spin ? r(130, 170 + 60 * diff) : r(140, 210 + 110 * diff)
        const a0 = spin ? r(0, PI) : pick([0, HALF, HALF, PI / 4, -PI / 4, r(0, PI)])
        const w = spin ? (chance(0.5) ? 1 : -1) * r(60, 120) * PI / 180 : 0
        const hy = spin ? len / 2 : Math.abs(sin(a0)) * len / 2
        const lo = CEIL + hy - 6, hi = FLOOR - hy + 6
        // Hug a wall now and then (yarn strung from the ceiling or the floor), else anywhere in the corridor.
        const y = chance(0.3) ? (chance(0.5) ? lo : hi) : r(lo, hi)
        out.yarns.push({ x, y, len, a0, w })
        if (chance(0.35)) {
          const free = y > (CEIL + FLOOR) / 2 ? clampY(y - hy - 70, 10) : clampY(y + hy + 70, 10)
          line(x - SP * 1.5, free, 4)
        }
        x += v * (r(0.72, 1.0) - 0.28 * diff) + (spin ? len * 0.3 : 0)
      }
    }
    x += v * (r(0.35, 0.65) - 0.2 * diff)
  }
  out.spr.sort((a, b) => a.x - b.x)
  // Now and then a brew token rides along with a sprinkle (spent on the Second Brew spin when you bonk).
  if (!opts.noParcels && out.spr.length && chance(0.32)) {
    const s = out.spr[Math.floor(rand() * out.spr.length)]
    out.parcels.push({ x: s.x, y: s.y, kind: 'token' })
    out.parcels.sort((a, b) => a.x - b.x)
  }
  out.yarns.sort((a, b) => a.x - b.x)
  return out
}

// A seeded tunnel: chunks built on demand and cached (a few at a time; they're cheap to rebuild).
export function makeWorld(seed, opts = {}) {
  const cache = new Map()
  const o = { whistle: !!opts.whistle, flock: !!opts.flock, noParcels: !!opts.noParcels, strict: !!opts.strict }
  return {
    seed: seed >>> 0, opts: o,
    chunk(k) {
      let c = cache.get(k)
      if (!c) {
        c = course(seed >>> 0, k, o)
        if (cache.size >= 8) for (const key of cache.keys()) if (key < k - 1 || key > k + 2) cache.delete(key)
        cache.set(k, c)
      }
      return c
    },
  }
}

// how.bot: a Chitbot's run (Chitbots fly from the seed alone, so nobody can pop their rescue bubble: they get none).
export function newRun(how = {}) {
  return {
    n: 0, d: 0, y: BOT, vy: 0, held: false, alive: true, end: 0, cause: null,
    veh: null, vt: 0, flip: 1, grace: 0, brew: false, fluff: 0, wh: 0, wc: 0,
    spr: 0, got: new Set(), lastP: -1, ek: 0, ei: 0, cr: [], st: [], lm: [],
    pops: 0, brews: 0, whistles: 0, shave: 999, strict: false, bot: !!how.bot,
    tok: 0, toks: 0, spin: null, spun: 0, revives: 0, bub: null, bubLog: null, rescued: 0,
    // mission counters
    rides: 0, dodged: 0, gates: 0, looms: 0, air0: -1, airD: 0, floorD: 0,
  }
}
// Copy for look-ahead (bots, the planner). Sprinkles aren't tracked in copies.
export function clone(s) {
  return {
    ...s, got: null, cr: s.cr.map(c => ({ ...c })), st: s.st.slice(), lm: s.lm.slice(),
    spin: s.spin && { ...s.spin }, bub: s.bub && { ...s.bub }, bubLog: s.bubLog && { ...s.bubLog },
  }
}

// First index in a list sorted by x with .x >= x.
function lower(list, x) {
  let lo = 0, hi = list.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].x < x) lo = m + 1; else hi = m }
  return lo
}

// Squared distance from (px, py) to the segment (ax, ay)-(bx, by).
function segD2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const ex = ax + t * dx - px, ey = ay + t * dy - py
  return ex * ex + ey * ey
}

// A yarn strand's ends at tick n (spinning ones turn and gate strands slide with the run clock, the same everywhere).
export function yarnEnds(y, n) {
  const a = y.a0 + y.w * n * DT, h = y.len / 2, c = cos(a) * h, s = sin(a) * h
  const cy = y.amp ? y.y + y.amp * sin(y.ph + y.om * n * DT) : y.y
  return [y.x - c, cy - s, y.x + c, cy + s]
}

// The Flock's rescue bubble: it floats on with the tunnel from where you bonked, drifting to the middle and bobbing.
export function bubbleY(b, age) {
  const f = age < 60 ? age / 60 : 1
  return b.y0 + (MIDY - b.y0) * f + 46 * sin(age * 0.05) * f
}
// Where the bubble { n0, d0, y0 } is at tick n: the same sums the bubbled flyer's own ticks do.
export function bubbleAt(b, n) {
  let d = b.d0
  for (let i = b.n0; i < n; i++) d += speed(d) * DT
  return { d, y: bubbleY(b, n - b.n0) }
}
// Does a flyer at (d, y) touch the bubble?
export function touches(b, n, d, y) {
  if (n < b.n0) return false
  const p = bubbleAt(b, n), dx = p.d - d, dy = p.y - y, rr = R + BUBBLE_R
  return dx * dx + dy * dy < rr * rr
}
const canBubble = (st, world) => world.opts.flock && !st.bot && !st.rescued && !st.bubLog

function die(st, what) { st.alive = false; st.end = st.n; st.cause = what }

function hurt(st, world, what) {
  if (st.strict || world.opts.strict) return die(st, what)
  if (st.veh) {
    if (st.veh === 'trotter' && what === 'yarn' && st.y >= BOT - 0.5) return // stomps straight through
    st.veh = null; st.vt = 0; st.flip = 1; st.grace = POP_GRACE; st.vy = -500; st.pops++
    return
  }
  if (st.brew) { st.brew = false; st.grace = BREW_GRACE; st.brews++; return }
  fatal(st, world, what)
}

// A bonk: brew tokens first (the Second Brew spin), then the Flock's rescue bubble, then down you go.
function fatal(st, world, what) {
  st.cause = what
  if (st.tok > 0) return startSpin(st, world)
  if (canBubble(st, world)) return startBubble(st)
  die(st, what)
}

// Reels: 0 teapot, 1 sprinkle, 2 crane, 3 yarn, 4 teacup. Three teapots pour you a Second Brew (you fly on).
function startSpin(st, world) {
  const rand = rng(mix(world.seed ^ 0x5b1e, st.n))
  const pulls = []
  for (let i = 0; i < st.tok; i++) {
    const u = rand()
    let reels, prize
    if (u < 0.24) { reels = [0, 0, 0]; prize = 'brew' } else if (u < 0.42) { reels = [1, 1, 1]; prize = 25 } else if (u < 0.72) {
      const a = 1 + Math.floor(rand() * 4), b = 1 + ((a + Math.floor(rand() * 3)) % 4)
      reels = rand() < 0.5 ? [a, a, b] : [b, a, a]; prize = 10
    } else {
      const a = Math.floor(rand() * 5)
      reels = [a, (a + 1 + Math.floor(rand() * 2)) % 5, (a + 3 + Math.floor(rand() * 2)) % 5]; prize = 3
    }
    pulls.push({ reels, prize })
    if (prize === 'brew') break
  }
  st.tok -= pulls.length
  st.spin = { pulls, i: 0, left: SPIN_TICKS }
  st.vy = 0; st.veh = null; st.vt = 0; st.flip = 1
}
function spinTick(st, world, held) {
  st.n++; st.held = held
  const s = st.spin
  if (--s.left > 0) return finish(st)
  const p = s.pulls[s.i]
  if (p.prize === 'brew') { st.spin = null; st.revives++; revive(st); return finish(st) }
  st.spr += p.prize; st.spun += p.prize
  if (++s.i < s.pulls.length) { s.left = SPIN_TICKS; return finish(st) }
  st.spin = null
  if (canBubble(st, world)) startBubble(st)
  else die(st, st.cause)
  return finish(st)
}

function startBubble(st) {
  const y0 = Math.min(BOT - 40, Math.max(TOP + 40, st.y))
  st.bub = { n0: st.n, d0: st.d, y0, cause: st.cause }
  st.bubLog = { n0: st.n, d0: st.d, y0, nR: -1 }
  st.vy = 0; st.veh = null; st.vt = 0; st.flip = 1; st.brew = false
}
function bubbleTick(st, world, held, rescue) {
  st.n++; st.held = held
  const b = st.bub, age = st.n - b.n0
  st.d += speed(st.d) * DT
  st.y = bubbleY(b, age); st.vy = 0
  events(st, world, st.d, st.n, st.y, false)
  if (rescue) { st.bub = null; st.rescued = 1; st.bubLog.nR = st.n; revive(st); return finish(st) }
  if (age >= BUBBLE_TICKS) { st.bub = null; st.d = b.d0; st.y = b.y0; die(st, b.cause) }
  return finish(st)
}

function revive(st) {
  st.grace = REVIVE_GRACE; st.vy = -500; st.cause = null
  st.cr.length = 0; st.st.length = 0; st.lm.length = 0
}

function take(st, kind) {
  if (VEHICLES.includes(kind)) {
    if (st.veh) { st.vt = VEHICLE_TICKS; return }
    st.veh = kind; st.vt = VEHICLE_TICKS; st.flip = 1; st.rides++
  } else if (kind === 'brew') {
    if (st.brew && st.got) st.spr += 10
    st.brew = true
  } else if (kind === 'fluff') st.fluff = FLUFF_TICKS
  else if (kind === 'token') { st.toks++; if (st.tok < TOKENS_MAX) st.tok++ }
}

// Crane, steam, loom and gate triggers, in course order (spawn false: just walk past them, as a bubble does).
function events(st, world, d, n, y, spawn) {
  for (;;) {
    const ch = world.chunk(st.ek)
    if (st.ei < ch.events.length) {
      const e = ch.events[st.ei]
      if (e.x > d) break
      st.ei++
      if (!spawn) continue
      if (e.type === 'crane') for (let i = 0; i < e.n; i++) st.cr.push({ n0: n + i * CRANE_GAP, y, sx: VIEW_W + 60, h: e.home ? 1 : 0, v: e.n, i })
      else if (e.type === 'steam') st.st.push({ n0: n, lanes: e.lanes })
      else if (e.type === 'loom') st.lm.push({ n0: n, beams: e.beams, dur: e.dur, pat: e.pat })
      else if (e.type === 'gate') st.gates++
    } else if (ch.x1 <= d) { st.ek++; st.ei = 0 } else break
  }
}

const stopped = st => !st.alive || st.grace > 0 || st.spin || st.bub

// One tick. held: the button is down. whistle: the Kettle Whistle was pressed this tick (needs the house rule).
// rescue: a friend flew through your bubble (the Flock house rule; the referee checks their replay really did).
export function step(st, world, held, whistle = false, rescue = false) {
  if (!st.alive) return st
  if (st.spin) return spinTick(st, world, held)
  if (st.bub) return bubbleTick(st, world, held, rescue)
  const press = held && !st.held
  st.held = held
  if (whistle && world.opts.whistle && st.wc === 0) { st.wh = WHISTLE_TICKS; st.wc = WHISTLE_COOL; st.whistles++ }

  // Flight. Velocity ramps, so a tap is a small hop and a hold a smooth climb. Each vehicle has its own feel.
  let a, up = -900, dn = 900, sp = speed(st.d)
  const veh = st.veh
  if (!veh) a = held ? -3300 : 2600
  else if (veh === 'trotter') { a = 3600; up = -1300; dn = 1300; if (press && st.y >= BOT - 0.5) st.vy = -1150 }
  else if (veh === 'brolly') { a = held ? -1500 : 700; up = -420; dn = 300 }
  else if (veh === 'flip') { if (press) st.flip = -st.flip; a = 4200 * st.flip; up = -1100; dn = 1100 }
  else if (veh === 'cup') { a = held ? 6200 : 2600; up = -1650; dn = 1750 } // always bouncing; hold to slam down
  else if (veh === 'rocket') { a = held ? -1500 : 1900; up = -440; dn = 760; if (held) sp *= 1 + DASH } // hold to dash
  else { a = 2300; up = -760; dn = 860; if (press) st.vy = -760 } // sponge: tap to flap
  st.vy += a * DT
  if (st.vy < up) st.vy = up
  if (st.vy > dn) st.vy = dn
  st.y += st.vy * DT
  if (st.y > BOT) {
    st.y = BOT
    if (veh === 'cup') { const b = st.vy * 0.95; st.vy = -(b < 850 ? 850 : b > 1650 ? 1650 : b) } else if (st.vy > 0) st.vy = 0
  }
  if (st.y < TOP) { st.y = TOP; if (veh === 'cup' && st.vy < 0) st.vy = -st.vy * 0.5; else if (st.vy < 0) st.vy = 0 }
  st.d += sp * DT
  st.n++
  const n = st.n, d = st.d, y = st.y

  if (st.grace > 0) st.grace--
  if (st.wh > 0) st.wh--
  if (st.wc > 0) st.wc--
  if (st.fluff > 0) st.fluff--
  if (st.veh && --st.vt <= 0) { st.veh = null; st.flip = 1; st.grace = 30 }
  // Floor and air (mission counters).
  if (y >= BOT - 0.5) { st.air0 = -1; st.floorD += sp * DT } else {
    if (st.air0 < 0) st.air0 = d
    else if (d - st.air0 > st.airD) st.airD = d - st.air0
  }

  const k = chunkOf(d), c = world.chunk(k)
  events(st, world, d, n, y, true)

  // Pickups: sprinkles (tracked only in real runs) and parcels.
  if (st.got) {
    const reach = st.veh === 'sponge' ? 230 : st.fluff > 0 ? 170 : R + 14, r2 = reach * reach
    for (let i = lower(c.spr, d - reach); i < c.spr.length && c.spr[i].x <= d + reach; i++) {
      const s = c.spr[i], dx = s.x - d, dy = s.y - y
      if (dx * dx + dy * dy < r2) { const id = k * 100000 + i; if (!st.got.has(id)) { st.got.add(id); st.spr++ } }
    }
  }
  for (let i = lower(c.parcels, d - 60); i < c.parcels.length && c.parcels[i].x <= d + 60; i++) {
    const p = c.parcels[i], id = k * 100 + i, dx = p.x - d, dy = p.y - y
    if (id > st.lastP && dx * dx + dy * dy < (R + 30) * (R + 30)) { st.lastP = id; take(st, p.kind) }
  }

  // Cranes: track your height, lock, then fly in at twice the scroll speed (screen coordinates). Homing ones keep
  // steering towards you (3 px a tick) until they're close, so you have to move late and far.
  let live = 0
  for (const cr of st.cr) {
    const age = n - cr.n0
    if (age < 0) { st.cr[live++] = cr; continue }
    if (age < CRANE_TRACK) cr.y += (y - cr.y) * 0.18
    else if (age >= CRANE_TRACK + CRANE_LOCK) {
      cr.sx -= 2 * sp * DT
      if (cr.h && cr.sx > PX + HOME_STOP) { const dy = y - cr.y; cr.y += dy > HOME_STEP ? HOME_STEP : dy < -HOME_STEP ? -HOME_STEP : dy }
    }
    if (cr.sx > -80) st.cr[live++] = cr
    else st.dodged++
  }
  st.cr.length = live
  live = 0
  for (const s of st.st) if (n - s.n0 < STEAM_CHARGE + STEAM_FIRE) st.st[live++] = s
  st.st.length = live
  live = 0
  for (const L of st.lm) { if (n - L.n0 < L.dur) st.lm[live++] = L; else st.looms++ }
  st.lm.length = live

  if (st.grace > 0 || st.wh > 0) return finish(st)

  // Hits.
  for (let i = lower(c.yarns, d - 200); i < c.yarns.length && c.yarns[i].x <= d + 200; i++) {
    const [ax, ay, bx, by] = yarnEnds(c.yarns[i], n)
    const s2 = segD2(d, y, ax, ay, bx, by), e1 = (d - ax) * (d - ax) + (y - ay) * (y - ay), e2 = (d - bx) * (d - bx) + (y - by) * (y - by)
    const rs = R + YARN_W, rb = R + BALL_R
    if (s2 < rs * rs || e1 < rb * rb || e2 < rb * rb) { hurt(st, world, 'yarn'); if (stopped(st)) return finish(st) }
    else if (st.got) { const near = s2 - (rs + 40) * (rs + 40); if (near < 0) st.shave = Math.min(st.shave, nearGap(s2, rs)) }
  }
  for (const cr of st.cr) {
    if (n - cr.n0 < CRANE_TRACK + CRANE_LOCK) continue
    const dx = cr.sx - PX, dy = cr.y - y
    if (dx * dx + dy * dy < (R + 16) * (R + 16)) { hurt(st, world, 'crane'); if (stopped(st)) return finish(st) }
  }
  for (const s of st.st) {
    const age = n - s.n0
    if (age < STEAM_CHARGE) continue
    for (const ly of s.lanes) {
      const g = Math.abs(y - ly) - (STEAM_HALF + R - 8)
      if (g < 0) { hurt(st, world, 'steam'); if (stopped(st)) return finish(st) }
      else if (st.got && g < st.shave) st.shave = g
    }
  }
  for (const L of st.lm) {
    const age = n - L.n0
    for (const b of L.beams) {
      const t = age - b.at
      if (t < LOOM_CHARGE || t >= LOOM_CHARGE + LOOM_FIRE) continue
      const g = Math.abs(y - b.y) - LOOM_HIT
      if (g < 0) { hurt(st, world, 'loom'); if (stopped(st)) return finish(st) }
      else if (st.got && g < st.shave) st.shave = g
    }
  }
  return finish(st)
}
// Clearance in px from a squared distance (integer search, no Math.sqrt): only for the Closest Shave ribbon.
function nearGap(d2, rs) {
  let g = 0
  while (g < 40 && (rs + g + 1) * (rs + g + 1) <= d2) g++
  return g
}
function finish(st) {
  if (st.alive && st.n >= MAX_TICKS) { st.alive = false; st.end = st.n; st.cause = 'time'; st.spin = null; st.bub = null }
  return st
}

// Replays a thrust log: { t: ticks where the button flipped (starting released), w: ticks the whistle was pressed,
// r: the tick a friend popped your rescue bubble }. Stops at the first bonk, at `upto` ticks (a run the player ended
// themselves) or at MAX_TICKS. how: { bot, noRescue (ignore log.r), onTick(st) after every tick }.
export function replay(seed, log, opts = {}, upto = MAX_TICKS, how = {}) {
  const world = makeWorld(seed, opts), st = newRun(how)
  const t = log?.t || [], w = log?.w || [], r = how.noRescue ? [] : log?.r || []
  let ti = 0, wi = 0, ri = 0, held = false
  const cap = Math.min(upto, MAX_TICKS)
  while (st.alive && st.n < cap) {
    while (ti < t.length && t[ti] <= st.n) { held = !held; ti++ }
    let wh = false, rs = false
    while (wi < w.length && w[wi] <= st.n) { wh = true; wi++ }
    while (ri < r.length && r[ri] <= st.n) { rs = true; ri++ }
    step(st, world, held, wh, rs)
    if (how.onTick) how.onTick(st)
  }
  if (st.alive) st.end = st.n
  return st
}

// Records a run's inputs as a log (what the client sends with its result).
export function recorder() {
  const log = { t: [], w: [], r: [] }
  let held = false
  return {
    log,
    input(st, h, wh, rs) { if (h !== held) { log.t.push(st.n); held = h } if (wh) log.w.push(st.n); if (rs) log.r.push(st.n) },
  }
}

// Missions: three per round, drawn from the seed, the same for everyone. Each reads a counter the sim keeps, so the
// referee's replay says which you really finished.
export const MISSIONS = {
  far: { n: [600, 900, 1300], text: n => `Fly ${n.toLocaleString()} m`, of: st => metres(st) },
  spr: { n: [40, 70, 110], text: n => `Scoop ${n} sprinkles`, of: st => st.spr },
  ride: { n: [1, 2, 3], text: n => `Ride ${n} vehicle${n > 1 ? 's' : ''}`, of: st => st.rides },
  air: { n: [150, 250, 400], text: n => `Stay off the floor for ${n} m`, of: st => Math.floor(st.airD / PPM) },
  floor: { n: [80, 160, 260], text: n => `Run ${n} m along the floor`, of: st => Math.floor(st.floorD / PPM) },
  crane: { n: [3, 6, 10], text: n => `Dodge ${n} paper cranes`, of: st => st.dodged },
  gate: { n: [2, 4, 7], text: n => `Thread ${n} strand gates`, of: st => st.gates },
  loom: { n: [2, 3, 5], text: n => `Outlast ${n} yarn looms`, of: st => st.looms },
  token: { n: [1, 2, 3], text: n => `Catch ${n} brew token${n > 1 ? 's' : ''}`, of: st => st.toks },
}
export function pickMissions(seed) {
  const rand = rng(mix(seed ^ 0x3a55, 7)), keys = Object.keys(MISSIONS), out = []
  while (out.length < 3) {
    const k = keys[Math.floor(rand() * keys.length)]
    if (out.some(m => m.k === k)) continue
    const l = MISSIONS[k].n
    out.push({ k, n: l[Math.floor(rand() * l.length)] })
  }
  return out
}
export const missionText = m => MISSIONS[m.k]?.text(m.n) ?? ''
export const missionOf = (m, st) => Math.min(m.n, MISSIONS[m.k]?.of(st) ?? 0)
// Bit i set: mission i done.
export const missionMask = (ms, st) => (ms || []).reduce((b, m, i) => (missionOf(m, st) >= m.n ? b | (1 << i) : b), 0)
