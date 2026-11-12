// Pillow Chit Fight drawings as compact stroke data, shared by the canvas, the replay and the referee.
// A drawing is an array of strokes { c, w, p }: c a crayon index (COLORS), w a size index (SIZES) and p the points
// on a 256×256 grid, packed two bytes per point (x, y) into URL-safe base64 with no padding. The referee caps the
// stroke and point counts, so a drawing stays a few KB and fits in the public game state.
export const GRID = 256
// Crayons: ink, berry, peach, butter, leaf, sky, lilac, and the eraser (paper colour, painted over the top).
export const COLORS = ['#4a3b32', '#e2697b', '#ff9f6b', '#f2c14e', '#6fb27f', '#6fb3dc', '#a98bd6', '#fffdf8']
export const COLOR_NAMES = ['Ink', 'Berry', 'Peach', 'Butter', 'Leaf', 'Sky', 'Lilac', 'Eraser']
export const ERASER = 7
export const SIZES = [3, 7, 15]
export const MAX_STROKES = 150, MAX_POINTS = 1800, MAX_STROKE_POINTS = 500, MAX_NAME = 28

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const IDX = Object.fromEntries([...A].map((c, i) => [c, i]))

// [x0, y0, x1, y1, …] (integers 0–255) → base64url.
export function packPts(pts) {
  let out = ''
  for (let i = 0; i < pts.length; i += 3) {
    const a = pts[i] & 255, b = i + 1 < pts.length ? pts[i + 1] & 255 : 0, c = i + 2 < pts.length ? pts[i + 2] & 255 : 0
    const n = (a << 16) | (b << 8) | c
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63]
    if (i + 1 < pts.length) out += A[(n >> 6) & 63]
    if (i + 2 < pts.length) out += A[n & 63]
  }
  return out
}

// base64url → [x0, y0, …], or null if it isn't a whole number of points.
export function unpackPts(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  const bytes = []
  for (let i = 0; i < s.length; i += 4) {
    const k = Math.min(4, s.length - i)
    let n = 0
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < k ? IDX[s[i + j]] : 0)
    bytes.push((n >> 16) & 255)
    if (k > 2) bytes.push((n >> 8) & 255)
    if (k > 3) bytes.push(n & 255)
  }
  return bytes.length % 2 ? null : bytes
}

export const strokePts = st => (st.p.length * 3 >> 2) >> 1 // points in a packed stroke, without unpacking
export const artPoints = art => (art || []).reduce((n, st) => n + strokePts(st), 0)

// The referee's check: a valid copy of a submitted drawing, or an error. Empty drawings are allowed (a blank champion is
// its own kind of brave).
export function cleanArt(art) {
  if (!Array.isArray(art) || art.length > MAX_STROKES) throw new Error('That drawing has too many strokes.')
  let total = 0
  const out = art.map(st => {
    if (!st || typeof st !== 'object') throw new Error("That drawing doesn't make sense.")
    const { c, w, p } = st
    if (!Number.isInteger(c) || c < 0 || c >= COLORS.length || !Number.isInteger(w) || w < 0 || w >= SIZES.length) throw new Error("That drawing doesn't make sense.")
    const pts = unpackPts(p)
    if (!pts || pts.length < 2 || pts.length / 2 > MAX_STROKE_POINTS) throw new Error("That drawing doesn't make sense.")
    total += pts.length / 2
    return { c, w, p }
  })
  if (total > MAX_POINTS) throw new Error('That drawing uses too much crayon.')
  return out
}

export function cleanName(s) {
  if (s == null) return ''
  if (typeof s !== 'string') throw new Error('That name is not text.')
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

// Ramer–Douglas–Peucker on a flat [x, y, …] list: drops points within eps of the line through their neighbours.
export function simplify(pts, eps = 0.8) {
  const n = pts.length / 2
  if (n <= 2) return pts.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack = [[0, n - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    const ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * j], by = pts[2 * j + 1]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy)
    let far = -1, best = eps
    for (let k = i + 1; k < j; k++) {
      const px = pts[2 * k], py = pts[2 * k + 1]
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay)
      if (d > best) { best = d; far = k }
    }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]) }
  }
  const out = []
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[2 * k], pts[2 * k + 1])
  return out
}

// Packs a stroke from canvas points (already on the grid): rounded, clamped, deduplicated and simplified.
export function makeStroke(c, w, raw, eps = 0.8) {
  const q = []
  for (let i = 0; i < raw.length; i += 2) {
    const x = Math.max(0, Math.min(255, Math.round(raw[i]))), y = Math.max(0, Math.min(255, Math.round(raw[i + 1])))
    if (q.length && q[q.length - 2] === x && q[q.length - 1] === y) continue
    q.push(x, y)
  }
  let pts = simplify(q, eps)
  if (pts.length / 2 > MAX_STROKE_POINTS) pts = simplify(q, eps * 4).slice(0, MAX_STROKE_POINTS * 2)
  return { c, w, p: packPts(pts) }
}

// A smooth SVG path through a stroke's points (quadratic curves through the midpoints).
export function pathOf(pts) {
  const n = pts.length / 2
  if (n === 1) return `M${pts[0]} ${pts[1]}l0.01 0`
  if (n === 2) return `M${pts[0]} ${pts[1]}L${pts[2]} ${pts[3]}`
  let d = `M${pts[0]} ${pts[1]}`
  for (let k = 1; k < n - 1; k++) {
    const x = pts[2 * k], y = pts[2 * k + 1], mx = (x + pts[2 * k + 2]) / 2, my = (y + pts[2 * k + 3]) / 2
    d += `Q${x} ${y} ${mx} ${my}`
  }
  return d + `L${pts[2 * n - 2]} ${pts[2 * n - 1]}`
}
