// Lantern Lift (SIM, about 27 s, free-for-all): three paper lanterns, one after another. Hold to fill each one with
// warm air, let go, and it drifts up and slows to a stop. Stop inside the gold band to score big (closest to the gold
// line scores most); float above the band and the lantern bursts for nothing; fall short and it scores a little for
// the height it reached. Every lantern has its own gold line and its own burner (some fill faster than others).
//
// The Chatterflies pattern, like Wishfall Catch: an integer-only sim (+ - * and floor), 30 ticks a second from the
// shared start. A run's input is a log of [tick, 1 = pressed | 0 = let go] changes; only the first press and the
// first let-go of each lantern count. A player posts { type: 'mini', log, score }; the referee replays the log and
// keeps its own score. Bots' runs follow from (seed, seat, level) alone (botLog), so every client draws the same ghosts.
import { botSeed, irng, tooEarly, validPairs } from './simkit.js'

export const id = 'lift'
export const kind = 'sim'

export const HZ = 30
export const SEG = 270 // ticks per lantern (9 s)
export const LANTERNS = 3
export const TICKS = SEG * LANTERNS // 810
export const SKY = 1000 // height units shown on screen (the sim keeps 16ths of a unit)
export const BAND = 50 // the gold band is gold +- BAND
export const LATE = SEG - 80 // a lantern still held here lets go by itself, so it can stop before the next one
const HEAT_MAX = 240
const COOL = 6
const MAX_LOG = 400
export const duration = () => Math.ceil(TICKS * 1000 / HZ)

// The three lanterns: gold line height and burner strength (heat per held tick).
export function makeLanterns(seed) {
  const r = irng(seed), out = []
  for (let i = 0; i < LANTERNS; i++) out.push({ gold: 380 + r(400), puff: 3 + r(3) })
  return out
}

// Points for one lantern: 60-100 inside the band (100 on the line), 0 for a burst, up to 50 for the height reached.
export function points(y, gold, burst) {
  if (burst) return 0
  const d = y > gold ? y - gold : gold - y
  if (d <= BAND) return 100 - Math.floor(d * 40 / BAND)
  return Math.floor(y * 50 / (gold - BAND))
}

const freshLantern = () => ({ ph: 'wait', heat: 0, vy: 0, Y: 0, y: 0 })
export const newRun = () => ({ n: 0, down: 0, k: 0, L: freshLantern(), res: [], score: 0 })

function settle(st, lan, burst) {
  const L = st.L
  L.ph = 'done'
  const p = points(L.y, lan.gold, burst)
  st.res.push({ y: L.y, burst: burst ? 1 : 0, p })
  st.score += p
}

// One tick. st.down is the input for this tick.
export function step(st, lans) {
  const k = Math.floor(st.n / SEG), s = st.n - k * SEG
  if (k !== st.k) { st.k = k; st.L = freshLantern() }
  const L = st.L, lan = lans[k]
  if (L.ph === 'wait' && st.down && s < LATE) L.ph = 'hold'
  if (L.ph === 'hold' && (!st.down || s >= LATE)) L.ph = 'rise'
  if (L.ph === 'hold' || L.ph === 'rise') {
    L.heat = L.ph === 'hold' ? Math.min(HEAT_MAX, L.heat + lan.puff) : Math.max(0, L.heat - COOL)
    L.vy += Math.floor(L.heat / 16) - 4
    L.vy -= Math.floor(L.vy / 16)
    if (L.vy > 240) L.vy = 240
    if (L.vy < -64) L.vy = -64
    L.Y += L.vy
    if (L.Y < 0) { L.Y = 0; if (L.vy < 0) L.vy = 0 }
    L.y = Math.floor(L.Y / 16)
    if (L.y > lan.gold + BAND) settle(st, lan, true)
    else if (L.ph === 'rise' && L.vy <= 0) settle(st, lan, false)
  }
  if (s === SEG - 1 && L.ph !== 'done') settle(st, lan, false) // never pressed (or somehow still going): scores where it is
  st.n++
}

// Replay a log: [[tick, 0|1], ...], ticks strictly increasing. onTick (optional) sees the state after every tick.
export function replay(seed, log, lans = makeLanterns(seed), onTick) {
  const st = newRun()
  let j = 0
  while (st.n < TICKS) {
    while (j < log.length && log[j][0] <= st.n) st.down = log[j++][1]
    step(st, lans)
    if (onTick) onTick(st)
  }
  return st
}

export const validLog = log => validPairs(log, TICKS, 1, MAX_LOG)

// How high a lantern stops after holding for h ticks (a burst reports the height it burst at).
export function apexFor(lan, h) {
  const st = newRun(), lans = [lan]
  st.down = 1
  while (st.n < SEG && st.res.length === 0) {
    if (st.n === h) st.down = 0
    step(st, lans)
  }
  return st.res[0]
}

// ── Chitbots ──
// When they start pressing (ticks into the lantern), how far off their release can be, and how often they get
// greedy (hold a few ticks longer, aiming at the top of the band).
export const LEVELS = {
  easy: { start: 40, wait: 50, noise: 7, greedy: 300 },
  normal: { start: 25, wait: 30, noise: 3, greedy: 120 },
  hard: { start: 15, wait: 20, noise: 1, greedy: 30 },
}

// The best hold for a lantern: the length whose stop lands closest to the gold line without bursting.
export function bestHold(lan) {
  let best = 1, bestD = 1e9
  for (let h = 1; h < LATE - 20; h++) {
    const r = apexFor(lan, h)
    if (r.burst) break
    const d = Math.abs(r.y - lan.gold)
    if (d < bestD) { bestD = d; best = h }
  }
  return best
}

export function botLog(seed, seat, level) {
  const L = LEVELS[level] || LEVELS.normal, r = irng(botSeed(seed, seat, 23)), lans = makeLanterns(seed), log = []
  lans.forEach((lan, k) => {
    let h = bestHold(lan) + r(2 * L.noise + 1) - L.noise
    if (r(1000) < L.greedy) h += 2 + r(4)
    h = Math.max(1, h)
    const at = k * SEG + L.start + r(L.wait)
    log.push([at, 1], [Math.min(k * SEG + LATE - 1, at + h), 0])
  })
  return { st: replay(seed, log, lans), log }
}

// ── the minigame interface (see count.js) ──
export function begin(players, rand) {
  return { pub: { seed: Math.floor(rand() * 2 ** 32), players: [...players] }, secret: {} }
}

export function submit(state, pid, m, ctx = {}) {
  if (!validLog(m?.log)) throw new Error("That lantern run doesn't make sense.")
  if (tooEarly(ctx, duration())) throw new Error('The lanterns are still up.')
  const st = replay(state.seed, m.log)
  const e = { score: st.score, res: st.res }
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
