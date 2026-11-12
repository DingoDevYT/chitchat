// Chatterflies: one frame of the Long Burrow on a 2D canvas, in logical 1280 x 720 px (the caller sets the transform).
// Fixed side-on camera: nothing moves vertically; the world scrolls left past the flyer pinned at PX.
import {
  CEIL, FLOOR, PX, R, VIEW_W, VIEW_H, BOT, LANES, STEAM_CHARGE, STEAM_FIRE, STEAM_HALF, CRANE_TRACK, CRANE_LOCK,
  BALL_R, chunkOf, yarnEnds, speed,
} from './course.js'
import { BACK_W, NEAR_W } from './art.js'

const CH = FLOOR - CEIL
export const VEH_NAMES = { trotter: 'Teapot Trotter · tap to hop', brolly: 'Brolly Glider · hold to rise', flip: 'Flip-Tub · tap to flip' }

function tiles(g, img, off, w, y, h) {
  let x = -Math.round(((off % w) + w) % w)
  // Source inset by a pixel and copies overlapped by one, so smoothing never shows a seam between copies.
  for (; x < VIEW_W; x += w) g.drawImage(img, 1, 0, img.width - 2, img.height, x, y, w + 1, h)
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

// A flyer: face (PNGtuber sprite), kettle jetpack or vehicle. alpha < 1 for ghosts.
export function drawFlyer(g, art, f) {
  const { x, y, face, veh, flip = 1, vy = 0, alpha = 1, t = 0, blink = false, size = 64 } = f
  g.save()
  g.globalAlpha = alpha * (blink && Math.floor(t * 12) % 2 ? 0.45 : 1)
  if (veh === 'trotter') {
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

export function drawFrame(g, S) {
  const { art, world, camD, n, me, reduced, t } = S
  const left = camD - PX, right = left + VIEW_W
  // Burrow: far wall (slow parallax), pillars, ceiling and floor (move with the world).
  tiles(g, art.back, left * (reduced ? 0.85 : 0.5), BACK_W, CEIL, CH)
  tiles(g, art.near, left, NEAR_W, CEIL, CH)
  tiles(g, art.ceil, left, 400, 0, CEIL)
  tiles(g, art.floor, left, 400, FLOOR, VIEW_H - FLOOR)

  const k0 = Math.max(-1, chunkOf(left - 200)), k1 = chunkOf(right + 200)
  // Steam lines: vents hiss and a dotted lane shows during the charge, then a wall-to-wall blast.
  for (const s of me?.st || []) {
    const age = n - s.n0
    for (const ly of s.lanes) {
      if (age < STEAM_CHARGE) {
        const p = age / STEAM_CHARGE
        g.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * p})`; g.fillRect(0, ly - STEAM_HALF, VIEW_W, STEAM_HALF * 2)
        g.strokeStyle = '#ffffffdd'; g.lineWidth = 4; g.setLineDash([14, 14]); g.lineDashOffset = -t * 60
        g.beginPath(); g.moveTo(40, ly); g.lineTo(VIEW_W - 40, ly); g.stroke(); g.setLineDash([])
        g.fillStyle = `rgba(255,170,74,${0.3 + 0.5 * p * (0.5 + 0.5 * Math.sin(t * 20))})`
        g.beginPath(); g.arc(17, ly, 26, 0, 7); g.arc(VIEW_W - 17, ly, 26, 0, 7); g.fill()
      } else if (age < STEAM_CHARGE + STEAM_FIRE) {
        const fade = Math.min(1, (STEAM_CHARGE + STEAM_FIRE - age) / 10)
        g.fillStyle = `rgba(255,255,255,${0.85 * fade})`; g.fillRect(0, ly - STEAM_HALF, VIEW_W, STEAM_HALF * 2)
        for (let i = 0; i < 18; i++) {
          const px = ((i * 97 + t * 900) % (VIEW_W + 80)) - 40, py = ly + Math.sin(i * 1.7 + t * 6) * STEAM_HALF * 0.8
          g.globalAlpha = fade; g.drawImage(art.puff, px - 26, py - 26, 52, 52); g.globalAlpha = 1
        }
      }
      g.drawImage(art.vent, 0, ly - 28, 34, 56)
      g.save(); g.translate(VIEW_W, 0); g.scale(-1, 1); g.drawImage(art.vent, 0, ly - 28, 34, 56); g.restore()
    }
  }

  for (let k = k0; k <= k1; k++) {
    const c = world.chunk(k)
    // Sprinkles (the ones you've already scooped are gone).
    for (let i = 0; i < c.spr.length; i++) {
      const s = c.spr[i]
      if (s.x < left - 20) continue
      if (s.x > right + 20) break
      if (me?.got?.has(k * 100000 + i)) continue
      const bob = reduced ? 0 : Math.sin(t * 4 + s.x * 0.02) * 3
      g.drawImage(art.spr, s.x - left - 14, s.y - 14 + bob, 28, 28)
    }
    for (let i = 0; i < c.parcels.length; i++) {
      const p = c.parcels[i]
      if (p.x < left - 40 || p.x > right + 40 || (me && k * 100 + i <= me.lastP)) continue
      const bob = reduced ? 0 : Math.sin(t * 3) * 6
      g.drawImage(art.gift[p.kind], p.x - left - 32, p.y - 32 + bob, 64, 64)
    }
    // Static yarn: a crackling strand between two balls of yarn; some spin around their middle.
    for (const y of c.yarns) {
      if (y.x < left - 200 || y.x > right + 200) continue
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
    if (!gh.alive && gh.d - camD < -PX) continue // a landed ghost scrolls away with the tunnel
    const x =Math.max(40, Math.min(VIEW_W - 40, PX + (gh.d - camD)))
    drawFlyer(g, art, { x, y: gh.y, face: gh.face, veh: gh.veh, flip: gh.flip, alpha: gh.alive ? 0.5 : 0.25, t, size: 56 })
    const ty = gh.y + (gh.veh === 'trotter' ? 34 : 44)
    // Ghosts flying together share a spot: stack their name tags instead of overprinting them.
    let yy = ty
    while (tags.some(([tx, tty]) => Math.abs(tx - x) < 70 && Math.abs(tty - yy) < 16)) yy += 16
    tags.push([x, yy])
    label(g, gh.name, x, yy, 13, '#6b4a3a')
  }

  // Steam puffs from the kettle.
  for (const p of S.puffs) {
    g.globalAlpha = Math.max(0, p.life)
    g.drawImage(art.puff, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s)
  }
  g.globalAlpha = 1

  if (me) {
    if (me.wh > 0) { // Kettle Whistle: a puff of steam all around
      g.fillStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(t * 30)})`
      g.beginPath(); g.arc(PX, me.y, 58, 0, 7); g.fill()
    }
    if (me.alive || S.fall) {
      const y = me.alive ? me.y : S.fall.y
      g.save()
      if (!me.alive) { g.translate(PX + S.fall.x, y); g.rotate(S.fall.r); g.translate(-PX - S.fall.x, -y) }
      drawFlyer(g, art, { x: PX + (me.alive ? 0 : S.fall.x), y, face: S.face, veh: me.alive ? me.veh : null, flip: me.flip, vy: me.vy, t, blink: me.grace > 0 })
      g.restore()
      if (me.alive && me.veh) pill(g, VEH_NAMES[me.veh], PX + 40, me.veh === 'trotter' ? me.y - 104 : me.y - 92)
      if (me.alive && me.brew) g.drawImage(art.gift.brew, PX + 26, me.y - 52, 26, 26)
    }
    // Paper cranes: a warning at the right edge that follows your height, turns red and locks, then the crane.
    for (const c of me.cr) {
      const age = n - c.n0
      if (age < 0) continue
      if (age < CRANE_TRACK + CRANE_LOCK) {
        const locked = age >= CRANE_TRACK
        const pulse = locked ? 1 + 0.12 * Math.sin(t * 40) : 1
        g.drawImage(locked ? art.lock : art.warn, VIEW_W - 76 - 24 * (pulse - 1), c.y - 32 * pulse, 64 * pulse, 64 * pulse)
        label(g, '!', VIEW_W - 92, c.y, 26, '#e8606e')
      } else g.drawImage(art.crane, c.sx - 32, c.y - 22, 64, 44)
    }
  }
}

// Screen-space puffs: a few per tick while thrusting, drifting back with the scroll.
export function updatePuffs(puffs, dt, me, held, d, reduced) {
  for (const p of puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.6; p.s += dt * 30 }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].life <= 0) puffs.splice(i, 1)
  if (me?.alive && held && !me.veh && puffs.length < (reduced ? 12 : 40)) {
    puffs.push({ x: PX - 44, y: me.y + 24, vx: -speed(d) * 0.35 - 40 * Math.random(), vy: 120 + 80 * Math.random(), life: 0.8, s: 16 + 10 * Math.random() })
  }
}

export { LANES }
