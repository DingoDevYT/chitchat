// Lantern Hollow's painted ground: a night meadow (dabbed grass, wildflowers), the moonlit pond with lily pads and the
// moon's reflection, the worn lantern path round it with warm pools of light, and soft shadows where the 3D tiles,
// stalls and posts stand. Drawn once into a canvas (no web fonts needed: there's no lettering). Everything that moves
// or glows is 3D on top (Table3D StarchatScene).
import { BOARD_D, BOARD_W, PATH, POND, POST_SPOTS, SPOTS, TILE_R, beside } from './geom.js'
import { LOOP } from './data.js'

export const GROUND = '#1d3833' // the meadow colour at the board's edge, so the ground plane round it matches
const PX = 2048, PY = Math.round(PX * BOARD_D / BOARD_W)
const X = x => (x / BOARD_W + 0.5) * PX, Z = z => (z / BOARD_D + 0.5) * PY, U = PX / BOARD_W
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

let cached = null
export function boardCanvas() {
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = PX; c.height = PY
  const g = c.getContext('2d'), r = rng(7)
  // meadow: lighter where the lanterns are, falling off to the dark edge
  const bg = g.createRadialGradient(PX / 2, PY / 2, PY * 0.15, PX / 2, PY / 2, PX * 0.62)
  bg.addColorStop(0, '#3c6e5c'); bg.addColorStop(0.55, '#2f5c4e'); bg.addColorStop(1, GROUND)
  g.fillStyle = bg; g.fillRect(0, 0, PX, PY)
  // soft painted patches, then grass dabs
  for (let i = 0; i < 70; i++) {
    const x = r() * PX, y = r() * PY, rad = 60 + r() * 160
    const p = g.createRadialGradient(x, y, 0, x, y, rad)
    const col = ['#4a7d62', '#2a4f48', '#557f5a', '#30574f'][i % 4]
    p.addColorStop(0, col + '66'); p.addColorStop(1, col + '00')
    g.fillStyle = p; g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  for (let i = 0; i < 4200; i++) {
    const x = r() * PX, y = r() * PY
    const edge = Math.hypot((x - PX / 2) / PX, (y - PY / 2) / PY)
    g.fillStyle = ['#5d9471', '#4a8064', '#3a6b58', '#6ea57a', '#2c5648'][Math.floor(r() * 5)] + (edge > 0.45 ? '55' : 'aa')
    g.beginPath(); g.ellipse(x, y, 2 + r() * 3, 6 + r() * 7, (r() - 0.5) * 0.8, 0, 7); g.fill()
  }
  for (let i = 0; i < 260; i++) { // wildflowers
    const x = r() * PX, y = r() * PY
    g.fillStyle = ['#f6e7b0', '#f2a7c3', '#c9b6e8', '#fff4dc'][i % 4] + 'cc'
    g.beginPath(); g.arc(x, y, 2.5 + r() * 2.5, 0, 7); g.fill()
  }

  // the pond: deep blue, a lighter shallow rim, the moon's reflection, ripples and lily pads
  const px = X(POND.x), pz = Z(POND.z), rx = POND.rx * U, rz = POND.rz * U
  g.fillStyle = '#16302c66'; g.beginPath(); g.ellipse(px, pz + 14, rx + 40, rz + 40, 0, 0, 7); g.fill()
  g.fillStyle = '#7d6a4a'; g.beginPath(); g.ellipse(px, pz, rx + 22, rz + 22, 0, 0, 7); g.fill() // muddy bank
  g.fillStyle = '#5f8d6a'; g.beginPath(); g.ellipse(px, pz, rx + 12, rz + 12, 0, 0, 7); g.fill() // reeds
  const wg = g.createRadialGradient(px - rx * 0.2, pz - rz * 0.3, 10, px, pz, rx)
  wg.addColorStop(0, '#3b6fa0'); wg.addColorStop(0.6, '#24507e'); wg.addColorStop(1, '#173a63')
  g.fillStyle = wg; g.beginPath(); g.ellipse(px, pz, rx, rz, 0, 0, 7); g.fill()
  g.strokeStyle = '#9cc8e066'; g.lineWidth = 6; g.beginPath(); g.ellipse(px, pz, rx - 10, rz - 10, 0, 0, 7); g.stroke()
  g.save(); g.beginPath(); g.ellipse(px, pz, rx, rz, 0, 0, 7); g.clip()
  const mx = px - rx * 0.45, mz = pz + rz * 0.35
  const mg = g.createRadialGradient(mx, mz, 0, mx, mz, 160)
  mg.addColorStop(0, '#fff3c4aa'); mg.addColorStop(1, '#fff3c400')
  g.fillStyle = mg; g.fillRect(mx - 160, mz - 160, 320, 320)
  g.strokeStyle = '#fff3c499'; g.lineWidth = 5; g.lineCap = 'round'
  for (let k = 0; k < 6; k++) { const w = 70 - k * 9; g.beginPath(); g.moveTo(mx - w, mz - 50 + k * 22); g.lineTo(mx + w, mz - 50 + k * 22); g.stroke() }
  g.strokeStyle = '#bfe0f033'; g.lineWidth = 3
  for (let i = 0; i < 26; i++) { const x = px + (r() - 0.5) * rx * 1.7, y = pz + (r() - 0.5) * rz * 1.6, w = 20 + r() * 40; g.beginPath(); g.ellipse(x, y, w, w * 0.3, 0, 0.2, 2.9); g.stroke() }
  g.restore()
  for (let i = 0; i < 16; i++) { // lily pads round the edge of the water
    const t = r() * Math.PI * 2, k = 0.72 + r() * 0.2
    const x = px + Math.cos(t) * rx * k, y = pz + Math.sin(t) * rz * k, s = 16 + r() * 16
    g.fillStyle = '#4f8f5a'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, s, t + 0.35, t + Math.PI * 2 - 0.1); g.closePath(); g.fill()
    g.strokeStyle = '#2f6a45'; g.lineWidth = 2; g.stroke()
    if (i % 4 === 0) { g.fillStyle = '#f6c6d8'; g.beginPath(); g.arc(x + s * 0.2, y - s * 0.2, s * 0.35, 0, 7); g.fill() }
  }

  // the lantern path: a worn earth ribbon with a darker edge, warm light pools along it
  const ribbon = (w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'
    g.beginPath(); PATH.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.stroke()
  }
  ribbon(TILE_R * 3.1 * U, '#00000030')
  ribbon(TILE_R * 2.7 * U, '#7a6648')
  ribbon(TILE_R * 2.3 * U, '#a58c62')
  for (let i = 0; i < 900; i++) { // pebbles in the path
    const [x, z] = PATH[Math.floor(r() * PATH.length)], a = r() * 7, d = r() * TILE_R * 1.1 * U
    g.fillStyle = r() < 0.5 ? '#c4ab7c88' : '#8a734f88'
    g.beginPath(); g.arc(X(x) + Math.cos(a) * d, Z(z) + Math.sin(a) * d, 2 + r() * 3, 0, 7); g.fill()
  }
  for (let i = 0; i < LOOP; i += 2) {
    const p = SPOTS[i], x = X(p.x), y = Z(p.z), rad = 1.25 * U
    const lg = g.createRadialGradient(x, y, 0, x, y, rad)
    lg.addColorStop(0, '#ffd27a40'); lg.addColorStop(1, '#ffd27a00')
    g.fillStyle = lg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // shadows under the bridge on the water, and where the props stand
  const a = SPOTS[26], b = SPOTS[9]
  g.strokeStyle = '#0b1a2a77'; g.lineWidth = 0.62 * U; g.lineCap = 'butt'
  g.beginPath(); g.moveTo(X(a.x), Z(a.z) + 18); g.lineTo(X(b.x), Z(b.z) + 18); g.stroke()
  const blot = (p, s) => { g.fillStyle = '#00000038'; g.beginPath(); g.ellipse(X(p.x), Z(p.z) + 6, s * U, s * 0.7 * U, 0, 0, 7); g.fill() }
  Object.values(POST_SPOTS).forEach(p => blot(p, 0.22))
  ;[6, 22].forEach(i => blot(beside(i, 1.0), 0.55))
  blot(beside(9, 1.05), 0.75)
  // fade every edge into the plain meadow colour, so the board melts into the ground round it
  const fade = Math.round(PY * 0.16)
  ;[[0, 0, 0, fade], [0, PY, 0, PY - fade], [0, 0, fade, 0], [PX, 0, PX - fade, 0]].forEach(([x0, y0, x1, y1]) => {
    const e = g.createLinearGradient(x0, y0, x1, y1)
    e.addColorStop(0, GROUND); e.addColorStop(1, GROUND + '00')
    g.fillStyle = e; g.fillRect(0, 0, PX, PY)
  })
  cached = c
  return c
}
