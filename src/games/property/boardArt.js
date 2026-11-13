import { BOARD, GROUPS } from './rules.js'
import { CORNER, SIDE, along, cell } from './geom.js'
import { paintFilterSvg, WASH_LAYERS } from '../../themes/paint.jsx'

// Property Tycoon's board, "Storybook Town Map": crisp shop-plot tiles (awning in the street's colour, name, price, icon)
// round a hand-painted village green — a stream rising at a rocky spring, winding under a plank bridge into a lily pond,
// a teacup fountain on the town square, trees, signposts and a ribbon title. The art is built as SVG markup (the green
// with the room backgrounds' gouache filters from themes/paint.jsx), rasterised once into a 2048 px canvas, then the
// lettering is drawn on top with the app's own fonts (an SVG drawn as an image can't use web fonts). Only the empty
// board: who owns what and any cottages are 3D on top of it (Table3D PropertyScene).

export const BOARD_PX = 2048
const W = BOARD_PX, P = W / SIDE, E0 = CORNER * P, E1 = W - E0, MID = W / 2
const T = 95.6, TH = T * CORNER, S = P / T // tiles are laid out in "mockup units" (T across) and scaled to pixels
const D = '#5b4636'
const HOODS = ['Mossy Woods', 'Sky Harbour', 'Blossom Gardens', 'Marmalade Market', 'Berry Fields', 'Butter Meadow', 'Fern Glen', 'Plum Heights']
// Where the two deck piles sit on the board (world offsets in tiles from the middle; Table3D places the 3D decks here).
export const DECK_SPOTS = [{ x: -2.56, z: -2.46, rot: 0.17 }, { x: 2.56, z: -2.46, rot: -0.17 }]

const r1 = n => Math.round(n * 10) / 10
const txt = (x, y, s, size, fill, cls) => `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${fill}" class="${cls}">${s}</text>`
function lines(n) {
  if (n.length <= 9 || !n.includes(' ')) return [n]
  const w = n.split(' '); let best = null
  for (let k = 1; k < w.length; k++) { const a = w.slice(0, k).join(' '), b = w.slice(k).join(' '); const m = Math.max(a.length, b.length); if (!best || m < best[0]) best = [m, a, b] }
  return [best[1], best[2]]
}
const nameText = (n, y, size, fill, gap) => lines(n).map((l, k) => txt(0, y + k * gap, l, size, fill, 'lb')).join('')
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const t = f < 0 ? 0 : 255, p = Math.abs(f); r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1) }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// ───────────── tile drawings (crisp, as in the chosen mockup) ─────────────
function star(cx, cy, R, r) { let p = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r : R; p += (k ? 'L' : 'M') + r1(cx + Math.cos(a) * q) + ' ' + r1(cy + Math.sin(a) * q) } return p + 'Z' }
function motif(g, x, y, sc = 1) {
  const col = GROUPS[g].color, sw = `stroke="${D}" stroke-width="1.8" stroke-linejoin="round"`
  let s = ''
  if (g === 0) s = `<path d="M-4 1 h8 v8 q-4 3 -8 0z" fill="#fff3dc" ${sw}/><path d="M-13 2 Q-13 -13 0 -13 Q13 -13 13 2 Z" fill="${col}" ${sw}/><circle cx="-5" cy="-6" r="2.2" fill="#fff4e0"/><circle cx="4.5" cy="-4" r="2.4" fill="#fff4e0"/><path d="M8 10 q4 -6 8 0" fill="#8bbf6f" ${sw}/>`
  if (g === 1) s = `<path d="M-15 7 a6 6 0 0 1 2 -11 a8 8 0 0 1 15 -2 a6 6 0 0 1 9 7 a5 5 0 0 1 -1 6 z" fill="#ffffff" stroke="${col}" stroke-width="2.6"/><path d="M5 -13 q2 -3 4 0 q2 -3 4 0" fill="none" ${sw}/>`
  if (g === 2) s = [0, 1, 2, 3, 4].map(k => { const a = k * 72 * Math.PI / 180 - Math.PI / 2; return `<circle cx="${r1(Math.cos(a) * 6.5)}" cy="${r1(Math.sin(a) * 6.5)}" r="5.6" fill="${col}" ${sw}/>` }).join('') + `<circle r="4" fill="#f6d36b" ${sw}/>`
  if (g === 3) s = `<circle r="10.5" cy="2" fill="${col}" ${sw}/><path d="M0 -8 q6 -8 11 -4 q-5 5 -11 4z" fill="#8bbf6f" ${sw}/><circle cx="-4" cy="-1" r="2" fill="#ffd9a8"/>`
  if (g === 4) s = `<path d="M-6 0 Q-2 -12 3 -14 Q4 -6 6 0" fill="none" stroke="#6c8f45" stroke-width="2"/><circle cx="-6" cy="4" r="6.5" fill="${col}" ${sw}/><circle cx="7" cy="5" r="6.5" fill="${col}" ${sw}/><circle cx="-8" cy="2" r="1.6" fill="#ffd2cc"/><path d="M3 -14 q6 -2 8 2 q-5 2 -8 -2z" fill="#8bbf6f" ${sw}/>`
  if (g === 5) s = Array.from({ length: 8 }, (_, k) => `<ellipse cx="0" cy="-8" rx="3.6" ry="6" fill="${col}" ${sw} transform="rotate(${k * 45})"/>`).join('') + `<circle r="5" fill="#a0703f" ${sw}/>`
  if (g === 6) s = `<path d="M0 13 Q2 0 -2 -13" fill="none" stroke="${D}" stroke-width="1.8"/>` + [-9, -4, 1, 6].map(yy => `<ellipse cx="-6" cy="${yy}" rx="5.5" ry="2.6" fill="${col}" ${sw} transform="rotate(-25 -6 ${yy})"/><ellipse cx="5" cy="${yy - 2}" rx="5.5" ry="2.6" fill="${col}" ${sw} transform="rotate(25 5 ${yy - 2})"/>`).join('')
  if (g === 7) s = `<path d="${star(-3, 1, 11, 5)}" fill="${col}" ${sw}/><path d="M9 -13 a6 6 0 1 0 6 8 a5 5 0 0 1 -6 -8z" fill="#f6d36b" ${sw}/>`
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc})">${s}</g>`
}
function icon(kind, x, y, sc = 1) {
  const sw = `stroke="${D}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`
  let s = ''
  if (kind === 'rail') s = `<path d="M0 -13 l6 -8 M2 -21 h10" fill="none" ${sw}/><rect x="-19" y="-13" width="38" height="23" rx="7" fill="#f2b45f" ${sw}/><rect x="-19" y="-13" width="38" height="7" rx="3.5" fill="#d9774f" ${sw}/>${[-14, -4, 6].map(a => `<rect x="${a}" y="-4" width="8" height="7" rx="2" fill="#dff1f7" ${sw}/>`).join('')}<path d="M-19 6 H19" ${sw}/><circle cx="-10" cy="12" r="3.6" fill="${D}"/><circle cx="10" cy="12" r="3.6" fill="${D}"/>`
  if (kind === 'lantern') s = `<circle r="15" cy="-1" fill="#ffd77a" opacity=".3"/><path d="M0 -21 v4" ${sw}/><path d="M-8 -17 h16 l-3 5 h-10z" fill="#c98a4f" ${sw}/><rect x="-9" y="-12" width="18" height="21" rx="5" fill="#ffd77a" ${sw}/><path d="M-3 -8 v13 M3 -8 v13" stroke="#e8a948" stroke-width="1.6"/><rect x="-7" y="9" width="14" height="5" rx="2" fill="#c98a4f" ${sw}/>`
  if (kind === 'well') s = `<path d="M-15 -8 L0 -19 L15 -8z" fill="#d9774f" ${sw}/><path d="M-11 -8 V4 M11 -8 V4 M-11 -3 H11" fill="none" ${sw}/><path d="M0 -3 v5" ${sw}/><rect x="-3" y="2" width="6" height="5" fill="#9fd3e3" ${sw}/><rect x="-15" y="4" width="30" height="12" rx="5" fill="#d8cbb4" ${sw}/><path d="M-8 4 v12 M0 4 v12 M8 4 v12" stroke="${D}" stroke-width="1.2"/>`
  if (kind === 'cookie') s = `<path d="M-19 5 Q-17 -15 0 -11 Q17 -15 19 5 Q8 -2 0 7 Q-8 -2 -19 5Z" fill="#f2c46b" ${sw}/><path d="M0 -11 Q-2 -2 0 7" fill="none" stroke="#c98a4f" stroke-width="1.6"/><rect x="2" y="-1" width="15" height="5" rx="1" fill="#fffaf0" ${sw} transform="rotate(14 2 -1)"/>`
  if (kind === 'cup') s = `<path d="M-5 -14 q-3 -4 0 -8 M3 -14 q-3 -4 0 -8" fill="none" stroke="#b7a28e" stroke-width="2" stroke-linecap="round"/><ellipse cx="0" cy="11" rx="20" ry="4.5" fill="#fff8ea" ${sw}/><path d="M13 -5 a6 6 0 0 1 0 11" fill="none" stroke="${D}" stroke-width="3"/><path d="M-14 -8 h28 v5 a14 13 0 0 1 -28 0 z" fill="#fff8ea" ${sw}/><path d="M-14 -3 h28" stroke="#e58fb4" stroke-width="3"/>`
  if (kind === 'tax') s = `<path d="M-6 -12 h12 l-3 5 q13 6 9 17 q-3 6 -12 6 q-9 0 -12 -6 q-4 -11 9 -17z" fill="#d9b58a" ${sw}/><path d="M-5 -7 h10" ${sw}/><circle cx="9" cy="10" r="7" fill="#f6d36b" ${sw}/><path d="M9 6.5 v7" stroke="#b9862f" stroke-width="2"/>`
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc})">${s}</g>`
}
function sun(x, y, r, col = '#f6c95c') {
  return `<g transform="translate(${x} ${y})">${Array.from({ length: 10 }, (_, k) => `<rect x="-2.5" y="${-r - 9}" width="5" height="8" rx="2.5" fill="${col}" transform="rotate(${k * 36})"/>`).join('')}<circle r="${r}" fill="${col}" stroke="${D}" stroke-width="2"/><circle cx="${-r * .35}" cy="${-r * .05}" r="1.8" fill="${D}"/><circle cx="${r * .35}" cy="${-r * .05}" r="1.8" fill="${D}"/><path d="M${-r * .3} ${r * .25} q${r * .3} ${r * .3} ${r * .6} 0" fill="none" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/><circle cx="${-r * .62}" cy="${r * .2}" r="2.6" fill="#f19a8a" opacity=".7"/><circle cx="${r * .62}" cy="${r * .2}" r="2.6" fill="#f19a8a" opacity=".7"/></g>`
}
function moon(x, y, r) {
  return `<g transform="translate(${x} ${y})"><path d="M${r * .3} ${-r} a${r} ${r} 0 1 0 ${r * .75} ${r * 1.55} a${r * .8} ${r * .8} 0 0 1 ${-r * .75} ${-r * 1.55}z" fill="#f6d980" stroke="${D}" stroke-width="2" stroke-linejoin="round"/><path d="M${-r * .45} ${r * .05} q${r * .15} ${r * .12} ${r * .3} 0" fill="none" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/><path d="M${-r * .9} ${-r * .55} q${r * .5} ${-r * .9} ${r * 1.4} ${-r * .65} l${r * .45} ${r * .5} q${-r * .8} ${-r * .1} ${-r * 1.6} ${r * .45}z" fill="#8fa8e0" stroke="${D}" stroke-width="2" stroke-linejoin="round"/><circle cx="${r * 1.05}" cy="${-r * .65}" r="${r * .17}" fill="#fff" stroke="${D}" stroke-width="1.5"/></g>`
}
const zzz = (x, y, c = '#7a8fc9') => txt(x, y, 'z', 16, c, 'hd') + txt(x + 10, y - 10, 'z', 12, c, 'hd') + txt(x + 18, y - 18, 'z', 9, c, 'hd')
const iconFor = sp => ({ rail: 'rail', util: sp.name === 'Lantern Works' ? 'lantern' : 'well', cookie: 'cookie', party: 'cup', tax: 'tax' })[sp.k]

function tile(sp) {
  const x0 = -T / 2 + 3, y0 = -TH / 2 + 3, ww = T - 6, hh = TH - 6
  let s = `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(ww)}" height="${r1(hh)}" rx="10" fill="#fff8e6" stroke="#cfb487" stroke-width="2" filter="url(#sh)"/>`
  if (sp.k === 'prop') {
    const col = GROUPS[sp.g].color, r = ww / 12
    s += `<g clip-path="url(#band)"><rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(ww)}" height="27" fill="${col}"/>${Array.from({ length: 6 }, (_, k) => `<rect x="${r1(x0 + k * 2 * r + r * .5)}" y="${r1(y0)}" width="${r1(r)}" height="27" fill="#fff" opacity=".33"/>`).join('')}</g>`
    s += Array.from({ length: 6 }, (_, k) => `<circle cx="${r1(x0 + r + k * 2 * r)}" cy="${r1(y0 + 26)}" r="${r1(r)}" fill="${col}"/>`).join('')
    s += `<path d="M${r1(x0)} ${r1(y0 + 26)} H${r1(x0 + ww)}" stroke="${shade(col, -0.2)}" stroke-width="1.5"/>`
    s += nameText(sp.name, y0 + 51, 12.5, D, 14) + motif(sp.g, 0, y0 + 93, 1.15)
  } else {
    s += nameText(sp.name, y0 + 24, 12.5, D, 14) + icon(iconFor(sp), 0, 6, 1.25)
    if (sp.k === 'cookie' || sp.k === 'party') s += txt(0, y0 + hh - 13, 'Draw a card', 10, '#9a8268', 'sm')
  }
  if (sp.price || sp.amt) {
    const ty = r1(y0 + hh - 28)
    s += sp.amt ? `<rect x="-30" y="${ty}" width="60" height="21" rx="10.5" fill="#f3dfb8" stroke="#c9a26d" stroke-width="1.5"/>` + txt(0, ty + 15, `Pay ${sp.amt}`, 11.5, D, 'lb')
      : `<rect x="-28" y="${ty}" width="56" height="21" rx="10.5" fill="#f3dfb8" stroke="#c9a26d" stroke-width="1.5"/><circle cx="-17" cy="${ty + 10.5}" r="5" fill="#f6d36b" stroke="#b9862f" stroke-width="1.2"/>` + txt(5, ty + 15, sp.price, 12.5, D, 'lb')
  }
  return s
}
function corner(i) {
  const h = 170 / 2 - 4
  let s = `<rect x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" rx="16" fill="#fff3dc" stroke="#cfb487" stroke-width="2" filter="url(#sh)"/>`
  if (i === 0) s += sun(0, -38, 15) + txt(0, 18, 'Start', 36, '#c96f45', 'hd') + txt(0, 38, 'Collect 200 as you pass', 10.5, D, 'sm') + `<path d="M50 62 H-48 m10 -9 l-10 9 l10 9" fill="none" stroke="#e07a4f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
  if (i === 10) s += `<rect x="${-h + 8}" y="${-h + 8}" width="${2 * h - 46}" height="${2 * h - 46}" rx="14" fill="#e8e3f4" stroke="#b6acd6" stroke-width="2"/><g transform="translate(-20 -18)"><path d="M-30 6 q0 -32 30 -32 q30 0 30 32z" fill="#f4c7a8" stroke="${D}" stroke-width="2"/><path d="M-36 6 Q0 -40 36 6" fill="none" stroke="#c98a6a" stroke-width="7" stroke-linecap="round"/><path d="M-9 6 v-12 a9 9 0 0 1 18 0 v12z" fill="#8a6bb0" stroke="${D}" stroke-width="2"/>${zzz(22, -20)}</g>${txt(-20, 34, 'Nap Nook', 17, '#6a5bc4', 'hd')}${txt(0, h - 10, 'Just visiting', 11, '#8a7a66', 'sm')}<g transform="translate(${h - 12} 0) rotate(-90)">${txt(0, 0, 'Just visiting', 11, '#8a7a66', 'sm')}</g>`
  if (i === 20) s += `<g transform="rotate(-45)"><rect x="-46" y="-46" width="92" height="70" rx="6" fill="#f7d3d0"/>${[-34, -12, 10].map(a => `<rect x="${a}" y="-46" width="11" height="70" fill="#e58f8f" opacity=".55"/>`).join('')}${[-40, -18, 4].map(a => `<rect x="-46" y="${a}" width="92" height="11" fill="#e58f8f" opacity=".55"/>`).join('')}<rect x="-46" y="-46" width="92" height="70" rx="6" fill="none" stroke="${D}" stroke-width="2"/><path d="M-14 -16 h28 l-4 16 h-20z" fill="#d9a35f" stroke="${D}" stroke-width="2"/><path d="M-10 -16 q10 -16 20 0" fill="none" stroke="${D}" stroke-width="2.2"/>${txt(0, 46, 'Picnic Blanket', 17, '#c25b5b', 'hd')}${txt(0, 62, 'Free rest', 11, D, 'sm')}</g>`
  if (i === 30) s += `<g transform="rotate(-45)">${moon(-6, -14, 24)}${txt(0, 38, 'Go Nap', 26, '#6a5bc4', 'hd')}${txt(0, 55, 'Straight to the Nap Nook', 10, D, 'sm')}</g>`
  return s
}

// ───────────── the painted green ─────────────
const F = id => `url(#p${id})` // paint filters: b brush, f fine, h haze, g glow, s sky
// A shape laid as three offset translucent washes (as <Wash> in themes/paint.jsx); rim: [colour, dx, dy] lit edge.
function wash(d, fill, f, o = 1, rim, k = 5) {
  const c = [].concat(fill), [rc, rx = 0, ry = 0] = rim || []
  let s = `<g${f ? ` filter="${F(f)}"` : ''}${o !== 1 ? ` opacity="${o}"` : ''}>`
  if (rim) s += `<path d="${d}" fill="${rc}"/>`
  WASH_LAYERS.forEach(([dx, dy, a], i) => { s += `<path d="${d}" fill="${c[i % c.length]}" opacity="${a}" transform="translate(${r1(dx * k + rx)} ${r1(dy * k + ry)})"/>` })
  return s + '</g>'
}
// closed Catmull-Rom loop through points
function loop(pts) {
  const n = pts.length, Q = i => pts[(i + n) % n]
  let d = `M${r1(Q(0)[0])} ${r1(Q(0)[1])}`
  for (let i = 0; i < n; i++) {
    const a = Q(i - 1), b = Q(i), c = Q(i + 1), e = Q(i + 2)
    d += `C${r1(b[0] + (c[0] - a[0]) / 6)} ${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)} ${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])} ${r1(c[1])}`
  }
  return d + 'Z'
}
// a lumpy organic blob (pond, bush, canopy)
function blob(cx, cy, rx, ry, rnd, n = 9, j = 0.12, rot = 0) {
  return loop(Array.from({ length: n }, (_, k) => {
    const a = rot + k / n * Math.PI * 2, q = 1 + (rnd() - .5) * 2 * j
    return [cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]
  }))
}
// open Catmull-Rom sampled into a dense polyline
function spline(pts, per = 24) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i - 1] || pts[i], b = pts[i], c = pts[i + 1], e = pts[i + 2] || c
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t
      out.push([0, 1].map(j => .5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - e[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + e[j]) * t3)))
    }
  }
  out.push(pts.at(-1))
  return out
}
// a ribbon of varying width along a polyline (the stream and its banks)
function ribbon(line, width, wob = 0, seed = 1) {
  const L = [], R = []
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l
    const t = i / (line.length - 1), w = width(t) / 2
    const wl = w + Math.sin(t * 23 + seed) * wob, wr = w + Math.sin(t * 19 + seed * 2.3) * wob
    L.push([p[0] + nx * wl, p[1] + ny * wl]); R.push([p[0] - nx * wr, p[1] - ny * wr])
  })
  return 'M' + [...L, ...R.reverse()].map(p => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z'
}
// a dashed line of cobbles along a path
const cobbles = (d, w, dash, fill, o = 1, off = 0) => `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-dashoffset="${off}" stroke-linecap="round" opacity="${o}"/>`
const rrPath = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`

// The layout of the green, in board pixels.
const PLAZA = [MID, 880, 215]
const SPRING = [505, 1296]
const STREAM = [SPRING, [600, 1352], [735, 1338], [880, 1398], [MID, 1430], [1165, 1404], [1290, 1450], [1385, 1490]]
const POND = [1462, 1502, 128, 92]
const BRIDGE = [MID, 1430]
const deckPx = DECK_SPOTS.map(d => [MID + d.x * P, MID + d.z * P, -d.rot * 180 / Math.PI])
const SIGNS = [[0, 1430, E1 - 125, 0], [1, 618, E1 - 125, 0], [2, E0 + 125, 1490, 90], [3, E0 + 125, 905, 90], [4, 602, E0 + 125, 180], [5, 1446, E0 + 125, 180], [6, E1 - 125, 905, 270], [7, E1 - 125, 1490, 270]]
const TREES = [[560, 880, 1], [640, 1000, .78], [545, 1112, .92], [1490, 875, 1.05], [1395, 990, .8], [1525, 1105, .95], [880, 440, .95], [1172, 468, 1.05],
  [560, 1520, .95], [800, 1580, 1.1], [1245, 1600, .9], [1575, 1300, .85], [455, 1440, .7], [1110, 1585, .7]]

function green() {
  const rnd = rng(7)
  const g0 = E0 + 86, gw = E1 - E0 - 172
  let s = ''
  // sandy border + cobbled ring round the green (the owner bars in 3D sit on the plain sand, just inside the tiles)
  s += wash(rrPath(E0 + 6, E0 + 6, E1 - E0 - 12, E1 - E0 - 12, 34), ['#efe0bd', '#f3e6c6', '#ead9b2'], 'b', 1, null, 4)
  const ring = rrPath(E0 + 61, E0 + 61, E1 - E0 - 122, E1 - E0 - 122, 46)
  s += `<g filter="${F('f')}"><path d="${ring}" fill="none" stroke="#d9c18e" stroke-width="42"/><path d="${ring}" fill="none" stroke="#c9ad78" stroke-width="44" opacity=".25" transform="translate(2 3)"/>`
  s += `<path d="${rrPath(E0 + 49, E0 + 49, E1 - E0 - 98, E1 - E0 - 98, 52)}" fill="none" stroke="#efdfba" stroke-width="15" stroke-dasharray="17 7" stroke-linecap="round"/>`
  s += `<path d="${rrPath(E0 + 73, E0 + 73, E1 - E0 - 146, E1 - E0 - 146, 40)}" fill="none" stroke="#e8d4a8" stroke-width="15" stroke-dasharray="15 8" stroke-dashoffset="9" stroke-linecap="round"/></g>`
  // the meadow, with sunlit and shady patches and grass tufts
  s += wash(rrPath(g0, g0, gw, gw, 40), ['#b9d597', '#c3dc9f', '#b0cd8d'], 'b', 1, ['#a7c585', 2, 4], 6)
  for (const [x, y, rx, ry, c, o] of [[700, 640, 260, 170, '#d3e7ae', .55], [1330, 1180, 300, 190, '#d0e5aa', .5], [640, 1240, 220, 120, '#a8c787', .45], [1380, 700, 230, 150, '#aac98a', .4], [1020, 1620, 330, 90, '#cfe3a8', .45], [1024, 1020, 340, 220, '#cde2a6', .35]])
    s += wash(blob(x, y, rx, ry, rnd, 8, .18), c, 'h', o, null, 8)
  let tufts = '', tufts2 = ''
  for (let k = 0; k < 520; k++) {
    const x = g0 + 20 + rnd() * (gw - 40), y = g0 + 20 + rnd() * (gw - 40), h = 7 + rnd() * 8
    const t = `M${r1(x)} ${r1(y)}l${r1(-3 - rnd() * 2)} ${r1(-h)}M${r1(x + 2)} ${r1(y)}l${r1(rnd() * 2)} ${r1(-h - 3)}M${r1(x + 4)} ${r1(y)}l${r1(3 + rnd() * 2)} ${r1(-h + 1)}`
    if (k % 3) tufts += t; else tufts2 += t
  }
  s += `<g filter="${F('f')}" fill="none" stroke-linecap="round" stroke-width="2.6"><path d="${tufts}" stroke="#9fbf7f" opacity=".55"/><path d="${tufts2}" stroke="#ddebbf" opacity=".6"/></g>`
  // footpaths: from the square up between the decks, and down over the bridge to the cobbles
  const pathN = `M${MID} 690C${MID + 60} 600 ${MID - 70} 480 ${MID + 6} ${E0 + 50}`, pathS = `M${MID} 1070C${MID - 70} 1180 ${MID + 40} 1310 ${MID} 1430S${MID - 60} 1610 ${MID + 8} ${E1 - 50}`
  s += `<g filter="${F('f')}" fill="none" stroke-linecap="round"><path d="${pathN}${pathS}" stroke="#a9c486" stroke-width="96" opacity=".55"/><path d="${pathN}${pathS}" stroke="#d9c597" stroke-width="80"/><path d="${pathN}${pathS}" stroke="#eadab2" stroke-width="64" transform="translate(-3 -2)"/><path d="${pathN}${pathS}" stroke="#f4e8cc" stroke-width="24" opacity=".5" transform="translate(-12 -4)"/></g>`
  s += `<g filter="${F('f')}">${cobbles(pathN + pathS, 6, '1 37', '#c9b07c', .7, 5)}${cobbles(pathN + pathS, 5, '1 53', '#fbf3df', .8, 21)}</g>`

  // the stream: rises at a rocky spring, winds under the bridge and widens into the lily pond
  const line = spline(STREAM)
  const wid = t => 34 + 34 * Math.pow(t, 1.3)
  s += wash(ribbon(line, t => wid(t) + 46, 4, 1), ['#94b77a', '#9cbd80', '#8db175'], 'b', .9, null, 4) // grassy bank
  s += wash(blob(POND[0], POND[1], POND[2] + 26, POND[3] + 24, rnd, 10, .07), ['#94b77a', '#9cbd80', '#8db175'], 'b', .9, null, 4)
  s += wash(blob(SPRING[0], SPRING[1], 70, 58, rnd, 8, .1), ['#94b77a', '#9cbd80'], 'b', .9, null, 4)
  s += wash(ribbon(line, t => wid(t) + 18, 3, 2), ['#ddd0a2', '#e6dab0', '#d5c796'], 'f', 1, null, 3) // sandy edge
  s += wash(blob(POND[0], POND[1], POND[2] + 10, POND[3] + 9, rnd, 10, .06), ['#ddd0a2', '#e6dab0'], 'f', 1, null, 3)
  s += wash(blob(SPRING[0], SPRING[1], 50, 42, rnd, 8, .1), ['#ddd0a2', '#e6dab0'], 'f', 1, null, 3)
  const water = ['#8cc7d7', '#9dd2df', '#82bfd1']
  s += wash(ribbon(line, wid, 2.5, 3), water, 'f', 1, null, 3)
  s += wash(blob(POND[0], POND[1], POND[2], POND[3], rnd, 10, .06), water, 'f', 1, null, 3)
  s += wash(blob(SPRING[0], SPRING[1], 38, 32, rnd, 8, .1), water, 'f', 1, null, 3)
  // deeper water down the middle, and the pond's deep heart
  s += wash(ribbon(line.slice(8), t => (wid(t) * .42), 3, 4), '#6eaac2', 'h', .45, null, 4)
  s += wash(blob(POND[0] + 8, POND[1] + 6, POND[2] * .6, POND[3] * .55, rnd, 8, .1), '#6eaac2', 'h', .45, null, 6)
  // light on the water: ripples running with the current, rings on the pond
  let rip = ''
  for (let i = 10; i < line.length - 12; i += 13) {
    const t = i / line.length, [x, y] = line[i], [x2, y2] = line[i + 3], off = (rnd() - .5) * wid(t) * .5
    const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, len = .8 + rnd() * .6
    rip += `M${r1(x + nx * off)} ${r1(y + ny * off)}q${r1(dx * len / 2 + nx * 4)} ${r1(dy * len / 2 + ny * 4)} ${r1(dx * len)} ${r1(dy * len)}`
  }
  s += `<g filter="${F('f')}" fill="none" stroke-linecap="round"><path d="${rip}" stroke="#e9f7f8" stroke-width="3.5" opacity=".7"/>`
  s += `<ellipse cx="${POND[0] - 40}" cy="${POND[1] - 30}" rx="34" ry="12" stroke="#e9f7f8" stroke-width="3.5" opacity=".7"/><ellipse cx="${POND[0] + 30}" cy="${POND[1] + 34}" rx="22" ry="8" stroke="#e9f7f8" stroke-width="3" opacity=".6"/>`
  s += `<path d="M${SPRING[0] - 14} ${SPRING[1] - 6}a10 6 0 1 0 20 0M${SPRING[0] + 4} ${SPRING[1] + 10}a8 5 0 1 0 14 0" stroke="#f2fbfc" stroke-width="3" opacity=".85"/></g>`
  // spring rocks
  for (const [a, r, k] of [[-2.6, 54, 1], [-1.9, 58, .8], [-1.2, 52, 1.1], [2.9, 50, .9], [2.2, 56, .7], [-.4, 60, .75], [1.5, 52, .65]]) {
    const x = SPRING[0] + Math.cos(a) * r, y = SPRING[1] + Math.sin(a) * r * .8
    s += wash(blob(x, y, 20 * k, 15 * k, rnd, 7, .15), ['#b9b1a3', '#c4bdb0', '#aea698'], 'f', 1, ['#e3ddd2', -2, -3], 2)
  }
  // lily pads, a water lily and reeds on the pond
  for (const [x, y, r, a] of [[-58, -6, 19, .4], [-28, 30, 15, 2.2], [40, -36, 17, 4], [64, 14, 13, 1.2], [8, -48, 11, 5.4]]) {
    const cx = POND[0] + x, cy = POND[1] + y
    s += wash(`M${r1(cx)} ${r1(cy)}L${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}A${r} ${r * .8} 0 1 1 ${r1(cx + Math.cos(a + .5) * r)} ${r1(cy + Math.sin(a + .5) * r)}Z`, ['#6f9f5c', '#7aab66', '#679656'], 'f', 1, ['#9cc983', -1, -2], 2)
  }
  s += `<g filter="${F('f')}" transform="translate(${POND[0] - 22} ${POND[1] + 30})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-7" rx="4.5" ry="8" fill="#f4b6c8" transform="rotate(${a})"/>`).join('')}<circle r="4.5" fill="#f6d36b"/></g>`
  let reeds = ''
  for (const [x, y, h] of [[POND[0] + 110, POND[1] - 50, 52], [POND[0] + 122, POND[1] - 30, 64], [POND[0] + 104, POND[1] - 12, 44], [POND[0] - 120, POND[1] + 52, 48], [POND[0] - 134, POND[1] + 34, 58]])
    reeds += `<path d="M${x} ${y}q-3 ${-h / 2} 2 ${-h}" stroke="#6f9a52" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="${x - 2}" y="${y - h - 4}" width="9" height="20" rx="4.5" fill="#9a6b45"/>`
  s += `<g filter="${F('f')}">${reeds}</g>`

  // the plank bridge where the south path crosses
  s += `<g transform="translate(${BRIDGE[0]} ${BRIDGE[1]}) rotate(18)">`
  s += wash('M-58 -66H58V74H-58Z', '#3f6f80', 'h', .22, null, 3) // its shadow on the water
  s += wash('M-48 -84H48V84H-48Z', ['#d4a26a', '#dcae78', '#c9965f'], 'f', 1, ['#efc993', -2, -2], 2)
  s += `<g filter="${F('f')}" stroke-linecap="round">${Array.from({ length: 9 }, (_, k) => `<path d="M-46 ${-84 + (k + 1) * 16.8}H46" stroke="#a87445" stroke-width="3" opacity=".75"/>`).join('')}`
  s += `<path d="M-54 -88V88M54 -88V88" stroke="#8d5d37" stroke-width="10"/><path d="M-55 -86V86M53 -86V86" stroke="#b98450" stroke-width="4" opacity=".7"/>`
  s += [-88, -30, 30, 88].map(y => `<circle cx="-54" cy="${y}" r="9" fill="#7a4e2d"/><circle cx="54" cy="${y}" r="9" fill="#7a4e2d"/>`).join('') + '</g></g>'

  // the town square and its teacup fountain
  const [px, py, pr] = PLAZA
  s += wash(blob(px, py, pr + 14, pr + 10, rnd, 12, .03), '#a7c586', 'h', .5, null, 6)
  s += wash(blob(px, py, pr, pr, rnd, 14, .02), ['#efe2c2', '#f4e9cf', '#e9dab6'], 'b', 1, ['#d8c393', 3, 5], 4)
  s += `<g filter="${F('f')}" fill="none">${cobbles(`M${px - pr + 16} ${py}a${pr - 16} ${pr - 16} 0 1 0 ${2 * (pr - 16)} 0a${pr - 16} ${pr - 16} 0 1 0 ${-2 * (pr - 16)} 0`, 14, '16 7', '#e1cd9f')}`
  s += cobbles(`M${px - pr + 38} ${py}a${pr - 38} ${pr - 38} 0 1 0 ${2 * (pr - 38)} 0a${pr - 38} ${pr - 38} 0 1 0 ${-2 * (pr - 38)} 0`, 12, '13 9', '#e8d7ae', .8, 6) + '</g>'
  s += `<g transform="translate(${px} ${py - 14}) scale(1.75)">`
  s += wash('M-74 40a74 16 0 1 0 148 0a74 16 0 1 0 -148 0Z', '#b49a72', 'h', .35, null, 1) // shadow
  s += wash('M-70 34a70 16 0 1 0 140 0a70 16 0 1 0 -140 0Z', ['#8fcadb', '#a2d6e2', '#86c2d4'], 'f', 1, ['#d9c9a6', 0, 2.5], 1) // saucer pool
  s += `<g filter="${F('f')}"><ellipse cx="-22" cy="36" rx="16" ry="4" fill="#eaf8fa" opacity=".7"/><ellipse cx="30" cy="40" rx="10" ry="3" fill="#eaf8fa" opacity=".6"/></g>`
  s += wash('M-50 -14h100v14a50 44 0 0 1 -100 0z', ['#fff7e8', '#fbefdc', '#fffaf0'], 'f', 1, ['#e3cfb2', 2, 2], 1)
  s += wash('M-48 4a50 40 0 0 0 96 0 a50 44 0 0 1 -96 0z', '#e8d6bc', 'f', .6, null, .6) // shading under the bowl
  s += `<g filter="${F('f')}"><path d="M-50 -2h100" stroke="#e58fb4" stroke-width="6" opacity=".9"/><path d="M48 -6a20 18 0 0 1 0 34" fill="none" stroke="#e3cfb2" stroke-width="10"/><path d="M48 -6a20 18 0 0 1 0 34" fill="none" stroke="#fff7e8" stroke-width="6"/></g>`
  s += wash('M-50 -14a50 9 0 1 0 100 0a50 9 0 1 0 -100 0Z', ['#8fcadb', '#a2d6e2'], 'f', 1, ['#efe1c8', 0, -1.5], 1)
  s += `<g filter="${F('f')}" fill="none" stroke-linecap="round"><path d="M0 -14q-6 -30 -2 -46M0 -14q10 -24 14 -40M0 -14q-16 -20 -18 -36" stroke="#d3eef4" stroke-width="5" opacity=".9"/><path d="M0 -14q-6 -30 -2 -46" stroke="#fff" stroke-width="2" opacity=".7"/></g>`
  s += `<g filter="${F('f')}" fill="#d3eef4"><circle cx="-2" cy="-62" r="5"/><circle cx="15" cy="-56" r="4"/><circle cx="-19" cy="-52" r="4"/><circle cx="-26" cy="-30" r="2.5"/><circle cx="24" cy="-34" r="2.5"/></g></g>`
  s += `<g filter="${F('g')}" opacity=".35"><circle cx="${px}" cy="${py - 90}" r="60" fill="#ffffff"/></g>`

  // cobbled pads under the two deck piles
  for (const [x, y, r] of deckPx) {
    s += `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(r)})">` + wash(rrPath(-208, -152, 416, 304, 70), '#a7c586', 'h', .5, null, 6)
    s += wash(rrPath(-196, -142, 392, 284, 64), ['#ecdcb6', '#f2e5c6', '#e5d3a9'], 'b', 1, ['#d6bf8d', 3, 5], 4)
    s += `<g filter="${F('f')}">${cobbles(rrPath(-182, -128, 364, 256, 54), 12, '15 8', '#dfc999')}</g></g>`
  }

  // trees, each with a soft shadow, a trunk, and a canopy laid as washes lit from the top left
  for (const [x, y, k] of TREES) {
    const rr = 50 * k
    s += wash(blob(x + rr * .35, y + rr * .75, rr * 1.05, rr * .5, rnd, 8, .1), '#6f8f55', 'h', .32, null, 6)
    s += wash(`M${r1(x - 7 * k)} ${r1(y + rr * .2)}L${r1(x - 6 * k)} ${r1(y + rr * .78)}Q${x} ${r1(y + rr * .88)} ${r1(x + 7 * k)} ${r1(y + rr * .78)}L${r1(x + 6 * k)} ${r1(y + rr * .2)}Z`, ['#94643f', '#a0704a'], 'f', 1, null, 1.5)
    const tone = rnd() > .5 ? ['#7aa964', '#84b36c', '#70a05b'] : ['#86b46a', '#8fbd72', '#7caa61']
    s += wash(blob(x, y - rr * .38, rr * .95, rr * .82, rnd, 9, .1), tone, 'b', 1, ['#5f8c4f', 4, 6], 3)
    s += wash(blob(x - rr * .3, y - rr * .66, rr * .5, rr * .44, rnd, 7, .14), '#b5d891', 'f', .7, null, 2)
    s += wash(blob(x + rr * .28, y - rr * .1, rr * .45, rr * .3, rnd, 7, .14), '#5e8a4c', 'h', .35, null, 2)
  }
  // bushes and flower dabs
  for (const [x, y, k] of [[700, 1180, 1], [1340, 1230, .9], [820, 1250, .7], [1210, 300 + 120, .6], [800, 690, .7], [1250, 700, .7], [430, 1600, .8], [1590, 1620, .75], [960, 1180, .55], [1090, 1170, .55]]) {
    s += wash(blob(x, y, 30 * k, 22 * k, rnd, 8, .16), ['#86b46a', '#90be74', '#7caa61'], 'f', 1, ['#5f8c4f', 2, 3], 2)
    s += wash(blob(x - 7 * k, y - 7 * k, 13 * k, 9 * k, rnd, 6, .2), '#b8da94', 'f', .65, null, 1)
  }
  let dabs = ''
  const flowerCols = ['#f4b6c8', '#ffffff', '#f6d36b', '#e58fb4', '#c9b8ee']
  for (let k = 0; k < 120; k++) {
    const x = g0 + 30 + rnd() * (gw - 60), y = g0 + 30 + rnd() * (gw - 60)
    if (Math.hypot(x - PLAZA[0], y - PLAZA[1]) < PLAZA[2] + 30) continue
    dabs += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(3 + rnd() * 2.5)}" fill="${flowerCols[k % 5]}"/>`
  }
  s += `<g filter="${F('f')}" opacity=".9">${dabs}</g>`

  // the ribbon title
  s += `<g transform="translate(${MID} 1143) scale(1.76)">`
  s += wash('M-232 -30Q0 -54 232 -30L232 40Q0 16 -232 40Z', '#8a6a4c', 'h', .3, null, 1) // its shadow on the grass
  for (const sx of [-1, 1]) s += wash(`M${-250 * sx} -10l${-34 * sx} -6l${18 * sx} 26l${-18 * sx} 26l${50 * sx} -4z`, ['#d9774f', '#e0855c', '#cf6c46'], 'f', 1, ['#a9573a', 0, 2], 1)
  s += wash('M-230 -36Q0 -60 230 -36L230 34Q0 10 -230 34Z', ['#fff4dc', '#fbecd0', '#fff8e8'], 'f', 1, ['#d9b98a', 0, 3], 1)
  s += `<path d="M-218 -26Q0 -48 218 -26M-218 24Q0 0 218 24" fill="none" stroke="#e6c99c" stroke-width="2" stroke-dasharray="6 5" filter="${F('f')}"/>`
  s += txt(0, 14, 'Property Tycoon', 46, '#c96f45', 'hd') + '</g>'

  // signposts naming the neighbourhoods, each facing its own side of the board
  for (const [g, x, y, r] of SIGNS) {
    s += `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${r}) scale(1.76)">`
    s += wash(rrPath(-72, -11, 148, 30, 15), '#7a6040', 'h', .3, null, 1)
    s += wash(rrPath(-74, -14, 148, 28, 14), ['#fff6e2', '#fbefd6', '#fffaf0'], 'f', 1, ['#b48a5e', 0, 1.6], 1)
    s += `<g filter="${F('f')}"><circle cx="-58" cy="0" r="7" fill="${GROUPS[g].color}"/><circle cx="-60" cy="-2" r="2.5" fill="#fff" opacity=".5"/></g>`
    s += txt(8, 5, HOODS[g], 14, D, 'lb') + '</g>'
  }
  return s
}

// The whole board as SVG markup (texts included; boardCanvas lifts them out and letters them with real fonts).
export function boardSvg() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><defs>${paintFilterSvg('p', 5, 1.2)}`
  s += `<clipPath id="band"><rect x="${r1(-T / 2 + 3)}" y="${r1(-TH / 2 + 3)}" width="${r1(T - 6)}" height="24" rx="10"/><rect x="${r1(-T / 2 + 3)}" y="${r1(-TH / 2 + 14)}" width="${r1(T - 6)}" height="13"/></clipPath>`
  s += `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#6b4a2c" flood-opacity=".22"/></filter>`
  // paper grain, as .tb-grain in styles/themes.css: fine tooth plus a slow mottle
  s += `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" seed="2" stitchTiles="stitch"/><feColorMatrix values="2.4 0 0 0 -.7 2.4 0 0 0 -.72 2.4 0 0 0 -.76 0 0 0 0 1"/></filter>`
  s += `<filter id="mottle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="3" seed="7"/><feColorMatrix values="1.6 0 0 0 -.3 1.6 0 0 0 -.32 1.6 0 0 0 -.36 0 0 0 0 .6"/></filter></defs>`
  s += `<rect width="${W}" height="${W}" fill="#c99d6e"/>`
  s += wash(rrPath(5, 5, W - 10, W - 10, 26), ['#ecdcb6', '#f0e2c0', '#e6d4aa'], 'b', 1, null, 4)
  s += `<path d="${rrPath(5, 5, W - 10, W - 10, 26)}" fill="none" stroke="#b98b5e" stroke-width="9"/>`
  s += green()
  BOARD.forEach((sp, i) => {
    const [c, r] = cell(i), rot = [0, 90, 180, 270][Math.floor(i / 10)]
    s += `<g transform="translate(${r1(along(c) * P)} ${r1(along(r) * P)}) rotate(${rot}) scale(${(i % 10 ? S : S * .92).toFixed(4)})">${i % 10 ? tile(sp) : corner(i)}</g>`
  })
  s += `<rect width="${W}" height="${W}" filter="url(#mottle)" opacity=".07"/><rect width="${W}" height="${W}" filter="url(#grain)" opacity=".05"/>`
  return s + '</svg>'
}

const FONTS = { hd: ['600', 'Fredoka, Nunito, "Trebuchet MS", sans-serif'], lb: ['900', 'Nunito, "Trebuchet MS", sans-serif'], sm: ['800', 'Nunito, "Trebuchet MS", sans-serif'] }

// Paints the board into one cached canvas. Returns { canvas, ready }: the canvas holds a plain placeholder at once and
// the finished painting when `ready` resolves (rasterising the filters takes a moment, once).
let cached = null
export function boardCanvas() {
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = W
  const g = canvas.getContext('2d')
  g.fillStyle = '#ecdcb6'; g.fillRect(0, 0, W, W)
  g.fillStyle = '#bcd79a'; g.fillRect(E0 + 86, E0 + 86, E1 - E0 - 172, E1 - E0 - 172)
  const ready = (async () => {
    // lift the lettering out (with where each line sits) so the canvas can set it in the app's fonts
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none'
    host.innerHTML = boardSvg()
    document.body.appendChild(host)
    const svg = host.firstChild, texts = []
    for (const t of [...svg.querySelectorAll('text')]) {
      const m = t.getCTM()
      texts.push({ m: [m.a, m.b, m.c, m.d, m.e, m.f], x: +t.getAttribute('x'), y: +t.getAttribute('y'), s: t.textContent, size: +t.getAttribute('font-size'), fill: t.getAttribute('fill'), cls: t.getAttribute('class') })
      t.remove()
    }
    const markup = new XMLSerializer().serializeToString(svg)
    host.remove()
    const img = new Image()
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
    await img.decode()
    try { await Promise.race([Promise.all(Object.values(FONTS).map(([w, f]) => document.fonts.load(`${w} 20px ${f}`))), new Promise(r => setTimeout(r, 2500))]) } catch { /* system font is fine */ }
    g.drawImage(img, 0, 0, W, W)
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    for (const t of texts) {
      const [w, f] = FONTS[t.cls] || FONTS.lb
      g.setTransform(...t.m)
      g.font = `${w} ${t.size}px ${f}`; g.fillStyle = t.fill
      g.fillText(t.s, t.x, t.y)
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
    return canvas
  })().catch(e => { console.warn('board paint failed', e); return canvas })
  cached = { canvas, ready }
  return cached
}
