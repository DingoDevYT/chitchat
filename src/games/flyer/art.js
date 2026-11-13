// Jetpack Dash art: the Long Burrow and its props, drawn once into offscreen canvases (sprites and repeating tiles)
// so a frame is mostly drawImage calls. All original: lantern-lit burrow under Teacup Town, yarn, paper cranes,
// kettle vents, teapots, brollies and bathtubs. Sizes are in logical px (the 1280 x 720 view); `k` is the pixel scale.
import { CEIL, FLOOR, VIEW_W } from './course.js'

const mk = (w, h, k, draw) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k))
  const g = c.getContext('2d')
  g.scale(k, k)
  draw(g, w, h)
  c.w = w; c.h = h // logical size, for drawing back at 1:1
  return c
}
const circle = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
// Small seeded scatter for decoration (not gameplay).
const hash = i => { let x = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; return (x >>> 0) / 4294967296 }

export const BACK_W = 1600, NEAR_W = 1200
const CH = FLOOR - CEIL

// The far wall: warm plaster, round night windows, picture frames and hanging lanterns (parallax 0.5).
function backTile(k) {
  return mk(BACK_W, CH, k, g => {
    const gr = g.createLinearGradient(0, 0, 0, CH)
    gr.addColorStop(0, '#f1dab6'); gr.addColorStop(1, '#ecd0a6')
    g.fillStyle = gr; g.fillRect(0, 0, BACK_W, CH)
    // faint plank lines
    g.strokeStyle = '#e2c393'; g.lineWidth = 2
    for (let x = 60; x < BACK_W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, CH); g.stroke() }
    // round windows with a night sky
    for (const [x, y, r, moon] of [[300, 300, 66, true], [1180, 210, 54, false]]) {
      circle(g, x, y, r + 12, '#a8673f'); circle(g, x, y, r, '#3b3466')
      if (moon) { circle(g, x + 20, y - 18, 16, '#ffe9a8'); circle(g, x + 28, y - 24, 14, '#3b3466') }
      for (let i = 0; i < 4; i++) circle(g, x - r * 0.5 + hash(i + x) * r, y + (hash(i * 7 + x) - 0.5) * r, 2, '#fff6d8')
      g.fillStyle = '#a8673f'; g.fillRect(x - 4, y - r, 8, r * 2); g.fillRect(x - r, y - 4, r * 2, 8)
    }
    // picture frames
    for (const [x, y, w, h, kind] of [[760, 120, 74, 86, 'hill'], [80, 410, 82, 66, 'sun'], [1420, 400, 70, 80, 'leaf']]) {
      g.fillStyle = '#9c5f3a'; rrect(g, x - 6, y - 6, w + 12, h + 12, 4); g.fill()
      g.fillStyle = kind === 'sun' ? '#f6c9c4' : '#cfe9f2'; g.fillRect(x, y, w, h)
      if (kind === 'hill') { g.fillStyle = '#8cc88a'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.4, y + h * 0.45); g.lineTo(x + w * 0.65, y + h * 0.7); g.lineTo(x + w * 0.85, y + h * 0.5); g.lineTo(x + w, y + h); g.fill() }
      if (kind === 'sun') circle(g, x + w / 2, y + h / 2, 16, '#f28a5c')
      if (kind === 'leaf') { g.fillStyle = '#7cbf8a'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, 12, 26, 0.5, 0, 7); g.fill() }
    }
    // hanging roots
    g.strokeStyle = '#8a5a3c'; g.lineWidth = 4; g.lineCap = 'round'
    for (const x of [120, 560, 980, 1340]) { g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 14, 20, x - 12, 40, x + 6, 62); g.stroke() }
    // lanterns with a glow
    for (const x of [520, 1000, 1500]) {
      const gl = g.createRadialGradient(x, 76, 6, x, 76, 120)
      gl.addColorStop(0, '#ffd88a88'); gl.addColorStop(1, '#ffd88a00')
      g.fillStyle = gl; g.fillRect(x - 120, 0, 240, 200)
      g.strokeStyle = '#7a4a32'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 48); g.stroke()
      g.fillStyle = '#f6a64a'; rrect(g, x - 18, 46, 36, 50, 12); g.fill()
      g.fillStyle = '#ffd88a'; rrect(g, x - 12, 52, 24, 38, 9); g.fill()
    }
  })
}

// Near layer: chunky wooden pillars (parallax 1.0, so they read as the tunnel moving past).
function nearTile(k) {
  return mk(NEAR_W, CH, k, g => {
    for (const x of [200, 820]) {
      g.fillStyle = '#c98d5e'; g.fillRect(x, 0, 30, CH)
      g.fillStyle = '#b07646'; g.fillRect(x + 22, 0, 8, CH)
      g.fillStyle = '#a8703f'; g.fillRect(x - 6, 0, 42, 14)
    }
  })
}

// Ceiling and floor strips (repeat every 400 px).
function ceilTile(k) {
  return mk(400, CEIL, k, g => {
    g.fillStyle = '#8a5a3c'; g.fillRect(0, 0, 400, CEIL)
    g.fillStyle = '#6e4430'; g.fillRect(0, CEIL - 14, 400, 14)
    g.fillStyle = '#9c6a48'; for (let x = 0; x < 400; x += 100) g.fillRect(x, 0, 6, CEIL - 14)
  })
}
function floorTile(k) {
  const H = 720 - FLOOR
  return mk(400, H, k, g => {
    g.fillStyle = '#b97a52'; g.fillRect(0, 0, 400, H)
    g.fillStyle = '#7a4a32'; g.fillRect(0, 0, 400, 8)
    g.fillStyle = '#9c6440'
    for (let x = 0; x < 400; x += 200) g.fillRect(x + 110, 8, 3, 44)
    g.fillRect(0, 50, 400, 3)
    g.fillStyle = '#e98b8b'; g.fillRect(0, 60, 400, 5)
    g.fillStyle = '#f3c08f'; g.fillRect(0, 66, 400, 2)
  })
}

const yarnBall = k => mk(36, 36, k, g => {
  circle(g, 18, 18, 16, '#e8738a')
  g.strokeStyle = '#c4506a'; g.lineWidth = 2.2
  for (const [a, b] of [[0.2, 2.4], [1.4, 3.6], [2.6, 4.9], [-0.6, 1.2]]) { g.beginPath(); g.arc(18, 18, 11, a, b); g.stroke() }
  circle(g, 12, 12, 3, '#ffb3c2')
})
const sprinkle = k => mk(30, 30, k, g => {
  g.beginPath()
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 13, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(15 + r * Math.cos(a), 15 + r * Math.sin(a)) }
  g.closePath(); g.fillStyle = '#ffc94a'; g.fill(); g.lineJoin = 'round'; g.strokeStyle = '#e09a2a'; g.lineWidth = 2; g.stroke()
  circle(g, 12, 11, 2, '#fff3c4')
})
const gift = (k, kind) => mk(64, 64, k, g => {
  if (kind === 'brew') { // the rare Second Brew token: a golden teapot coin
    circle(g, 32, 32, 26, '#f2c14e'); circle(g, 32, 32, 21, '#ffdf7e')
    g.fillStyle = '#c98d1f'; g.beginPath(); g.ellipse(31, 36, 12, 9, 0, 0, 7); g.fill(); g.fillRect(25, 24, 12, 4)
    g.fillRect(41, 32, 9, 3); circle(g, 31, 22, 3, '#c98d1f')
    return
  }
  if (kind === 'fluff') { // dandelion fluff
    g.strokeStyle = '#9bd17a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 60); g.lineTo(32, 36); g.stroke()
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 30); g.lineTo(32 + 20 * Math.cos(a), 30 + 20 * Math.sin(a)); g.stroke(); circle(g, 32 + 20 * Math.cos(a), 30 + 20 * Math.sin(a), 3, '#fff') }
    circle(g, 32, 30, 5, '#f6e7b0')
    return
  }
  circle(g, 32, 32, 30, '#ffffff66')
  g.fillStyle = '#8fcf8a'; rrect(g, 12, 24, 40, 30, 5); g.fill()
  g.fillStyle = '#7ab775'; g.fillRect(12, 24, 40, 8)
  g.fillStyle = '#f6d37a'; g.fillRect(28, 24, 8, 30)
  g.beginPath(); g.ellipse(25, 20, 8, 5, -0.5, 0, 7); g.ellipse(39, 20, 8, 5, 0.5, 0, 7); g.fill()
})
const crane = k => mk(64, 44, k, g => {
  g.lineJoin = 'round'
  g.fillStyle = '#fffaf0'; g.strokeStyle = '#d98a9a'; g.lineWidth = 2
  g.beginPath(); g.moveTo(4, 24); g.lineTo(30, 18); g.lineTo(60, 26); g.lineTo(30, 30); g.closePath(); g.fill(); g.stroke() // body, nose left
  g.fillStyle = '#ffe3ea'; g.beginPath(); g.moveTo(28, 20); g.lineTo(44, 2); g.lineTo(40, 24); g.closePath(); g.fill(); g.stroke() // wing
  g.beginPath(); g.moveTo(52, 25); g.lineTo(62, 12); g.lineTo(58, 27); g.closePath(); g.fill(); g.stroke() // tail
})
const warn = (k, locked) => mk(64, 64, k, g => {
  circle(g, 32, 32, 28, locked ? '#e8606e' : '#ffffffdd')
  circle(g, 32, 32, 22, locked ? '#ff8a96' : '#fff')
  g.strokeStyle = '#e8606e'; g.lineWidth = 3.5; g.lineJoin = 'round'
  g.beginPath(); g.moveTo(20, 34); g.lineTo(44, 22); g.lineTo(36, 44); g.lineTo(33, 35); g.closePath()
  g.fillStyle = locked ? '#fff' : '#fde3e6'; g.fill(); g.stroke()
})
const vent = k => mk(34, 56, k, g => {
  g.fillStyle = '#c9963f'; rrect(g, 0, 0, 34, 56, 8); g.fill()
  g.fillStyle = '#e8b85a'; rrect(g, 5, 6, 24, 44, 6); g.fill()
  g.fillStyle = '#8a6328'; for (let y = 14; y < 46; y += 9) g.fillRect(9, y, 16, 3)
})
// The kettle jetpack, spout down-left so the steam goes behind.
const kettle = k => mk(48, 52, k, g => {
  g.strokeStyle = '#6f7d8c'; g.lineWidth = 4; g.beginPath(); g.arc(24, 14, 11, Math.PI, 0); g.stroke()
  g.fillStyle = '#9fd0ea'; g.beginPath(); g.ellipse(24, 32, 18, 16, 0, 0, 7); g.fill()
  g.fillStyle = '#7fb8d6'; g.fillRect(6, 34, 36, 5)
  g.fillStyle = '#f2a07a'; g.beginPath(); g.ellipse(24, 17, 10, 4, 0, 0, 7); g.fill(); circle(g, 24, 13, 3, '#f2a07a')
  g.fillStyle = '#9fd0ea'; g.beginPath(); g.moveTo(10, 40); g.lineTo(2, 50); g.lineTo(8, 51); g.lineTo(16, 44); g.fill()
})
const trotter = k => mk(150, 120, k, g => {
  g.fillStyle = '#7fb8d6'; g.fillRect(48, 86, 14, 26); g.fillRect(86, 86, 14, 26)
  g.fillStyle = '#ef8fa4'; g.beginPath(); g.ellipse(55, 112, 14, 6, 0, 0, 7); g.ellipse(93, 112, 14, 6, 0, 0, 7); g.fill()
  g.strokeStyle = '#7fb8d6'; g.lineWidth = 10; g.lineCap = 'round'
  g.beginPath(); g.arc(28, 62, 18, Math.PI * 0.5, Math.PI * 1.5); g.stroke() // handle
  g.beginPath(); g.moveTo(118, 66); g.quadraticCurveTo(132, 52, 140, 30); g.stroke() // spout
  g.fillStyle = '#9fd0ea'; g.beginPath(); g.ellipse(74, 62, 48, 34, 0, 0, 7); g.fill()
  g.fillStyle = '#e8f4fb'; g.fillRect(28, 66, 92, 10)
  for (const [x, y, c] of [[54, 52, '#f6a6b8'], [76, 74, '#f2c14e'], [96, 54, '#8fcf8a']]) circle(g, x, y, 5, c)
})
const brolly = k => mk(150, 150, k, g => {
  g.fillStyle = '#f2a7c3'; g.beginPath(); g.moveTo(10, 56); g.quadraticCurveTo(75, -24, 140, 56)
  for (let i = 0; i < 5; i++) g.quadraticCurveTo(140 - i * 26 - 13, 44, 140 - (i + 1) * 26, 56)
  g.fill()
  g.fillStyle = '#e48aaa'; g.beginPath(); g.moveTo(75, 8); g.quadraticCurveTo(60, 30, 62, 54); g.lineTo(88, 54); g.quadraticCurveTo(90, 30, 75, 8); g.fill()
  circle(g, 75, 8, 4, '#c96f90')
  g.strokeStyle = '#7a4a32'; g.lineWidth = 4; g.beginPath(); g.moveTo(75, 56); g.lineTo(75, 128); g.arc(85, 128, 10, Math.PI, 0, true); g.stroke()
  g.fillStyle = '#c98d5e'; rrect(g, 46, 120, 50, 10, 4); g.fill()
})
const tub = k => mk(150, 100, k, g => {
  g.fillStyle = '#cfe6f2'; rrect(g, 10, 30, 130, 14, 7); g.fill()
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(16, 42); g.lineTo(134, 42); g.quadraticCurveTo(130, 86, 75, 86); g.quadraticCurveTo(20, 86, 16, 42); g.fill()
  g.fillStyle = '#e6f2f8'; g.fillRect(24, 50, 102, 6)
  g.fillStyle = '#c9a26b'; g.fillRect(34, 84, 8, 12); g.fillRect(108, 84, 8, 12)
  for (let i = 0; i < 6; i++) circle(g, 30 + i * 18, 30, 7 + (i % 2) * 3, '#ffffffee') // bubbles
  // a little rubber duck on the rim
  circle(g, 126, 22, 9, '#ffd84a'); g.fillStyle = '#ffd84a'; g.beginPath(); g.ellipse(120, 30, 12, 7, 0, 0, 7); g.fill()
  g.fillStyle = '#f2954a'; g.beginPath(); g.moveTo(134, 20); g.lineTo(142, 23); g.lineTo(134, 25); g.fill(); circle(g, 128, 19, 1.6, '#231d2b')
})
const puff = k => mk(32, 32, k, g => {
  const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16)
  gr.addColorStop(0, '#ffffffee'); gr.addColorStop(1, '#ffffff00')
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32)
})

// Everything at once; rebuilt only when the pixel scale changes (resize / DPR).
export function buildArt(k) {
  const kk = Math.min(2, Math.max(0.5, k))
  return {
    k: kk,
    back: backTile(Math.min(1.25, kk)), near: nearTile(kk), ceil: ceilTile(kk), floor: floorTile(kk),
    ball: yarnBall(kk), spr: sprinkle(kk), crane: crane(kk), warn: warn(kk, false), lock: warn(kk, true), vent: vent(kk),
    kettle: kettle(kk), trotter: trotter(kk), brolly: brolly(kk), flip: tub(kk), puff: puff(kk),
    gift: { trotter: gift(kk, 'v'), brolly: gift(kk, 'v'), flip: gift(kk, 'v'), brew: gift(kk, 'brew'), fluff: gift(kk, 'fluff') },
  }
}

// The default critter face (people with no PNGtuber upload), as in the rest of Chitchat.
export function drawCritter(g, size, color, talk) {
  const k = size / 64
  g.save(); g.scale(k, k)
  circle(g, 16, 16, 9, color); circle(g, 48, 16, 9, color); circle(g, 16, 16, 4, '#00000022'); circle(g, 48, 16, 4, '#00000022'); circle(g, 32, 36, 24, color)
  g.fillStyle = '#ff6b8b55'; g.beginPath(); g.ellipse(18, 42, 4, 2.5, 0, 0, 7); g.ellipse(46, 42, 4, 2.5, 0, 0, 7); g.fill()
  g.fillStyle = '#231d2b'; g.beginPath(); g.ellipse(24, 33, 3, 4, 0, 0, 7); g.ellipse(40, 33, 3, 4, 0, 0, 7); g.fill()
  if (talk) { g.beginPath(); g.ellipse(32, 45, 5, 4, 0, 0, 7); g.fill() }
  else { g.strokeStyle = '#231d2b'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(27, 43); g.quadraticCurveTo(32, 47, 37, 43); g.stroke() }
  g.restore()
}

export { VIEW_W }
