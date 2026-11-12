// Chatterflies, the second wave of things to draw (kept out of render.js / art.js so those stay small): the Bouncy
// Castle Teacup, the Rocket Kettle and the Sprinkle Sponge, brew tokens, yarn looms, clearer crane warnings, Flock
// rescue bubbles and the Second Brew spin. All original art in the burrow's cozy style; drawn in logical 1280 x 720 px.
import {
  BOT, BUBBLE_R, BUBBLE_TICKS, CRANE_LOCK, CRANE_TRACK, LOOM_CHARGE, LOOM_FIRE, LOOM_HALF, PX, R, SPIN_TICKS, VIEW_W,
  bubbleAt,
} from './course.js'

const mk = (w, h, k, draw) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k))
  const g = c.getContext('2d')
  g.scale(k, k)
  draw(g, w, h)
  return c
}
const circle = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }

// The Bouncy Castle Teacup: an inflatable teacup with puffy rim, bunting and a saucer that boings.
const cup = k => mk(160, 130, k, g => {
  g.fillStyle = '#f7c9a8'; g.beginPath(); g.ellipse(80, 118, 70, 10, 0, 0, 7); g.fill() // saucer
  g.fillStyle = '#eaa985'; g.beginPath(); g.ellipse(80, 116, 52, 5, 0, 0, 7); g.fill()
  g.strokeStyle = '#9fd0ea'; g.lineWidth = 14; g.lineCap = 'round'
  g.beginPath(); g.arc(134, 70, 18, -Math.PI * 0.45, Math.PI * 0.45); g.stroke() // handle
  g.fillStyle = '#b6def0'; g.beginPath(); g.moveTo(18, 42); g.lineTo(142, 42); g.quadraticCurveTo(138, 112, 80, 112); g.quadraticCurveTo(22, 112, 18, 42); g.fill()
  g.strokeStyle = '#ffffff88'; g.lineWidth = 3
  for (const x of [46, 80, 114]) { g.beginPath(); g.moveTo(x, 48); g.quadraticCurveTo(x + (x - 80) * 0.15, 80, x + (x - 80) * 0.1, 106); g.stroke() } // inflatable seams
  for (let i = 0; i < 7; i++) circle(g, 22 + i * 19.3, 42, 11, i % 2 ? '#f6a6b8' : '#ffd0dc') // puffy rim
  g.strokeStyle = '#7a4a32'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 30); g.quadraticCurveTo(80, 50, 140, 30); g.stroke()
  for (let i = 0; i < 6; i++) { const x = 30 + i * 20, y = 33 + 6 * Math.sin((i / 5) * Math.PI); g.fillStyle = ['#f2a07a', '#8fcf8a', '#f6d37a', '#b597e0'][i % 4]; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.lineTo(x, y + 11); g.fill() }
  circle(g, 58, 78, 6, '#f2c14e'); circle(g, 100, 88, 6, '#8fcf8a')
})
// The Rocket Kettle: a long copper kettle on its side, fins and a spout that pours steam backwards.
const rocket = k => mk(170, 100, k, g => {
  g.fillStyle = '#e58f6a'; g.beginPath(); g.moveTo(30, 38); g.lineTo(8, 18); g.lineTo(44, 34); g.fill(); g.beginPath(); g.moveTo(30, 66); g.lineTo(8, 88); g.lineTo(44, 70); g.fill() // fins
  g.fillStyle = '#e8a35c'; rrect(g, 26, 30, 116, 46, 23); g.fill()
  g.fillStyle = '#f4c27e'; rrect(g, 34, 36, 98, 14, 7); g.fill()
  g.fillStyle = '#c97b3c'; g.fillRect(64, 30, 6, 46); g.fillRect(104, 30, 6, 46)
  g.fillStyle = '#e8a35c'; g.beginPath(); g.moveTo(140, 44); g.quadraticCurveTo(168, 50, 140, 62); g.fill() // nose cap
  g.strokeStyle = '#6f7d8c'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(84, 30, 16, Math.PI, 0); g.stroke() // handle
  g.fillStyle = '#c97b3c'; g.beginPath(); g.moveTo(30, 58); g.lineTo(6, 62); g.lineTo(6, 52); g.lineTo(30, 50); g.fill() // spout, backwards
  circle(g, 124, 54, 6, '#fff3dc'); circle(g, 124, 54, 3, '#7fb8d6') // porthole
})
const flame = k => mk(90, 60, k, g => {
  const gr = g.createRadialGradient(70, 30, 4, 60, 30, 56)
  gr.addColorStop(0, '#ffffffee'); gr.addColorStop(0.5, '#ffe9c4aa'); gr.addColorStop(1, '#ffd08a00')
  g.fillStyle = gr; g.beginPath(); g.moveTo(90, 22); g.quadraticCurveTo(10, 0, 0, 30); g.quadraticCurveTo(10, 60, 90, 38); g.fill()
})
// The Sprinkle Sponge: a soft yellow sponge with a green scrub top, little flappy dish-cloth wings.
const sponge = k => mk(150, 110, k, g => {
  g.fillStyle = '#d7ecf8'; g.beginPath(); g.ellipse(26, 46, 26, 14, -0.5, 0, 7); g.ellipse(124, 46, 26, 14, 0.5, 0, 7); g.fill() // wings
  g.strokeStyle = '#a9cfe4'; g.lineWidth = 2; for (const x of [16, 26, 36]) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 6, 54); g.stroke() }
  g.fillStyle = '#ffd96a'; rrect(g, 30, 40, 90, 56, 16); g.fill()
  g.fillStyle = '#7cc48a'; rrect(g, 30, 30, 90, 20, 10); g.fill()
  g.fillStyle = '#5faa70'; for (let i = 0; i < 8; i++) g.fillRect(38 + i * 10, 34, 4, 3)
  for (const [x, y, r] of [[48, 64, 5], [70, 80, 4], [96, 62, 6], [104, 84, 3.5], [58, 86, 3], [84, 70, 3]]) circle(g, x, y, r, '#efb946')
})
const giftBox = (k, kind) => mk(64, 64, k, g => {
  if (kind === 'token') { // a brew token: a little tea bag on a string with a tag
    g.strokeStyle = '#a07a5a'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 8); g.lineTo(32, 22); g.stroke()
    g.fillStyle = '#f6a64a'; rrect(g, 24, 2, 16, 10, 3); g.fill()
    g.fillStyle = '#f3e3c7'; g.beginPath(); g.moveTo(18, 24); g.lineTo(46, 24); g.lineTo(50, 56); g.quadraticCurveTo(32, 62, 14, 56); g.closePath(); g.fill()
    g.strokeStyle = '#d8bf96'; g.lineWidth = 2; g.stroke()
    circle(g, 32, 42, 9, '#b5733f'); g.fillStyle = '#fff3dc'; g.font = '800 12px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2', 32, 43)
    return
  }
  circle(g, 32, 32, 30, '#ffffff66')
  const col = { cup: ['#9fd0ea', '#7fb8d6'], rocket: ['#f2a07a', '#d9855f'], sponge: ['#f6d37a', '#e0b85a'] }[kind] || ['#8fcf8a', '#7ab775']
  g.fillStyle = col[0]; rrect(g, 12, 24, 40, 30, 5); g.fill()
  g.fillStyle = col[1]; g.fillRect(12, 24, 40, 8)
  g.fillStyle = '#fff3dc'; g.fillRect(28, 24, 8, 30)
  g.beginPath(); g.ellipse(25, 20, 8, 5, -0.5, 0, 7); g.ellipse(39, 20, 8, 5, 0.5, 0, 7); g.fill()
})
const spool = k => mk(30, 44, k, g => {
  g.fillStyle = '#b07646'; rrect(g, 2, 0, 26, 8, 3); g.fill(); rrect(g, 2, 36, 26, 8, 3); g.fill()
  g.fillStyle = '#7fc7d9'; g.fillRect(6, 8, 18, 28)
  g.strokeStyle = '#5aa6ba'; g.lineWidth = 1.5; for (let y = 12; y < 36; y += 5) { g.beginPath(); g.moveTo(6, y); g.lineTo(24, y + 2); g.stroke() }
})

// Adds the new sprites to the art from art.js (call after every buildArt).
export function addArt(art) {
  const k = art.k
  Object.assign(art, { cup: cup(k), rocket: rocket(k), flame: flame(k), sponge: sponge(k), spool: spool(k) })
  art.gift = { ...art.gift, cup: giftBox(k, 'cup'), rocket: giftBox(k, 'rocket'), sponge: giftBox(k, 'sponge'), token: giftBox(k, 'token') }
  return art
}

// The new vehicles (render.js drawFlyer hands them here). Returns false for anything it doesn't draw.
export function drawVehicle(g, art, f) {
  const { x, y, face, veh, vy = 0, t = 0, held = false } = f
  if (!art.cup) return false
  if (veh === 'cup') {
    const squash = y >= BOT - 2 ? 0.86 : 1 + Math.min(0.08, Math.abs(vy) / 20000)
    g.save(); g.translate(x, y + R + 6); g.scale(1 / squash, squash)
    if (face) g.drawImage(face, -28, -134, 56, 56) // peeking over the rim
    g.drawImage(art.cup, -80, -124, 160, 130)
    g.restore()
  } else if (veh === 'rocket') {
    g.save(); g.translate(x, y); g.rotate(Math.max(-0.2, Math.min(0.2, vy / 2400)))
    if (held) { const fl = 1 + 0.15 * Math.sin(t * 40); g.drawImage(art.flame, -150 * fl, -24, 90 * fl, 48) }
    g.drawImage(art.rocket, -86, -52, 170, 100)
    if (face) g.drawImage(face, -18, -84, 50, 50)
    g.restore()
  } else if (veh === 'sponge') {
    const flap = Math.sin(t * (vy < 0 ? 30 : 10)) * 0.25
    g.save(); g.translate(x, y)
    g.save(); g.scale(1, 1 + flap * 0.3); g.drawImage(art.sponge, -75, -50, 150, 110); g.restore()
    if (face) g.drawImage(face, -26, -62, 52, 52)
    g.restore()
  } else return false
  return true
}
export const VEH_NAMES_2 = { cup: 'Bouncy Castle Teacup · hold to slam, bounce high', rocket: 'Rocket Kettle · hold to dash', sponge: 'Sprinkle Sponge · tap to flap' }

function tag(g, text, x, y, size = 14, fill = '#4a3324', bg = '#fff8ecee') {
  g.font = `800 ${size}px Nunito, system-ui, sans-serif`
  const w = g.measureText(text).width + 18
  g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8) : g.rect(x - w / 2, y - size * 0.8, w, size * 1.6); g.fill()
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(text, x, y + 1)
}

function bubble(g, x, y, t, left, label) {
  const r = BUBBLE_R + Math.sin(t * 3) * 3
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  gr.addColorStop(0, '#ffffff66'); gr.addColorStop(0.7, '#cfefff33'); gr.addColorStop(1, '#bfe6ffaa')
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  g.strokeStyle = '#ffffffcc'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke()
  g.strokeStyle = '#ffffffee'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r - 10, -2.6, -1.9); g.stroke()
  if (left != null) { g.strokeStyle = '#8fd3b4'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); g.stroke() }
  if (label) tag(g, label, x, y - r - 18, 13, '#2f5a7a')
}

const REEL = ['teapot', 'spr', 'crane', 'ball', 'cup']
function reelImg(art, i) {
  const k = REEL[i]
  return k === 'teapot' ? art.gift.brew : k === 'spr' ? art.spr : k === 'crane' ? art.crane : k === 'ball' ? art.ball : art.cup
}
// Reel symbols keep their shape (the crane and the teacup are wider than tall).
function reelDraw(g, img, x, y, s) {
  const a = img.width / img.height, w = a >= 1 ? s : s * a, h = a >= 1 ? s / a : s
  g.drawImage(img, x - w / 2, y - h / 2, w, h)
}

// Everything new that sits on top of a frame: S is drawFrame's scene plus { me } (your sim state).
export function drawExtras(g, S) {
  const { art, me, n, t, camD } = S
  if (!art.cup) return
  // The camera may show more than the sim's 1280 x 720 (render.js camera): wall-to-wall things span what's visible.
  const v = S.view || { x0: 0, x1: VIEW_W, y0: 0, y1: 720 }, L0 = v.x0, W = v.x1 - v.x0
  const ck = (v.x1 + 70 - PX) / (VIEW_W + 60 - PX) // cranes are stretched to enter from the visible edge (as render.js)
  // Yarn looms: spools at both walls; a trembling thread while it charges, then a taut glowing strand.
  for (const L of me?.lm || []) {
    const age = n - L.n0
    for (const b of L.beams) {
      const a = age - b.at
      if (a < -12 || a >= LOOM_CHARGE + LOOM_FIRE) continue
      g.drawImage(art.spool, L0 + 4, b.y - 22, 30, 44)
      g.save(); g.translate(v.x1, 0); g.scale(-1, 1); g.drawImage(art.spool, 4, b.y - 22, 30, 44); g.restore()
      if (a < 0) continue
      if (a < LOOM_CHARGE) {
        const p = a / LOOM_CHARGE, wob = (1 - p) * 6
        g.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * p})`; g.lineWidth = 2 + 2 * p; g.setLineDash([10, 10]); g.lineDashOffset = -t * 120
        g.beginPath(); g.moveTo(L0 + 34, b.y)
        for (let x = L0 + 34; x <= v.x1 - 34; x += 40) g.lineTo(x, b.y + Math.sin(x * 0.05 + t * 30) * wob)
        g.stroke(); g.setLineDash([])
        g.fillStyle = `rgba(127,199,217,${0.08 + 0.12 * p})`; g.fillRect(L0 + 34, b.y - LOOM_HALF - R + 5, W - 68, (LOOM_HALF + R - 5) * 2)
      } else {
        const fade = Math.min(1, (LOOM_CHARGE + LOOM_FIRE - a) / 8)
        g.globalAlpha = fade
        g.fillStyle = '#7fc7d955'; g.fillRect(L0 + 30, b.y - LOOM_HALF - 6, W - 60, (LOOM_HALF + 6) * 2)
        g.fillStyle = '#7fc7d9'; g.fillRect(L0 + 30, b.y - LOOM_HALF, W - 60, LOOM_HALF * 2)
        g.fillStyle = '#e8fbff'; g.fillRect(L0 + 30, b.y - 2, W - 60, 4)
        g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5; g.beginPath()
        const j = Math.floor(t * 20)
        for (let x = L0 + 30, i = 0; x < v.x1 - 30; x += 18, i++) g.lineTo(x, b.y + ((i + j) % 2 ? 4 : -4))
        g.stroke(); g.globalAlpha = 1
      }
    }
  }
  // Clearer crane warnings: a guide line at the locked height, a ring that fills up, a volley count and HOMING.
  for (const c of me?.cr || []) {
    const age = n - c.n0
    if (age < 0 || age >= CRANE_TRACK + CRANE_LOCK) continue
    const p = age / (CRANE_TRACK + CRANE_LOCK), locked = age >= CRANE_TRACK
    g.strokeStyle = locked ? '#e8606e88' : '#ffffff55'; g.lineWidth = locked ? 3 : 2; g.setLineDash([8, 12]); g.lineDashOffset = t * 80
    g.beginPath(); g.moveTo(v.x1 - 150, c.y); g.lineTo(PX + 60, c.y); g.stroke(); g.setLineDash([])
    g.strokeStyle = locked ? '#e8606e' : '#ffb35c'; g.lineWidth = 5; g.lineCap = 'round'
    g.beginPath(); g.arc(v.x1 - 56, c.y, 52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); g.stroke()
    if (c.i === 0 && c.v > 1) tag(g, `×${c.v}`, v.x1 - 56, c.y + 70, 15, '#c8414f')
    if (c.h) tag(g, 'HOMING', v.x1 - 150, c.y - 56, 12, '#fff8ec', '#c8414fdd')
  }
  // Homing cranes in flight trail little paper sparkles.
  for (const c of me?.cr || []) {
    if (!c.h || n - c.n0 < CRANE_TRACK + CRANE_LOCK) continue
    for (let i = 1; i < 4; i++) { g.globalAlpha = 0.5 - i * 0.12; g.fillStyle = '#ffe3ea'; g.beginPath(); g.arc((c.sx > PX ? PX + (c.sx - PX) * ck : c.sx) + 30 + i * 22, c.y + Math.sin(t * 20 + i) * 4, 5 - i, 0, 7); g.fill() }
    g.globalAlpha = 1
  }
  // Friends' rescue bubbles, where the referee will check them (bubbleAt), and yours.
  for (const gh of S.ghosts || []) {
    if (!gh.bub || !me) continue
    const p = bubbleAt(gh.bub, me.n), x = PX + (p.d - camD)
    if (x < v.x0 - 80 || x > v.x1 + 80) continue
    bubble(g, x, p.y, t, 1 - (me.n - gh.bub.n0) / BUBBLE_TICKS, `Fly through to save ${gh.name}!`)
  }
  if (me?.bub) bubble(g, PX, me.y, t, 1 - (n - me.bub.n0) / BUBBLE_TICKS, 'Waiting for a friend…')
  if (me?.spin) drawSpin(g, art, me.spin, t, v)
}

// The Second Brew spin: three reels that stop one by one, then the prize.
function drawSpin(g, art, s, t, v) {
  const cx = (v.x0 + v.x1) / 2, cy = 300, w = 420, h = 230
  const pull = s.pulls[s.i], el = SPIN_TICKS - s.left
  g.fillStyle = '#4a302088'; g.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0)
  g.fillStyle = '#c98d5e'; rrect(g, cx - w / 2 - 10, cy - h / 2 - 10, w + 20, h + 20, 30); g.fill()
  g.fillStyle = '#fff8ec'; rrect(g, cx - w / 2, cy - h / 2, w, h, 24); g.fill()
  tag(g, `Second Brew spin${s.pulls.length > 1 ? ` · ${s.i + 1} of ${s.pulls.length}` : ''}`, cx, cy - h / 2 + 26, 18, '#8a5a10', '#ffe9b0')
  for (let i = 0; i < 3; i++) {
    const rx = cx - 130 + i * 130, ry = cy + 6, stopAt = 34 + i * 14
    g.fillStyle = '#f1dab6'; rrect(g, rx - 54, ry - 54, 108, 108, 18); g.fill()
    const sym = el >= stopAt ? pull.reels[i] : Math.floor(t * 16 + i * 2) % 5
    const bob = el >= stopAt ? 0 : ((t * 16) % 1) * 30 - 15
    g.save(); g.beginPath(); g.rect(rx - 54, ry - 54, 108, 108); g.clip()
    reelDraw(g, reelImg(art, sym), rx, ry + bob, sym === 4 ? 92 : 72)
    g.restore()
  }
  if (el >= 34 + 28 + 6) {
    const text = pull.prize === 'brew' ? 'Three teapots! A Second Brew: fly on!' : `+${pull.prize} sprinkles`
    tag(g, text, cx, cy + h / 2 - 22, 18, pull.prize === 'brew' ? '#2f7a4a' : '#8a5a10', '#fff3c4')
  }
}
