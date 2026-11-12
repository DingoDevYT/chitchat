// Shared bits for the SIM minigames Lantern Lift, Teacup Tap and Owl Says: an integer rng (the same mulberry32 as
// rng.js, returning whole numbers so nothing depends on float division), a per-seat bot seed, and the input-log
// checks. Everything that decides a score uses only + - * / and floor on integers.

export function irng(seed) {
  let a = seed >>> 0
  return n => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
}

// A bot's own rng: (game seed, seat, a per-minigame salt), so every client draws the same bot run.
export const botSeed = (seed, seat, salt) => ((seed >>> 0) ^ Math.imul(seat + salt, 0x9e3779b1)) >>> 0

// A log of [tick, value] pairs, ticks strictly increasing inside [0, ticks), value a whole number in [0, maxValue].
export function validPairs(log, ticks, maxValue, maxLen) {
  if (!Array.isArray(log) || log.length > maxLen) return false
  let last = -1
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 2) return false
    const [t, v] = e
    if (!Number.isInteger(t) || !Number.isInteger(v) || t <= last || t < 0 || t >= ticks || v < 0 || v > maxValue) return false
    last = t
  }
  return true
}

// People can't post a run before the minigame's clock has run out (plus slack for clock drift).
export const CLOCK_SLACK_MS = 15000
export const tooEarly = (ctx, durationMs) => !ctx.bot && ctx.startAt != null && ctx.now != null && ctx.now + CLOCK_SLACK_MS < ctx.startAt + durationMs
