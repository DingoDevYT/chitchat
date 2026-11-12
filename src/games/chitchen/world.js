// The Chitchen in 3D (plain three.js): the TV-head character, the bakery built from map.js, the Tea Break stools and
// the night tram stop. Kept light for phones: shared geometries and materials, Lambert shading, no shadow maps,
// and a fixed set of lights whose intensities change (so shaders never recompile mid-game).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { ROOMS, SPOTS, FIX, TABLE, walls } from './map.js'

const G = new Map(), M = new Map()
const geo = (key, make) => G.get(key) || (G.set(key, make()), G.get(key))
export const mat = (color, o = {}) => {
  const key = color + JSON.stringify(o)
  if (!M.has(key)) { const { basic, ...rest } = o; M.set(key, basic ? new THREE.MeshBasicMaterial({ color, ...rest }) : new THREE.MeshLambertMaterial({ color, ...rest })) }
  return M.get(key)
}
const glow = (color, k = 1) => mat(color, { emissive: color, emissiveIntensity: k })
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o }
const cyl = (rt, rb, h, seg = 10) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
const sph = (r, w = 10, h = 8) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h))
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d))
const rbox = (w, h, d, r) => geo(`r${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r))

// ---- the TV-head --------------------------------------------------------------------------------------------
export const LOOKS = [
  { body: '#86b6e8', casing: '#fff1dc', trim: '#e9cfa9', tip: '#f2c14e' },
  { body: '#f09a83', casing: '#9fd8c4', trim: '#7cbca6', tip: '#ff8fa8' },
  { body: '#9cc79a', casing: '#c98d5a', trim: '#a8703f', tip: '#f2c14e', wood: true },
  { body: '#a98bd6', casing: '#f6d37a', trim: '#d9b25a', tip: '#7cc4b0' },
  { body: '#f2c14e', casing: '#f2a7c3', trim: '#d98aa8', tip: '#86b6e8' },
  { body: '#7cc4b0', casing: '#fff1dc', trim: '#e9cfa9', tip: '#e86a8a' },
  { body: '#e58fb4', casing: '#86b6e8', trim: '#6a98c9', tip: '#fff1dc' },
  { body: '#b98a6a', casing: '#f6efe2', trim: '#d8c9b0', tip: '#e8857a' },
]
export const SCREEN_W = 0.52, SCREEN_H = 0.39

// Returns { group, tv, screen (canvas + texture), pose(walk, phase, mode), broken(on), frame (talk ring) }.
export function tvHead(look) {
  const L = LOOKS[look % LOOKS.length], g = new THREE.Group()
  const bodyM = mat(L.body), legM = mat(new THREE.Color(L.body).multiplyScalar(0.8).getStyle()), dark = mat('#3b3140'), cream = mat('#fff8ee'), shoe = mat('#6b4a3a')
  const legs = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.13, 0.36, 0)
    leg.add(mesh(cyl(0.075, 0.085, 0.3, 8), legM, 0, -0.15, 0))
    const boot = mesh(sph(0.11), shoe, 0, -0.32, 0.04); boot.scale.set(1, 0.7, 1.35); leg.add(boot)
    g.add(leg); legs.push(leg)
  }
  const torso = new THREE.Group(); torso.position.y = 0.3; g.add(torso)
  torso.add(mesh(cyl(0.24, 0.34, 0.5, 14), bodyM, 0, 0.27, 0))
  const sh = mesh(geo('shoulder', () => new THREE.SphereGeometry(0.24, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)), bodyM, 0, 0.52, 0); sh.scale.y = 0.45; torso.add(sh)
  torso.add(mesh(geo('apron', () => new THREE.CylinderGeometry(0.255, 0.35, 0.42, 14, 1, true, -0.9, 1.8)), mat('#fff8ee', { side: THREE.DoubleSide }), 0, 0.24, 0.006))
  torso.add(mesh(box(0.16, 0.09, 0.02), mat('#f2a7c3'), 0, 0.2, 0.31))
  const arms = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.27, 0.5, 0)
    arm.add(mesh(cyl(0.055, 0.065, 0.3, 8), bodyM, 0, -0.14, 0)); arm.add(mesh(sph(0.08), cream, 0, -0.3, 0))
    arm.rotation.z = side * 0.35; torso.add(arm); arms.push(arm)
  }
  torso.add(mesh(cyl(0.07, 0.09, 0.08, 8), dark, 0, 0.6, 0))
  const tv = new THREE.Group(); tv.position.y = 0.92; torso.add(tv)
  tv.add(mesh(rbox(0.8, 0.62, 0.56, 0.1), mat(L.casing)))
  if (L.wood) for (let i = 0; i < 4; i++) tv.add(mesh(box(0.805, 0.012, 0.565), mat(L.trim), 0, -0.2 + i * 0.13, 0))
  tv.add(mesh(rbox(0.6, 0.46, 0.04, 0.05), dark, -0.07, 0.01, 0.27))
  const cv = document.createElement('canvas'); cv.width = 192; cv.height = 144
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  const screen = mesh(geo('screen', () => new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), -0.07, 0.01, 0.292); tv.add(screen)
  const frame = mesh(rbox(0.68, 0.56, 0.01, 0.07), mat('#8ff0cf', { basic: true, toneMapped: false }), -0.07, 0.01, 0.284); frame.visible = false; tv.add(frame)
  for (const y of [0.12, -0.02]) { const k = mesh(cyl(0.035, 0.035, 0.03, 10), mat(L.trim), 0.3, y, 0.285); k.rotation.x = Math.PI / 2; tv.add(k) }
  for (let i = 0; i < 3; i++) tv.add(mesh(box(0.08, 0.012, 0.01), dark, 0.3, -0.12 - i * 0.035, 0.282))
  const ants = []
  for (const side of [-1, 1]) {
    const ant = new THREE.Group(); ant.position.set(0, 0.31, 0); ant.rotation.z = -side * 0.42
    const rod = mesh(cyl(0.012, 0.012, 0.36, 5), dark, 0, 0.18, 0); ant.add(rod)
    const tip = mesh(sph(0.04, 8, 6), glow(L.tip, 0.25), 0, 0.37, 0); ant.add(tip)
    tv.add(ant); ants.push({ ant, rod, tip })
  }
  tv.add(mesh(cyl(0.06, 0.07, 0.03, 10), mat(L.trim), 0, 0.315, 0))
  // the smashed bits, hidden until tucked in: a droopy antenna, a plaster, cartoon stars
  const hurt = new THREE.Group(); hurt.visible = false; tv.add(hurt)
  const pl = mesh(box(0.2, 0.06, 0.01), mat('#f3c7a5'), 0.28, 0.24, 0.282); pl.rotation.z = 0.6; hurt.add(pl)
  for (const [x, y, z] of [[-0.45, 0.42, 0.1], [0.42, 0.5, -0.05], [-0.2, 0.55, 0.2]]) hurt.add(mesh(geo('star', () => new THREE.OctahedronGeometry(0.045)), glow('#ffd76a', 0.9), x, y, z))
  const droop = new THREE.Group(); droop.position.set(0, 0.31, 0); droop.rotation.z = 0.42; droop.visible = false
  droop.add(mesh(cyl(0.012, 0.012, 0.18, 5), dark, 0, 0.09, 0))
  const up = new THREE.Group(); up.position.y = 0.18; up.rotation.z = -1.6
  up.add(mesh(cyl(0.012, 0.012, 0.2, 5), dark, 0, 0.1, 0)); up.add(mesh(sph(0.04, 8, 6), glow(L.tip, 0.1), 0, 0.21, 0)); droop.add(up); tv.add(droop)

  let mode = null
  return {
    group: g, tv, canvas: cv, tex, frame,
    // mode: 'stand' | 'walk' | 'sit' | 'slump'; phase: walk cycle (radians)
    pose(m, phase = 0, amount = 1) {
      const s = Math.sin(phase) * 0.55 * amount
      if (m === 'walk' || m === 'stand') {
        legs.forEach((l, i) => { l.rotation.set(i ? -s : s, 0, 0); l.position.y = 0.36 })
        arms.forEach((a, i) => { a.rotation.set(i ? s * 0.9 : -s * 0.9, 0, (i ? 1 : -1) * 0.35) })
        torso.position.y = 0.3 + Math.abs(Math.cos(phase)) * 0.03 * amount; tv.rotation.set(0, 0, 0)
      }
      if (m === mode) return
      mode = m
      if (m === 'sit') { legs.forEach(l => { l.rotation.set(-1.35, 0, 0); l.position.y = 0.4 }); arms.forEach((a, i) => a.rotation.set(-0.9, 0, (i ? 1 : -1) * 0.15)); torso.position.y = 0.08; tv.rotation.set(0, 0, 0) }
      if (m === 'slump') { legs.forEach((l, i) => { l.rotation.set(-1.45, 0, (i ? 1 : -1) * 0.25); l.position.y = 0.16 }); torso.position.y = 0.12; tv.rotation.set(0.18, 0, 0.22) }
    },
    broken(on) { hurt.visible = droop.visible = on; ants[1].ant.visible = !on },
  }
}

// A soft glowing floor ring (talking: mint, your lamplight: warm, a chore spot: gold).
export function ring(color, r = 0.5, opacity = 0.85) {
  const m = new THREE.Mesh(geo(`ring${r}`, () => new THREE.RingGeometry(r * 0.82, r, 32)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false }))
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03
  return m
}

// ---- textures -------------------------------------------------------------------------------------------------
function texCanvas(draw, rep) {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'), 128, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); return t
}
const planks = (base, line) => (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff0c' : '#0000000c'; g.fillRect(0, (i * h) / 8, w, h / 8); g.fillStyle = line; g.fillRect(0, (i * h) / 8, w, 1); g.fillRect(((i * 37) % 8) * (w / 8), (i * h) / 8, 1, h / 8) }
}
const FLOOR = {
  pantry: g => planks('#b88a5e', '#8a613f')(g, 128, 128), loft: g => planks('#a87c58', '#7d573a')(g, 128, 128), shop: g => planks('#c4956a', '#956a46')(g, 128, 128),
  cellar: g => { g.fillStyle = '#8e8a93'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#6f6a76'; g.lineWidth = 2; for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) g.strokeRect(x * 32 + (y % 2) * 16, y * 32, 32, 32) },
  kitchen: g => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#f3e2c4' : '#dca889'; g.fillRect(x * 32, y * 32, 32, 32) } },
  garden: g => { g.fillStyle = '#6f9f62'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 200; i++) { g.fillStyle = i % 2 ? '#7fb06f' : '#5f8e55'; g.fillRect((i * 97) % 128, (i * 61) % 128, 2, 5) } },
}

// ---- the bakery -----------------------------------------------------------------------------------------------
// map (x, y) → world (x, z). Returns { group, flames, lanterns, ovenMouth }.
export function bakery() {
  const B = new THREE.Group(), flames = [], lanterns = []
  for (const r of ROOMS) {
    const f = mesh(new THREE.PlaneGeometry(r.w, r.h), new THREE.MeshLambertMaterial({ map: texCanvas(FLOOR[r.id], [r.w / 4, r.h / 4]) }), r.x + r.w / 2, 0, r.y + r.h / 2)
    f.rotation.x = -Math.PI / 2; B.add(f)
  }
  const wallM = mat('#e9d3b4'), trimM = mat('#8a5a3c'), hedgeM = mat('#557f4c')
  for (const [x1, y1, x2, y2] of walls()) {
    const len = Math.hypot(x2 - x1, y2 - y1), cx = (x1 + x2) / 2, cz = (y1 + y2) / 2
    const garden = cx > 24 && cz > 11 && (x1 === x2 ? x1 === 36 : y1 === 24)
    const h = garden ? 0.7 : 1.15
    const w = mesh(new THREE.BoxGeometry(len + 0.25, h, 0.25), garden ? hedgeM : wallM, cx, h / 2, cz)
    if (x1 === x2) w.rotation.y = Math.PI / 2
    B.add(w)
    if (!garden) { const t = mesh(new THREE.BoxGeometry(len + 0.3, 0.08, 0.32), trimM, cx, h, cz); if (x1 === x2) t.rotation.y = Math.PI / 2; B.add(t) }
  }
  // doors that stick during a pantry jam: little wooden doors, shown only then
  const jamDoors = new THREE.Group(); jamDoors.visible = false; B.add(jamDoors)
  for (const [x, z, rot] of [[12, 5.5, Math.PI / 2], [6, 11, 0]]) { const d = mesh(box(2, 1.1, 0.12), mat('#7a4e32'), x, 0.55, z); d.rotation.y = rot; jamDoors.add(d) }
  const wood = mat('#9a6a45'), darkWood = mat('#6e4a33'), brick = mat('#c0664a'), cream = mat('#f6ead7'), gold = mat('#e6b443')
  const add = (o, x, y, z) => { o.position.set(x, y, z); B.add(o); return o }
  const bx = (w, h, d, m, x, y, z) => add(new THREE.Mesh(box(w, h, d), m), x, y, z)
  const cy = (rt, rb, h, m, x, y, z, seg = 10) => add(new THREE.Mesh(cyl(rt, rb, h, seg), m), x, y, z)
  const ball = (r, m, x, y, z) => add(new THREE.Mesh(sph(r), m), x, y, z)
  const candle = (x, z, y = 0) => { cy(0.07, 0.07, 0.22, cream, x, y + 0.11, z, 8); const f = ball(0.05, glow('#ffcf6a', 2.5), x, y + 0.27, z); f.scale.y = 1.6; flames.push(f) }
  // Kitchen
  const ovenX = FIX.dialA.x, ovenZ = 11.9
  bx(3, 1, 1.6, brick, ovenX, 0.5, ovenZ + 0.8)
  const dome = add(new THREE.Mesh(geo('dome', () => new THREE.SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), brick), ovenX, 1, ovenZ + 0.8); dome.scale.set(1.1, 0.75, 0.6)
  const ovenMouth = add(new THREE.Mesh(geo('mouth', () => new THREE.CircleGeometry(0.5, 16, 0, Math.PI)), new THREE.MeshLambertMaterial({ color: '#ff9a3c', emissive: '#ff9a3c', emissiveIntensity: 1.6 })), ovenX, 1.0, ovenZ + 1.62)
  bx(0.8, 0.1, 0.1, darkWood, ovenX, 1.0, ovenZ + 1.62)
  const dial = cy(0.12, 0.12, 0.06, gold, ovenX + 1.1, 0.7, ovenZ + 1.62, 12); dial.rotation.x = Math.PI / 2
  cy(1.9, 1.9, 0.12, wood, TABLE.x, 0.78, TABLE.y, 24); cy(0.25, 0.4, 0.75, darkWood, TABLE.x, 0.37, TABLE.y)
  const bell = add(new THREE.Group(), FIX.bell.x + 0.5, 0.84, FIX.bell.y - 0.3)
  bell.add(mesh(cyl(0.06, 0.22, 0.3, 12), gold, 0, 0.17, 0)); bell.add(mesh(sph(0.05), gold, 0, 0.36, 0))
  const pot = add(new THREE.Group(), TABLE.x - 0.5, 0.84, TABLE.y + 0.3)
  pot.add(mesh(sph(0.26, 12, 8), mat('#86b6e8'), 0, 0.22, 0)); const sp = mesh(cyl(0.03, 0.05, 0.25, 6), mat('#86b6e8'), 0.3, 0.25, 0); sp.rotation.z = -0.9; pot.add(sp)
  candle(TABLE.x + 0.7, TABLE.y + 0.6, 0.84)
  const ice = SPOTS.find(s => s.id === 'ice')
  bx(3, 0.9, 1.2, wood, ice.x, 0.45, ice.y - 1.4); bx(3.1, 0.08, 1.3, cream, ice.x, 0.92, ice.y - 1.4)
  for (let i = 0; i < 5; i++) { ball(0.16, mat('#e2a35c'), ice.x - 1 + i * 0.5, 1.02, ice.y - 1.3); const ic = ball(0.11, mat('#f7b6c9'), ice.x - 1 + i * 0.5, 1.12, ice.y - 1.3); ic.scale.y = 0.5 }
  // Pantry
  bx(9, 1.6, 0.6, wood, 6, 0.8, 0.5)
  for (let i = 0; i < 12; i++) cy(0.14, 0.14, 0.3, mat(['#e86a8a', '#f2c14e', '#7cc4b0', '#a98bd6'][i % 4]), 2 + i * 0.7, 1.75, 0.5, 8)
  const ger = SPOTS.find(s => s.id === 'gerald')
  cy(0.45, 0.45, 0.9, new THREE.MeshLambertMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.45 }), ger.x - 1.2, 0.45, ger.y - 1.2, 14)
  ball(0.38, mat('#f4e9d2'), ger.x - 1.2, 0.55, ger.y - 1.2)
  for (const [x, z] of [[1.2, 8.5], [2.2, 9.2], [1.5, 9.6]]) { const s = add(new THREE.Mesh(rbox(0.8, 0.9, 0.6, 0.2), mat('#e9dcc2')), x, 0.45, z); s.rotation.y = x }
  const sift = SPOTS.find(s => s.id === 'sift'); bx(1.6, 0.85, 1, wood, sift.x + 1, 0.42, sift.y + 0.6); cy(0.3, 0.25, 0.15, mat('#c9c2b6'), sift.x + 1, 0.93, sift.y + 0.6)
  candle(1.5, 4.5); candle(10.5, 2)
  // Clock Loft
  const clk = SPOTS.find(s => s.id === 'clock')
  const house = add(new THREE.Group(), clk.x, 1.2, 0.35)
  house.add(mesh(box(1, 1, 0.4), darkWood)); const roof = mesh(geo('roof', () => new THREE.ConeGeometry(0.85, 0.5, 4)), mat('#8a3f3a'), 0, 0.7, 0); roof.rotation.y = Math.PI / 4; house.add(roof)
  house.add(mesh(geo('clockface', () => new THREE.CircleGeometry(0.32, 16)), cream, 0, 0.05, 0.21)); house.add(mesh(box(0.03, 0.6, 0.03), gold, 0, -0.75, 0.15)); house.add(mesh(sph(0.09), gold, 0, -1.05, 0.15))
  bx(1.2, 0.02, 3, mat('#b5655a'), 17, 0.02, 6.5)
  for (const [x, z, y] of [[14, 9.5, 0], [14.9, 9.6, 0], [14.4, 9.4, 0.7]]) bx(0.8, 0.7, 0.8, mat('#b98a5a'), x, 0.35 + y, z)
  candle(22.5, 2); candle(13.5, 3)
  // Jam Cellar
  for (let r = 0; r < 2; r++) { bx(7, 0.08, 0.6, wood, 31, 0.8 + r * 0.6, 0.6); for (let i = 0; i < 12; i++) cy(0.13, 0.13, 0.26, mat(['#d94f5c', '#f28a3c', '#8b4fb0', '#f2c14e'][(i + r) % 4]), 28 + i * 0.55, 0.97 + r * 0.6, 0.6, 8) }
  for (const [x, z] of [[26, 9], [27, 9.3]]) cy(0.45, 0.45, 0.95, mat('#8a5a3c'), x, 0.48, z, 12)
  const valve = add(new THREE.Mesh(geo('valve', () => new THREE.TorusGeometry(0.25, 0.05, 6, 14)), mat('#d94f5c')), FIX.dialB.x + 1.6, 0.9, FIX.dialB.y); valve.rotation.y = Math.PI / 2
  cy(0.05, 0.05, 2, mat('#8e8a93'), FIX.dialB.x + 1.75, 1, FIX.dialB.y, 6)
  candle(25.5, 5.5); candle(34.5, 6)
  // Front Shop
  bx(1.2, 0.95, 5, wood, 10, 0.47, 17); bx(1.25, 0.5, 5, new THREE.MeshLambertMaterial({ color: '#d8f0f5', transparent: true, opacity: 0.35 }), 10, 1.2, 17)
  for (let i = 0; i < 6; i++) { const b = ball(0.22, mat('#d99a55'), 10, 1.05, 15 + i * 0.8); b.scale.set(1.4, 0.7, 1) }
  const kn = SPOTS.find(s => s.id === 'knead'); bx(1.8, 0.85, 1.1, wood, kn.x - 1.3, 0.42, kn.y); const d = ball(0.32, mat('#f4e3c6'), kn.x - 1.3, 0.95, kn.y); d.scale.y = 0.55
  const bxs = SPOTS.find(s => s.id === 'box'); for (let i = 0; i < 3; i++) bx(0.7, 0.35, 0.7, mat('#f2a7c3'), bxs.x - 1.4, 0.18 + i * 0.36, bxs.y + 0.6)
  const fuse = bx(0.5, 0.7, 0.2, mat('#7d7884'), FIX.fuse.x - 1.75, 1, FIX.fuse.y + 0.5); fuse.rotation.y = Math.PI / 2
  candle(1, 22.5); candle(6, 12)
  // Herb Garden
  for (let i = 0; i < 3; i++) { bx(2.2, 0.5, 0.9, wood, 28 + i * 2.6, 0.25, 21.5); for (let k = 0; k < 4; k++) ball(0.25, mat(k % 2 ? '#5f9a58' : '#7cc46a'), 27.3 + i * 2.6 + k * 0.45, 0.62, 21.5) }
  for (let i = 0; i < 5; i++) { const st = cy(0.4, 0.45, 0.06, mat('#b9b2a8'), 25.8 + i * 1.6, 0.03, 17.6 + (i % 2) * 0.4, 10); st.scale.z = 0.8 }
  for (let i = 0; i < 8; i++) lanterns.push(ball(0.14, glow(['#ffcf6a', '#ff9fb4', '#9fe0ff'][i % 3], 1.6), 25 + i * 1.4, 2.0 - Math.sin((i / 7) * Math.PI) * 0.35, 12.4 + Math.sin(i) * 0.2))
  candle(34.5, 14)
  return { group: B, flames, lanterns, ovenMouth, jamDoors }
}

// Gold chore-spot ring with a floating sparkle.
export function choreMarker(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z)
  g.add(ring('#f2c14e', 0.75))
  const s = mesh(geo('star2', () => new THREE.OctahedronGeometry(0.16)), glow('#ffd76a', 1.4), 0, 1.7, 0); s.scale.y = 1.4; g.add(s)
  g.userData.spark = s
  return g
}

export function stools() {
  const g = new THREE.Group(), m = mat('#9a6a45')
  for (let i = 0; i < 8; i++) { const s = mesh(cyl(0.3, 0.26, 0.45, 10), m); s.visible = false; g.add(s) }
  return g
}
export function cup(spoons) {
  const g = new THREE.Group()
  g.add(mesh(cyl(0.17, 0.12, 0.17, 12), mat('#fff8ee')))
  for (let k = 0; k < spoons; k++) { const s = mesh(cyl(0.015, 0.015, 0.36, 5), mat('#d8dde6'), (k - (spoons - 1) / 2) * 0.06, 0.15, 0); s.rotation.z = (k - (spoons - 1) / 2) * 0.35; g.add(s) }
  return g
}

// The night tram stop (the reveal), built off to the side of the bakery at (x0, 0, z0).
export const TRAM = { x: 70, z: 12 }
export function tramStop() {
  const S = new THREE.Group(); S.position.set(TRAM.x, 0, TRAM.z)
  const g = mesh(new THREE.PlaneGeometry(60, 30), mat('#2e3a2e'), 0, -0.01, -6); g.rotation.x = -Math.PI / 2; S.add(g)
  S.add(mesh(box(18, 0.35, 4), mat('#9a8f86'), 0, 0.17, 2.2))
  for (const z of [-0.6, -1.8]) S.add(mesh(box(40, 0.08, 0.1), mat('#b0b4c0'), 0, 0.06, z))
  const tram = new THREE.Group(); tram.position.set(3.2, 0, -1.2); S.add(tram)
  tram.add(mesh(box(8, 2.3, 2.2), mat('#f3e2c4'), 0, 1.55, 0)); tram.add(mesh(box(8.05, 0.7, 2.25), mat('#5fb3a6'), 0, 0.75, 0))
  tram.add(mesh(box(8.1, 0.25, 2.3), mat('#5fb3a6'), 0, 2.8, 0))
  const win = mat('#ffd58a', { emissive: '#ffb54a', emissiveIntensity: 1.6 })
  for (let i = 0; i < 4; i++) if (i !== 1) tram.add(mesh(geo('win', () => new THREE.PlaneGeometry(1.2, 0.9)), win, -3 + i * 1.9, 1.9, 1.11))
  tram.add(mesh(geo('door', () => new THREE.PlaneGeometry(1.1, 1.9)), mat('#ffcf7a', { emissive: '#ffb54a', emissiveIntensity: 2.2 }), -1.1, 1.4, 1.11))
  for (const x of [-2.8, 2.8]) for (const z of [-0.9, 0.9]) { const w = mesh(cyl(0.35, 0.35, 0.2, 12), mat('#3b3140'), x, 0.35, z); w.rotation.x = Math.PI / 2; tram.add(w) }
  S.add(mesh(cyl(0.06, 0.08, 3.2, 8), mat('#3b3140'), -4.6, 1.95, 3.4)); S.add(mesh(sph(0.22), glow('#ffe0a0', 2.5), -4.6, 3.6, 3.4))
  for (let i = 0; i < 18; i++) S.add(mesh(sph(0.18, 6, 5), glow(['#ffb54a', '#ff8fa8', '#9fd8ff'][i % 3], 2), -14 + ((i * 37) % 30), 5 + ((i * 13) % 7) * 0.8, -14 - ((i * 7) % 10)))
  const stars = new THREE.BufferGeometry(); const pts = []; for (let i = 0; i < 200; i++) pts.push(((i * 73) % 120) - 60, 8 + ((i * 31) % 30), -30 - (i % 10))
  stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); S.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#fff', size: 0.18 })))
  S.add(mesh(geo('moon', () => new THREE.CircleGeometry(1.6, 24)), mat('#fff3c8', { basic: true }), 10, 13, -35))
  return { group: S, door: [TRAM.x + 2.1, TRAM.z + 0.2] }
}

export { THREE }
