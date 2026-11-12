// The Chitchen, as data: a cozy six-room bakery on a 36 × 24 grid (1 unit ≈ one avatar's width).
// Pure JS shared by the rules (referee range checks, Chitbot walking) and, later, the client (drawing, collisions,
// proximity voice). Rooms are axis-aligned rectangles that tile the floor; walls run along their shared edges with
// door gaps. Nothing here is secret.

export const W = 36, H = 24
export const SPEED = 3.2 // units per second, everyone (sleepwalkers too)

export const ROOMS = [
  { id: 'pantry', name: 'Pantry', x: 0, y: 0, w: 12, h: 11 },
  { id: 'loft', name: 'Clock Loft', x: 12, y: 0, w: 12, h: 11 },
  { id: 'cellar', name: 'Jam Cellar', x: 24, y: 0, w: 12, h: 11 },
  { id: 'shop', name: 'Front Shop', x: 0, y: 11, w: 12, h: 13 },
  { id: 'kitchen', name: 'Kitchen', x: 12, y: 11, w: 12, h: 13 },
  { id: 'garden', name: 'Herb Garden', x: 24, y: 11, w: 12, h: 13 },
]

// Door gaps: [a, b, x1, y1, x2, y2] on the wall between rooms a and b. `pantry` doors stick during a pantry jam.
export const DOORS = [
  ['pantry', 'loft', 12, 4.5, 12, 6.5],
  ['loft', 'cellar', 24, 4.5, 24, 6.5],
  ['shop', 'kitchen', 12, 16.5, 12, 18.5],
  ['kitchen', 'garden', 24, 16.5, 24, 18.5],
  ['pantry', 'shop', 5, 11, 7, 11],
  ['loft', 'kitchen', 17, 11, 19, 11],
  ['cellar', 'garden', 29, 11, 31, 11],
].map(([a, b, x1, y1, x2, y2]) => ({ id: `${a}-${b}`, a, b, x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2 }))

// Chore spots. `kind` picks the mini-game (the client maps kinds to chores; several can share a kind later).
export const SPOTS = [
  { id: 'gerald', kind: 'gerald', name: 'Feed Gerald', room: 'pantry', x: 3, y: 3 },
  { id: 'sift', kind: 'sift', name: 'Sift the flour', room: 'pantry', x: 9, y: 8 },
  { id: 'clock', kind: 'clock', name: 'Wind the cuckoo clock', room: 'loft', x: 18, y: 2 },
  { id: 'jam', kind: 'jam', name: 'Sort the jam jars', room: 'cellar', x: 32, y: 3 },
  { id: 'knead', kind: 'knead', name: 'Knead the dough', room: 'shop', x: 4, y: 16 },
  { id: 'box', kind: 'box', name: 'Box the buns', room: 'shop', x: 7, y: 21 },
  { id: 'ice', kind: 'ice', name: 'Ice the buns', room: 'kitchen', x: 15, y: 14 },
  { id: 'herbs', kind: 'herbs', name: 'Snip the herbs', room: 'garden', x: 32, y: 20 },
]

// Fixed things you walk up to: the tea bell on the kitchen table, the fuse box (candles), the two oven dials (boil-over).
export const FIX = {
  bell: { x: 18, y: 18, room: 'kitchen' },
  fuse: { x: 2, y: 13, room: 'shop' },
  dialA: { x: 21, y: 13, room: 'kitchen' },
  dialB: { x: 34, y: 9, room: 'cellar' },
}
export const TABLE = { x: 18, y: 18, r: 2.6 } // everyone sits round it at a Tea Break and starts there after one

export const spot = id => SPOTS.find(s => s.id === id)
export const room = id => ROOMS.find(r => r.id === id)
export const roomAt = (x, y) => ROOMS.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const seatPos = (i, n) => {
  const a = Math.PI / 2 + (2 * Math.PI * i) / n
  return [+(TABLE.x + TABLE.r * Math.cos(a)).toFixed(2), +(TABLE.y + TABLE.r * Math.sin(a)).toFixed(2)]
}

// Wall segments [x1, y1, x2, y2]: the outside, plus the inner grid lines minus door gaps (minus nothing for doors
// that are stuck: pass jam = true to shut the pantry's two doors).
function cut(fixed, from, to, gaps, vertical) {
  const out = []
  let at = from
  for (const [g1, g2] of gaps.sort((p, q) => p[0] - q[0])) {
    if (g1 > at) out.push(vertical ? [fixed, at, fixed, g1] : [at, fixed, g1, fixed])
    at = g2
  }
  if (to > at) out.push(vertical ? [fixed, at, fixed, to] : [at, fixed, to, fixed])
  return out
}
const wallCache = {}
export function walls(jam = false) {
  if (wallCache[jam]) return wallCache[jam]
  const open = DOORS.filter(d => !(jam && (d.a === 'pantry' || d.b === 'pantry')))
  const gaps = (fixed, vertical) => open.filter(d => vertical ? d.x1 === fixed && d.x2 === fixed : d.y1 === fixed && d.y2 === fixed)
    .map(d => vertical ? [d.y1, d.y2] : [d.x1, d.x2])
  return (wallCache[jam] = [
    [0, 0, W, 0], [0, H, W, H], [0, 0, 0, H], [W, 0, W, H],
    ...cut(11, 0, W, gaps(11, false), false),
    ...cut(12, 0, H, gaps(12, true), true),
    ...cut(24, 0, H, gaps(24, true), true),
  ])
}

// How many walls the straight line a→b crosses (proximity voice muffling, Chitbot line of sight).
const cross = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (!d) return false
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
  return t > 0 && t < 1 && u >= 0 && u <= 1
}
export function wallsBetween(a, b, jam = false) {
  let n = 0
  for (const w of walls(jam)) if (cross(a[0], a[1], b[0], b[1], ...w)) n++
  return n
}
export const canSee = (a, b, range, jam = false) => dist(a, b) <= range && wallsBetween(a, b, jam) === 0

// Walking route from a point to a point: through door midpoints room by room (rooms are convex, so straight lines
// inside a room never cross a wall). Returns the points after `from`.
const ADJ = {}
for (const d of DOORS) { (ADJ[d.a] ||= []).push([d.b, d]); (ADJ[d.b] ||= []).push([d.a, d]) }
export function route(from, to, jam = false) {
  const r0 = roomAt(...from), r1 = roomAt(...to)
  if (!r0 || !r1 || r0 === r1) return [to]
  const prev = { [r0]: null }, q = [r0]
  while (q.length) {
    const r = q.shift()
    if (r === r1) break
    for (const [n, d] of ADJ[r] || []) {
      if (n in prev || (jam && (d.a === 'pantry' || d.b === 'pantry'))) continue
      prev[n] = [r, d]; q.push(n)
    }
  }
  if (!(r1 in prev)) return [from] // shut in (pantry jam): stay put
  const pts = [to]
  for (let r = r1; prev[r]; r = prev[r][0]) pts.unshift([prev[r][1].x, prev[r][1].y])
  return pts
}
export const pathLen = pts => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0)

// Where a walker on plan { pts, t0 } is at game time t (ms), at SPEED along the polyline, then standing still.
export function along(plan, t) {
  const pts = plan.pts
  let left = Math.max(0, (t - plan.t0) / 1000) * SPEED
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (left <= d) { const k = d ? left / d : 1; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k] }
    left -= d
  }
  return pts[pts.length - 1]
}
export const arrival = plan => plan.t0 + (pathLen(plan.pts) / SPEED) * 1000
