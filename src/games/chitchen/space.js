// Walking and hearing in the Chitchen: pure functions shared by the client (collisions, proximity voice, who you
// can see) and its tests. Map units; see map.js.
import { SPEED, W, H, walls, wallsBetween, dist, sightOf } from './map.js'

export const BODY = 0.35 // walker radius
export const HEAR = { full: 3.5, far: 9 } // full volume inside `full`, fading to nothing at `far`
export const HEAR_FLOUR = { full: 1.8, far: 4.5 } // flour storm: half the range, muffled
export const ghostly = s => s === 'nap' || s === 'home' // smashed or ejected: a ghost

// How far I can see right now (Infinity for ghosts and people watching: they see the whole bakery).
export function visionOf(v, me) {
  const s = v.status?.[me]
  if (!s || ghostly(s)) return Infinity
  return sightOf(v.me?.role, v.mischief?.kind === 'candles')
}

// The visibility polygon for the fog of war: `n` rays from p out to radius r, each stopping at the first wall
// (pushed `push` units past it, so the near face of the wall is lit). Returns [[x, y], …] round the circle.
export function sightPolygon(p, r, jam = false, n = 120, push = 0.2) {
  const ws = walls(jam), out = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a)
    let best = r
    for (const [x1, y1, x2, y2] of ws) {
      const ex = x2 - x1, ey = y2 - y1, d = dx * ey - dy * ex
      if (Math.abs(d) < 1e-9) continue
      const t = ((x1 - p[0]) * ey - (y1 - p[1]) * ex) / d, u = ((x1 - p[0]) * dy - (y1 - p[1]) * dx) / d
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = Math.min(r, t + push)
    }
    out.push([p[0] + dx * best, p[1] + dy * best])
  }
  return out
}

// Walking as a ghost: no walls, just the edges of the bakery.
export function drift([x, y], ix, iy, dt) {
  const len = Math.hypot(ix, iy)
  if (len > 1) { ix /= len; iy /= len }
  const s = SPEED * 1.25 * dt
  return [Math.min(W - BODY, Math.max(BODY, x + ix * s)), Math.min(H - BODY, Math.max(BODY, y + iy * s))]
}

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

// Can someone at a see b, with vision radius r (walls block sight)?
export const canSeeAt = (a, b, r, jam) => r === Infinity || (dist(a, b) <= r && wallsBetween(a, b, jam) === 0)

// Proximity voice: how loud (0..1) and how muffled (low-pass Hz) `them` sounds to `me`.
// v: the game view. pos: pid → [x, y]. Ghosts (smashed or ejected) can never be heard by the living, at any time
// until the game ends, but hear everyone themselves. At the role reveal and in meetings the living hear the whole
// table; during the night shift voices carry by distance and walls. Someone in voice who isn't playing is hushed for
// the players (no hints from the crowd), and hears everything.
export function hear(v, me, them, pos) {
  const st = id => v.status?.[id] ?? 'out'
  const a = st(me), b = st(them)
  if (a === 'out' || v.phase === 'end') return { gain: 1, lp: 20000 } // I'm watching, or it's over: everyone talks
  if (b === 'out') return { gain: v.phase === 'play' ? 0 : 1, lp: 20000 }
  if (ghostly(b)) return { gain: ghostly(a) ? 1 : 0, lp: 20000 }
  if (v.phase !== 'play') return { gain: 1, lp: 20000 }
  if (ghostly(a)) return { gain: 1, lp: 20000 } // ghosts hear the living, wherever they float
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

