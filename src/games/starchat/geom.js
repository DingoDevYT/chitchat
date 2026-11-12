// Lantern Hollow's layout in world units (x right, z toward the camera, y up), shared by the 3D scene, the painted board
// and the flat fallback. Plain maths, no three.js. The loop is a closed Catmull-Rom curve round the pond (the mockup's
// shape), the 36 loop spaces are spaced evenly along it, and the Firefly Bridge's spaces run straight across the water
// from the Bridge Gate (west bank) to the Tea House (east bank).
import { BRIDGE, LOOP, POSTS, SPACES } from './data.js'

export const BOARD_W = 13, BOARD_D = 9 // the painted board plane
const S = 0.6 // mockup units to world units
const CTRL = [[-7.2, -3.6], [-3.4, -5.0], [1.6, -5.2], [6.2, -4.3], [8.1, -1.0], [7.4, 2.6], [4.0, 4.6], [-0.8, 5.0], [-5.2, 4.3], [-8.0, 1.2]]
  .map(([x, z]) => [x * S, z * S])

function catmull(P, steps) {
  const out = [], n = P.length
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)))
    }
  }
  return out
}
function resample(poly, n) {
  const pts = [...poly, poly[0]], seg = []
  let L = 0
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d }
  const out = [], step = L / n
  let acc = 0, j = 0
  for (let k = 0; k < n; k++) {
    const target = k * step
    while (j < seg.length - 1 && acc + seg[j] < target) { acc += seg[j]; j++ }
    const t = seg[j] ? (target - acc) / seg[j] : 0
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t])
  }
  return out
}

export const PATH = catmull(CTRL, 40) // the dense loop, for painting the lantern path
const ring = resample(PATH, LOOP)
// Walk the ring the way that puts the Bridge Gate on the west bank and the Tea House on the east bank (the bridge runs
// across the pond), with the Festival Gate toward the camera. Fixed by the board, so it's just a search over offsets.
const [OFF, DIR] = (() => {
  let best = null
  for (const dir of [1, -1]) for (let off = 0; off < LOOP; off++) {
    const at = i => ring[((off + dir * i) % LOOP + LOOP) % LOOP]
    const w = at(BRIDGE.from), e = at(SPACES[SPACES.length - 1].next[0]), g = at(0)
    const cost = (w[0] + 4.8) ** 2 + (w[1] - 0.2) ** 2 + (e[0] - 4.8) ** 2 + (e[1] - 0.2) ** 2 - g[1] * 0.5
    if (!best || cost < best[0]) best = [cost, off, dir]
  }
  return best.slice(1)
})()

// SPOTS[i] = { x, z } for every space (loop and bridge).
export const SPOTS = SPACES.map((_, i) => {
  if (i < LOOP) { const [x, z] = ring[((OFF + DIR * i) % LOOP + LOOP) % LOOP]; return { x, z } }
  return null
})
{
  const a = SPOTS[BRIDGE.from], b = SPOTS[SPACES[SPACES.length - 1].next[0]], n = SPACES.length - LOOP
  for (let k = 0; k < n; k++) {
    const t = (k + 1) / (n + 1)
    SPOTS[LOOP + k] = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
  }
}
export const TILE_R = 0.3

// Which way is "outward" from the pond at a loop space (for props beside the path).
export function outward(i) {
  const p = SPOTS[i], d = Math.hypot(p.x, p.z * 1.4) || 1
  return [p.x / d, (p.z * 1.4) / d]
}
// A spot just off the path, outside the loop (posts, stalls, the Tea House).
export const beside = (i, k = 0.75) => { const [ox, oz] = outward(i); return { x: SPOTS[i].x + ox * k, z: SPOTS[i].z + oz * k } }
export const POST_SPOTS = Object.fromEntries(POSTS.map(p => [p, beside(p, 0.62)]))

// The pond: an ellipse inside the loop.
export const POND = { x: 0.15, z: 0.05, rx: 3.55, rz: 1.75 }
