// Chatterflies look-ahead: a small search over button presses (the tests use it to prove every chunk can be flown)
// and the Chitbot pilots built on it. Pure and seeded: a bot's whole run follows from (seed, seat, level), so the
// referee, the browser drawing its ghost and the tests all see the same flight.
import { rng } from '../rng.js'
import { BOT, TOP, MAX_TICKS, VEHICLES, chunkOf, clone, makeWorld, metres, newRun, step } from './course.js'

const MID = (TOP + BOT) / 2
const VI = Object.fromEntries(VEHICLES.map((v, i) => [v, i + 1]))

// Depth-first search over blocks of `block` ticks (button held or not for the whole block), up to `horizon` ticks.
// States are bucketed by (depth, height, speed, vehicle) so the search stays polynomial. Any path it returns was
// really simulated, so "found" is a proof; the bucketing can only make it miss a path, never invent one.
// strict: a shielded hit (vehicle, Second Brew) counts as a crash, so a found path touches nothing at all.
export function search(world, st0, horizon, { block = 5, maxNodes = 20000, target = MID, strict = true } = {}) {
  const levels = Math.ceil(horizon / block)
  const seen = new Set(), path = []
  let nodes = 0, best = [], bestDepth = -1
  const rec = (st, depth) => {
    if (depth >= levels) return true
    if (++nodes > maxNodes) return false
    const first = st.y > target
    for (let o = 0; o < 2; o++) {
      const h = o === 0 ? first : !first
      const s = clone(st)
      s.strict = strict
      for (let i = 0; i < block && s.alive; i++) step(s, world, h)
      if (!s.alive) continue
      const key = depth * 1e7 + Math.round(s.y / 6) * 1e4 + Math.round(s.vy / 75 + 50) * 100 + (s.veh ? VI[s.veh] : 0) * 2 + (s.flip < 0 ? 1 : 0)
      if (seen.has(key)) continue
      seen.add(key)
      path[depth] = h
      if (depth > bestDepth) { bestDepth = depth; best = path.slice(0, depth + 1) }
      if (rec(s, depth + 1)) return true
    }
    return false
  }
  const ok = rec(st0, 0)
  return { ok, path: ok ? path.slice(0, levels) : best, nodes }
}

// Difficulty: reaction delay (ticks of carrying on with a stale plan after a slip), how far ahead they look, and how
// often they slip (rising with distance, so every bot lands eventually). Easy bots chase sprinkles into trouble.
export const LEVELS = {
  easy: { react: 21, horizon: 50, slip: 0.004, tire: 350, greedy: 1 },
  normal: { react: 12, horizon: 65, slip: 0.0025, tire: 550, greedy: 0.6 },
  hard: { react: 6, horizon: 85, slip: 0.0015, tire: 850, greedy: 0.3 },
}
const BLOCK = 5, NODES = 2500
const WHISTLE_SPR = 40 // bots fill the Kettle Whistle with sprinkles only (they don't talk), as a quiet person would

// The next sprinkle ahead (a target height to steer towards), else hold the middle.
function aim(world, st, greedy, rand) {
  const c = world.chunk(chunkOf(st.d + 300))
  for (const s of c.spr) if (s.x > st.d + 60 && s.x < st.d + 300 + 400 * greedy) return s.y
  return rand() < 0.5 ? MID : st.y
}

// A Chitbot at the controls: call next(st) before each tick for the button state; next.w is true on a tick it blows
// the Kettle Whistle (house rule on, meter full, and its look-ahead sees no clean way through the next half second).
export function pilot(world, level, seed, seat) {
  const L = LEVELS[level] || LEVELS.normal
  const rand = rng(((seed >>> 0) ^ Math.imul(seat + 7, 0x85ebca6b)) >>> 0)
  let plan = [], bi = 0, sub = 0, stale = 0, act = false, sprSeen = 0, meter = 0
  const next = st => {
    next.w = false
    if (st.spin || st.bub) { sub = 0; plan = []; bi = 0; return false } // nothing to steer
    if (world.opts.whistle && st.spr > sprSeen) { meter = Math.min(1, meter + (st.spr - sprSeen) / WHISTLE_SPR); sprSeen = st.spr }
    if (sub === 0) {
      // After a slip the old plan carries on for the reaction delay, then the bot notices and replans.
      if (stale > 0 && (stale -= BLOCK) <= 0) { plan = []; bi = 0 }
      if (stale <= 0 && plan.length - bi < Math.ceil(L.horizon / BLOCK / 2)) {
        const r = search(world, st, L.horizon, { block: BLOCK, maxNodes: NODES, target: aim(world, st, L.greedy, rand) })
        plan = r.path; bi = 0
        if (!r.ok && world.opts.whistle && meter >= 1 && st.wc === 0 && st.wh === 0 && r.path.length * BLOCK < 30) { next.w = true; meter = 0 }
      }
      act = bi < plan.length ? plan[bi++] : st.y > MID
      const m = metres(st)
      if (stale <= 0 && rand() < L.slip * (1 + (m / L.tire) * (m / L.tire))) { act = !act; stale = L.react }
    }
    sub = (sub + 1) % BLOCK
    return act
  }
  next.w = false
  return next
}

// A bot's whole run: { st, log } (log in the same shape a player's client sends). onTick(st) after every tick.
export function botRun(seed, seat, level, opts = {}, onTick = null) {
  const world = makeWorld(seed, opts), st = newRun({ bot: true }), next = pilot(world, level, seed, seat)
  const t = [], w = []
  let held = false
  while (st.alive && st.n < MAX_TICKS) {
    const h = next(st)
    if (h !== held) { t.push(st.n); held = h }
    if (next.w) w.push(st.n)
    step(st, world, h, next.w)
    if (onTick) onTick(st)
  }
  return { st, log: { t, w } }
}
