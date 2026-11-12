// What a TV-head's screen shows: the player's live PNGtuber frame (or a Chitbot face, or the default critter), with
// TV touches (scanlines, glare) and the game states: standby (candles out and quiet), smashed (tucked in) and the
// crumb mask (revealed Nibbler). Drawn into a small canvas that becomes the screen texture.
import { drawCam } from '../cams'

const ink = '#231d2b'
const cache = new Map()

// A loaded <img> for src, or null while it loads (then calls back so the screen can redraw).
export function img(src, onload) {
  if (!src) return null
  let e = cache.get(src)
  if (!e) {
    e = { el: new Image(), ok: false, waiters: new Set() }
    e.el.crossOrigin = 'anonymous'
    e.el.onload = () => { e.ok = true; for (const w of e.waiters) w(); e.waiters.clear() }
    e.el.src = src
    cache.set(src, e)
  }
  if (e.ok) return e.el
  if (onload) e.waiters.add(onload)
  return null
}

function critter(g, color, talk, blink) {
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
  dot(-16, -19, 8.5, color); dot(16, -19, 8.5, color); dot(-16, -19, 4, '#0002'); dot(16, -19, 4, '#0002'); dot(0, 0, 23, color)
  g.fillStyle = '#ff6b8b55'; g.beginPath(); g.ellipse(-13, 6, 4, 2.5, 0, 0, 7); g.ellipse(13, 6, 4, 2.5, 0, 0, 7); g.fill()
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 2.4; g.lineCap = 'round'
  if (blink) for (const x of [-8, 8]) { g.beginPath(); g.arc(x, -3, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke() }
  else for (const x of [-8, 8]) { g.beginPath(); g.ellipse(x, -3, 3, 4, 0, 0, 7); g.fill() }
  if (talk) { g.beginPath(); g.ellipse(0, 10, 5, 4.2, 0, 0, 7); g.fill() }
  else { g.beginPath(); g.moveTo(-5, 9); g.quadraticCurveTo(0, 13.5, 5, 9); g.stroke() }
}

// s: { src, color, talk, blink, state: 'live' | 'standby' | 'broken' | 'mask', bg, cam }
// cam: a ready feed from games/cams.jsx (useCamVideo), drawn instead of the avatar.
export function drawScreen(cv, s, onload) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.fillStyle = s.bg || '#f6c9a0'; g.fillRect(0, 0, W, H)
  const vg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7)
  vg.addColorStop(0, '#ffffff30'); vg.addColorStop(1, '#00000040'); g.fillStyle = vg; g.fillRect(0, 0, W, H)
  const pic = s.cam ? null : img(s.src, onload)
  if (s.cam) drawCam(g, s.cam, 0, 0, W, H) // a live webcam fills the whole screen: it's literally a TV
  else if (pic && pic.naturalWidth) {
    const k = Math.min((W * 0.92) / pic.naturalWidth, (H * 0.94) / pic.naturalHeight)
    const w = pic.naturalWidth * k, h = pic.naturalHeight * k
    g.drawImage(pic, (W - w) / 2, H - h - H * 0.02 + (s.talk ? -H * 0.015 : 0), w, h)
  } else {
    g.save(); g.translate(W / 2, H / 2 + 6); g.scale(H / 80, H / 80); critter(g, s.color || '#f4a261', s.talk, s.blink); g.restore()
  }
  if (s.state === 'mask') {
    g.save(); g.translate(W / 2, H * 0.42); g.scale(W / 160, W / 160)
    g.fillStyle = '#3a2a3f'; g.beginPath(); g.ellipse(0, 0, 44, 14, 0, 0, 7); g.fill()
    g.fillStyle = '#fff'; for (const x of [-16, 16]) { g.beginPath(); g.ellipse(x, 0, 7, 5, 0, 0, 7); g.fill() }
    g.fillStyle = '#d9a066'; for (const [x, y] of [[-52, 26], [46, 30], [-36, 44], [30, -46], [-44, -38], [54, 4]]) { g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill() }
    g.restore()
  }
  if (s.state === 'standby') { g.fillStyle = '#0b0a18d8'; g.fillRect(0, 0, W, H) }
  if (s.state === 'broken') broken(g, W, H)
  g.fillStyle = '#00000014'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2)
  const gl = g.createLinearGradient(0, 0, W, H); gl.addColorStop(0, '#ffffff38'); gl.addColorStop(0.35, '#ffffff00'); g.fillStyle = gl; g.fillRect(0, 0, W, H)
}

let snow = null
function broken(g, W, H) {
  g.fillStyle = '#20202ab8'; g.fillRect(0, 0, W, H)
  if (!snow) { // one shared patch of static
    snow = document.createElement('canvas'); snow.width = 96; snow.height = 72
    const s = snow.getContext('2d'), d = s.createImageData(96, 72)
    let seed = 7
    for (let i = 0; i < d.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const v = (seed / 2147483647) * 230; d.data[i] = d.data[i + 1] = v; d.data[i + 2] = v + 20; d.data[i + 3] = 120 }
    s.putImageData(d, 0, 0)
  }
  g.imageSmoothingEnabled = false; g.drawImage(snow, 0, 0, W, H); g.imageSmoothingEnabled = true
  g.fillStyle = '#ffffff22'; g.fillRect(0, H * 0.58, W, H * 0.08)
  let seed = 3
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const cx = W * 0.62, cy = H * 0.38
  g.strokeStyle = '#ffffffd0'; g.lineWidth = W / 160; g.lineCap = 'round'
  for (let k = 0; k < 9; k++) {
    let a = (k / 9) * Math.PI * 2 + r() * 0.5, x = cx, y = cy
    g.beginPath(); g.moveTo(x, y)
    for (let j = 0; j < 4; j++) { const len = W * (0.06 + r() * 0.1); a += (r() - 0.5) * 0.7; x += Math.cos(a) * len; y += Math.sin(a) * len; g.lineTo(x, y) }
    g.stroke()
  }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, W / 70, 0, 7); g.fill()
  g.save(); g.translate(W * 0.22, H * 0.8); g.rotate(-0.5)
  g.fillStyle = '#f3c7a5'; g.fillRect(-W * 0.13, -H * 0.06, W * 0.26, H * 0.12)
  g.fillStyle = '#e4ab88'; g.fillRect(-W * 0.04, -H * 0.06, W * 0.08, H * 0.12)
  g.restore()
  g.fillStyle = '#ffffffe0'; g.font = `bold ${H * 0.16}px sans-serif`; g.fillText('z', W * 0.12, H * 0.28); g.font = `bold ${H * 0.11}px sans-serif`; g.fillText('z', W * 0.22, H * 0.17)
}
