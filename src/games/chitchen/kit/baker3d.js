// The Midnight Chitchen baker, in plain three.js (no React), so both the R3F <Baker> and the plain-three game loop
// can use it. A stubby little baker with a rounded TV for a head: the screen shows the player's avatar, the body wears
// their colour, an apron and a baker's hat with a coloured band. Toon shading plus an ink outline (inverted hull) keep
// it readable from the tilted top-down camera.
//
//   const b = createBaker()            // b.group goes in the scene; place it with b.group.position
//   b.update(dt, { texture, color, state, facing, speed, talking, onStep })   // every frame
//   b.dispose()                        // per-baker bits only; shared geometry and materials stay
//
// state: 'idle' | 'walk' | 'task' | 'dead' | 'ghost' | 'ventIn' | 'ventOut' | 'win' | 'lose'
// Extra update props: instant (dead: already lying there), onStep (each footfall), phase / stateTime (pin the
// walk phase or the time into the state, for previews and frame strips).
// Phones: every geometry and every colour material is shared between bakers; each baker owns only its screen
// materials and one Points object for sparks. ~22 draw calls a baker, nothing allocated per frame.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const STATES = ['idle', 'walk', 'task', 'dead', 'ghost', 'ventIn', 'ventOut', 'win', 'lose']
export const BAKER_HEIGHT = 1.85 // feet to the top of the hat, in world units
export const SCREEN = { w: 0.54, h: 0.38 }

// ---- shared resources (made on first use, so importing this file costs nothing) ------------------------------------
let S = null, GRAD = null
const flat = g => (g.index ? g.toNonIndexed() : g) // RoundedBoxGeometry has no index; merging needs all alike
const toonCache = new Map()
function shared() {
  if (S) return S
  GRAD = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
  GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter
  GRAD.generateMipmaps = false
  GRAD.needsUpdate = true
  const unitPlane = new THREE.PlaneGeometry(1, 1)
  S = {
    g: {
      leg: new THREE.CylinderGeometry(0.068, 0.075, 0.22, 8),
      foot: new THREE.SphereGeometry(0.09, 10, 7),
      body: new THREE.CapsuleGeometry(0.25, 0.14, 5, 14),
      apron: new THREE.CylinderGeometry(0.268, 0.3, 0.3, 16, 1, true, -1.05, 2.1),
      bib: new THREE.BoxGeometry(0.22, 0.15, 0.025),
      pocket: new THREE.BoxGeometry(0.14, 0.07, 0.02),
      arm: new THREE.CapsuleGeometry(0.055, 0.13, 3, 8),
      hand: new THREE.SphereGeometry(0.072, 10, 7),
      neck: new THREE.CylinderGeometry(0.075, 0.09, 0.08, 10),
      casing: new RoundedBoxGeometry(0.76, 0.58, 0.5, 3, 0.12),
      // the static dark bits of the TV (bezel + speaker grille) and the two knobs, merged: one draw call each
      headDark: mergeGeometries([new RoundedBoxGeometry(0.6, 0.44, 0.04, 2, 0.06).translate(0, 0.31, 0.245), ...[-1, 0, 1].map(i => new THREE.BoxGeometry(0.06, 0.012, 0.012).translate(i * 0.08, 0.05, 0.252))].map(flat)),
      knobs: mergeGeometries([-0.22, 0.22].map(x => new THREE.CylinderGeometry(0.032, 0.032, 0.035, 10).rotateX(Math.PI / 2).translate(x, 0.04, 0.25))),
      hatBand: new THREE.CylinderGeometry(0.17, 0.17, 0.11, 14),
      hatPuff: new THREE.SphereGeometry(0.2, 14, 9),
      tail: new THREE.ConeGeometry(0.25, 0.5, 14, 1, true),
      shadow: new THREE.CircleGeometry(0.42, 20),
      unitPlane,
    },
    m: {
      ink: new THREE.MeshBasicMaterial({ color: '#2a2030', side: THREE.BackSide }),
      cream: toon('#fff6e8'),
      pocket: toon('#f2a7c3'),
      shoe: toon('#6b4a3a'),
      dark: toon('#2f2836'),
      knob: toon('#d9b25a'),
      hat: toon('#fffaf2'),
      shadow: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }),
      crack: new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, toneMapped: false }),
      sparks: new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    },
    face: faceTexture(),
  }
  S.m.apron = toon('#fff6e8', { side: THREE.DoubleSide })
  return S
}

// One toon material per colour (and per ghost-ness), shared by every baker that wears it.
function toon(color, o = {}) {
  const key = color + JSON.stringify(o)
  let m = toonCache.get(key)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...o })
    toonCache.set(key, m)
  }
  return m
}
// For props and other kit pieces: the same cached toon look.
export function toonMat(color, o) { shared(); return toon(color, o) }
export function inkMat() { return shared().m.ink }
const ghostOpts ={ transparent: true, opacity: 0.42, depthWrite: false }
const lighten = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString()

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
// A simple happy face for a screen with no avatar yet (drawn on the screen's own colour).
function faceTexture() {
  if (typeof document === 'undefined') return null
  const c = canvas(128, 96), g = c.getContext('2d'), ink = '#231d2b'
  g.fillStyle = ink
  for (const x of [46, 82]) { g.beginPath(); g.ellipse(x, 44, 6, 8, 0, 0, 7); g.fill() }
  g.fillStyle = '#ff6b8b66'; for (const x of [34, 94]) { g.beginPath(); g.ellipse(x, 60, 8, 5, 0, 0, 7); g.fill() }
  g.strokeStyle = ink; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(54, 62); g.quadraticCurveTo(64, 71, 74, 62); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// The smashed screen: a dark tint, a punched hole and white cracks running out from it, plus a little static.
function crackTexture() {
  if (typeof document === 'undefined') return null
  const W = 160, H = 112, c = canvas(W, H), g = c.getContext('2d')
  let seed = 11
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.fillStyle = 'rgba(16,14,26,0.62)'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 260; i++) { const v = 120 + r() * 135; g.fillStyle = `rgba(${v},${v},${v + 15},0.35)`; g.fillRect(r() * W, r() * H, 2, 1) }
  const cx = W * 0.58, cy = H * 0.4
  g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineCap = 'round'
  for (let k = 0; k < 11; k++) {
    let a = (k / 11) * Math.PI * 2 + r() * 0.4, x = cx, y = cy
    g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y)
    for (let j = 0; j < 5; j++) { const len = 9 + r() * 16; a += (r() - 0.5) * 0.8; x += Math.cos(a) * len; y += Math.sin(a) * len; g.lineTo(x, y); g.lineWidth = Math.max(0.8, 2.2 - j * 0.4) }
    g.stroke()
  }
  g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 24, 0.4, 2.6); g.stroke()
  g.fillStyle = '#0b0910'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---- helpers --------------------------------------------------------------------------------------------------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const bounceOut = x => {
  x = clamp(x, 0, 1)
  const n = 7.5625, d = 2.75
  if (x < 1 / d) return n * x * x
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375
  return n * (x -= 2.625 / d) * x + 0.984375
}
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a))
const JOINTS = { rigY: 0, rigRX: 0, rigRY: 0, sqX: 1, sqY: 1, torX: 0, torY: 0, torZ: 0, legL: 0, legR: 0, splay: 0, aLX: 0, aLZ: 0.22, aRX: 0, aRZ: 0.22, hdX: 0, hdZ: 0, hdY: 0, hatX: 0, hatZ: 0, tail: 0 }
const SNAP = new Set(['dead', 'ventIn', 'ventOut'])
const N_SPARK = 32
const tmpV = new THREE.Vector3()
const tmpC = new THREE.Color()

// ---- the baker ------------------------------------------------------------------------------------------------------
export function createBaker() {
  const { g: G, m: M, face } = shared()
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); return o }

  const group = new THREE.Group() // place this one; the rest is internal
  const yawG = new THREE.Group(); group.add(yawG)
  const shadow = mesh(G.shadow, M.shadow, 0, 0.006, 0); shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = -1; yawG.add(shadow)
  const rig = new THREE.Group(); yawG.add(rig) // squash/stretch, bounce, topple (pivot at the feet)
  const hips = new THREE.Group(); hips.position.y = 0.3; rig.add(hips)

  // legs
  const legs = [], feet = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.1, 0, 0); leg.userData.side = side
    const shin = mesh(G.leg, null, 0, -0.11, 0); leg.add(shin)
    const foot = mesh(G.foot, M.shoe, 0, -0.24, 0.035); foot.scale.set(1, 0.62, 1.4); leg.add(foot)
    hips.add(leg); legs.push({ leg, shin }); feet.push(foot)
  }
  // torso: body, apron, arms, neck, head
  const torso = new THREE.Group(); hips.add(torso)
  const body = mesh(G.body, null, 0, 0.31, 0); body.scale.set(1.05, 1, 0.9); torso.add(body)
  const bodyLine = mesh(G.body, M.ink, 0, 0.31, 0); bodyLine.scale.set(1.05 * 1.07, 1.05, 0.9 * 1.08); torso.add(bodyLine)
  const apron = mesh(G.apron, M.apron, 0, 0.24, 0); apron.scale.z = 0.9; torso.add(apron)
  const bib = mesh(G.bib, M.cream, 0, 0.45, 0.218); bib.rotation.x = -0.18; torso.add(bib)
  const pocket = mesh(G.pocket, M.pocket, 0, 0.2, 0.262); pocket.rotation.x = 0.12; torso.add(pocket)
  const tail = mesh(G.tail, null, 0, 0.0, 0); tail.rotation.x = Math.PI; tail.visible = false; torso.add(tail)
  const arms = [], hands = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.27, 0.47, 0)
    const sleeve = mesh(G.arm, null, 0, -0.1, 0); arm.add(sleeve)
    const hand = mesh(G.hand, M.cream, 0, -0.22, 0); arm.add(hand)
    torso.add(arm); arms.push({ arm, sleeve, side }); hands.push(hand)
  }
  torso.add(mesh(G.neck, M.dark, 0, 0.63, 0))
  const head = new THREE.Group(); head.position.y = 0.64; torso.add(head)
  const casing = mesh(G.casing, null, 0, 0.29, 0); head.add(casing)
  const casingLine = mesh(G.casing, M.ink, 0, 0.29, 0); casingLine.scale.setScalar(1.06); head.add(casingLine)
  head.add(mesh(G.headDark, M.dark))
  // screen layers, back to front: colour, avatar, crack; glow rim sits behind the bezel
  const bgMat = new THREE.MeshBasicMaterial({ color: '#f6c9a0', toneMapped: false, transparent: true })
  const avMat = new THREE.MeshBasicMaterial({ map: face, transparent: true, toneMapped: false, depthWrite: false })
  const glowMat = new THREE.MeshBasicMaterial({ color: '#8ff0cf', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const screenBg = mesh(G.unitPlane, bgMat, 0, 0.31, 0.268); screenBg.scale.set(SCREEN.w, SCREEN.h, 1); head.add(screenBg)
  const avatar = mesh(G.unitPlane, avMat, 0, 0.31, 0.274); avatar.renderOrder = 1; head.add(avatar)
  const crack = mesh(G.unitPlane, M.crack, 0, 0.31, 0.28); crack.scale.set(SCREEN.w, SCREEN.h, 1); crack.renderOrder = 2; crack.visible = false; head.add(crack)
  const glow = mesh(G.unitPlane, glowMat, 0, 0.31, 0.252); glow.scale.set(0.72, 0.56, 1); glow.renderOrder = 1; head.add(glow)
  const screenAnchor = new THREE.Object3D(); screenAnchor.position.set(0, 0.31, 0.3); head.add(screenAnchor)
  head.add(mesh(G.knobs, M.knob))
  const hat = new THREE.Group(); hat.position.set(0, 0.58, -0.02); hat.rotation.z = -0.12; head.add(hat)
  const band = mesh(G.hatBand, null, 0, 0.05, 0); hat.add(band)
  const puff = mesh(G.hatPuff, M.hat, 0, 0.19, 0); puff.scale.set(1.08, 0.72, 1.08); hat.add(puff)

  // sparks, sparkles, puffs: one Points per baker, fading by colour (additive), parked far below when idle
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(N_SPARK * 3).fill(-999), pCol = new Float32Array(N_SPARK * 3)
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
  const pts = new THREE.Points(pGeo, M.sparks); pts.frustumCulled = false; yawG.add(pts)
  const pv = new Float32Array(N_SPARK * 3), plife = new Float32Array(N_SPARK), pmax = new Float32Array(N_SPARK), pgrav = new Float32Array(N_SPARK), prgb = new Float32Array(N_SPARK * 3)
  let pNext = 0, pAlive = 0
  const emit = (x, y, z, count, color, spread, up, grav, life = 0.7) => {
    tmpC.set(color)
    for (let k = 0; k < count; k++) {
      const i = pNext; pNext = (pNext + 1) % N_SPARK
      const a = Math.random() * Math.PI * 2, s = spread * (0.4 + Math.random() * 0.6)
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z
      pv[i * 3] = Math.cos(a) * s; pv[i * 3 + 1] = up * (0.5 + Math.random() * 0.7); pv[i * 3 + 2] = Math.sin(a) * s
      plife[i] = pmax[i] = life * (0.6 + Math.random() * 0.6); pgrav[i] = grav
      prgb[i * 3] = tmpC.r; prgb[i * 3 + 1] = tmpC.g; prgb[i * 3 + 2] = tmpC.b
    }
    pAlive = N_SPARK
  }
  const stepParticles = dt => {
    if (!pAlive) return
    let alive = 0
    for (let i = 0; i < N_SPARK; i++) {
      if (plife[i] <= 0) continue
      plife[i] -= dt
      if (plife[i] <= 0) { pPos[i * 3 + 1] = -999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue }
      alive++
      pv[i * 3 + 1] += pgrav[i] * dt
      const drag = 1 - 2.2 * dt
      pv[i * 3] *= drag; pv[i * 3 + 2] *= drag
      pPos[i * 3] += pv[i * 3] * dt; pPos[i * 3 + 1] = Math.max(0.02, pPos[i * 3 + 1] + pv[i * 3 + 1] * dt); pPos[i * 3 + 2] += pv[i * 3 + 2] * dt
      const f = plife[i] / pmax[i]
      pCol[i * 3] = prgb[i * 3] * f; pCol[i * 3 + 1] = prgb[i * 3 + 1] * f; pCol[i * 3 + 2] = prgb[i * 3 + 2] * f
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true
    pAlive = alive
  }
  // where the screen is, in yawG space (sparks fly from it wherever the head has fallen)
  const screenPos = () => { screenAnchor.getWorldPosition(tmpV); return yawG.worldToLocal(tmpV) }

  // ---- materials by colour and ghost-ness ----
  let curColor = null, curGhost = null
  const applyLook = (color, ghost) => {
    if (color === curColor && ghost === curGhost) return
    curColor = color; curGhost = ghost
    const o = ghost ? ghostOpts : {}
    const bodyM = toon(color, o), limbM = toon('#' + new THREE.Color(color).multiplyScalar(0.82).getHexString(), o), caseM = toon(lighten(color, 0.18), o)
    body.material = bodyM; tail.material = bodyM; band.material = bodyM
    for (const a of arms) a.sleeve.material = bodyM
    for (const l of legs) l.shin.material = limbM
    casing.material = caseM
    const crm = ghost ? toon('#fff6e8', ghostOpts) : M.cream
    for (const h of hands) h.material = crm
    bib.material = crm; puff.material = ghost ? toon('#fffaf2', ghostOpts) : M.hat
    apron.material = ghost ? toon('#fff6e8', { ...ghostOpts, side: THREE.DoubleSide }) : M.apron
    pocket.material = ghost ? toon('#f2a7c3', ghostOpts) : M.pocket
    bodyLine.visible = casingLine.visible = !ghost
    for (const f of feet) f.visible = !ghost
    for (const l of legs) l.leg.visible = !ghost
    tail.visible = ghost
    bgBase.set(lighten(color, 0.55))
  }
  const bgBase = new THREE.Color('#f6c9a0')

  // ---- the avatar on the screen, fitted to its aspect and bottom-aligned like a PNGtuber ----
  let curTex, texW = 0, texH = 0
  const fitAvatar = tex => {
    const img = tex?.image, w = img?.naturalWidth || img?.videoWidth || img?.width || 0, h = img?.naturalHeight || img?.videoHeight || img?.height || 0
    if (tex === curTex && w === texW && h === texH) return
    curTex = tex; texW = w; texH = h
    avMat.map = tex || face; avMat.needsUpdate = true
    if (!tex || !w || !h) { avatar.scale.set(SCREEN.w * 0.9, SCREEN.h * 0.9, 1); avatar.userData.y = 0.31; return }
    const a = w / h, box = (SCREEN.w * 0.92) / (SCREEN.h * 0.96)
    const sw = a > box ? SCREEN.w * 0.92 : SCREEN.h * 0.96 * a, sh = sw / a
    avatar.scale.set(sw, sh, 1)
    avatar.userData.y = 0.31 - SCREEN.h / 2 + sh / 2 + 0.006
  }

  // ---- animation ----
  const C = { ...JOINTS }, P = { ...JOINTS }
  const st = { state: null, t: 0, clock: Math.random() * 10, phase: 0, yaw: 0, talk: 0, spark: 0, lastSin: 0, ventDone: false }

  function update(dt, p = {}) {
    dt = Math.min(dt || 0, 0.05)
    const state = STATES.includes(p.state) ? p.state : 'idle'
    if (state !== st.state) enter(state, p)
    st.t += dt; st.clock += dt
    if (p.stateTime != null) st.t = p.stateTime // previews and frame strips: pin the state's clock
    const t = st.clock, tt = st.t
    applyLook(p.color || '#86b6e8', state === 'ghost')
    fitAvatar(p.texture || null)

    // facing: turn smoothly the short way round (frozen once fallen)
    if (p.facing != null && state !== 'dead') st.yaw += wrapAngle(p.facing - st.yaw) * (1 - Math.exp(-12 * dt))
    yawG.rotation.y = st.yaw

    const talkTarget = state === 'dead' ? 0 : typeof p.talking === 'number' ? clamp(p.talking, 0, 1) : p.talking ? 1 : 0
    st.talk += (talkTarget - st.talk) * (1 - Math.exp(-14 * dt))

    Object.assign(P, JOINTS)
    pose[state](P, t, tt, p, dt)

    const k = SNAP.has(state) ? 1 : 1 - Math.exp(-22 * dt)
    for (const j in P) C[j] += (P[j] - C[j]) * k

    rig.position.y = C.rigY
    rig.rotation.set(C.rigRX, C.rigRY, 0)
    rig.scale.set(C.sqX, C.sqY, C.sqX)
    torso.rotation.set(C.torX, C.torY, C.torZ)
    legs[0].leg.rotation.set(C.legL, 0, -C.splay); legs[1].leg.rotation.set(C.legR, 0, C.splay)
    arms[0].arm.rotation.set(C.aLX, 0, -C.aLZ); arms[1].arm.rotation.set(C.aRX, 0, C.aRZ)
    tail.rotation.z = C.tail
    // talking: the head bobs and squashes with the voice, the screen brightens and a mint rim glows
    const tk = st.talk, wob = Math.abs(Math.sin(t * 13)) * tk
    head.rotation.set(C.hdX - wob * 0.05, 0, C.hdZ)
    head.position.y = 0.64 + C.hdY + wob * 0.035
    head.scale.set(1 + wob * 0.03, 1 - wob * 0.04 + tk * 0.02, 1 + wob * 0.03)
    hat.position.x = C.hatX; hat.rotation.z = -0.12 + C.hatZ
    avatar.position.y = (avatar.userData.y ?? 0.31) + wob * 0.01
    glowMat.opacity = tk * (0.55 + 0.35 * Math.sin(t * 9)); glow.visible = tk > 0.02
    let bright = 1 + tk * 0.22
    if (state === 'lose') bright = 0.6
    if (state === 'dead') bright = tt < 0.5 ? (Math.floor(tt * 30) % 2 ? 1.6 : 0.3) : 0.45 + (Math.sin(t * 37) > 0.97 ? 0.5 : 0)
    bgMat.color.copy(bgBase).multiplyScalar(bright)
    avMat.color.setScalar(state === 'dead' ? 0.5 : state === 'lose' ? 0.7 : 1)
    const ghost = state === 'ghost'
    bgMat.opacity = avMat.opacity = ghost ? 0.55 : 1
    shadow.visible = rig.visible
    if (state === 'dead') { shadow.scale.set(1.1, 2.2, 1); shadow.position.z = -0.6 * clamp(tt * 2, 0, 1) }
    else { shadow.scale.setScalar(ghost ? 0.6 + Math.sin(t * 2) * 0.05 : clamp(1 - C.rigY * 0.6, 0.3, 1)); shadow.position.z = 0 }

    // particles by state
    st.spark -= dt
    if (state === 'task' && st.spark <= 0) { st.spark = 0.11; emit((Math.random() - 0.5) * 0.3, 0.75, 0.42, 1, Math.random() < 0.5 ? '#ffd76a' : '#fff1b0', 0.25, 0.9, 0.2, 0.9) }
    if (state === 'dead' && tt > 0.9 && st.spark <= 0) { st.spark = 0.9 + Math.random() * 1.4; const s = screenPos(); emit(s.x, s.y, s.z, 4, '#ffb347', 0.6, 1.4, -5, 0.5) }
    if (state === 'win' && st.spark <= 0) { st.spark = 0.18; emit((Math.random() - 0.5) * 0.8, 1.9, (Math.random() - 0.5) * 0.4, 2, ['#ff8fa8', '#ffd76a', '#8ff0cf', '#a98bd6'][Math.floor(Math.random() * 4)], 0.5, 0.6, -1.2, 1.4) }
    stepParticles(dt); pts.visible = pAlive > 0

    // footsteps: one per foot plant
    if (state === 'walk') { const s = Math.sin(st.phase); if ((s >= 0) !== (st.lastSin >= 0)) p.onStep?.(); st.lastSin = s }
  }

  function enter(state, p) {
    const prev = st.state
    st.state = state; st.t = 0; st.spark = 0
    crack.visible = state === 'dead'
    rig.visible = true
    if (prev === null && p.facing != null) st.yaw = p.facing
    if (state === 'dead') {
      if (p.instant) st.t = 3 // a body found later: already lying there
      else { group.updateWorldMatrix(true, true); const s = screenPos(); emit(s.x, s.y, s.z, 18, '#ffcf6a', 1.8, 2.2, -6, 0.6); emit(s.x, s.y, s.z, 6, '#9fe0ff', 1.2, 1.6, -6, 0.4) }
    }
    if (state === 'ventIn') emit(0, 0.1, 0, 10, '#fff6e8', 1.1, 0.8, -1, 0.7)
    if (state === 'ventOut') { emit(0, 0.1, 0, 12, '#fff6e8', 1.2, 1.4, -1.5, 0.8); C.rigY = -1.6; C.sqX = C.sqY = 0.3 }
    if (prev === 'dead' || prev === 'ventIn') Object.assign(C, JOINTS)
  }

  // Each pose writes target joint values into P (defaults already in place).
  const pose = {
    idle(P, t) {
      const br = Math.sin(t * 2.3)
      P.sqY = 1 + br * 0.022; P.sqX = 1 - br * 0.012
      P.aLZ = 0.22 + br * 0.03; P.aRZ = 0.22 + br * 0.03
      P.aLX = Math.sin(t * 1.1) * 0.05; P.aRX = -P.aLX
      P.hdZ = Math.sin(t * 0.8) * 0.05; P.hdX = Math.sin(t * 0.55) * 0.03
      P.torY = Math.sin(t * 0.4) * 0.06
    },
    walk(P, t, tt, p, dt) {
      const sp = p.speed ?? 2.4, amt = clamp(sp / 2.4, 0.35, 1.3)
      if (p.phase != null) st.phase = p.phase; else st.phase += dt * (5.5 + sp * 2.4)
      const s = Math.sin(st.phase), c = Math.abs(Math.cos(st.phase))
      P.legL = s * 0.8 * amt; P.legR = -P.legL
      P.aLX = -s * 0.95 * amt; P.aRX = -P.aLX
      P.aLZ = P.aRZ = 0.16
      P.rigY = c * 0.075 * amt                         // up as each leg passes under the body
      P.sqY = 1 + (c - 0.6) * 0.07 * amt; P.sqX = 1 - (c - 0.6) * 0.035 * amt
      P.torX = 0.15 * Math.min(1, amt)                 // lean into the walk
      P.torZ = s * 0.06 * amt; P.torY = s * 0.13 * amt // sway and hip twist
      P.hdX = -0.07 + Math.cos(st.phase * 2) * 0.03; P.hdZ = -s * 0.05
      P.hatZ = -s * 0.08
    },
    task(P, t) {
      const w = t * 11
      P.torX = 0.24; P.hdX = 0.18 + Math.sin(t * 3) * 0.04
      P.aLX = -1.25 + Math.sin(w) * 0.35; P.aRX = -1.25 + Math.sin(w + Math.PI) * 0.35
      P.aLZ = P.aRZ = 0.05
      P.rigY = Math.abs(Math.sin(t * 5.5)) * 0.018; P.sqY = 1 - Math.abs(Math.sin(t * 5.5)) * 0.03
      P.legL = 0.08; P.legR = -0.08
    },
    dead(P, t, tt) {
      if (tt < 0.12) { const j = tt / 0.12; P.sqY = 1 - 0.18 * Math.sin(j * Math.PI); P.sqX = 1 + 0.12 * Math.sin(j * Math.PI); P.hdX = -0.35 * j; P.aLZ = P.aRZ = 0.22 + 0.9 * j; return }
      const k = bounceOut((tt - 0.12) / 0.7), e = ease((tt - 0.12) / 0.5)
      P.rigRX = -1.5 * k; P.rigY = 0.26 * k
      P.legL = -0.55 * e; P.legR = -0.25 * e; P.splay = 0.25 * e
      P.aLZ = 0.22 + 1.1 * e; P.aRZ = 0.22 + 0.8 * e; P.aLX = -0.3 * e; P.aRX = 0.4 * e
      P.hdX = -0.3 * e; P.hdZ = 0.35 * e
      P.hatX = 0.32 * e; P.hatZ = 1.3 * e              // the hat tumbles off
    },
    ghost(P, t, tt, p) {
      const moving = (p.speed ?? 0) > 0.1
      P.rigY = 0.32 + Math.sin(t * 2) * 0.08
      P.sqY = 1 + Math.sin(t * 2) * 0.03
      P.torX = moving ? 0.28 : 0.06
      P.aLX = -0.35 + Math.sin(t * 2.2) * 0.25; P.aRX = -0.35 + Math.sin(t * 2.2 + 1) * 0.25
      P.aLZ = 0.55 + Math.sin(t * 2) * 0.1; P.aRZ = 0.55 + Math.sin(t * 2 + 0.6) * 0.1
      P.hdZ = Math.sin(t * 1.3) * 0.08
      P.tail = Math.sin(t * 3) * 0.18
    },
    ventIn(P, t, tt) {
      if (tt < 0.12) { const j = tt / 0.12; P.sqY = 1 - 0.3 * j; P.sqX = 1 + 0.22 * j; P.aLZ = P.aRZ = 0.5 * j; return }
      if (tt < 0.3) { const j = ease((tt - 0.12) / 0.18); P.rigY = 0.45 * Math.sin(j * Math.PI / 2); P.sqY = 0.7 + 0.55 * j; P.sqX = 1.22 - 0.37 * j; P.aLX = P.aRX = -2.8 * j; P.aLZ = P.aRZ = 0.2; return }
      const j = clamp((tt - 0.3) / 0.25, 0, 1), sh = 1 - 0.75 * j
      P.rigY = 0.45 - 2.4 * j * j; P.sqY = 1.25 * sh; P.sqX = 0.85 * sh; P.rigRY = j * Math.PI * 2
      P.aLX = P.aRX = -2.8; P.aLZ = P.aRZ = 0.2
      rig.visible = tt <= 0.55
    },
    ventOut(P, t, tt) {
      if (tt < 0.25) { const j = ease(tt / 0.25); P.rigY = -1.6 + 2.3 * j; P.sqY = 0.3 + 0.95 * j; P.sqX = 0.3 + 0.55 * j; P.rigRY = (1 - j) * Math.PI * 2; P.aLX = P.aRX = -2.8; P.aLZ = P.aRZ = 0.2; return }
      if (tt < 0.5) { const j = (tt - 0.25) / 0.25; P.rigY = 0.7 * (1 - j * j); P.sqY = 1.15 - 0.15 * j; P.sqX = 0.9 + 0.1 * j; P.aLX = P.aRX = -2.8 + 2.4 * j; P.aLZ = P.aRZ = 0.2 + 0.4 * j; return }
      if (tt < 0.7) { const j = Math.sin(((tt - 0.5) / 0.2) * Math.PI); P.sqY = 1 - 0.28 * j; P.sqX = 1 + 0.18 * j; P.aLZ = P.aRZ = 0.6 - 0.38 * ((tt - 0.5) / 0.2); return }
      pose.idle(P, t)
    },
    win(P, t) {
      const h = Math.abs(Math.sin(t * 5))
      P.rigY = h * 0.32; P.sqY = h < 0.2 ? 0.86 : 1 + h * 0.06; P.sqX = h < 0.2 ? 1.08 : 1 - h * 0.03
      P.aLX = -2.7 + Math.sin(t * 9) * 0.25; P.aRX = -2.7 + Math.sin(t * 9 + 1.5) * 0.25
      P.aLZ = P.aRZ = 0.38
      P.legL = h * 0.3; P.legR = -h * 0.3
      P.hdZ = Math.sin(t * 5) * 0.1; P.hdX = -0.12
    },
    lose(P, t) {
      const s = Math.sin(t * 0.9)
      P.torX = 0.42 + s * 0.03; P.hdX = 0.38; P.hdZ = 0.08
      P.aLX = 0.25; P.aRX = 0.25; P.aLZ = P.aRZ = 0.04
      P.sqY = 0.93 + s * 0.012; P.sqX = 1.03
      P.hatZ = 0.25
    },
  }

  function dispose() { bgMat.dispose(); avMat.dispose(); glowMat.dispose(); pGeo.dispose() }

  return { group, update, dispose, emit: (count = 12, color = '#ffd76a') => emit(0, 1, 0, count, color, 1, 1.5, -3, 0.7), get state() { return st.state } }
}
