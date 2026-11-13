// Jetpack Dash: one frame of the Long Burrow on a 2D canvas, in the logical px of course.js (the caller sets the
// transform). Side-on camera: nothing moves vertically; the world scrolls left past the flyer pinned at PX.
//
// The sim's view is 1280 x 720, but the camera may show more than that (S.view): a wider, zoomed-out window with the
// flyer small and well left, so there's more tunnel ahead, like the genre. Everything in world space lines up exactly;
// cranes (which live in screen space in the sim) are stretched to enter from the visible right edge and still reach
// the flyer on the very tick the sim says they do. All of this is presentation only.
import {
  CEIL, FLOOR, PX, R, VIEW_W, VIEW_H, BOT, LANES, STEAM_CHARGE, STEAM_FIRE, STEAM_HALF, CRANE_TRACK, CRANE_LOCK,
  BALL_R, chunkOf, yarnEnds, speed,
} from './course.js'
import { BACK_W, NEAR_W } from './art.js'
import { VEH_NAMES_2, drawVehicle } from './extras.js'

const CH = FLOOR - CEIL
export const VEH_NAMES = { trotter: 'Teapot Trotter · tap to hop', brolly: 'Brolly Glider · hold to rise', flip: 'Flip-Tub · tap to flip', ...VEH_NAMES_2 }
export const BEEP_EVERY = 18 // ticks between crane warning beeps while it tracks you (and blinks in time)
export const LOCK_EVERY = 6
const FULL = { x0: 0, x1: VIEW_W, y0: 0, y1: VIEW_H }

// The camera: given the canvas size in CSS px, the logical window to show and the scale. The flyer sits ~19% from
// the left of a window at least 1280 x 800 logical px (a touch zoomed out from the sim's 720 px corridor view).
export function camera(cssW, cssH) {
  const scale = Math.min(cssW / VIEW_W, cssH / 800)
  const w = Math.min(cssW / scale, 2000), h = cssH / scale
  const x0 = PX - Math.max(0.19 * w, 230), y0 = VIEW_H / 2 - h / 2
  return { scale, view: { x0, x1: x0 + w, y0, y1: y0 + h }, tx: (cssW - w * scale) / 2 - x0 * scale, ty: -y0 * scale }
}

function tiles(g, img, off, w, y, h, v) {
  let x = v.x0 - Math.round((((off + v.x0) % w) + w) % w)
  // Source inset by a pixel and copies overlapped by one, so smoothing never shows a seam between copies.
  for (; x < v.x1; x += w) g.drawImage(img, 1, 0, img.width - 2, img.height, x, y, w + 1, h)
}

function label(g, text, x, y, size = 15, fill = '#4a3324') {
  g.font = `800 ${size}px Nunito, system-ui, sans-serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.lineWidth = 4; g.strokeStyle = '#fff8ec'; g.lineJoin = 'round'
  g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y)
}
function pill(g, text, x, y) {
  g.font = '800 15px Nunito, system-ui, sans-serif'
  const w = g.measureText(text).width + 24
  g.fillStyle = '#fff8ecee'; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - 15, w, 30, 15) : g.rect(x - w / 2, y - 15, w, 30); g.fill()
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a3324'; g.fillText(text, x, y + 1)
}

// A flyer: face (PNGtuber sprite), kettle jetpack or vehicle. alpha < 1 for ghosts. sq = [sx, sy] squash/stretch,
// anchored at the flyer's feet so a landing squashes into the floor.
export function drawFlyer(g, art, f) {
  const { x, y, face, veh, flip = 1, vy = 0, alpha = 1, t = 0, blink = false, size = 64, sq } = f
  g.save()
  g.globalAlpha = alpha * (blink && Math.floor(t * 12) % 2 ? 0.45 : 1)
  if (sq && (sq[0] !== 1 || sq[1] !== 1)) { g.translate(x, y + R); g.scale(sq[0], sq[1]); g.translate(-x, -y - R) }
  if (drawVehicle(g, art, f)) { /* the Teacup, Rocket Kettle and Sponge live in extras.js */ } else if (veh === 'trotter') {
    const bob = Math.abs(Math.sin(t * 14)) * (y >= BOT - 1 ? 4 : 0)
    g.drawImage(art.trotter, x - 76, y + R - 112 - bob, 150, 120)
    if (face) g.drawImage(face, x - 26, y - 70 - bob, 52, 52)
  } else if (veh === 'brolly') {
    g.drawImage(art.brolly, x - 80, y - 118, 150, 150)
    if (face) g.drawImage(face, x - 30, y - 36, 56, 56)
  } else if (veh === 'flip') {
    g.translate(x, y)
    if (flip < 0) g.scale(1, -1)
    if (face) g.drawImage(face, -27, -52, 54, 54)
    g.drawImage(art.flip, -75, -36, 150, 100)
  } else {
    g.translate(x, y)
    g.rotate(Math.max(-0.3, Math.min(0.3, vy / 3000)))
    g.drawImage(art.kettle, -size * 0.78, -size * 0.32, 44, 48)
    if (face) g.drawImage(face, -size / 2, -size / 2, size, size)
  }
  g.restore()
}

// A big edge-of-screen warning badge: a soft glow band along the edge, a round badge and a chevron pointing in.
function edgeWarn(g, art, x, y, dir, { locked = false, on = true, t = 0, size = 84 } = {}) {
  const band = g.createLinearGradient(x, 0, x - dir * 300, 0)
  const a = locked ? 0.55 : on ? 0.35 : 0.16
  band.addColorStop(0, `rgba(232,96,110,${a})`); band.addColorStop(1, 'rgba(232,96,110,0)')
  g.fillStyle = band; g.fillRect(dir > 0 ? x - 300 : x, y - 52, 300, 104)
  const pulse = locked ? 1 + 0.14 * Math.sin(t * 40) : on ? 1.08 : 1
  const s = size * pulse, cx = x - dir * (size / 2 + 14)
  g.drawImage(locked ? art.lock : art.warn, cx - s / 2, y - s / 2, s, s)
  // chevron pointing into the screen (where it's coming from → where you are)
  const hx = cx - dir * (size / 2 + 22)
  g.fillStyle = locked ? '#e8606e' : on ? '#e8606eee' : '#e8606e88'
  g.beginPath(); g.moveTo(hx - dir * 18, y); g.lineTo(hx, y - 20); g.lineTo(hx, y + 20); g.closePath(); g.fill()
  g.strokeStyle = '#fff8ec'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke()
}

export function drawFrame(g, S) {
  const { art, world, camD, n, me, reduced, t } = S
  const v = S.view || FULL
  const left = camD - PX
  // Burrow: earth beyond the strips (when the camera shows more than the sim's 720 px), far wall (slow parallax),
  // pillars, ceiling and floor (move with the world).
  if (v.y0 < 0) { g.fillStyle = '#5e3a28'; g.fillRect(v.x0, v.y0, v.x1 - v.x0, -v.y0 + 1) }
  if (v.y1 > VIEW_H) { g.fillStyle = '#a56a45'; g.fillRect(v.x0, VIEW_H - 1, v.x1 - v.x0, v.y1 - VIEW_H + 1) }
  tiles(g, art.back, left * (reduced ? 0.85 : 0.5), BACK_W, CEIL, CH, v)
  tiles(g, art.near, left, NEAR_W, CEIL, CH, v)
  tiles(g, art.ceil, left, 400, 0, CEIL, v)
  tiles(g, art.floor, left, 400, FLOOR, VIEW_H - FLOOR, v)

  const wl = left + v.x0, wr = left + v.x1 // world x at the screen edges
  const k0 = Math.max(-1, chunkOf(wl - 200)), k1 = chunkOf(wr + 200)
  // Steam lines: vents hiss and a dotted lane shows during the charge (with big badges at both edges), then a
  // wall-to-wall blast.
  for (const s of me?.st || []) {
    const age = n - s.n0
    for (const ly of s.lanes) {
      if (age < STEAM_CHARGE) {
        const p = age / STEAM_CHARGE, on = Math.floor(age / 9) % 2 === 0
        g.fillStyle = `rgba(255,236,214,${0.16 + 0.18 * p})`; g.fillRect(v.x0, ly - STEAM_HALF, v.x1 - v.x0, STEAM_HALF * 2)
        g.strokeStyle = on ? '#ffffff' : '#ffffffaa'; g.lineWidth = 5; g.setLineDash([18, 14]); g.lineDashOffset = -t * 80
        g.beginPath(); g.moveTo(v.x0 + 40, ly); g.lineTo(v.x1 - 40, ly); g.stroke(); g.setLineDash([])
        g.fillStyle = `rgba(255,170,74,${0.3 + 0.5 * p * (0.5 + 0.5 * Math.sin(t * 20))})`
        g.beginPath(); g.arc(v.x0 + 17, ly, 30, 0, 7); g.arc(v.x1 - 17, ly, 30, 0, 7); g.fill()
        for (const [x, dir] of [[v.x0 + 52, -1], [v.x1 - 52, 1]]) {
          const r = 24 + (on ? 3 : 0) + 6 * p
          g.fillStyle = on ? '#e8606e' : '#f08a6a'; g.beginPath(); g.arc(x - dir * 34, ly, r, 0, 7); g.fill()
          g.strokeStyle = '#fff8ec'; g.lineWidth = 4; g.stroke()
          label(g, '!', x - dir * 34, ly + 1, 30, '#fff8ec')
        }
      } else if (age < STEAM_CHARGE + STEAM_FIRE) {
        const fade = Math.min(1, (STEAM_CHARGE + STEAM_FIRE - age) / 10)
        g.fillStyle = `rgba(255,255,255,${0.85 * fade})`; g.fillRect(v.x0, ly - STEAM_HALF, v.x1 - v.x0, STEAM_HALF * 2)
        const W = v.x1 - v.x0 + 80
        for (let i = 0; i < 22; i++) {
          const px = v.x0 + ((i * 97 + t * 900) % W) - 40, py = ly + Math.sin(i * 1.7 + t * 6) * STEAM_HALF * 0.8
          g.globalAlpha = fade; g.drawImage(art.puff, px - 26, py - 26, 52, 52); g.globalAlpha = 1
        }
      }
      g.drawImage(art.vent, v.x0, ly - 28, 34, 56)
      g.save(); g.translate(v.x1, 0); g.scale(-1, 1); g.drawImage(art.vent, 0, ly - 28, 34, 56); g.restore()
    }
  }

  for (let k = k0; k <= k1; k++) {
    const c = world.chunk(k)
    // Sprinkles (the ones you've already scooped are gone).
    for (let i = 0; i < c.spr.length; i++) {
      const s = c.spr[i]
      if (s.x < wl - 20) continue
      if (s.x > wr + 20) break
      if (me?.got?.has(k * 100000 + i)) continue
      const bob = reduced ? 0 : Math.sin(t * 4 + s.x * 0.02) * 3
      g.drawImage(art.spr, s.x - left - 14, s.y - 14 + bob, 28, 28)
    }
    for (let i = 0; i < c.parcels.length; i++) {
      const p = c.parcels[i]
      if (p.x < wl - 40 || p.x > wr + 40 || (me && k * 100 + i <= me.lastP)) continue
      const bob = reduced ? 0 : Math.sin(t * 3) * 6
      g.drawImage(art.gift[p.kind], p.x - left - 32, p.y - 32 + bob, 64, 64)
    }
    // Static yarn: a crackling strand between two balls of yarn; some spin around their middle.
    for (const y of c.yarns) {
      if (y.x < wl - 200 || y.x > wr + 200) continue
      const [ax, ay, bx, by] = yarnEnds(y, n), sx = -left
      g.lineCap = 'round'
      g.strokeStyle = '#f4a3b8'; g.lineWidth = 12; g.beginPath(); g.moveTo(ax + sx, ay); g.lineTo(bx + sx, by); g.stroke()
      g.strokeStyle = '#ffd6e0'; g.lineWidth = 4; g.beginPath(); g.moveTo(ax + sx, ay); g.lineTo(bx + sx, by); g.stroke()
      // crackle
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = Math.max(4, Math.round(len / 22))
      g.strokeStyle = '#fff1a0'; g.lineWidth = 2.5; g.beginPath()
      const jig = reduced ? 0 : Math.floor(t * 18)
      for (let i = 0; i <= segs; i++) {
        const f = i / segs, o = (i % 2 ? 1 : -1) * (5 + ((i * 7 + jig) % 5))
        const px = ax + dx * f + nx * o + sx, py = ay + dy * f + ny * o
        i ? g.lineTo(px, py) : g.moveTo(px, py)
      }
      g.stroke()
      if (y.w) { // a hint of which way it spins
        g.strokeStyle = '#a07a6a66'; g.lineWidth = 2; g.setLineDash([6, 8])
        g.beginPath(); g.arc(y.x + sx, y.y, y.len / 2 + 16, y.a0 + y.w * n / 60 + 0.3, y.a0 + y.w * n / 60 + 1.1); g.stroke(); g.setLineDash([])
      }
      g.drawImage(art.ball, ax + sx - BALL_R - 3, ay - BALL_R - 3, 36, 36)
      g.drawImage(art.ball, bx + sx - BALL_R - 3, by - BALL_R - 3, 36, 36)
    }
  }

  // Friends as ghosts, slid by how far behind/ahead they are (clamped to the screen).
  const tags = []
  for (const gh of S.ghosts) {
    if (!gh.alive && gh.d - camD < v.x0 - PX) continue // a landed ghost scrolls away with the tunnel
    const x = Math.max(v.x0 + 40, Math.min(v.x1 - 40, PX + (gh.d - camD)))
    drawFlyer(g, art, { x, y: gh.y, face: gh.face, veh: gh.veh, flip: gh.flip, alpha: gh.alive ? 0.5 : 0.25, t, size: 56 })
    const ty = gh.y + (gh.veh === 'trotter' ? 34 : 44)
    // Ghosts flying together share a spot: stack their name tags instead of overprinting them.
    let yy = ty
    while (tags.some(([tx, tty]) => Math.abs(tx - x) < 70 && Math.abs(tty - yy) < 16)) yy += 16
    tags.push([x, yy])
    label(g, gh.name, x, yy, 13, '#6b4a3a')
  }

  drawFx(g, art, S.fx || [])

  if (me) {
    if (me.wh > 0) { // Kettle Whistle: a puff of steam all around
      g.fillStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(t * 30)})`
      g.beginPath(); g.arc(PX, me.y, 58, 0, 7); g.fill()
    }
    if (me.alive || S.fall) {
      const y = me.alive ? me.y : S.fall.y
      g.save()
      if (!me.alive) {
        // a soft shadow under the tumbling flyer, then the flyer itself spinning
        const fx = PX + S.fall.x, near = Math.max(0, 1 - (BOT - y) / 300)
        g.fillStyle = `rgba(60,30,20,${0.25 * near})`; g.beginPath(); g.ellipse(fx, FLOOR - 2, 34 * (0.5 + near / 2), 7, 0, 0, 7); g.fill()
        g.translate(fx, y); g.rotate(S.fall.r); g.translate(-fx, -y)
      }
      drawFlyer(g, art, { x: PX + (me.alive ? 0 : S.fall.x), y, face: S.face, veh: me.alive ? me.veh : null, flip: me.flip, vy: me.alive ? me.vy : 0, t, blink: me.grace > 0, sq: me.alive ? S.sq : S.fall.sq, held: me.held })
      g.restore()
      if (me.alive && me.veh) pill(g, VEH_NAMES[me.veh], PX + 40, me.y - ({ trotter: 104, cup: 124, rocket: 102 }[me.veh] || 92))
      if (me.alive && me.brew) g.drawImage(art.gift.brew, PX + 26, me.y - 52, 26, 26)
    }
    // Paper cranes: a big warning at the right edge that follows your height, turns red and locks, then the crane.
    const ck = (v.x1 + 70 - PX) / (VIEW_W + 60 - PX)
    for (const c of me.cr) {
      const age = n - c.n0
      if (age < 0) continue
      if (age < CRANE_TRACK + CRANE_LOCK) {
        const locked = age >= CRANE_TRACK
        const on = locked ? (age - CRANE_TRACK) % LOCK_EVERY < LOCK_EVERY / 2 : age % BEEP_EVERY < BEEP_EVERY / 2
        edgeWarn(g, art, v.x1, c.y, 1, { locked, on, t })
      } else {
        const x = c.sx > PX ? PX + (c.sx - PX) * ck : c.sx
        // speed lines behind the crane
        g.strokeStyle = '#fff8ec99'; g.lineWidth = 3; g.lineCap = 'round'
        for (const dy of [-10, 2, 12]) { g.beginPath(); g.moveTo(x + 36, c.y + dy); g.lineTo(x + 36 + 40 + Math.abs(dy) * 2, c.y + dy); g.stroke() }
        g.drawImage(art.crane, x - 38, c.y - 26, 76, 52)
      }
    }
  }
}

// ── particles: steam puffs, warm sparks, floor dust, sprinkle glints. Screen space, drifting back with the scroll. ──
function drawFx(g, art, fx) {
  for (const p of fx) {
    const a = Math.max(0, p.life / p.max)
    if (p.kind === 'puff' || p.kind === 'dust') {
      g.globalAlpha = p.kind === 'dust' ? a * 0.8 : a
      if (p.kind === 'dust') { g.fillStyle = '#e9c49a'; g.beginPath(); g.arc(p.x, p.y, p.s / 2, 0, 7); g.fill() } else g.drawImage(art.puff, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s)
    } else if (p.kind === 'spark') {
      g.globalAlpha = a; g.fillStyle = p.col || '#ffb35a'; g.beginPath(); g.arc(p.x, p.y, p.s * a + 1, 0, 7); g.fill()
    } else if (p.kind === 'glint') { // a little four-point twinkle
      const s = p.s * (0.4 + a)
      g.globalAlpha = a; g.fillStyle = p.col || '#fff3b0'
      g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s * 0.25, p.y - s * 0.25); g.lineTo(p.x + s, p.y); g.lineTo(p.x + s * 0.25, p.y + s * 0.25)
      g.lineTo(p.x, p.y + s); g.lineTo(p.x - s * 0.25, p.y + s * 0.25); g.lineTo(p.x - s, p.y); g.lineTo(p.x - s * 0.25, p.y - s * 0.25); g.closePath(); g.fill()
    } else if (p.kind === 'ring') { // a pickup ring that pops outward
      g.globalAlpha = a; g.strokeStyle = p.col || '#fff3b0'; g.lineWidth = 4 * a + 1
      g.beginPath(); g.arc(p.x, p.y, p.s * (1.6 - a), 0, 7); g.stroke()
    }
  }
  g.globalAlpha = 1
}

export function updateFx(fx, dt) {
  for (const p of fx) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt
    if (p.g) p.vy += p.g * dt
    if (p.kind === 'puff' || p.kind === 'dust') p.s += dt * (p.grow ?? 30)
    if (p.floor && p.y > FLOOR - 2) { p.y = FLOOR - 2; p.vy *= -0.3 }
  }
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i].life <= 0) fx.splice(i, 1)
}

const CAP = 160
const add = (fx, p) => { if (fx.length < CAP) fx.push({ max: p.life, ...p }) }

// While thrusting on the kettle: steam puffs and warm sparks from the spout, blown back by the scroll.
// `acc` is the caller's emission accumulator ({ n: 0 }), so the rate doesn't depend on the frame rate.
export function thrustFx(fx, dt, y, d, reduced, acc) {
  const n = reduced ? 0.4 : 1, back = -speed(d) * 0.35
  acc.n += dt * 60 * n
  while (acc.n >= 1) {
    acc.n--
    add(fx, { kind: 'puff', x: PX - 44, y: y + 24, vx: back - 40 * Math.random(), vy: 140 + 90 * Math.random(), life: 0.55, s: 16 + 12 * Math.random() })
    if (!reduced && Math.random() < 0.8) add(fx, { kind: 'spark', x: PX - 46 + 6 * Math.random(), y: y + 28, vx: back - 80 * Math.random(), vy: 260 + 160 * Math.random(), life: 0.25 + 0.15 * Math.random(), s: 3 + 2 * Math.random(), col: Math.random() < 0.5 ? '#ffd27a' : '#ff9a5a' })
  }
}
// A puff of floor dust (landing, skidding). k 0..1 is how hard.
export function dustFx(fx, x, k = 1, d = 0, reduced = false) {
  const back = -speed(d) * 0.25, m = Math.round((reduced ? 3 : 9) * k) + 1
  for (let i = 0; i < m; i++) {
    const side = i % 2 ? 1 : -1
    add(fx, { kind: 'dust', x: x + side * 10 * Math.random(), y: FLOOR - 6, vx: back + side * (60 + 140 * Math.random()) * k, vy: -60 - 90 * Math.random() * k, g: 260, life: 0.45 + 0.25 * Math.random(), s: 8 + 10 * Math.random() * k, grow: 26 })
  }
}
// A sprinkle scooped: a ring and a few twinkles that trail off behind.
export function glintFx(fx, x, y, d = 0, reduced = false) {
  const back = -speed(d) * 0.5
  add(fx, { kind: 'ring', x, y, vx: back * 0.6, vy: 0, life: 0.28, s: 18 })
  for (let i = 0; i < (reduced ? 1 : 4); i++) add(fx, { kind: 'glint', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 24, vx: back - 60 * Math.random(), vy: (Math.random() - 0.5) * 120, life: 0.35 + 0.3 * Math.random(), s: 7 + 5 * Math.random(), col: i % 2 ? '#ffe27a' : '#fff8d8' })
}
// A burst of confetti-coloured sparks (parcel opening, vehicle pop).
export function burstFx(fx, x, y, cols, k = 1, reduced = false) {
  for (let i = 0; i < (reduced ? 4 : 16) * k; i++) {
    const a = Math.random() * Math.PI * 2, s = 140 + 260 * Math.random()
    add(fx, { kind: 'spark', x, y, vx: Math.cos(a) * s - 200, vy: Math.sin(a) * s, g: 500, life: 0.5 + 0.3 * Math.random(), s: 4 + 3 * Math.random(), col: cols[i % cols.length] })
  }
}

export { LANES, VIEW_H }
