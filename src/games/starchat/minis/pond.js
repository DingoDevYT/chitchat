// Pond Skippers (SIM, 20 s, free-for-all): flick three stones across the moonlit pond. Aim and power decide where each
// hop lands: a stone that lands on a drifting lily pad bounces on with a bit more speed, one that lands on a rock or
// in the reeds stops, one that reaches the far bank scores a bonus. Everyone skips on the same pond (one public seed).
//
// The Wishfall Catch pattern (see catch.js): the pond and every throw are a pure, integer-only sim (+ - * and
// Math.floor only), so a run's whole input is its throw log [[tick, aim, power], ...]. A player posts
// { type: 'mini', log, score }; the referee replays the log and keeps the replayed score. Bots' throws follow from
// (seed, seat, level) alone (botLog), so every client draws the same ghost stones.
export const id = 'pond'
export const kind = 'sim'

export const HZ = 30
export const TICKS = 20 * HZ // 600
export const STONES = 3
export const GAP = 30 // ticks between throws (one second), so a stone is well on its way before the next
export const W = 1000 // pond width, sim units
export const L = 1000 // the far bank's line
export const X0 = 500, Y0 = 40 // where every stone leaves the near bank
export const AIM = 90 // aim: sideways units per 100 forward, -AIM..AIM
export const PMIN = 10, PMAX = 100
export const HOP_T = 4 // ticks a hop takes (when the lily pads are checked, and for drawing)
export const MINV = 12 // slower than this and the stone sinks
export const PAD_R = 46, ROCK_R = 34
export const POINTS = { per10: 1, skip: 4, pad: 6, bank: 20 }
export const duration = () => Math.ceil(TICKS * 1000 / HZ)
const CLOCK_SLACK = 15 * HZ // ticks of clock slack for a throw stamped ahead of the referee's clock
const MAX_HOPS = 40

// The same integer mulberry32 as catch.js.
function irng(seed) {
  let a = seed >>> 0
  return n => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

// The pond: lily pads that drift side to side (a triangle wave in whole units) and still rocks.
export function makePond(seed) {
  const r = irng(seed)
  const pads = [], rocks = []
  for (let i = 0; i < 7; i++) {
    const y = 200 + i * 105 + r(50)
    const span = 80 + r(240), bx = 120 + r(W - 240 - span)
    pads.push({ y, bx, span, sp: 2 + r(5), ph: r(2 * span) })
  }
  for (let i = 0; i < 4; i++) rocks.push({ x: 260 + r(W - 520), y: 230 + i * 170 + r(70) })
  return { pads, rocks }
}

export function padX(p, t) {
  const q = (t * p.sp + p.ph) % (2 * p.span)
  return p.bx + (q < p.span ? q : 2 * p.span - q)
}

const near = (dx, dy, r) => dx * dx + dy * dy <= r * r

// One throw: { hops: [{ x, y, t, on }] (on: 'water' | 'pad' | 'rock' | 'reeds' | 'bank' | 'sink'), skips, pads, end,
// dist, score }. Hop k lands at tick t + HOP_T * (k + 1).
export function fling(pond, t, aim, power) {
  let v = 24 + Math.floor(power * 66 / 100), x = X0, y = Y0, skips = 0, padsHit = 0, end = 'sink'
  const hops = []
  for (let k = 0; k < MAX_HOPS; k++) {
    const dy = v * 2
    x += Math.floor(dy * aim / 100)
    y += dy
    const at = t + HOP_T * (k + 1)
    if (y >= L) { y = L; end = 'bank'; hops.push({ x, y, t: at, on: 'bank' }); break }
    if (x < 0 || x > W) { end = 'reeds'; hops.push({ x, y, t: at, on: 'reeds' }); break }
    if (pond.rocks.some(o => near(o.x - x, o.y - y, ROCK_R))) { end = 'rock'; hops.push({ x, y, t: at, on: 'rock' }); break }
    if (pond.pads.some(p => near(padX(p, at) - x, p.y - y, PAD_R))) { padsHit++; v += 4; hops.push({ x, y, t: at, on: 'pad' }); continue }
    v = Math.floor(v * 3 / 4) - 1
    if (v < MINV) { hops.push({ x, y, t: at, on: 'sink' }); break }
    skips++
    hops.push({ x, y, t: at, on: 'water' })
  }
  const dist = y - Y0
  const score = Math.floor(dist / 10) * POINTS.per10 + skips * POINTS.skip + padsHit * POINTS.pad + (end === 'bank' ? POINTS.bank : 0)
  return { hops, skips, pads: padsHit, end, dist, score }
}

export function replay(seed, log, pond = makePond(seed)) {
  const throws = log.map(([t, aim, power]) => fling(pond, t, aim, power))
  return { throws, score: throws.reduce((a, b) => a + b.score, 0) }
}

export function validLog(log) {
  if (!Array.isArray(log) || log.length > STONES) return false
  let last = -GAP
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 3 || !e.every(Number.isInteger)) return false
    const [t, aim, power] = e
    if (t < 0 || t >= TICKS || t - last < GAP || aim < -AIM || aim > AIM || power < PMIN || power > PMAX) return false
    last = t
  }
  return true
}

// ── Chitbots ──
// When they throw, how finely they search aims and powers (0: no search), and how far their hand shakes.
export const LEVELS = {
  easy: { search: 0, shakeA: 30, shakeP: 45 },
  normal: { search: 1, aStep: 10, pStep: 15, waits: [0, 9], shakeA: 7, shakeP: 10 },
  hard: { search: 2, aStep: 5, pStep: 6, waits: [0, 5, 10, 15, 20], shakeA: 2, shakeP: 3 },
}
const botSeed = (seed, seat) => ((seed >>> 0) ^ Math.imul(seat + 29, 0x85ebca6b)) >>> 0
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function botLog(seed, seat, level) {
  const Lv = LEVELS[level] || LEVELS.normal, r = irng(botSeed(seed, seat)), pond = makePond(seed)
  const log = []
  for (let i = 0; i < STONES; i++) {
    const t0 = 45 + i * 150 + r(40)
    let best = { t: t0, aim: r(2 * AIM + 1) - AIM, power: 40 + r(61), score: -1 }
    if (Lv.search) {
      for (const w of Lv.waits) for (let aim = -AIM; aim <= AIM; aim += Lv.aStep) for (let power = PMIN; power <= PMAX; power += Lv.pStep) {
        const s = fling(pond, t0 + w, aim, power).score
        if (s > best.score) best = { t: t0 + w, aim, power, score: s }
      }
    }
    const aim = clamp(best.aim + r(2 * Lv.shakeA + 1) - Lv.shakeA, -AIM, AIM)
    const power = clamp(best.power + r(2 * Lv.shakeP + 1) - Lv.shakeP, PMIN, PMAX)
    log.push([best.t, aim, power])
  }
  return { log, score: replay(seed, log, pond).score }
}

// ── the minigame interface (see count.js) ──
export function begin(players, rand) {
  return { pub: { seed: Math.floor(rand() * 2 ** 32), players: [...players] }, secret: {} }
}

// ctx: { now, startAt, bot }. A throw can't be stamped later than the referee's clock allows (plus slack).
export function submit(state, pid, m, ctx = {}) {
  if (!validLog(m?.log)) throw new Error("Those throws don't make sense.")
  if (!ctx.bot && ctx.startAt != null && ctx.now != null && m.log.length) {
    const elapsed = Math.floor((ctx.now - ctx.startAt) * HZ / 1000)
    if (m.log.at(-1)[0] > elapsed + CLOCK_SLACK) throw new Error("That stone hasn't been thrown yet.")
  }
  const { throws, score } = replay(state.seed, m.log)
  const e = { score, throws: throws.map(t => ({ score: t.score, skips: t.skips, pads: t.pads, end: t.end, dist: t.dist })) }
  if (m.score !== score) e.fixed = true // the replay disagreed with the client's number; the replay counts
  return e
}

export const timeoutEntry = null

// rand is unused on purpose: the throws must be the ones every client draws as the bot's ghost.
export function bot(state, pid, level) {
  const seat = Math.max(0, state.players.indexOf(pid))
  const { log, score } = botLog(state.seed, seat, level)
  return { type: 'mini', log, score }
}

export function finish(state, secret, entries) {
  const scores = {}, runs = {}
  for (const [pid, e] of Object.entries(entries)) {
    scores[pid] = e ? e.score : -1
    runs[pid] = e
  }
  return { scores, bonus: {}, reveal: { runs } }
}
