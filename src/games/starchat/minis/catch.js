// Wishfall Catch (SIM, 30 s, free-for-all): slide a jam-jar basket left and right under a falling sky. Big stars +3,
// stardust +1, dud clouds knock 2 off (never below 0). Everyone plays the same sky (one public seed) at once.
//
// The Jetpack Dash pattern: the sky and the basket are a pure, integer-only sim (+ - * and floor, no Math.sin or
// floats deciding anything), stepped at 30 ticks a second from the shared start. A run's input is a log of
// [tick, target x] changes; the basket glides toward its target at a fixed speed. A player posts
// { type: 'mini', log, score }; the referee replays the log and keeps the replayed score, so a claimed score never
// counts by itself. Bots' runs follow from (seed, seat, level) alone (botLog), so every client draws the same ghost.
export const id = 'catch'
export const kind = 'sim'

export const HZ = 30
export const TICKS = 30 * HZ // 900
export const W = 1000 // field width in sim units
export const EDGE = 60 // the basket's centre stays within [EDGE, W - EDGE]
export const SPEED = 24 // units per tick
export const REACH = 66 // |object x - basket x| at landing to catch it
export const LAND = 520 // the basket's line, in view units (for drawing only)
export const VALUE = { big: 3, dust: 1, cloud: -2 }
export const duration = () => Math.ceil(TICKS * 1000 / HZ)
const MAX_LOG = 4000
const CLOCK_SLACK_MS = 15000

// The same mulberry32 as rng.js, but returning integers so nothing depends on float division.
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

// The sky: every object { k, x, t0 (tick it appears at the top), arr (tick it reaches the basket line) }, by arr.
export function makeSky(seed) {
  const r = irng(seed), out = []
  let t = 10
  while (t < TICKS - 40) {
    const fall = 42 + r(30), roll = r(100)
    const k = roll < 16 ? 'big' : roll < 72 ? 'dust' : 'cloud'
    const x = EDGE - 20 + r(W - 2 * EDGE + 40)
    if (t + fall < TICKS) out.push({ k, x, t0: t, arr: t + fall })
    t += 3 + r(Math.max(4, 11 - Math.floor(t / 150))) // the sky gets busier as the half-minute runs on
  }
  return out.sort((a, b) => a.arr - b.arr || a.x - b.x)
}

export const newRun = () => ({ n: 0, x: W / 2, tgt: W / 2, score: 0, big: 0, dust: 0, cloud: 0, i: 0, ev: [] })
const clampX = x => Math.max(EDGE, Math.min(W - EDGE, x))

// One tick: glide toward the target, then anything landing this tick is caught if it's over the basket.
export function step(st, sky) {
  const d = clampX(st.tgt) - st.x
  st.x += d > SPEED ? SPEED : d < -SPEED ? -SPEED : d
  st.n++
  while (st.i < sky.length && sky[st.i].arr < st.n) st.i++
  while (st.i < sky.length && sky[st.i].arr === st.n) {
    const o = sky[st.i]
    const dx = o.x - st.x
    if (dx <= REACH && dx >= -REACH) {
      st[o.k]++
      st.score = Math.max(0, st.score + VALUE[o.k])
      st.ev.push(st.i)
    }
    st.i++
  }
}

// Replay a log: [[tick, x], ...], ticks strictly increasing. onTick (optional) sees the state after every tick.
export function replay(seed, log, sky = makeSky(seed), onTick) {
  const st = newRun()
  let j = 0
  while (st.n < TICKS) {
    while (j < log.length && log[j][0] <= st.n) st.tgt = log[j++][1]
    step(st, sky)
    if (onTick) onTick(st)
  }
  return st
}

export function validLog(log) {
  if (!Array.isArray(log) || log.length > MAX_LOG) return false
  let last = -1
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 2) return false
    const [t, x] = e
    if (!Number.isInteger(t) || !Number.isInteger(x) || t <= last || t < 0 || t >= TICKS || x < 0 || x > W) return false
    last = t
  }
  return true
}

// ── Chitbots ──
// Reaction delay (ticks between looks), how far ahead they look, aim noise, how often they slip (per mille), and
// whether they bother about clouds.
export const LEVELS = {
  easy: { react: 18, look: 30, noise: 85, slip: 110, careless: true },
  normal: { react: 9, look: 50, noise: 40, slip: 45 },
  hard: { react: 3, look: 75, noise: 10, slip: 12 },
}
const botSeed = (seed, seat) => ((seed >>> 0) ^ Math.imul(seat + 11, 0x9e3779b1)) >>> 0

// Look ahead for the best reachable good object that isn't shadowed by a cloud; else step out from under a cloud.
function choose(st, sky, L, r) {
  let best = null, bestV = -1
  for (let i = st.i; i < sky.length && sky[i].arr <= st.n + L.look; i++) {
    const o = sky[i], dt = o.arr - st.n
    if (o.k === 'cloud' || dt < 2) continue
    if (Math.abs(o.x - st.x) > SPEED * (dt - 1)) continue
    const shadow = !L.careless && sky.some(c => c.k === 'cloud' && Math.abs(c.arr - o.arr) <= 2 && Math.abs(c.x - o.x) < REACH)
    if (shadow) continue
    const v = Math.floor(VALUE[o.k] * 1000 / (dt + 12))
    if (v > bestV) { bestV = v; best = o }
  }
  if (best) return best.x + r(2 * L.noise + 1) - L.noise
  if (!L.careless) for (let i = st.i; i < sky.length && sky[i].arr <= st.n + L.react + 12; i++) {
    const c = sky[i]
    if (c.k === 'cloud' && Math.abs(c.x - st.x) <= REACH) return c.x < st.x ? c.x + 2 * REACH + 10 : c.x - 2 * REACH - 10
  }
  return st.tgt
}

// A bot's whole run: { st, log } in the same shape a player's client posts.
export function botLog(seed, seat, level) {
  const L = LEVELS[level] || LEVELS.normal, r = irng(botSeed(seed, seat)), sky = makeSky(seed)
  const st = newRun(), log = []
  while (st.n < TICKS) {
    if (st.n % L.react === 0) {
      let t = clampX(choose(st, sky, L, r))
      if (r(1000) < L.slip) t = clampX(EDGE + r(W - 2 * EDGE))
      if (t !== st.tgt) { st.tgt = t; log.push([st.n, t]) }
    }
    step(st, sky)
  }
  return { st, log }
}

// ── the minigame interface (see count.js) ──
export function begin(players, rand) {
  return { pub: { seed: Math.floor(rand() * 2 ** 32), players: [...players] }, secret: {} }
}

const total = st => ({ score: st.score, big: st.big, dust: st.dust, cloud: st.cloud })

// ctx: { now, startAt, bot }. People can't post a run before the sky has finished falling (plus clock slack).
export function submit(state, pid, m, ctx = {}) {
  if (!validLog(m?.log)) throw new Error("That basket run doesn't make sense.")
  if (!ctx.bot && ctx.startAt != null && ctx.now != null && ctx.now + CLOCK_SLACK_MS < ctx.startAt + duration()) throw new Error('The stars are still falling.')
  const st = replay(state.seed, m.log)
  const e = total(st)
  if (m.score !== st.score) e.fixed = true // the replay disagreed with the client's number; the replay counts
  return e
}

export const timeoutEntry = null

// rand is unused on purpose: the run must be the one every client draws as the bot's ghost.
export function bot(state, pid, level) {
  const seat = Math.max(0, state.players.indexOf(pid))
  const { st, log } = botLog(state.seed, seat, level)
  return { type: 'mini', log, score: st.score }
}

export function finish(state, secret, entries) {
  const scores = {}, runs = {}
  for (const [pid, e] of Object.entries(entries)) {
    scores[pid] = e ? e.score : -1
    runs[pid] = e
  }
  return { scores, bonus: {}, reveal: { runs } }
}
