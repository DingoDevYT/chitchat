// Teacup Tap (SIM, 20 s, free-for-all): teacups slide along the tea tray to the kettle's spout in time with a
// tune; tap as each cup arrives under the spout. On the beat (within 2 ticks) pours a full cup, +3; close (within 6
// ticks, a tenth of a second) +2; a tap with no cup under the spout spills, -1 (never below 0). The chart comes from
// the seed, so everyone plays the same tune.
//
// The log is just the ticks you tapped at (60 a second), counted from the shared start on your own clock, so network
// latency doesn't matter. A player posts { type: 'mini', log: [tick, ...], score }; the referee replays the taps
// against the chart and keeps its own score, so a claimed score never counts by itself. Integer-only.
import { botSeed, irng, tooEarly } from './simkit.js'

export const id = 'tap'
export const kind = 'sim'

export const HZ = 60
export const TICKS = 20 * HZ // 1200
export const PERFECT = 2 // ticks either side of the beat for a full pour
export const GOOD = 6 // ticks either side for a close one
export const VALUE = { perfect: 3, good: 2, spill: -1 }
export const LEAD = 120 // ticks a cup takes to slide from the tray's edge to the spout (for drawing)
const MAX_LOG = 600
export const duration = () => Math.ceil(TICKS * 1000 / HZ)

// The chart: the tick each cup reaches the spout. A tempo from the seed, bars of four beats with rests and
// half-beat pairs, getting a little busier as it goes.
export function makeChart(seed) {
  const r = irng(seed), beat = [40, 36, 32][r(3)], out = []
  let t = 90, bar = 0
  while (t < TICKS - 50) {
    for (let b = 0; b < 4 && t < TICKS - 50; b++, t += beat) {
      const roll = r(100)
      const rest = roll < Math.max(8, 26 - bar * 3)
      const pair = !rest && roll > 92 - bar * 2
      if (!rest) out.push(t)
      if (pair && t + beat / 2 < TICKS - 50) out.push(t + beat / 2)
    }
    bar++
  }
  return out
}

export const newRun = () => ({ i: 0, last: -1, score: 0, perfect: 0, good: 0, spill: 0, miss: 0, hits: [] })

// One tap at tick t (taps strictly increasing). Cups whose window has passed are misses; the next cup within GOOD
// ticks is poured; anything else spills. hits: [cup index, 'perfect' | 'good'] for the view.
export function tap(st, chart, t) {
  while (st.i < chart.length && chart[st.i] + GOOD < t) { st.i++; st.miss++ }
  st.last = t
  const c = chart[st.i]
  const d = c == null ? GOOD + 1 : c > t ? c - t : t - c
  if (d <= PERFECT) { st.perfect++; st.score += VALUE.perfect; st.hits.push([st.i, 'perfect']); st.i++ }
  else if (d <= GOOD) { st.good++; st.score += VALUE.good; st.hits.push([st.i, 'good']); st.i++ }
  else { st.spill++; st.score = Math.max(0, st.score + VALUE.spill) }
}

// Count the cups that slid past without a tap (call at the end, or any time for a live tally).
export function settle(st, chart, now = TICKS) {
  while (st.i < chart.length && chart[st.i] + GOOD < now) { st.i++; st.miss++ }
  return st
}

export function replay(seed, log, chart = makeChart(seed)) {
  const st = newRun()
  for (const t of log) tap(st, chart, t)
  return settle(st, chart)
}

export function validLog(log) {
  if (!Array.isArray(log) || log.length > MAX_LOG) return false
  let last = -1
  for (const t of log) {
    if (!Number.isInteger(t) || t <= last || t < 0 || t >= TICKS) return false
    last = t
  }
  return true
}

// ── Chitbots ──
// Timing spread (ticks either side), how often they miss a cup or tap a stray (per mille).
export const LEVELS = {
  easy: { noise: 6, miss: 150, stray: 60 },
  normal: { noise: 3, miss: 50, stray: 20 },
  hard: { noise: 1, miss: 10, stray: 0 },
}

export function botLog(seed, seat, level) {
  const L = LEVELS[level] || LEVELS.normal, r = irng(botSeed(seed, seat, 37)), chart = makeChart(seed)
  const taps = new Set()
  for (const c of chart) {
    if (r(1000) < L.miss) continue
    taps.add(Math.max(0, Math.min(TICKS - 1, c + r(2 * L.noise + 1) - L.noise)))
    if (r(1000) < L.stray) taps.add(Math.min(TICKS - 1, c + 12 + r(6)))
  }
  const log = [...taps].sort((a, b) => a - b)
  return { st: replay(seed, log, chart), log }
}

// ── the minigame interface (see count.js) ──
export function begin(players, rand) {
  return { pub: { seed: Math.floor(rand() * 2 ** 32), players: [...players] }, secret: {} }
}

const total = st => ({ score: st.score, perfect: st.perfect, good: st.good, spill: st.spill, miss: st.miss })

export function submit(state, pid, m, ctx = {}) {
  if (!validLog(m?.log)) throw new Error("Those taps don't make sense.")
  if (tooEarly(ctx, duration())) throw new Error('The tune is still playing.')
  const st = replay(state.seed, m.log)
  const e = total(st)
  if (m.score !== st.score) e.fixed = true
  return e
}

export const timeoutEntry = null

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
