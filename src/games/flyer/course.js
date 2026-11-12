// Chatterflies: the Long Burrow and the flight physics. Pure and deterministic, shared by the browser, the referee
// (src/games/flyer/rules.js, bundled into the `game` edge function) and the Chitbot pilots.
//
// - course(seed, k): chunk k of the tunnel (400 m): static/spinning yarn, sprinkles, gift parcels, and the crane and
//   steam triggers. Everything is keyed to distance, so every client builds the same tunnel and no level data is sent.
// - step(st, world, held, whistle): one fixed 60 Hz tick of one flyer (thrust, gravity, vehicles, pickups, hits).
//   It mutates `st` in place (it runs tens of thousands of times per run, so no allocation per tick), but has no
//   hidden inputs: the same seed and the same input log always give the same run, which is what lets the referee
//   replay a thrust log and the tests prove every chunk can be flown.
// - Only + - * / and Math.floor are used in anything that decides a collision (sin/cos are our own polynomials, no
//   Math.sin or Math.sqrt), so the browser and the edge function agree to the last bit on every engine.
import { rng } from '../rng.js'

export const HZ = 60, DT = 1 / HZ, TICK_MS = 1000 / HZ
// The view: 1280 x 720 logical px. Corridor 560 px between ceiling and floor; the flyer is pinned 22% from the left.
export const VIEW_W = 1280, VIEW_H = 720, CEIL = 80, FLOOR = 640, PX = 282
export const R = 24 // flyer hit radius (the drawn flyer is ~70 px; hits are a little forgiving, like the genre)
export const TOP = CEIL + R, BOT = FLOOR - R
export const PPM = 50 // px per metre
export const START = 1600 // hazard-free runway before chunk 0
export const CHUNK = 400 * PPM
export const MAX_TICKS = 6 * 60 * HZ // a run never lasts longer than six minutes
export const VEHICLE_TICKS = 12 * HZ, POP_GRACE = HZ, BREW_GRACE = 90, WHISTLE_TICKS = 90, WHISTLE_COOL = 20 * HZ, FLUFF_TICKS = 6 * HZ
export const CRANE_TRACK = 72, CRANE_LOCK = 24, CRANE_GAP = 30 // ticks: tracks your height 1.2 s, locks 0.4 s, flocks 0.5 s apart
export const STEAM_CHARGE = 90, STEAM_FIRE = 60 // 1.5 s charge, 1 s blast
export const STEAM_HALF = 36 // drawn half-height of a steam blast
export const LANES = [136, 248, 360, 472, 584] // steam lane centres
export const YARN_W = 9, BALL_R = 15
export const PARCELS = ['trotter', 'brolly', 'flip', 'brew', 'fluff']
export const VEHICLES = ['trotter', 'brolly', 'flip']

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

  while (true) {
    const v = speed(x), diff = difficulty(x)
    // Everything (steam blasts and cranes included) is over before `end`, so the closing breather is clean.
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
      const w = [3, 3, 3, 1.4, 2], tot = w.reduce((a, b) => a + b, 0)
      let u = rand() * tot, i = 0
      while (u > w[i]) u -= w[i++]
      out.parcels.push({ x: x + v * 0.4, y: r(TOP + 60, BOT - 60), kind: PARCELS[i] })
      x += v * 0.9
      continue
    }
    run++
    const roll = rand()
    const pCrane = 0.1 + 0.1 * diff, pSteam = 0.05 + 0.1 * diff, pShape = 0.12 - 0.06 * diff
    let kind = roll < pCrane ? 'crane' : roll < pCrane + pSteam ? 'steam' : roll < pCrane + pSteam + pShape ? 'shape' : 'yarn'
    if (kind === 'crane' && x < START + 500 * PPM * (1 - diff)) kind = 'yarn' // no cranes in the first stretch
    const flock = diff > 0.25 && chance(0.2 + 0.4 * diff) ? 3 : 1
    const craneT = (CRANE_TRACK + CRANE_LOCK + (flock - 1) * CRANE_GAP) / HZ + (VIEW_W + 140 - PX) / (2 * v) + 0.35
    if (kind === 'crane' && room < v * craneT) kind = 'yarn'
    if (kind === 'steam' && room < v * ((STEAM_CHARGE + STEAM_FIRE) / HZ + 0.35)) kind = 'yarn'
    if (kind === 'crane') {
      out.events.push({ x, type: 'crane', n: flock })
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
  return out
}

// A seeded tunnel: chunks built on demand and cached (a few at a time; they're cheap to rebuild).
export function makeWorld(seed, opts = {}) {
  const cache = new Map()
  const o = { whistle: !!opts.whistle, noParcels: !!opts.noParcels, strict: !!opts.strict }
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

export function newRun() {
  return {
    n: 0, d: 0, y: BOT, vy: 0, held: false, alive: true, end: 0, cause: null,
    veh: null, vt: 0, flip: 1, grace: 0, brew: false, fluff: 0, wh: 0, wc: 0,
    spr: 0, got: new Set(), lastP: -1, ek: 0, ei: 0, cr: [], st: [],
    pops: 0, brews: 0, whistles: 0, shave: 999, strict: false,
  }
}
// Copy for look-ahead (bots, the planner). Sprinkles aren't tracked in copies.
export function clone(s) {
  return { ...s, got: null, cr: s.cr.map(c => ({ ...c })), st: s.st.slice() }
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

// A yarn strand's ends at tick n (spinning ones turn with the run clock, the same on every client).
export function yarnEnds(y, n) {
  const a = y.a0 + y.w * n * DT, h = y.len / 2, c = cos(a) * h, s = sin(a) * h
  return [y.x - c, y.y - s, y.x + c, y.y + s]
}

function hurt(st, world, what) {
  if (st.strict || world.opts.strict) { st.alive = false; st.end = st.n; st.cause = what; return }
  if (st.veh) {
    if (st.veh === 'trotter' && what === 'yarn' && st.y >= BOT - 0.5) return // stomps straight through
    st.veh = null; st.vt = 0; st.flip = 1; st.grace = POP_GRACE; st.vy = -500; st.pops++
    return
  }
  if (st.brew) { st.brew = false; st.grace = BREW_GRACE; st.brews++; return }
  st.alive = false; st.end = st.n; st.cause = what
}

function take(st, kind) {
  if (VEHICLES.includes(kind)) {
    if (st.veh) { st.vt = VEHICLE_TICKS; return }
    st.veh = kind; st.vt = VEHICLE_TICKS; st.flip = 1
  } else if (kind === 'brew') {
    if (st.brew && st.got) st.spr += 10
    st.brew = true
  } else if (kind === 'fluff') st.fluff = FLUFF_TICKS
}

// One tick. held: the button is down. whistle: the Kettle Whistle was pressed this tick (needs the house rule).
export function step(st, world, held, whistle = false) {
  if (!st.alive) return st
  const press = held && !st.held
  st.held = held
  if (whistle && world.opts.whistle && st.wc === 0) { st.wh = WHISTLE_TICKS; st.wc = WHISTLE_COOL; st.whistles++ }

  // Flight. Velocity ramps, so a tap is a small hop and a hold a smooth climb.
  let a, up = -900, dn = 900
  const veh = st.veh
  if (!veh) a = held ? -3300 : 2600
  else if (veh === 'trotter') { a = 3600; up = -1300; dn = 1300; if (press && st.y >= BOT - 0.5) st.vy = -1150 }
  else if (veh === 'brolly') { a = held ? -1500 : 700; up = -420; dn = 300 }
  else { if (press) st.flip = -st.flip; a = 4200 * st.flip; up = -1100; dn = 1100 }
  st.vy += a * DT
  if (st.vy < up) st.vy = up
  if (st.vy > dn) st.vy = dn
  st.y += st.vy * DT
  if (st.y > BOT) { st.y = BOT; if (st.vy > 0) st.vy = 0 }
  if (st.y < TOP) { st.y = TOP; if (st.vy < 0) st.vy = 0 }
  const sp = speed(st.d)
  st.d += sp * DT
  st.n++
  const n = st.n, d = st.d, y = st.y

  if (st.grace > 0) st.grace--
  if (st.wh > 0) st.wh--
  if (st.wc > 0) st.wc--
  if (st.fluff > 0) st.fluff--
  if (st.veh && --st.vt <= 0) { st.veh = null; st.flip = 1; st.grace = 30 }

  const k = chunkOf(d), c = world.chunk(k)

  // Crane and steam triggers, in course order.
  for (;;) {
    const ch = world.chunk(st.ek)
    if (st.ei < ch.events.length) {
      const e = ch.events[st.ei]
      if (e.x > d) break
      st.ei++
      if (e.type === 'crane') for (let i = 0; i < e.n; i++) st.cr.push({ n0: n + i * CRANE_GAP, y, sx: VIEW_W + 60 })
      else st.st.push({ n0: n, lanes: e.lanes })
    } else if (ch.x1 <= d) { st.ek++; st.ei = 0 } else break
  }

  // Pickups: sprinkles (tracked only in real runs) and parcels.
  if (st.got) {
    const reach = st.fluff > 0 ? 170 : R + 14, r2 = reach * reach
    for (let i = lower(c.spr, d - reach); i < c.spr.length && c.spr[i].x <= d + reach; i++) {
      const s = c.spr[i], dx = s.x - d, dy = s.y - y
      if (dx * dx + dy * dy < r2) { const id = k * 100000 + i; if (!st.got.has(id)) { st.got.add(id); st.spr++ } }
    }
  }
  for (let i = lower(c.parcels, d - 60); i < c.parcels.length && c.parcels[i].x <= d + 60; i++) {
    const p = c.parcels[i], id = k * 100 + i, dx = p.x - d, dy = p.y - y
    if (id > st.lastP && dx * dx + dy * dy < (R + 30) * (R + 30)) { st.lastP = id; take(st, p.kind) }
  }

  // Cranes: track your height, lock, then fly in at twice the scroll speed (screen coordinates).
  let live = 0
  for (const cr of st.cr) {
    const age = n - cr.n0
    if (age < 0) { st.cr[live++] = cr; continue }
    if (age < CRANE_TRACK) cr.y += (y - cr.y) * 0.18
    else if (age >= CRANE_TRACK + CRANE_LOCK) cr.sx -= 2 * sp * DT
    if (cr.sx > -80) st.cr[live++] = cr
  }
  st.cr.length = live
  live = 0
  for (const s of st.st) if (n - s.n0 < STEAM_CHARGE + STEAM_FIRE) st.st[live++] = s
  st.st.length = live

  if (st.grace > 0 || st.wh > 0) return finish(st)

  // Hits.
  for (let i = lower(c.yarns, d - 200); i < c.yarns.length && c.yarns[i].x <= d + 200; i++) {
    const [ax, ay, bx, by] = yarnEnds(c.yarns[i], n)
    const s2 = segD2(d, y, ax, ay, bx, by), e1 = (d - ax) * (d - ax) + (y - ay) * (y - ay), e2 = (d - bx) * (d - bx) + (y - by) * (y - by)
    const rs = R + YARN_W, rb = R + BALL_R
    if (s2 < rs * rs || e1 < rb * rb || e2 < rb * rb) { hurt(st, world, 'yarn'); if (!st.alive || st.grace) return finish(st) }
    else if (st.got) { const near = s2 - (rs + 40) * (rs + 40); if (near < 0) st.shave = Math.min(st.shave, nearGap(s2, rs)) }
  }
  for (const cr of st.cr) {
    if (n - cr.n0 < CRANE_TRACK + CRANE_LOCK) continue
    const dx = cr.sx - PX, dy = cr.y - y
    if (dx * dx + dy * dy < (R + 16) * (R + 16)) { hurt(st, world, 'crane'); if (!st.alive || st.grace) return finish(st) }
  }
  for (const s of st.st) {
    const age = n - s.n0
    if (age < STEAM_CHARGE) continue
    for (const ly of s.lanes) {
      const g = Math.abs(y - ly) - (STEAM_HALF + R - 8)
      if (g < 0) { hurt(st, world, 'steam'); if (!st.alive || st.grace) return finish(st) }
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
  if (st.alive && st.n >= MAX_TICKS) { st.alive = false; st.end = st.n; st.cause = 'time' }
  return st
}

// Replays a thrust log: { t: ticks where the button flipped (starting released), w: ticks the whistle was pressed }.
// Stops at the first bonk, at `upto` ticks (a run the player ended themselves) or at MAX_TICKS.
export function replay(seed, log, opts = {}, upto = MAX_TICKS) {
  const world = makeWorld(seed, opts), st = newRun()
  const t = log?.t || [], w = log?.w || []
  let ti = 0, wi = 0, held = false
  const cap = Math.min(upto, MAX_TICKS)
  while (st.alive && st.n < cap) {
    while (ti < t.length && t[ti] <= st.n) { held = !held; ti++ }
    let wh = false
    while (wi < w.length && w[wi] <= st.n) { wh = true; wi++ }
    step(st, world, held, wh)
  }
  if (st.alive) st.end = st.n
  return st
}

// Records a run's inputs as a log (what the client sends with its result).
export function recorder() {
  const log = { t: [], w: [] }
  let held = false
  return {
    log,
    input(st, h, wh) { if (h !== held) { log.t.push(st.n); held = h } if (wh) log.w.push(st.n) },
  }
}
