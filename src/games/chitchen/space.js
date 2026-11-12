// Walking and hearing in the Chitchen: pure functions shared by the client (collisions, proximity voice, who you
// can see) and its tests. Map units; see map.js.
import { SPEED, W, H, walls, wallsBetween, dist } from './map.js'

export const BODY = 0.35 // walker radius
export const SEE = 7.5, SEE_DARK = 3.2 // how far your lamplight shows people (no walls between)
export const HEAR = { full: 3.5, far: 9 } // full volume inside `full`, fading to nothing at `far`
export const HEAR_FLOUR = { full: 1.8, far: 4.5 } // flour storm: half the range, muffled

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
// How much a walker at (x, y) overlaps the walls (0 = free). Walls are 0.25 thick.
export function overlap(x, y, jam = false) {
  let worst = 0
  for (const w of walls(jam)) worst = Math.max(worst, BODY + 0.125 - segDist(x, y, ...w))
  return worst
}
// One movement step: input (ix, iy) in -1..1 (length ≤ 1), dt seconds. Slides along walls axis by axis, and lets you
// walk out if you're already stuck (a pantry door just jammed on you).
export function step([x, y], ix, iy, dt, jam = false) {
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len }
  const s = SPEED * dt, now = overlap(x, y, jam)
  const ok = (nx, ny) => { const o = overlap(nx, ny, jam); return o <= 0 || o < now - 1e-6 }
  const nx = Math.min(W - BODY, Math.max(BODY, x + ix * s))
  if (ok(nx, y)) x = nx
  const ny = Math.min(H - BODY, Math.max(BODY, y + iy * s))
  if (ok(x, ny)) y = ny
  return [x, y]
}

export const canSeeAt = (a, b, dark, jam) => dist(a, b) <= (dark ? SEE_DARK : SEE) && wallsBetween(a, b, jam) === 0

// Proximity voice: how loud (0..1) and how muffled (low-pass Hz) `them` sounds to `me`.
// v: the game view. pos: pid → [x, y]. Outside the night shift (apron, Tea Breaks, the end) everyone hears the table,
// except that nobody hears nappers (they watch from the upstairs window). During the shift nappers hear only nappers,
// people who've gone home hear everything and are heard by nobody but each other, and someone in voice who isn't
// playing is hushed for the players (no hints from the crowd).
export function hear(v, me, them, pos) {
  const st = id => v.status?.[id] ?? 'out'
  const a = st(me), b = st(them)
  if (a === 'out') return { gain: 1, lp: 20000 } // I'm watching, not playing
  if (b === 'out') return { gain: v.phase === 'play' ? 0 : 1, lp: 20000 }
  if (b === 'home') return { gain: a === 'home' ? 1 : 0, lp: 20000 }
  if (a === 'home') return { gain: 1, lp: 20000 }
  if (v.phase !== 'play') return { gain: b === 'nap' && v.phase !== 'end' ? 0 : 1, lp: 20000 }
  if ((a === 'nap') !== (b === 'nap')) return { gain: 0, lp: 20000 }
  const p = pos[me], q = pos[them]
  if (!p || !q) return { gain: 0, lp: 20000 }
  const flour = v.mischief?.kind === 'flour', jam = v.mischief?.kind === 'jam'
  const R = flour ? HEAR_FLOUR : HEAR
  const d = dist(p, q)
  let gain = d <= R.full ? 1 : d >= R.far ? 0 : 1 - (d - R.full) / (R.far - R.full)
  gain *= gain // eases out
  const n = gain > 0 ? wallsBetween(p, q, jam) : 0
  gain *= 0.4 ** n
  let lp = n ? 1400 / n : 20000
  if (flour) lp = Math.min(lp, 800)
  return { gain: +gain.toFixed(3), lp: Math.round(lp) }
}

// ---- walking together (net.js): interpolation and send throttling -------------------------------------------
export const SEND_MS = 100, BEHIND_MS = 120

// Interpolation buffer for one remote walker (pure, tested).
export function makeTrack() {
  const buf = []
  return {
    push(s) { // s: { t (local ms), x, y, f }
      if (buf.length && s.t <= buf[buf.length - 1].t) return
      buf.push(s); if (buf.length > 12) buf.shift()
    },
    at(t) {
      if (!buf.length) return null
      const want = t - BEHIND_MS
      if (want <= buf[0].t) return buf[0]
      for (let i = buf.length - 1; i > 0; i--) {
        const a = buf[i - 1], b = buf[i]
        if (want >= a.t && want <= b.t) { const k = (want - a.t) / (b.t - a.t || 1); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: k < 0.5 ? a.f : b.f, moving: true } }
      }
      const last = buf[buf.length - 1]
      return { ...last, moving: t - last.t < 300 }
    },
    last: () => buf[buf.length - 1] || null,
  }
}

// Throttle for our own sends (pure, tested): send if moved and SEND_MS passed, or 1 s heartbeat.
export function shouldSend(prev, cur, now) {
  if (!prev) return true
  const moved = Math.abs(prev.x - cur.x) + Math.abs(prev.y - cur.y) > 0.01 || prev.f !== cur.f
  return (moved && now - prev.t >= SEND_MS) || now - prev.t >= 1000
}

