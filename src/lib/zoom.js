// Zoom & pan for a stream <video>: transform is translate(x, y) scale(s) with the origin at the box centre.
// Pointer coordinates (px, py) are relative to the box centre; w, h are the box size.
export const MIN = 1, MAX = 5
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Keep the scaled video covering the box: an edge can't be dragged inside it.
export function clampPan({ s, x, y }, w, h) {
  const mx = (s - 1) * w / 2, my = (s - 1) * h / 2
  return { s, x: clamp(x, -mx, mx) || 0, y: clamp(y, -my, my) || 0 }
}

// Zoom to scale `next`, keeping the point under (px, py) fixed.
export function zoomAt(z, next, px, py, w, h) {
  const s = clamp(next, MIN, MAX), k = s / z.s
  return clampPan({ s, x: px - (px - z.x) * k, y: py - (py - z.y) * k }, w, h)
}

// Double-click / double-tap: back to 1x if zoomed, else 2x at the pointer.
export const toggleAt = (z, px, py, w, h) => z.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(z, 2, px, py, w, h)
