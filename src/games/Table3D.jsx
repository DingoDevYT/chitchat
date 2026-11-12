// The 3D game table (lazy chunk: three.js loads only when a game opens). WebGL draws the cozy room, table, lamp,
// cards, chips, dice and board; the people are real DOM <Avatar>s (talking, expressions, GIFs, webcams) projected onto
// their seats every frame, so PNGtubers look exactly like they do in the crowd.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Person } from './People'
import Avatar, { useFace } from '../Avatar'
import { botChar, botUrl } from './bots.js'
import { voiceLevels } from '../lib/store'
import { card as playCard } from './highcard/rules.js'
import { CARDS, FLAVOURS } from './snack/rules.js'
import { N } from './property/rules.js'
import { boardCanvas, DECK_SPOTS } from './property/boardArt.js'
import { snackFace } from './Card'
import { CORNER, SIDE, along, cell } from './property/geom.js'

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const CW = 0.56, CH = 0.8 // card size in world units

// ── per-game framing ──
const LAYOUT = {
  snack: { shape: 'round', R: 2.35, felt: '#c7836a', seatR: 3.2, cam: [0, 6.2, 7.4], look: [0, -0.15, 0.4], H: 2.0 },
  highcard: { shape: 'round', R: 2.2, felt: '#3f6b5c', seatR: 3.0, cam: [0, 5.8, 7.0], look: [0, -0.15, 0.4], H: 1.9 },
  poker: { shape: 'round', R: 2.5, felt: '#2f6b4f', seatR: 3.3, cam: [0, 5.6, 7.6], look: [0, -0.1, 0.4], H: 2.1 },
  property: { follow: true, shape: 'square', R: 3.1, felt: '#d9c7a3', seatR: 4.0, cam: [0, 8.4, 6.6], look: [0, 0.5, 0.2], H: 2.3 },
  isle: { shape: 'round', R: 3.6, felt: '#5fa8bf', seatR: 4.55, cam: [0, 8.5, 6.7], look: [0, -0.15, 0.45], H: 2.2 }, // the felt is the sea
  // Starchat is outdoors: no room, table or chairs, everyone walks the board. `fit` (w × d world units) pulls the
  // camera back until the board fits the width; portrait phones look along the board from the side (camP) instead.
  starchat: { outdoor: true, follow: true, bg: '#1b1838', seatR: 4, cam: [0, 8.6, 8.4], camP: [10.5, 12.5, 0.4], followK: 1, followY: 0.5, look: [0, -0.4, -0.25], lookP: [1.2, -0.4, 0], fit: { w: 11.6, d: 7.6 } },
}

// ── canvas textures (cached) ──
const texCache = new Map()
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(key, t)
  return t
}
const FONT = '"Baloo 2", "Nunito", "Trebuchet MS", system-ui, sans-serif'
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r) }
function acorn(g, x, y, s, cap = '#7a4a2b', nut = '#c98a4b') {
  g.fillStyle = nut; g.beginPath(); g.ellipse(x, y + s * 0.15, s * 0.42, s * 0.5, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = cap; g.beginPath(); g.ellipse(x, y - s * 0.22, s * 0.55, s * 0.28, 0, Math.PI, 0); g.lineTo(x + s * 0.55, y - s * 0.18); g.lineTo(x - s * 0.55, y - s * 0.18); g.fill()
  g.fillRect(x - s * 0.06, y - s * 0.62, s * 0.12, s * 0.2)
}
const backTex = kind => canvasTex('back-' + kind, 256, 366, (g, w, h) => {
  g.fillStyle = '#fbf3e4'; rrect(g, 0, 0, w, h, 26); g.fill()
  g.fillStyle = kind === 'snack' ? '#ff9f6b' : '#7a3b46'; rrect(g, 12, 12, w - 24, h - 24, 18); g.fill()
  g.strokeStyle = '#fbf3e480'; g.lineWidth = 6
  for (let i = -h; i < w + h; i += 34) { g.beginPath(); g.moveTo(i, 12); g.lineTo(i + h * 0.5, h - 12); g.stroke() }
  if (kind === 'snack') {
    g.fillStyle = '#fbf3e4'; g.beginPath(); g.ellipse(w / 2, h / 2, 82, 58, -0.3, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#e0607e'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.3); g.fillText('SNACK', 0, -14); g.fillStyle = '#5b8de0'; g.fillText('STACK', 0, 24); g.restore()
  } else {
    g.fillStyle = '#fbf3e4'; g.beginPath(); g.arc(w / 2, h / 2, 62, 0, Math.PI * 2); g.fill()
    acorn(g, w / 2, h / 2, 70)
  }
})
const snackTex = id => canvasTex('s' + id, 256, 366, (g, w, h) => {
  const f = snackFace(id), col = f.color || '#3a2f3f'
  g.fillStyle = '#fbf3e4'; rrect(g, 0, 0, w, h, 26); g.fill()
  g.fillStyle = col; rrect(g, 12, 12, w - 24, h - 24, 18); g.fill()
  if (f.wild) FLAVOURS.forEach((fl, i) => { g.fillStyle = fl.color; g.beginPath(); g.moveTo(w / 2, h / 2); g.arc(w / 2, h / 2, 96, i * Math.PI / 2 - 0.6, (i + 1) * Math.PI / 2 - 0.6); g.fill() })
  else { g.fillStyle = '#fbf3e4'; g.beginPath(); g.ellipse(w / 2, h / 2, 86, 120, 0.45, 0, Math.PI * 2); g.fill() }
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `900 ${f.big.length > 1 ? 96 : 140}px ${FONT}`
  g.lineWidth = 10; g.strokeStyle = '#2b2230'; g.strokeText(f.big, w / 2, h / 2 + 8)
  g.fillStyle = f.wild ? '#fbf3e4' : col; g.fillText(f.big, w / 2, h / 2 + 8)
  g.font = `900 40px ${FONT}`; g.fillStyle = '#fbf3e4'
  g.fillText(f.big, 40, 44)
  g.save(); g.translate(w - 40, h - 44); g.rotate(Math.PI); g.fillText(f.big, 0, 0); g.restore()
})
const playTex = id => canvasTex('p' + id, 256, 366, (g, w, h) => {
  const c = playCard(id), ink = c.suit.red ? '#c8414f' : '#2b2230'
  g.fillStyle = '#fbf3e4'; rrect(g, 0, 0, w, h, 26); g.fill()
  g.strokeStyle = '#e4d6bd'; g.lineWidth = 4; rrect(g, 10, 10, w - 20, h - 20, 18); g.stroke()
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `800 58px ${FONT}`; g.fillText(c.rank, 44, 52)
  g.font = `48px ${FONT}`; g.fillText(c.suit.glyph, 44, 104)
  g.font = `150px ${FONT}`; g.fillText(c.suit.glyph, w / 2, h / 2 + 14)
  g.save(); g.translate(w - 44, h - 52); g.rotate(Math.PI); g.font = `800 58px ${FONT}`; g.fillText(c.rank, 0, 0); g.restore()
})
const edgeMat = new THREE.MeshStandardMaterial({ color: '#efe3cc', roughness: 0.8 })
const matCache = new Map()
const mat = (key, make) => { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key) }
const cardMats = (kind, id) => mat(`${kind}:${id}`, () => {
  const front = new THREE.MeshStandardMaterial({ map: id == null ? backTex(kind) : kind === 'snack' ? snackTex(id) : playTex(id), roughness: 0.65 })
  const back = new THREE.MeshStandardMaterial({ map: backTex(kind), roughness: 0.65 })
  return [edgeMat, edgeMat, front, back, edgeMat, edgeMat]
})
const cardGeo = new THREE.BoxGeometry(CW, 0.012, CH)

// ── tweening: anything wrapped in <Tw> eases toward its target, arcing up while it travels (deal, fly, flip) ──
function Tw({ pos, rot = [0, 0, 0], from, speed = 6, lift = 0.5, children, scale = 1 }) {
  const ref = useRef()
  const base = useRef(new THREE.Vector3(...(from || pos)))
  const target = useMemo(() => new THREE.Vector3(...pos), [pos[0], pos[1], pos[2]]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { ref.current.position.copy(base.current); if (from) ref.current.rotation.set(rot[0], rot[1] + 1.5, rot[2]) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const o = ref.current
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * speed)
    base.current.lerp(target, k)
    const d = base.current.distanceTo(target)
    o.position.set(base.current.x, base.current.y + (reduced ? 0 : Math.min(lift, d * 0.4)), base.current.z)
    o.rotation.x += (rot[0] - o.rotation.x) * k
    o.rotation.y += (rot[1] - o.rotation.y) * k
    o.rotation.z += (rot[2] - o.rotation.z) * k
  })
  return <group ref={ref} scale={scale}>{children}</group>
}

function CardMesh({ kind, id, up, pos, rot = 0, tilt = 0, from, speed }) {
  // Face up: the front (+y) on top. Face down: flipped over the long edge.
  return (
    <Tw pos={pos} rot={[tilt, rot, up ? 0 : Math.PI]} from={from} speed={speed}>
      <mesh geometry={cardGeo} material={cardMats(kind, up ? id : null)} castShadow receiveShadow />
    </Tw>
  )
}

// ── the room ──
function Room({ layout }) {
  const { size } = useThree()
  const portrait = size.width / Math.max(1, size.height) < 1.25 // phones look down past the lamp: leave it out
  const wall = useMemo(() => canvasTex('wall', 256, 256, (g, w, h) => {
    g.fillStyle = '#6b4c58'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#7a5866'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 30, h)
    g.fillStyle = '#e8b86b55'; for (let y = 32; y < h; y += 64) for (let x = 47; x < w; x += 64) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill() }
  }), [])
  wall.wrapS = wall.wrapT = THREE.RepeatWrapping; wall.repeat.set(8, 3)
  const floor = useMemo(() => canvasTex('floor', 256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#6e4b35' : '#7a553c'; g.fillRect(0, i * 32, w, 32); g.fillStyle = '#00000022'; g.fillRect(((i * 97) % w), i * 32, 3, 32) }
  }), [])
  floor.wrapS = floor.wrapT = THREE.RepeatWrapping; floor.repeat.set(6, 6)
  const sq = layout.shape === 'square'
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.7, 0]} receiveShadow><planeGeometry args={[40, 40]} /><meshStandardMaterial map={floor} roughness={0.9} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.69, 0]} receiveShadow><circleGeometry args={[sq ? 6.2 : 5.2, 48]} /><meshStandardMaterial color="#a44f4f" roughness={1} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.685, 0]} receiveShadow><ringGeometry args={[sq ? 5.6 : 4.6, sq ? 5.85 : 4.85, 48]} /><meshStandardMaterial color="#f2c98a" roughness={1} /></mesh>
      <mesh position={[0, 3, -9]} receiveShadow><planeGeometry args={[40, 10]} /><meshStandardMaterial map={wall} roughness={0.95} /></mesh>
      <mesh position={[-11, 3, 0]} rotation-y={Math.PI / 2} receiveShadow><planeGeometry args={[40, 10]} /><meshStandardMaterial map={wall} roughness={0.95} /></mesh>
      <mesh position={[11, 3, 0]} rotation-y={-Math.PI / 2} receiveShadow><planeGeometry args={[40, 10]} /><meshStandardMaterial map={wall} roughness={0.95} /></mesh>
      {/* night window with a moon */}
      <group position={[3.6, 2.6, -8.95]}>
        <mesh><planeGeometry args={[3.2, 2.4]} /><meshBasicMaterial color="#1d2b4f" /></mesh>
        <mesh position={[0.8, 0.5, 0.01]}><circleGeometry args={[0.32, 24]} /><meshBasicMaterial color="#f6e7b0" /></mesh>
        {[[-1.65, 0, 0.12, 2.6], [1.65, 0, 0.12, 2.6], [0, 0, 0.1, 2.4]].map(([x, , w, h], i) => <mesh key={i} position={[x, 0, 0.02]}><boxGeometry args={[w, h, 0.08]} /><meshStandardMaterial color="#e9dcc2" /></mesh>)}
        {[1.25, -1.25, 0].map((y, i) => <mesh key={i} position={[0, y, 0.02]}><boxGeometry args={[3.4, 0.1, 0.08]} /><meshStandardMaterial color="#e9dcc2" /></mesh>)}
      </group>
      {/* bookshelf */}
      <group position={[-5.2, -0.2, -8.6]}>
        <mesh castShadow receiveShadow><boxGeometry args={[3, 3, 0.6]} /><meshStandardMaterial color="#5a3c2a" /></mesh>
        {[0.9, -0.1, -1.1].map((y, r) => Array.from({ length: 7 }, (_, i) => (
          <mesh key={`${r}${i}`} position={[-1.2 + i * 0.36 + (r % 2) * 0.1, y + 0.2, 0.32]} castShadow>
            <boxGeometry args={[0.26, 0.62 - ((i * 7 + r) % 3) * 0.08, 0.3]} /><meshStandardMaterial color={['#c8414f', '#e8b86b', '#5b8de0', '#7cc46a', '#a98bd6', '#f0a050', '#6fc3d6'][(i + r * 2) % 7]} />
          </mesh>)))}
      </group>
      {/* plant */}
      <group position={[7.2, -1.7, -6.5]}>
        <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.45, 0.35, 0.9, 16]} /><meshStandardMaterial color="#c9714f" /></mesh>
        {[[0, 1.5, 0, 0.75], [0.45, 1.25, 0.2, 0.55], [-0.4, 1.3, -0.1, 0.6], [0.1, 2.0, -0.2, 0.5]].map(([x, y, z, r], i) =>
          <mesh key={i} position={[x, y, z]} castShadow><sphereGeometry args={[r, 12, 10]} /><meshStandardMaterial color={i % 2 ? '#5f9a58' : '#6fb06a'} roughness={1} /></mesh>)}
      </group>
      {/* hanging lamp over the table */}
      <group position={[0, 5.4, 0]} visible={!portrait}>
        <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.02, 0.02, 3.2, 6]} /><meshStandardMaterial color="#2b2230" /></mesh>
        <mesh><coneGeometry args={[1.0, 0.8, 32, 1, true]} /><meshStandardMaterial color="#e8b86b" side={THREE.DoubleSide} roughness={0.7} emissive="#7a4a10" emissiveIntensity={0.4} /></mesh>
        <mesh position={[0, -0.25, 0]}><sphereGeometry args={[0.22, 16, 12]} /><meshBasicMaterial color="#fff1cf" /></mesh>
      </group>
    </group>
  )
}

function Lights({ layout }) {
  const spot = useRef()
  useEffect(() => { spot.current.target.position.set(0, 0, 0); spot.current.target.updateMatrixWorld() }, [])
  return (
    <>
      <ambientLight intensity={0.35} color="#ffe2c4" />
      <hemisphereLight args={['#8fa2d8', '#4a3226', 0.45]} />
      <spotLight ref={spot} position={[0, 5.1, 0]} angle={layout.shape === 'square' ? 0.95 : 0.85} penumbra={0.55} intensity={3.2} decay={0} color="#ffd9a8"
        castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0004} />
      <pointLight position={[3.6, 2.6, -7.5]} intensity={0.6} decay={0} distance={8} color="#7f9be0" />
    </>
  )
}

function TableMesh({ layout }) {
  const { R, felt, shape } = layout
  const wood = '#8a5a3b'
  if (shape === 'square') return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow castShadow><boxGeometry args={[R * 2 + 0.5, 0.24, R * 2 + 0.5]} /><meshStandardMaterial color={wood} roughness={0.6} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => <mesh key={i} position={[x * R, -0.95, z * R]} castShadow><boxGeometry args={[0.3, 1.5, 0.3]} /><meshStandardMaterial color={wood} /></mesh>)}
    </group>
  )
  return (
    <group>
      <mesh position={[0, -0.1, 0]} receiveShadow castShadow><cylinderGeometry args={[R + 0.25, R + 0.2, 0.2, 64]} /><meshStandardMaterial color={wood} roughness={0.55} /></mesh>
      <mesh position={[0, 0.005, 0]} receiveShadow><cylinderGeometry args={[R, R, 0.02, 64]} /><meshStandardMaterial color={felt} roughness={0.95} /></mesh>
      <mesh position={[0, 0.02, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[R + 0.12, 0.09, 12, 64]} /><meshStandardMaterial color="#6e432b" roughness={0.5} /></mesh>
      <mesh position={[0, -0.95, 0]} castShadow><cylinderGeometry args={[0.35, 0.6, 1.5, 24]} /><meshStandardMaterial color={wood} /></mesh>
    </group>
  )
}

// Where seat i of n sits (you, meIdx, nearest the camera). Returns [x, z, angle].
// Portrait phones: everyone else shares the far arc instead of the full circle, so nobody sits off the screen edges.
function seatAt(i, n, meIdx, r, portrait) {
  const k = (i - meIdx + n) % n
  const a = !portrait || k === 0 || n < 3 ? Math.PI / 2 + (2 * Math.PI * k) / n
    : -Math.PI / 2 + Math.min(1.6, 0.55 * (n - 2)) * ((k - 1) / (n - 2) - 0.5)
  return [r * Math.cos(a), r * Math.sin(a), a]
}

// ── people: their PNGtuber face on a cut-out sitting behind the table (the table hides their lower third) ──
const SEAT_Y = -0.6, FIG_H = 1.75
const loader = new THREE.TextureLoader()
loader.setCrossOrigin('anonymous')
const imgTex = new Map()
function useImgTex(src) {
  const [t, setT] = useState(() => imgTex.get(src)?.tex || null)
  useEffect(() => {
    if (!src) return
    let on = true, e = imgTex.get(src)
    if (!e) {
      e = { p: new Promise(res => loader.load(src, tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; res(tx) }, undefined, () => res(null))) }
      imgTex.set(src, e)
    }
    e.p.then(tx => { e.tex = tx; if (on && tx) setT(tx) })
    return () => { on = false }
  }, [src])
  return src ? t : null
}
// The default critter (and Chitbots, in their orange coat with a BOT tag), drawn like the SVG one.
const critterTex = (color, talk, bot) => canvasTex(`critter${color}${talk ? 1 : 0}${bot || ''}`, 256, 256, (g, w) => {
  const k = w / 64
  g.scale(k, k)
  const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
  dot(16, 16, 9, color); dot(48, 16, 9, color); dot(16, 16, 4, '#00000022'); dot(48, 16, 4, '#00000022'); dot(32, 36, 24, color)
  g.fillStyle = '#ff6b8b55'; g.beginPath(); g.ellipse(18, 42, 4, 2.5, 0, 0, 7); g.ellipse(46, 42, 4, 2.5, 0, 0, 7); g.fill()
  g.fillStyle = '#231d2b'; g.beginPath(); g.ellipse(24, 33, 3, 4, 0, 0, 7); g.ellipse(40, 33, 3, 4, 0, 0, 7); g.fill()
  if (talk) { g.beginPath(); g.ellipse(32, 45, 5, 4, 0, 0, 7); g.fill() }
  else { g.strokeStyle = '#231d2b'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(27, 43); g.quadraticCurveTo(32, 47, 37, 43); g.stroke() }
  if (bot) {
    g.fillStyle = { hard: '#c8414f', easy: '#6fb06a' }[bot] || '#2b2230'; rrect(g, 40, 3, 22, 10, 5); g.fill()
    g.fillStyle = bot === 'easy' ? '#1b1420' : '#ffcf9e'; g.font = `900 7.5px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BOT', 51, 8.3)
  }
})
function Cutout({ p, x, z, turn, won }) {
  const face = useFace(p.user_id, 'stage')
  const talk = p.user_id ? face.talk : turn // Chitbots chatter while they think
  const photo = useImgTex(p.user_id ? (face.expr ? face.expr.src : null) : botUrl(botChar(p.bot, p.seat), talk)) // bots: their character
  const tex = photo || critterTex(p.user_id ? face.p?.color || '#f4a261' : botChar(p.bot, p.seat).color, talk)
  const aspect = Math.min(1.6, Math.max(0.5, tex.image ? tex.image.width / tex.image.height : 1))
  const h = FIG_H * (aspect > 1 ? 1 / Math.sqrt(aspect) : 1), w = h * aspect
  const g = useRef(), inner = useRef()
  useFrame(({ camera, clock }) => {
    // Turned halfway between the table (so side players sit square in their chairs, not through them) and you,
    // leaning back a little so a high camera still sees the face.
    const dx = camera.position.x - x, dz = camera.position.z - z
    const toCam = Math.atan2(dx, dz), toTable = Math.atan2(-x, -z)
    const yaw = toTable + Math.atan2(Math.sin(toCam - toTable), Math.cos(toCam - toTable)) * 0.5
    g.current.rotation.set(-Math.atan2(camera.position.y - SEAT_Y - FIG_H / 2, Math.hypot(dx, dz)) * 0.55, yaw, 0, 'YXZ')
    const t = clock.elapsedTime
    // Winners still hop; talking squashes and stretches from the feet with voice loudness (bots: a gentle chatter).
    const y = reduced ? 0 : won ? Math.abs(Math.sin(t * 6)) * 0.25 : 0
    inner.current.position.y += (y - inner.current.position.y) * 0.3
    const vol = reduced ? 0 : p.user_id ? (voiceLevels.get(p.user_id) || 0) : talk ? 0.35 + 0.35 * Math.abs(Math.sin(t * 9)) : 0
    const sy = 1 + vol * 0.16, sx = 1 - vol * 0.08
    inner.current.scale.x += (sx - inner.current.scale.x) * 0.4
    inner.current.scale.y += (sy - inner.current.scale.y) * 0.4
  })
  return (
    <group ref={g} position={[x, SEAT_Y, z]}>
      <group ref={inner}>
        <mesh position={[0, h / 2, 0]} renderOrder={1}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} transparent alphaTest={0.04} toneMapped={false} opacity={p.gone ? 0.45 : 1} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
function Chair({ x, z, a }) {
  return (
    <group position={[x, -1.7, z]} rotation-y={-a + Math.PI / 2}>
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow><boxGeometry args={[0.9, 0.12, 0.8]} /><meshStandardMaterial color="#9a6a48" /></mesh>
      <mesh position={[0, 1.55, 0.36]} castShadow><boxGeometry args={[0.9, 1.3, 0.1]} /><meshStandardMaterial color="#8a5a3b" /></mesh>
      <mesh position={[0, 0.98, 0]}><boxGeometry args={[0.82, 0.12, 0.72]} /><meshStandardMaterial color="#c86f5a" roughness={1} /></mesh>
    </group>
  )
}

// ── Snack Stack ──
const hashRot = id => (((id * 2654435761) >>> 0) % 1000) / 1000 - 0.5
// A hand of face-down cards held up in a fan at the table edge in front of someone (backs to the table).
function HandFan({ s, n, kind, R }) {
  if (!n) return null
  const back = cardMats(kind, null)
  const step = Math.min(0.2, 1.3 / n)
  const reach = Math.min(R * 0.8, s.r - 0.9) // well in front of them, so the fan sits below their face from the camera
  return (
    <group position={[Math.cos(s.a) * reach, 0.04, Math.sin(s.a) * reach]} rotation-y={Math.PI / 2 - s.a}>
      <group rotation-x={0.75} scale={0.62}>
        {Array.from({ length: n }, (_, k) => (
          <group key={k} rotation-z={(k - (n - 1) / 2) * -step}>
            <mesh geometry={cardGeo} material={back} position={[0, CH * 0.5, -k * 0.004]} rotation-x={Math.PI / 2} castShadow />
          </group>
        ))}
      </group>
    </group>
  )
}

function SnackScene({ v, seats, meId, pending }) {
  const top = pending?.type === 'play' ? pending.card : v.top // your card lands at once; the server catches up
  const [pile, setPile] = useState([])
  useEffect(() => {
    setPile(p => (p.at(-1)?.id === top ? p : [...p.slice(-5), { id: top, n: v.moves, from: pending?.type === 'play' ? meId : v.last?.type === 'play' ? v.last.pid : null }]))
  }, [top]) // eslint-disable-line react-hooks/exhaustive-deps
  const deckPos = [-0.5, 0.03 + Math.min(v.deck, 60) * 0.004, 0]
  const seatOf = pid => seats.find(s => s.pid === pid)
  const ring = useRef()
  useFrame((_, dt) => { if (ring.current && !reduced) ring.current.rotation.y -= v.dir * dt * 0.6 })
  const col = FLAVOURS[v.flavour].color
  const R = LAYOUT.snack.R
  return (
    <group>
      <mesh position={[deckPos[0], deckPos[1] / 2, deckPos[2]]} castShadow><boxGeometry args={[CW, Math.max(0.02, deckPos[1]), CH]} /><meshStandardMaterial color="#efe3cc" /></mesh>
      <CardMesh kind="snack" id={null} up={false} pos={[deckPos[0], deckPos[1] + 0.01, deckPos[2]]} />
      {pile.map((p, i) => {
        const s = p.from && seatOf(p.from)
        return <CardMesh key={p.id + '-' + p.n} kind="snack" id={p.id} up pos={[0.4 + hashRot(p.id) * 0.12, 0.03 + i * 0.013, hashRot(p.id + 7) * 0.12]} rot={hashRot(p.id) * 0.8}
          from={s ? [s.x * 0.62, 0.7, s.z * 0.62] : deckPos} speed={9} />
      })}
      <group ref={ring} position={[0, 0.04, 0]}>
        <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[1.3, 1.4, 64]} /><meshBasicMaterial color={col} transparent opacity={0.75} /></mesh>
        {[0, 1, 2].map(k => {
          const a = (k * 2 * Math.PI) / 3
          return <mesh key={k} position={[1.35 * Math.cos(a), 0.02, 1.35 * Math.sin(a)]} rotation={[-Math.PI / 2, 0, -a + (v.dir > 0 ? Math.PI : 0)]}>
            <coneGeometry args={[0.13, 0.32, 3]} /><meshBasicMaterial color={col} /></mesh>
        })}
      </group>
      {seats.filter(s => s.pid !== meId).map(s => <HandFan key={s.pid} s={s} n={Math.min(v.counts[s.pid] || 0, 16)} kind="snack" R={R} />)}
    </group>
  )
}
// ── High card ──
function HighScene({ v, seats, meId }) {
  const deck = [-0.4, 0.05, 0]
  return (
    <group>
      <CardMesh kind="play" id={null} up={false} pos={deck} />
      {v.discards.map((c, i) => <CardMesh key={'d' + c} kind="play" id={c} up pos={[0.5 + i * 0.05, 0.03 + i * 0.013, 0]} rot={hashRot(c)} from={deck} />)}
      {seats.map(s => {
        const id = v.reveal?.[s.pid] ?? (s.pid === meId ? v.me?.card : null)
        return <CardMesh key={s.pid + (v.acted?.[s.pid] === 'swap' ? 'b' : 'a')} kind="play" id={id} up={id != null} from={deck} pos={[s.x * 0.62, 0.04, s.z * 0.62]} rot={-s.a + Math.PI / 2} />
      })}
    </group>
  )
}

// ── Acorn Hold'em ──
const CHIP = ['#c8414f', '#fbf3e4', '#5b8de0', '#2f2a35', '#e8b86b']
const chipGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 20)
function Chips({ amount, pos, from }) {
  const n = Math.min(14, Math.ceil(Math.log2(amount / 5 + 1) * 1.6))
  if (!amount) return null
  const stacks = Math.ceil(n / 7)
  return (
    <Tw pos={pos} from={from} speed={5}>
      {Array.from({ length: n }, (_, i) => {
        const st = i % stacks, h = Math.floor(i / stacks)
        return <mesh key={i} geometry={chipGeo} position={[st * 0.24 - (stacks - 1) * 0.12, 0.02 + h * 0.042, 0]} castShadow
          material={mat('chip' + ((i + st) % 5), () => new THREE.MeshStandardMaterial({ color: CHIP[(i + st) % 5], roughness: 0.4 }))} />
      })}
    </Tw>
  )
}
function PokerScene({ v, seats, meId }) {
  const deck = [0, 0.4, -0.9]
  const pot = v.pot + Object.values(v.bets || {}).reduce((a, b) => a + b, 0)
  return (
    <group>
      {/* acorn emblem in the felt */}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.95, 1.02, 48]} /><meshBasicMaterial color="#e8b86b" transparent opacity={0.6} /></mesh>
      {[0, 1, 2, 3, 4].map(i => v.board[i] != null && <CardMesh key={'b' + v.board[i]} kind="play" id={v.board[i]} up pos={[(i - 2) * 0.66, 0.03, -0.05]} from={deck} />)}
      <Chips amount={v.pot} pos={[0, 0.02, 0.75]} />
      {seats.map(s => {
        if (v.out[s.pid]) return null
        const shown = v.shown?.[s.pid]
        const mine = s.pid === meId ? v.me?.cards : null
        const ax = -s.z / s.r, az = s.x / s.r
        const folded = v.folded?.[s.pid]
        return (
          <group key={s.pid}>
            {!folded && [0, 1].map(k => {
              const id = shown?.[k] ?? mine?.[k] ?? null
              return <CardMesh key={`${v.hand}-${k}`} kind="play" id={id} up={id != null} from={deck}
                pos={[s.x * 0.66 + ax * (k - 0.5) * 0.36, 0.03 + k * 0.013, s.z * 0.66 + az * (k - 0.5) * 0.36]} rot={-s.a + Math.PI / 2 + (k - 0.5) * 0.2} />
            })}
            <Chips amount={v.stacks[s.pid]} pos={[s.x * 0.8 + ax * 0.55, 0.02, s.z * 0.8 + az * 0.55]} />
            <Chips key={`${v.hand}-${v.phase}`} amount={v.bets?.[s.pid] || 0} pos={[s.x * 0.45, 0.02, s.z * 0.45]} from={[s.x * 0.8, 0.3, s.z * 0.8]} />
            {v.players[v.button] === s.pid && <Tw pos={[s.x * 0.6 - ax * 0.55, 0.03, s.z * 0.6 - az * 0.55]}>
              <mesh castShadow><cylinderGeometry args={[0.16, 0.16, 0.05, 24]} /><meshStandardMaterial color="#fbf3e4" /></mesh>
            </Tw>}
          </group>
        )
      })}
    </group>
  )
}

// ── Teacup Town ──
// 40 spaces on an 11×11 ring with wide corners (see property/ui.jsx). U = one edge tile's width in world units.
const BOARD_SIZE = 5.6, U = BOARD_SIZE / SIDE
const tilePos = i => { const [c, r] = cell(i); return [(along(c) - SIDE / 2) * U, (along(r) - SIDE / 2) * U] }
// Which way a tile's colour band faces (toward the middle): straight in from its side of the board, never diagonal.
const inwardOf = i => { const [c, r] = cell(i); return r === 10 ? [0, -1] : r === 0 ? [0, 1] : c === 0 ? [1, 0] : [-1, 0] }
// The painted "Storybook Town Map" board (property/boardArt.js), one cached texture. Its canvas shows a plain
// placeholder until the painting is done (a moment, once per session), then the texture refreshes.
let boardTexture = null
const boardTex = () => {
  if (boardTexture) return boardTexture
  const { canvas, ready } = boardCanvas()
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  ready.then(() => { t.needsUpdate = true })
  return (boardTexture = t)
}
function DieMesh({ value, pos, roll, idx }) {
  const mats = useMemo(() => [3, 4, 1, 6, 2, 5].map(n => mat('die' + n, () => new THREE.MeshStandardMaterial({ roughness: 0.45, map: canvasTex('die' + n, 128, 128, (g, w) => {
    g.fillStyle = '#fbf3e4'; rrect(g, 0, 0, w, w, 22); g.fill(); g.fillStyle = '#2b2230'
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n]
    for (const [x, y] of P) { g.beginPath(); g.arc(x * 32, y * 32, 11, 0, 7); g.fill() }
  }) }))), [])
  const ref = useRef()
  const t0 = useRef(-1)
  const fin = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] }[value] || [0, 0]
  const yaw = 0.4 + idx * 0.7
  useEffect(() => { t0.current = -1 }, [roll])
  useFrame(({ clock }) => {
    const o = ref.current
    if (t0.current < 0) t0.current = clock.elapsedTime
    const t = reduced ? 1 : Math.min(1, (clock.elapsedTime - t0.current) / 0.9)
    const e = 1 - (1 - t) ** 3, spin = (1 - e) * 9
    o.position.set(pos[0] - (1 - e) * 1.2, 0.18 + Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 1.1, pos[2] + (1 - e) * 1.0)
    o.rotation.set(fin[0] + spin, yaw + spin * 0.6, fin[1] + spin * 0.8, 'YXZ')
  })
  return <mesh ref={ref} material={mats} castShadow><boxGeometry args={[0.34, 0.34, 0.34]} /></mesh>
}
function Token({ color, space, slot, hop }) {
  // Walks tile by tile toward `space`, hopping on each step.
  const ref = useRef()
  const at = useRef(space)
  const prog = useRef(1)
  const from = useRef(tilePos(space))
  useFrame(({ clock }, dt) => {
    const o = ref.current
    if (prog.current < 1 || at.current !== space) { camFocus.x = o.position.x; camFocus.z = o.position.z; camFocus.t = clock.elapsedTime }
    if (prog.current >= 1 && at.current !== space) {
      const next = hop ? (at.current + 1) % N : space
      from.current = tilePos(at.current); at.current = next; prog.current = 0
    }
    prog.current = reduced ? 1 : Math.min(1, prog.current + dt * 5)
    const [ax, az] = from.current, [bx, bz] = tilePos(at.current)
    const t = prog.current
    const off = [(slot % 3 - 1) * 0.13, (Math.floor(slot / 3) - 0.5) * 0.15]
    o.position.set(ax + (bx - ax) * t + off[0], 0.02 + Math.sin(t * Math.PI) * 0.35, az + (bz - az) * t + off[1] + 0.05)
  })
  const m = mat('tok' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35 }))
  return (
    <group ref={ref} scale={0.75}>
      <mesh position={[0, 0.08, 0]} material={m} castShadow><cylinderGeometry args={[0.13, 0.16, 0.12, 20]} /></mesh>
      <mesh position={[0, 0.25, 0]} material={m} castShadow><cylinderGeometry args={[0.05, 0.1, 0.22, 16]} /></mesh>
      <mesh position={[0, 0.42, 0]} material={m} castShadow><sphereGeometry args={[0.1, 16, 12]} /></mesh>
    </group>
  )
}
// Cottages and inns: plaster walls on a stone footing, a pitched roof in the owner's colour, a chimney, a door and warm
// lit windows. Every part is one shared unit box or roof prism scaled into place, with shared materials (roof per colour).
const HOUSE = {
  box: new THREE.BoxGeometry(1, 1, 1),
  roof: new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.5, 0), // ridge along x, eaves at y 0
}
const houseMat = k => mat('house-' + k, () => ({
  wall: () => new THREE.MeshStandardMaterial({ color: '#f6ead2', roughness: 0.85 }),
  stone: () => new THREE.MeshStandardMaterial({ color: '#b9ad9c', roughness: 0.9 }),
  wood: () => new THREE.MeshStandardMaterial({ color: '#7a4e2d', roughness: 0.7 }),
  brick: () => new THREE.MeshStandardMaterial({ color: '#b5654a', roughness: 0.8 }),
  glow: () => new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }),
})[k]())
const roofMat = color => mat('roof' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
// [x, y, z, w, h, d, material]: parts of a house, front (door side) facing +z
const COTTAGE = [
  [0, 0.006, 0, 0.088, 0.012, 0.074, 'stone'], [0, 0.04, 0, 0.08, 0.058, 0.066, 'wall'],
  [0.022, 0.104, -0.012, 0.014, 0.034, 0.014, 'brick'],
  [-0.016, 0.03, 0.0335, 0.02, 0.036, 0.004, 'wood'], [0.019, 0.044, 0.0335, 0.018, 0.016, 0.004, 'glow'],
  [-0.0405, 0.044, 0, 0.004, 0.016, 0.018, 'glow'], [0.0405, 0.044, 0, 0.004, 0.016, 0.018, 'glow'],
]
const INN = [
  [0, 0.007, 0, 0.27, 0.014, 0.124, 'stone'], [0, 0.07, 0, 0.26, 0.112, 0.114, 'wall'], [0, 0.07, 0.058, 0.262, 0.008, 0.004, 'wood'],
  [-0.08, 0.19, -0.02, 0.02, 0.05, 0.02, 'brick'], [0.09, 0.185, 0.015, 0.018, 0.04, 0.018, 'brick'],
  [0, 0.035, 0.058, 0.032, 0.05, 0.005, 'wood'],
  ...[-0.095, -0.05, 0.05, 0.095].map(x => [x, 0.042, 0.058, 0.022, 0.022, 0.005, 'glow']),
  ...[-0.095, -0.032, 0.032, 0.095].map(x => [x, 0.1, 0.058, 0.022, 0.022, 0.005, 'glow']),
  [0, 0.1, 0.06, 0.05, 0.02, 0.006, 'wood'], // the inn's sign board over the door
]
function Cottage({ color, pos, rot, inn }) {
  const parts = inn ? INN : COTTAGE
  const roof = inn ? [0.29, 0.07, 0.078, 0.126] : [0.098, 0.046, 0.046, 0.069] // length, height, half-depth, eave y
  return (
    <group position={pos} rotation-y={rot} scale={1.2}>
      {parts.map(([x, y, z, w, h, d, m], i) => (
        <mesh key={i} geometry={HOUSE.box} material={houseMat(m)} position={[x, y, z]} scale={[w, h, d]} castShadow={m === 'wall' || m === 'brick'} />
      ))}
      <mesh geometry={HOUSE.roof} material={roofMat(color)} position={[0, roof[3] - 0.005, 0]} scale={[roof[0], roof[1] / 1.5, roof[2] / 0.866]} castShadow />
    </group>
  )
}
// A face-down deck pile on its spot in the middle of the board.
function Deck({ pos, rot, color, label }) {
  const top = useMemo(() => mat('deck' + label, () => new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex('deck' + label, 256, 180, (g, w, h) => {
    g.fillStyle = color; rrect(g, 0, 0, w, h, 18); g.fill()
    g.strokeStyle = '#fbf3e4'; g.lineWidth = 6; rrect(g, 10, 10, w - 20, h - 20, 12); g.stroke()
    // card backs: just the deck's icon, no words
    g.translate(w / 2, h / 2); g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#5a3a24'
    if (label === 'Fortune Cookie') { // a folded fortune cookie with its paper slip peeking out
      g.fillStyle = '#f7d79a'
      g.beginPath(); g.moveTo(-62, 18); g.bezierCurveTo(-58, -52, 34, -58, 60, -6); g.bezierCurveTo(30, -18, 8, 6, 2, 34); g.bezierCurveTo(-18, 18, -40, 14, -62, 18); g.fill(); g.stroke()
      g.beginPath(); g.moveTo(2, 34); g.bezierCurveTo(10, 6, 34, -6, 60, -6); g.bezierCurveTo(58, 26, 30, 44, 2, 34); g.fillStyle = '#e9b866'; g.fill(); g.stroke()
      g.fillStyle = '#fbf3e4'; g.beginPath(); g.moveTo(-6, 30); g.lineTo(-30, 52); g.lineTo(-18, 58); g.lineTo(4, 36); g.fill(); g.lineWidth = 4; g.stroke()
    } else { // a teacup on its saucer, steaming
      g.fillStyle = '#fbf3e4'
      g.beginPath(); g.ellipse(0, 46, 70, 14, 0, 0, Math.PI * 2); g.fill(); g.stroke()
      g.beginPath(); g.moveTo(-50, -14); g.lineTo(50, -14); g.bezierCurveTo(48, 30, 26, 42, 0, 42); g.bezierCurveTo(-26, 42, -48, 30, -50, -14); g.fill(); g.stroke()
      g.beginPath(); g.arc(58, 6, 15, -1.3, 1.5); g.stroke()
      g.fillStyle = color; g.beginPath(); g.arc(0, 12, 11, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#fbf3e4'; g.lineWidth = 6; g.beginPath(); g.moveTo(-16, -30); g.quadraticCurveTo(-26, -46, -12, -62); g.moveTo(14, -30); g.quadraticCurveTo(4, -46, 18, -62); g.stroke()
    }
  }) })), [color, label])
  const side = mat('deckside', () => new THREE.MeshStandardMaterial({ color: '#efe4cf' }))
  return (
    <mesh position={pos} rotation-y={rot} material={[side, side, top, side, side, side]} castShadow>
      <boxGeometry args={[2.3 * U * 0.9, 0.08, 1.6 * U * 0.9]} />
    </mesh>
  )
}
function PropertyScene({ v, seats }) {
  const board = useMemo(boardTex, [])
  const slots = {}
  return (
    <group>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} /><meshStandardMaterial map={board} roughness={0.8} /></mesh>
      {/* the two deck piles, on their cobbled pads in the painted green */}
      {DECK_SPOTS.map((p, k) => <Deck key={k} pos={[p.x * U, 0.05, p.z * U]} rot={p.rot} color={k ? '#8fc7e8' : '#e8b86b'} label={k ? 'Tea Party' : 'Fortune Cookie'} />)}
      {Object.entries(v.owner).map(([sp, o]) => {
        const [x, z] = tilePos(+sp), s = seats.find(p => p.pid === o)
        const n = v.cottages[sp] || 0
        const [ix, iz] = inwardOf(+sp)
        const band = CORNER * U * 0.39 // centre of the colour band, toward the middle of the board
        const bx = x + ix * band, bz = z + iz * band, face = Math.atan2(-ix, -iz) // houses face out, toward that side's players
        return (
          <group key={sp}>
            {/* who owns it: a bar in their colour just above the tile's colour band (pale while mortgaged) */}
            <mesh position={Math.abs(z) > Math.abs(x) ? [x, 0.02, z - Math.sign(z) * (CORNER * U / 2 + 0.045)] : [x - Math.sign(x) * (CORNER * U / 2 + 0.045), 0.02, z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={Math.abs(z) > Math.abs(x) ? [U * 0.92, 0.07] : [0.07, U * 0.92]} />
              <meshBasicMaterial color={v.mortgaged[sp] ? '#bdb3a4' : s?.color || '#999'} toneMapped={false} />
            </mesh>
            {n === 5 ? <Cottage inn color={s?.color || '#c86f5a'} pos={[bx, 0.01, bz]} rot={face} />
              : Array.from({ length: n }, (_, k) => <Cottage key={k} color={s?.color || '#c86f5a'} pos={[bx + (iz ? (k - (n - 1) / 2) * 0.115 : 0), 0.01, bz + (ix ? (k - (n - 1) / 2) * 0.115 : 0)]} rot={face} />)}
          </group>
        )
      })}
      {seats.filter(s => !v.broke[s.pid]).map(s => {
        const sp = v.pos[s.pid]
        slots[sp] = (slots[sp] || 0) + 1
        return <Token key={s.pid} color={s.color} space={sp} slot={slots[sp] - 1} hop={!(v.last?.napped || v.napping[s.pid] === 1 || v.card?.back)} />
      })}
      <DieMesh value={v.dice[0]} pos={[-0.3, 0, 0.85]} roll={v.rolls} idx={0} />
      <DieMesh value={v.dice[1]} pos={[0.3, 0, 0.95]} roll={v.rolls} idx={1} />
    </group>
  )
}

// ════════ Chitter Cove (isle): its own section, everything below until the end marker ════════
// A hex island filling a sea-blue table: low hex tiles with little props and a resource badge per kind, big number
// tokens (6 and 8 in red), a sandy rim, docks with ratio signs, plank paths and cozy cottages and lodges in the owner's
// colour, the raccoon, the dice on the far side. Tapping glowing spots goes through isle/pick.js (the HUD decides what).
import { EDGES as ISLE_EDGES, KINDS as ISLE_KINDS, TILES as ISLE_TILES, VERTS as ISLE_VERTS } from './isle/rules.js'
import { usePick as useIslePick, screen as isleScreen } from './isle/pick.js'
import { iconUrl as isleIcon } from './isle/icons.js'

const IK = 0.7, ITH = 0.12 // world units per hex size; tile thickness
const iw = (x, y) => [x * IK, y * IK] // island (x, y) → world (x, z)
const ISLE = {
  hex: new THREE.CylinderGeometry(IK * 0.95, IK * 0.97, ITH, 6), // a corner points along +z, like the rules' pointy-top hexes
  sand: new THREE.CylinderGeometry(IK * 1.07, IK * 1.13, 0.07, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 14, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  disc: new THREE.CylinderGeometry(1, 1, 1, 28),
  plane: new THREE.PlaneGeometry(1, 1),
  roof: new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.5, 0), // ridge along x
}
const im = (key, color, o = {}) => mat('isle-' + key, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }))
const flat = (key, map) => mat('isle-flat-' + key, () => new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: true }))
const ISLE_RES = { woods: 'twig', meadow: 'wool', clay: 'clay', berry: 'berry', tea: 'tea' }
const ISLE_RES_C = { twig: '#8a5a34', wool: '#9c8f74', clay: '#c8693f', berry: '#a54a82', tea: '#4f8a43' }
// A canvas texture that draws its background now and an icon (from isle/icons.js) once the SVG has loaded.
function iconTex(key, w, h, draw, icon, box) {
  if (texCache.has(key)) return texCache.get(key)
  const t = canvasTex(key, w, h, draw)
  if (icon && typeof Image !== 'undefined') {
    const img = new Image()
    img.onload = () => { t.image.getContext('2d').drawImage(img, ...box); t.needsUpdate = true }
    img.src = isleIcon(icon, 128)
  }
  return t
}
// A speckled top per tile kind (grass, soil, water), so tiles read as ground and not plastic.
const isleTopTex = k => canvasTex('isle-top-' + k, 128, 128, (g, w, h) => {
  g.fillStyle = ISLE_KINDS[k].color; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 70; i++) {
    g.fillStyle = i % 2 ? '#ffffff22' : '#00000018'
    g.beginPath(); g.arc((i * 53) % w, (i * 97 + i * i) % h, 2 + (i % 3), 0, 7); g.fill()
  }
})
const tileMats = k => mat('isle-tile-' + k, () => [im('side', '#a8885f'), new THREE.MeshStandardMaterial({ map: isleTopTex(k), roughness: 0.95 }), im('side', '#a8885f')])
// Number tokens: cream with a dark rim, a big dark number (6 and 8 bigger and red), and pips for how often it comes up.
const numTex = n => canvasTex('isle-num2-' + n, 256, 256, (g, w) => {
  const hot = n === 6 || n === 8
  g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill()
  g.fillStyle = hot ? '#fff1d6' : '#fff8ec'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, 7); g.fill()
  g.fillStyle = hot ? '#d12f3f' : '#2b2230'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `900 ${hot ? 150 : 132}px ${FONT}`; g.fillText(String(n), w / 2, w / 2 - 14)
  const dots = 6 - Math.abs(7 - n)
  for (let i = 0; i < dots; i++) { g.beginPath(); g.arc(w / 2 + (i - (dots - 1) / 2) * 24, w / 2 + 78, 9, 0, 7); g.fill() }
})
// A round badge with the tile's resource icon, so kinds read at a glance.
const badgeTex = r => iconTex('isle-badge-' + r, 128, 128, (g, w) => {
  g.fillStyle = ISLE_RES_C[r]; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill()
  g.fillStyle = '#fff8ec'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 10, 0, 7); g.fill()
}, r, [18, 18, 92, 92])
const dockTex = k => iconTex('isle-dock2-' + k, 192, 192, (g, w) => {
  g.fillStyle = '#fff8ec'; rrect(g, 6, 6, w - 12, w - 12, 30); g.fill()
  g.strokeStyle = k === 'any' ? '#8a5a34' : ISLE_RES_C[k]; g.lineWidth = 12; rrect(g, 6, 6, w - 12, w - 12, 30); g.stroke()
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2b2230'
  if (k === 'any') { g.font = `900 78px ${FONT}`; g.fillText('3:1', w / 2, w / 2 - 14); g.font = `800 34px ${FONT}`; g.fillText('any', w / 2, w / 2 + 50); return }
  g.font = `900 64px ${FONT}`; g.fillText('2:1', w / 2, w / 2 + 52)
}, k === 'any' ? null : k, [56, 18, 80, 80])
// Props per kind, in tile space; the middle is the number token and the bottom (toward you) the resource badge.
const SPOTS = [[-0.3, -0.1], [0.3, -0.1], [0, -0.33], [-0.3, 0.16], [0.3, 0.16]]
function TileProps({ k }) {
  const P = (key, col) => im(key, col)
  const parts = []
  if (k === 'woods') SPOTS.forEach(([x, z], i) => {
    parts.push([x, z, 0.022, 0.05, 0.022, 'disc', P('trunk', '#7a4e2d'), 0])
    parts.push([x, z, 0.07, 0.16, 0.07, 'cone', P(i % 2 ? 'pine' : 'pine2', i % 2 ? '#2f6b3a' : '#3e7d45'), 0.04])
  })
  if (k === 'meadow') SPOTS.slice(0, 4).forEach(([x, z]) => {
    parts.push([x, z, 0.06, 0.048, 0.044, 'ball', P('wool', '#fbf6ea'), 0.05])
    parts.push([x + 0.06, z, 0.026, 0.026, 0.026, 'ball', P('sheepface', '#3a3036'), 0.065])
  })
  if (k === 'clay') {
    parts.push([-0.3, -0.06, 0.12, 0.06, 0.1, 'ball', P('mound', '#b8603a'), 0])
    parts.push([0.3, 0.12, 0.1, 0.05, 0.08, 'ball', P('mound2', '#d07a4b'), 0])
    ;[[0.22, -0.18, 0], [0.32, -0.18, 0], [0.27, -0.18, 1], [-0.05, -0.33, 0]].forEach(([x, z, up]) => parts.push([x, z, 0.08, 0.035, 0.045, 'box', P('brick', '#c8693f'), up * 0.036]))
  }
  if (k === 'berry') SPOTS.slice(0, 4).forEach(([x, z], i) => {
    parts.push([x, z, 0.075, 0.06, 0.075, 'ball', P('bush', '#3f7a3f'), 0.05])
    ;[[0.035, 0.04], [-0.035, 0.035], [0.0, -0.05]].forEach(([dx, dz]) => parts.push([x + dx, z + dz, 0.022, 0.022, 0.022, 'ball', P(i % 2 ? 'berry2' : 'berry', i % 2 ? '#8f3c70' : '#c04a86'), 0.095]))
  })
  if (k === 'tea') [-0.32, -0.12].forEach(z => [-0.24, 0.24].forEach(x => parts.push([x, z + (x < 0 ? 0 : 0.04), 0.2, 0.05, 0.06, 'box', P('teabush', '#4f8a43'), 0])))
  if (k === 'tea') [-0.32, 0.32].forEach(x => parts.push([x, 0.14, 0.12, 0.05, 0.06, 'box', P('teabush2', '#5f9a4f'), 0]))
  if (k === 'pond') {
    parts.push([0, -0.02, 0.42, 0.01, 0.34, 'disc', mat('isle-water', () => new THREE.MeshStandardMaterial({ color: '#4f9fbf', roughness: 0.2, metalness: 0.1 })), 0])
    parts.push([0.12, -0.08, 0.08, 0.006, 0.08, 'disc', P('lily', '#6fb06a'), 0.01])
    parts.push([-0.14, 0.08, 0.05, 0.006, 0.05, 'disc', P('lily', '#6fb06a'), 0.01])
    parts.push([0.14, -0.08, 0.02, 0.02, 0.02, 'ball', P('flower', '#f3a7c0'), 0.02])
  }
  return parts.map(([x, z, sx, sy, sz, geo, m, y], i) => (
    <mesh key={i} geometry={ISLE[geo]} material={m} position={[x * IK * 1.6, ITH + y + (geo === 'ball' ? sy * 0.6 : sy / 2), z * IK * 1.6]} scale={[sx * 1.2, sy * 1.2, sz * 1.2]} castShadow />
  ))
}
function IsleNumber({ n, pos, hit }) {
  const ref = useRef(), t0 = useRef(-1)
  useEffect(() => { t0.current = hit ? -2 : -1 }, [hit])
  useFrame(({ clock }) => {
    if (t0.current === -2) t0.current = clock.elapsedTime
    const t = t0.current >= 0 ? clock.elapsedTime - t0.current : 9
    const b = !reduced && t < 1.2 ? Math.abs(Math.sin(t * Math.PI * 2.5)) * (1.2 - t) * 0.25 : 0
    ref.current.position.y = ITH + 0.025 + b
    ref.current.scale.setScalar(1 + b * 1.5)
  })
  const big = n === 6 || n === 8 ? 1.1 : 1
  return (
    <group position={[pos[0], 0, pos[1]]}><group ref={ref}>
      <mesh geometry={ISLE.disc} scale={[0.25 * big, 0.03, 0.25 * big]} material={[im('numside', '#3a2a20'), flat('num' + n, numTex(n)), im('numside', '#3a2a20')]} castShadow />
    </group></group>
  )
}
const tint = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString()
// A cozy home on a corner, all in the owner's colour: tinted walls, a full-colour roof and a colour footing; lodges add a tower.
function IsleHome({ color, lodge, pos }) {
  const roof = mat('isle-roof' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }))
  const wall = mat('isle-wall' + color, () => new THREE.MeshStandardMaterial({ color: tint(color, 0.55), roughness: 0.85 }))
  const base = mat('isle-base' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
  const wood = im('door', '#5a3a22'), glow = mat('isle-glow', () => new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }))
  const B = (p, s, m, k) => <mesh key={k} geometry={ISLE.box} material={m} position={p} scale={s} castShadow />
  const R = (p, s, k) => <mesh key={k} geometry={ISLE.roof} material={roof} position={p} scale={s} castShadow />
  const parts = lodge ? [
    B([0, 0.008, 0], [0.25, 0.016, 0.18], base, 0),
    B([0, 0.07, 0], [0.2, 0.12, 0.13], wall, 1), R([0, 0.13, 0], [0.23, 0.065, 0.095], 2),
    B([0.07, 0.12, -0.01], [0.08, 0.22, 0.09], wall, 3), R([0.07, 0.23, -0.01], [0.105, 0.055, 0.065], 4),
    B([-0.04, 0.045, 0.066], [0.035, 0.07, 0.005], wood, 5), B([0.035, 0.075, 0.066], [0.03, 0.03, 0.005], glow, 6), B([0.07, 0.17, 0.036], [0.03, 0.03, 0.005], glow, 7),
    B([-0.06, 0.19, -0.03], [0.025, 0.06, 0.025], im('chimney', '#7a4e2d'), 8),
  ] : [
    B([0, 0.008, 0], [0.15, 0.016, 0.13], base, 0),
    B([0, 0.055, 0], [0.11, 0.09, 0.09], wall, 1), R([0, 0.1, 0], [0.135, 0.06, 0.068], 2),
    B([-0.02, 0.04, 0.046], [0.03, 0.055, 0.005], wood, 3), B([0.03, 0.06, 0.046], [0.025, 0.025, 0.005], glow, 4),
    B([0.035, 0.14, -0.015], [0.02, 0.05, 0.02], im('chimney', '#7a4e2d'), 5),
  ]
  return <Tw pos={pos} from={[pos[0], pos[1] + 0.8, pos[2]]} speed={7} lift={0}><group scale={1.55}>{parts}</group></Tw>
}
// The raccoon: a round grey body, striped tail, black mask; it bobs where it sits and hops to a new tile.
function Raccoon({ pos }) {
  const bob = useRef()
  useFrame(({ clock }) => { if (bob.current && !reduced) bob.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2.2)) * 0.02 })
  const grey = im('rac-grey', '#9aa0aa'), dark = im('rac-dark', '#34343e'), white = im('rac-white', '#f4f1ea')
  const S = (p, s, m, k) => <mesh key={k} geometry={ISLE.ball} material={m} position={p} scale={s} castShadow />
  return (
    <Tw pos={pos} speed={4} lift={0.6}>
      <group ref={bob} scale={1.45}>
        {S([0, 0.09, 0], [0.085, 0.08, 0.075], grey, 1)}
        {S([0, 0.19, 0.03], [0.07, 0.06, 0.06], grey, 2)}
        {S([0, 0.19, 0.075], [0.06, 0.022, 0.03], dark, 3)}
        {S([-0.024, 0.193, 0.096], [0.012, 0.012, 0.01], white, 4)}
        {S([0.024, 0.193, 0.096], [0.012, 0.012, 0.01], white, 5)}
        {S([0, 0.17, 0.09], [0.022, 0.016, 0.02], white, 6)}
        {S([0, 0.175, 0.108], [0.009, 0.008, 0.008], dark, 7)}
        {[-1, 1].map(s => <mesh key={'e' + s} geometry={ISLE.cone} material={dark} position={[s * 0.045, 0.25, 0.02]} scale={[0.022, 0.04, 0.018]} />)}
        {[0, 1, 2, 3].map(i => <mesh key={'t' + i} geometry={ISLE.ball} material={i % 2 ? dark : grey} position={[0.02 + i * 0.012, 0.07 + i * 0.035, -0.09 - i * 0.02]} scale={[0.035, 0.03, 0.035]} castShadow />)}
      </group>
    </Tw>
  )
}
const hover = on => { if (typeof document !== 'undefined') document.body.style.cursor = on ? 'pointer' : '' }
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
// A tappable spot that flashes (opacity only: scaling the group moved spots off their corners and sides).
function Glow({ children, onPick }) {
  useFrame(({ clock }) => { glowMat.opacity = reduced ? 0.9 : 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)) })
  return <group onClick={e => { e.stopPropagation(); hover(false); onPick() }} onPointerOver={e => { e.stopPropagation(); hover(true) }} onPointerOut={() => hover(false)}>{children}</group>
}
const glowMat = mat('isle-glowspot', () => new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }))
// The dice roll in a gap between two docks, clear of the HUD: the left side on wide screens, the far side on phones.
const ISLE_DICE = { wide: [[-3.01, 1.34], [-3.23, 0.69]], tall: [[-1.1, -3.05], [-0.7, -3.22]] }

function IsleScene({ v, seats }) {
  const pick = useIslePick()
  const { camera, size } = useThree()
  const tall = size.width < size.height, sc = tall ? 0.9 : 1 // phones: a touch smaller so the side docks stay on screen
  useEffect(() => {
    const p = new THREE.Vector3()
    isleScreen.tile = i => { p.set(ISLE_TILES[i].x * IK * sc, 0.25, ISLE_TILES[i].y * IK * sc).project(camera); return [(p.x + 1) / 2 * size.width, (1 - p.y) / 2 * size.height] }
    return () => { isleScreen.tile = null }
  }, [camera, size, sc])
  useEffect(() => () => hover(false), [])
  const col = pid => seats.find(s => s.pid === pid)?.color || '#999'
  const sum = v.rolls ? v.dice[0] + v.dice[1] : 0
  const vpos = i => iw(ISLE_VERTS[i].x, ISLE_VERTS[i].y)
  const can = id => pick.onPick && pick.spots.includes(id)
  const rt = ISLE_TILES[v.raccoon]
  return (
    <group scale={sc}>
      {ISLE_TILES.map((t, i) => {
        const [x, z] = iw(t.x, t.y), k = v.tiles[i].k
        const tap = pick.kind === 'raccoon' && can(i)
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh geometry={ISLE.sand} material={im('sand', '#ead6a4')} position={[0, 0.035, 0]} receiveShadow />
            <mesh geometry={ISLE.hex} material={tileMats(k)} position={[0, ITH / 2 + 0.01, 0]} receiveShadow castShadow
              onClick={tap ? e => { e.stopPropagation(); hover(false); pick.onPick(i) } : undefined}
              onPointerOver={tap ? e => { e.stopPropagation(); hover(true) } : undefined} onPointerOut={tap ? () => hover(false) : undefined} />
            <group position={[0, 0.01, 0]}><TileProps k={k} /></group>
            {ISLE_RES[k] && <mesh geometry={ISLE.plane} material={flat('badge' + k, badgeTex(ISLE_RES[k]))} position={[0, ITH + 0.016, IK * 0.6]} rotation-x={-Math.PI / 2} scale={0.25} />}
            {tap && <Glow onPick={() => pick.onPick(i)}><mesh position={[0, ITH + 0.03, 0]} rotation-x={-Math.PI / 2} material={glowMat}><ringGeometry args={[IK * 0.66, IK * 0.78, 6, 1, Math.PI / 6]} /></mesh></Glow>}
          </group>
        )
      })}
      {v.tiles.map((t, i) => t.n > 0 && <IsleNumber key={'n' + i} n={t.n} pos={iw(ISLE_TILES[i].x, ISLE_TILES[i].y)} hit={t.n === sum ? v.rolls : 0} />)}
      {/* docks: a little pier out from the coast with a sign facing you (3:1 any, 2:1 one resource) */}
      {v.docks.map((d, i) => {
        const a = ISLE_VERTS[ISLE_EDGES[d.e].a], b = ISLE_VERTS[ISLE_EDGES[d.e].b]
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, len = Math.hypot(mx, my), ox = mx / len, oy = my / len
        const [px, pz] = iw(mx + ox * 0.3, my + oy * 0.3), [sx, sz] = iw(mx + ox * 0.56, my + oy * 0.56)
        return (
          <group key={'d' + i}>
            <mesh geometry={ISLE.box} material={im('pier', '#9a6a44')} position={[px, 0.05, pz]} rotation-y={Math.atan2(ox, oy)} scale={[0.14, 0.025, 0.34]} castShadow />
            {[-1, 1].map(s => <mesh key={s} geometry={ISLE.disc} material={im('post', '#6e4a30')} position={[px + s * oy * 0.06, 0.03, pz - s * ox * 0.06]} scale={[0.016, 0.08, 0.016]} />)}
            <group position={[sx, 0.22, sz]}>
              <mesh geometry={ISLE.disc} material={im('post', '#6e4a30')} position={[0, -0.11, 0]} scale={[0.014, 0.22, 0.014]} />
              <mesh geometry={ISLE.plane} rotation-x={-0.55} scale={0.34} material={flat('dock' + d.k, dockTex(d.k))} />
            </group>
          </group>
        )
      })}
      {Object.entries(v.paths).map(([e, p]) => {
        const ed = ISLE_EDGES[e], [ax, az] = vpos(ed.a), [bx, bz] = vpos(ed.b)
        return (
          <group key={'p' + e} position={[(ax + bx) / 2, ITH + 0.012, (az + bz) / 2]} rotation-y={-Math.atan2(bz - az, bx - ax)}>
            <mesh geometry={ISLE.box} material={im('plankedge', '#3a2a20')} position={[0, 0.012, 0]} scale={[IK * 0.64, 0.024, 0.1]} castShadow />
            <mesh geometry={ISLE.box} material={mat('isle-pathc' + col(p), () => new THREE.MeshStandardMaterial({ color: col(p), roughness: 0.5 }))} position={[0, 0.028, 0]} scale={[IK * 0.6, 0.016, 0.075]} castShadow />
          </group>
        )
      })}
      {Object.entries(v.homes).map(([i, h]) => { const [x, z] = vpos(+i); return <IsleHome key={'h' + i + h.l} color={col(h.p)} lodge={h.l === 2} pos={[x, ITH + 0.012, z]} /> })}
      <Raccoon pos={[rt.x * IK + 0.3, ITH + 0.012, rt.y * IK - 0.14]} />
      {(pick.kind === 'cottage' || pick.kind === 'lodge') && pick.spots.map(i => { const [x, z] = vpos(i); return (
        <Glow key={'g' + i} onPick={() => pick.onPick(i)}>
          <mesh geometry={ISLE.ball} material={glowMat} position={[x, ITH + 0.08, z]} scale={0.065} />
          <mesh geometry={ISLE.ball} material={hitMat} position={[x, ITH + 0.08, z]} scale={0.16} />
        </Glow>
      ) })}
      {pick.kind === 'path' && pick.spots.map(e => {
        const ed = ISLE_EDGES[e], [ax, az] = vpos(ed.a), [bx, bz] = vpos(ed.b)
        return (
          <Glow key={'gp' + e} onPick={() => pick.onPick(e)}>
            <group position={[(ax + bx) / 2, ITH + 0.045, (az + bz) / 2]} rotation-y={-Math.atan2(bz - az, bx - ax)}>
              <mesh geometry={ISLE.box} material={glowMat} scale={[IK * 0.5, 0.035, 0.06]} />
              <mesh geometry={ISLE.box} material={hitMat} scale={[IK * 0.6, 0.14, 0.24]} />
            </group>
          </Glow>
        )
      })}
      {ISLE_DICE[tall ? 'tall' : 'wide'].map(([x, z], k) => <DieMesh key={k} value={v.dice[k]} pos={[x, 0, z]} roll={v.rolls} idx={k} />)}
    </group>
  )
}
// ════════ end of Chitter Cove (isle) ════════

// ════════ Starchat (Lantern Hollow): its own section, everything below until the end marker ════════
// A night meadow round a moonlit pond: the painted ground (starchat/boardArt.js), chunky lantern-path tiles with kind
// icons, the Firefly Bridge across the water, lantern poles strung with fairy lights, the six Wishing Posts with the
// star hovering over the lit one and Chit beside it, Marzipan's stalls, Juniper's Tea House, fireflies. Everyone walks
// the path as their own PNGtuber cut-out, step by step, and the follow camera leans in on whoever is moving.
import { LOOP as SC_LOOP, POSTS as SC_POSTS, SPACES as SC_SPACES } from './starchat/data.js'
import { BOARD_D as SC_D, BOARD_W as SC_W, POST_SPOTS as SC_POST, SPOTS as SC_SPOTS, TILE_R as SC_TR, beside as scBeside, outward as scOut } from './starchat/geom.js'
import { boardCanvas as scBoardCanvas, GROUND as SC_GROUND } from './starchat/boardArt.js'
import { iconUrl as scIconUrl, starPts as scStarPts } from './starchat/icons.js'

const SC_KIND = {
  glow: { fill: '#f7c45a', rim: '#fff3c4', side: '#c88a2a', ic: 'glow' },
  drizzle: { fill: '#7f9fd0', rim: '#d8e6fb', side: '#4d6799', ic: 'drizzle' },
  firefly: { fill: '#8fcf7a', rim: '#e3f6d6', side: '#4f8f45', ic: 'firefly' },
  bramble: { fill: '#b35d5d', rim: '#f2cfc6', side: '#7a3535', ic: 'bramble' },
  stall: { fill: '#f19a8c', rim: '#ffe2db', side: '#b25f55', ic: 'stall' },
  tea: { fill: '#5fb7b0', rim: '#d6f3ef', side: '#357d77', ic: 'tea' },
  owl: { fill: '#9b86cf', rim: '#e8e0fa', side: '#62508f', ic: 'owl' },
  post: { fill: '#e8dcc4', rim: '#fffaf0', side: '#a8946e', ic: 'post' },
}
const SC_TH = 0.1, SC_BRIDGE_Y = 0.16 // tile thickness; how high the bridge deck lifts its tiles
const scY = i => (i >= SC_LOOP ? SC_BRIDGE_Y : 0) + SC_TH + 0.005 // the top of a tile
const SC_GEO = {
  tile: new THREE.CylinderGeometry(SC_TR, SC_TR * 1.05, SC_TH, 36),
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 16, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  plane: new THREE.PlaneGeometry(1, 1),
  coin: new THREE.CylinderGeometry(0.07, 0.07, 0.022, 18).rotateX(Math.PI / 2),
  bulb: new THREE.SphereGeometry(0.032, 8, 6),
  star: (() => { // a puffy flat star for the post signs
    const s = new THREE.Shape(), pts = scStarPts(0, 0, 1, 0.48).split(' ').map(p => p.split(',').map(Number))
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)))
    return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2 }).center()
  })(),
}
const scStd = (key, color, o = {}) => mat('sc-' + key, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }))
const scBasic = (key, color) => mat('sc-b-' + key, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }))
// A canvas texture that paints now and draws one of starchat/icons.js on top once the SVG image has loaded.
function scIconTex(key, w, h, draw, icon, box) {
  if (texCache.has(key)) return texCache.get(key)
  const t = canvasTex(key, w, h, draw)
  if (icon && typeof Image !== 'undefined') {
    const img = new Image()
    img.onload = () => { t.image.getContext('2d').drawImage(img, ...box); t.needsUpdate = true }
    img.src = scIconUrl(icon, 256)
  }
  return t
}
const scTopTex = k => scIconTex('sc-top-' + k, 256, 256, (g, w) => {
  const K = SC_KIND[k]
  g.fillStyle = K.rim; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill()
  g.fillStyle = K.fill; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 16, 0, 7); g.fill()
  g.fillStyle = '#ffffff2e'; g.beginPath(); g.ellipse(w * 0.4, w * 0.36, w * 0.26, w * 0.15, -0.4, 0, 7); g.fill()
}, SC_KIND[k].ic, [38, 38, 180, 180])
const scTileMats = k => mat('sc-tile-' + k, () => [scStd('side' + k, SC_KIND[k].side, { roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: scTopTex(k), roughness: 0.55 }), scStd('side' + k, SC_KIND[k].side)])
// A soft round glow (sprites tint it), and the star's smiling face.
const scGlowTex = () => canvasTex('sc-glow', 128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  r.addColorStop(0, '#ffffffff'); r.addColorStop(0.25, '#ffffff99'); r.addColorStop(1, '#ffffff00')
  g.fillStyle = r; g.fillRect(0, 0, w, w)
})
const scGlowMat = color => mat('sc-glow' + color, () => new THREE.SpriteMaterial({ map: scGlowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
const scStarTex = () => canvasTex('sc-star', 256, 256, (g, w) => {
  const pts = R => scStarPts(w / 2, w / 2 + 8, R, R * 0.5).split(' ').map(p => p.split(',').map(Number))
  const poly = (R, dy, col) => { g.beginPath(); pts(R).forEach(([x, y], i) => (i ? g.lineTo(x, y + dy) : g.moveTo(x, y + dy))); g.closePath(); g.fillStyle = col; g.lineJoin = 'round'; g.lineWidth = 26; g.strokeStyle = col; g.stroke(); g.fill() }
  poly(100, 8, '#e39a2c'); poly(100, 0, '#ffd45a')
  g.fillStyle = '#fff3b080'; g.beginPath(); g.ellipse(w * 0.38, w * 0.36, 22, 10, -0.6, 0, 7); g.fill()
  g.fillStyle = '#3a2a3f'; g.beginPath(); g.ellipse(w * 0.41, w * 0.53, 9, 12, 0, 0, 7); g.ellipse(w * 0.59, w * 0.53, 9, 12, 0, 0, 7); g.fill()
  g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.415, w * 0.51, 3.5, 0, 7); g.arc(w * 0.595, w * 0.51, 3.5, 0, 7); g.fill()
  g.strokeStyle = '#3a2a3f'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(w * 0.45, w * 0.62); g.quadraticCurveTo(w * 0.5, w * 0.67, w * 0.55, w * 0.62); g.stroke()
  g.fillStyle = '#ff7a8a66'; g.beginPath(); g.ellipse(w * 0.34, w * 0.6, 11, 7, 0, 0, 7); g.ellipse(w * 0.66, w * 0.6, 11, 7, 0, 0, 7); g.fill()
})
const scStripeTex = (a, b) => canvasTex('sc-stripe' + a + b, 128, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * w / 8, 0, w / 8, h) } })
const scPlankTex = () => canvasTex('sc-plank', 256, 64, (g, w, h) => {
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#9a6a44' : '#8a5c3a'; g.fillRect(i * 16, 0, 15, h); g.fillStyle = '#5a3a22'; g.fillRect(i * 16 + 15, 0, 1, h) }
})
let scBoardTexture = null
const scBoardTex = () => {
  if (!scBoardTexture) { scBoardTexture = new THREE.CanvasTexture(scBoardCanvas()); scBoardTexture.colorSpace = THREE.SRGBColorSpace; scBoardTexture.anisotropy = 8 }
  return scBoardTexture
}
// Where each walker's feet are right now (the dice and the star's swoop follow them).
const scFeet = {}
const _sc = new THREE.Vector3()

function ScLights() {
  const sun = useRef()
  useEffect(() => { sun.current.target.position.set(0, 0, 0); sun.current.target.updateMatrixWorld() }, [])
  return (
    <>
      <ambientLight intensity={0.55} color="#8c90d8" />
      <hemisphereLight args={['#6f86d8', '#24382e', 0.6]} />
      <directionalLight ref={sun} position={[-5, 11, 4]} intensity={1.15} color="#c9d4ff" castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0006}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={1} shadow-camera-far={30} />
      {/* warm light spilling from the Tea House and the stalls */}
      {[scBeside(9, 1.0), scBeside(6, 1.0), scBeside(22, 1.0)].map((p, i) => <pointLight key={i} position={[p.x, 0.9, p.z]} intensity={i ? 1.4 : 2} distance={3.2} decay={1.6} color="#ffc27a" />)}
    </>
  )
}

// The sky behind the hollow: stars, a big soft moon, dark hills on the horizon.
function ScSky() {
  const stars = useMemo(() => {
    const n = 420, p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.05 + 0.9 * ((i * 0.618) % 1)), e = 0.06 + 0.5 * ((i * 0.377) % 1), r = 34
      p.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 1, -Math.sin(a) * Math.cos(e) * r], i * 3)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  return (
    <group>
      <points geometry={stars}><pointsMaterial color="#fff6dc" size={1.6} sizeAttenuation={false} transparent opacity={0.85} fog={false} toneMapped={false} /></points>
      <group position={[-9, 9, -22]}>
        <mesh><circleGeometry args={[1.6, 40]} /><meshBasicMaterial color="#fff1c6" fog={false} toneMapped={false} /></mesh>
        <mesh position={[0.5, 0.35, 0.01]}><circleGeometry args={[0.32, 20]} /><meshBasicMaterial color="#efe0ae" fog={false} toneMapped={false} /></mesh>
        <sprite scale={9} material={scGlowMat('#8f9be0')} />
      </group>
      {[[-11, -11, 9, 3.2], [-2, -13, 11, 3.8], [9, -11.5, 9, 3], [15, -6, 6, 2.6], [-15, -5, 6, 2.4]].map(([x, z, s, h], i) => (
        <mesh key={i} geometry={SC_GEO.ball} material={scStd('hill' + (i % 2), i % 2 ? '#1c3731' : '#22423a', { roughness: 1 })} position={[x, -0.4, z]} scale={[s, h, s * 0.45]} />
      ))}
    </group>
  )
}

// Fireflies: a cheap cloud of additive points drifting over the meadow, each blinking on its own beat.
function ScFireflies({ n = 80 }) {
  const { geo, seed } = useMemo(() => {
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = []
    for (let i = 0; i < n; i++) {
      const x = (((i * 0.6180339) % 1) - 0.5) * SC_W * 1.1, z = (((i * 0.4142135) % 1) - 0.5) * SC_D * 1.05
      s.push([x, z, 0.3 + ((i * 0.7548) % 1) * 1.4, i * 1.7])
      p.set([x, s[i][2], z], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return { geo: g, seed: s }
  }, [n])
  const tex = useMemo(scGlowTex, [])
  useFrame(({ clock }) => {
    const t = reduced ? 3 : clock.elapsedTime, pos = geo.attributes.position, col = geo.attributes.color
    for (let i = 0; i < n; i++) {
      const [x, z, y, ph] = seed[i]
      pos.setXYZ(i, x + Math.sin(t * 0.3 + ph) * 0.5, y + Math.sin(t * 0.7 + ph * 2) * 0.18, z + Math.cos(t * 0.25 + ph) * 0.4)
      const b = reduced ? 0.7 : Math.max(0, Math.sin(t * 1.3 + ph * 3)) ** 2
      col.setXYZ(i, 0.85 * b, 1.0 * b, 0.45 * b)
    }
    pos.needsUpdate = true; col.needsUpdate = true
  })
  return <points geometry={geo}><pointsMaterial map={tex} size={0.16} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></points>
}

// The 41 tiles (36 round the loop, 5 on the bridge), fork choices pulsing, Honey Traps as little pots.
function ScTiles({ v }) {
  const ring = useRef()
  useFrame(({ clock }) => { if (ring.current) ring.current.children.forEach(c => { c.material.opacity = reduced ? 0.9 : 0.55 + 0.4 * Math.sin(clock.elapsedTime * 5) }) })
  const forks = v?.phase === 'fork' ? v.fork : []
  return (
    <group>
      {SC_SPACES.map((s, i) => (
        <mesh key={i} geometry={SC_GEO.tile} material={scTileMats(s.k)} position={[SC_SPOTS[i].x, scY(i) - SC_TH / 2, SC_SPOTS[i].z]} castShadow receiveShadow />
      ))}
      <group ref={ring}>
        {forks.map(i => (
          <mesh key={i} position={[SC_SPOTS[i].x, scY(i) + 0.01, SC_SPOTS[i].z]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[SC_TR * 1.08, SC_TR * 1.34, 32]} /><meshBasicMaterial color="#fff3a0" transparent depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {Object.keys(v?.traps || {}).map(sp => (
        <group key={'t' + sp} position={[SC_SPOTS[sp].x + 0.12, scY(+sp), SC_SPOTS[sp].z - 0.08]}>
          <mesh geometry={SC_GEO.cyl} material={scStd('honey', '#f2b33a', { roughness: 0.4 })} position={[0, 0.05, 0]} scale={[0.06, 0.1, 0.06]} castShadow />
          <mesh geometry={SC_GEO.cyl} material={scStd('honeylid', '#c9852a')} position={[0, 0.105, 0]} scale={[0.07, 0.02, 0.07]} />
        </group>
      ))}
    </group>
  )
}

// The Firefly Bridge: a plank deck across the pond on stilts, rails strung with lights.
function ScBridge() {
  const a = SC_SPOTS[26], b = SC_SPOTS[9], dx = b.x - a.x, dz = b.z - a.z
  const L = Math.hypot(dx, dz) - 0.7, mid = [(a.x + b.x) / 2, (a.z + b.z) / 2], rot = -Math.atan2(dz, dx)
  const deck = useMemo(() => { const t = scPlankTex().clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(L / 1.2, 1); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }) }, [L])
  const n = Math.round(L / 0.55)
  return (
    <group position={[mid[0], 0, mid[1]]} rotation-y={rot}>
      <mesh geometry={SC_GEO.box} material={deck} position={[0, SC_BRIDGE_Y - 0.03, 0]} scale={[L, 0.06, 0.66]} castShadow receiveShadow />
      {Array.from({ length: n + 1 }, (_, k) => [-1, 1].map(s => {
        const x = -L / 2 + (k * L) / n
        return (
          <group key={k + ':' + s}>
            <mesh geometry={SC_GEO.cyl} material={scStd('stilt', '#5a3a22')} position={[x, 0.12, s * 0.36]} scale={[0.025, 0.4, 0.025]} castShadow />
            {k % 2 === 0 && <mesh geometry={SC_GEO.bulb} material={scBasic('bulb' + (k % 3), ['#ffd27a', '#f2a7c3', '#b8e986'][k % 3])} position={[x, 0.34, s * 0.36]} />}
          </group>
        )
      }))}
      {[-1, 1].map(s => <mesh key={s} geometry={SC_GEO.box} material={scStd('rail', '#7a4e2d')} position={[0, 0.3, s * 0.36]} scale={[L, 0.025, 0.025]} />)}
    </group>
  )
}

// Lantern poles round the inside of the loop with paper lanterns, and fairy lights strung between them.
const SC_POLES = [0, 3, 6, 11, 14, 17, 20, 23, 29, 32].map(i => {
  const a = SC_SPOTS[i], b = SC_SPOTS[(i + 1) % SC_LOOP], [ox, oz] = scOut(i)
  return { x: (a.x + b.x) / 2 - ox * 0.5, z: (a.z + b.z) / 2 - oz * 0.5 }
})
const SC_POLE_H = 1.25
function ScLanterns() {
  const { lines, bulbs } = useMemo(() => {
    const pairs = [], bl = [], N = 10
    SC_POLES.forEach((p, i) => {
      const q = SC_POLES[(i + 1) % SC_POLES.length]
      const at = k => { const t = k / N; return [p.x + (q.x - p.x) * t, SC_POLE_H - 0.06 - Math.sin(t * Math.PI) * 0.32, p.z + (q.z - p.z) * t] }
      for (let k = 0; k < N; k++) { pairs.push(...at(k), ...at(k + 1)); if (k) bl.push(at(k)) }
    })
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3))
    return { lines: new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2a2230' })), bulbs: bl }
  }, [])
  const inst = useRef()
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), c = new THREE.Color(), pal = ['#ffd27a', '#f2a7c3', '#9fd0ea', '#b8e986', '#fff4dc']
    bulbs.forEach((p, i) => { m.makeTranslation(p[0], p[1] - 0.04, p[2]); inst.current.setMatrixAt(i, m); inst.current.setColorAt(i, c.set(pal[i % 5])) })
    inst.current.instanceMatrix.needsUpdate = true
    if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true
  }, [bulbs])
  return (
    <group>
      <primitive object={lines} />
      <instancedMesh ref={inst} args={[SC_GEO.bulb, null, bulbs.length]}><meshBasicMaterial toneMapped={false} /></instancedMesh>
      {SC_POLES.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh geometry={SC_GEO.cyl} material={scStd('pole', '#4a3020')} position={[0, SC_POLE_H / 2, 0]} scale={[0.03, SC_POLE_H, 0.03]} castShadow />
          <mesh geometry={SC_GEO.box} material={scStd('pole', '#4a3020')} position={[0.09, SC_POLE_H - 0.04, 0]} scale={[0.2, 0.025, 0.025]} />
          <group position={[0.17, SC_POLE_H - 0.2, 0]}>
            <mesh geometry={SC_GEO.ball} material={scBasic('lantern' + (i % 3), ['#ffcf5a', '#f7a26a', '#ffe08a'][i % 3])} scale={[0.075, 0.1, 0.075]} />
            <mesh geometry={SC_GEO.cyl} material={scStd('lcap', '#6b3f2a')} position={[0, 0.1, 0]} scale={[0.045, 0.025, 0.045]} />
            <sprite scale={0.7} material={scGlowMat('#ffb560')} />
          </group>
        </group>
      ))}
    </group>
  )
}

// Turns its children to face the camera round the vertical axis (lean: tip back toward a high camera).
function Billboard({ y = 0, children, lean = 0 }) {
  const g = useRef()
  useFrame(({ camera }) => {
    const o = g.current
    o.getWorldPosition(_sc)
    const dx = camera.position.x - _sc.x, dz = camera.position.z - _sc.z
    o.rotation.set(lean ? -Math.atan2(camera.position.y - _sc.y, Math.hypot(dx, dz)) * lean : 0, Math.atan2(dx, dz), 0, 'YXZ')
  })
  return <group ref={g} position={[0, y, 0]}>{children}</group>
}

// Wishing Posts: a wooden post with a cream star sign; the lit one glows gold.
function ScPosts({ star }) {
  return SC_POSTS.map(p => {
    const s = SC_POST[p], lit = p === star
    return (
      <group key={p} position={[s.x, 0, s.z]}>
        <mesh geometry={SC_GEO.cyl} material={scStd('post', '#6e4a30')} position={[0, 0.4, 0]} scale={[0.035, 0.8, 0.035]} castShadow />
        <Billboard y={0.88}>
          <mesh geometry={SC_GEO.star} scale={0.13} material={lit ? scStd('postlit', '#ffd45a', { emissive: '#e8a230', emissiveIntensity: 0.9 }) : scStd('postsign', '#efe2c4')} castShadow />
        </Billboard>
        {lit && <sprite position={[0, 0.88, 0]} scale={0.9} material={scGlowMat('#ffd27a')} />}
      </group>
    )
  })
}

// Marzipan's Lantern Stall: a striped tent with a counter and a warm lamp, facing the path.
function ScStall({ i }) {
  const p = scBeside(i, 1.0), [ox, oz] = scOut(i), face = Math.atan2(-ox, -oz)
  const stripes = useMemo(() => { const t = scStripeTex('#f19a8c', '#fff4dc').clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.needsUpdate = true; return t }, [])
  return (
    <group position={[p.x, 0, p.z]} rotation-y={face}>
      <mesh geometry={SC_GEO.cyl} position={[0, 0.2, 0]} scale={[0.36, 0.4, 0.36]} castShadow receiveShadow><meshStandardMaterial map={stripes} roughness={0.8} /></mesh>
      <mesh position={[0, 0.58, 0]} scale={[0.5, 0.42, 0.5]} castShadow><coneGeometry args={[1, 1, 16]} /><meshStandardMaterial map={stripes} roughness={0.8} /></mesh>
      <mesh geometry={SC_GEO.box} material={scStd('counter', '#c98a5a')} position={[0, 0.14, 0.38]} scale={[0.5, 0.28, 0.14]} castShadow />
      <mesh geometry={SC_GEO.box} material={scBasic('stallglow', '#ffd27a')} position={[0, 0.2, 0.452]} scale={[0.44, 0.08, 0.002]} />
      {[[-0.15, '#cfe9f5'], [0, '#f6c244'], [0.15, '#e9839a']].map(([x, c], k) => <mesh key={k} geometry={SC_GEO.ball} material={scStd('ware' + k, c)} position={[x, 0.31, 0.38]} scale={0.045} />)}
      <mesh geometry={SC_GEO.cyl} material={scStd('pole', '#4a3020')} position={[0, 0.88, 0]} scale={[0.012, 0.22, 0.012]} />
      <mesh geometry={SC_GEO.box} material={scStd('flag', '#ffd45a')} position={[0.06, 0.95, 0]} scale={[0.11, 0.07, 0.005]} />
      <sprite position={[0, 0.35, 0.45]} scale={1.1} material={scGlowMat('#ffb560')} />
    </group>
  )
}
// Juniper's Tea House (the cottage model, grown into a teal-roofed inn) and the Owl Post birdhouses.
function ScBuildings() {
  const th = scBeside(9, 1.08), [tx, tz] = scOut(9)
  return (
    <group>
      <group position={[th.x, 0, th.z]} rotation-y={Math.atan2(-tx, -tz)} scale={2.9}>
        <Cottage inn color="#5fb7b0" pos={[0, 0, 0]} rot={0} />
      </group>
      <sprite position={[th.x - tx * 0.45, 0.35, th.z - tz * 0.45]} scale={1.4} material={scGlowMat('#ffb560')} />
      {[15, 30].map(i => {
        const p = scBeside(i, 0.62), [ox, oz] = scOut(i)
        return (
          <group key={i} position={[p.x, 0, p.z]} rotation-y={Math.atan2(-ox, -oz)}>
            <mesh geometry={SC_GEO.cyl} material={scStd('post', '#6e4a30')} position={[0, 0.3, 0]} scale={[0.03, 0.6, 0.03]} castShadow />
            <group position={[0, 0.58, 0]} scale={2.6}><Cottage color="#9b86cf" pos={[0, 0, 0]} rot={0} /></group>
          </group>
        )
      })}
    </group>
  )
}
// Trees round the meadow (deep teal and dusky purple, like the mockup), clear of the path.
const SC_TREES = [[-6.2, -3.6, 1.1, 0], [-5.9, 3.7, 0.9, 1], [6.1, 3.5, 1.0, 0], [6.3, -3.1, 1.2, 1], [-2.6, -4.2, 0.8, 1], [2.4, -4.3, 0.9, 0],
  [-6.4, 0.4, 0.8, 0], [6.6, 1.3, 0.7, 1], [0.6, -4.5, 0.7, 0], [-4.0, -4.4, 0.7, 0], [4.4, -4.3, 0.75, 1], [-3.6, 4.3, 0.6, 0], [3.2, 4.4, 0.65, 1]]
function ScTrees() {
  return SC_TREES.map(([x, z, s, hue], i) => (
    <group key={i} position={[x, 0, z]} scale={s}>
      <mesh geometry={SC_GEO.cyl} material={scStd('trunk', '#4a3020')} position={[0, 0.4, 0]} scale={[0.07, 0.8, 0.07]} castShadow />
      <mesh geometry={SC_GEO.ball} material={scStd('leaf' + hue, hue ? '#5b5fa8' : '#2f6b55', { roughness: 0.95 })} position={[0, 1.0, 0]} scale={0.48} castShadow />
      <mesh geometry={SC_GEO.ball} material={scStd('leafb' + hue, hue ? '#6f73bf' : '#3f8064', { roughness: 0.95 })} position={[0.22, 1.25, 0.1]} scale={0.32} castShadow />
      <mesh geometry={SC_GEO.ball} material={scStd('leaf' + hue, hue ? '#5b5fa8' : '#2f6b55', { roughness: 0.95 })} position={[-0.25, 0.85, 0.05]} scale={0.3} castShadow />
    </group>
  ))
}

// Chit, the host: a cut-out beside the lit post, chattering while offering the star and hopping when it's caught.
function ScChit({ star, offering, cheer }) {
  const c = botChar('normal', 0) // Chit
  const tex = useImgTex(botUrl(c, offering)) || critterTex(c.color, offering)
  const ref = useRef(), inner = useRef(), at = useRef(null)
  const target = scBeside(star, 1.05)
  useFrame(({ clock }, dt) => {
    if (!at.current) at.current = new THREE.Vector3(target.x, 0, target.z)
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * 1.6)
    const d = Math.hypot(at.current.x - target.x, at.current.z - target.z)
    at.current.x += (target.x - at.current.x) * k; at.current.z += (target.z - at.current.z) * k
    ref.current.position.set(at.current.x, reduced ? 0 : Math.min(0.6, d * 0.3), at.current.z)
    const t = clock.elapsedTime
    inner.current.position.y = reduced ? 0 : cheer ? Math.abs(Math.sin(t * 7)) * 0.2 : offering ? Math.abs(Math.sin(t * 3)) * 0.04 : 0
  })
  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}><circleGeometry args={[0.2, 20]} /><meshBasicMaterial color="#000" transparent opacity={0.3} depthWrite={false} /></mesh>
      <Billboard lean={0.4}><group ref={inner}><mesh position={[0, 0.34, 0]} renderOrder={1}><planeGeometry args={[0.68, 0.68]} /><meshBasicMaterial map={tex} transparent alphaTest={0.04} toneMapped={false} side={THREE.DoubleSide} /></mesh></group></Billboard>
    </group>
  )
}

// The star: hovers and bobs over the lit post. When it moves it drifts there along a high arc (the camera follows);
// when someone buys it, it first swoops into their arms with a burst, then a new one drifts in to the next post.
const scPostTop = sp => new THREE.Vector3(SC_POST[sp].x, 1.3, SC_POST[sp].z)
function ScStar({ v }) {
  const ref = useRef(), glow = useRef(), burst = useRef()
  const anim = useRef(null), pos = useRef(null), seen = useRef(v.star)
  useEffect(() => {
    if (v.star === seen.current) return
    seen.current = v.star
    const caught = v.last?.ev?.find(e => e.e === 'star')
    anim.current = { t0: -1, from: (pos.current || scPostTop(v.star)).clone(), to: scPostTop(v.star), buyer: caught ? v.last.pid : null }
  }, [v.star]) // eslint-disable-line react-hooks/exhaustive-deps
  const face = useMemo(() => new THREE.MeshBasicMaterial({ map: scStarTex(), transparent: true, alphaTest: 0.05, toneMapped: false, side: THREE.DoubleSide }), [])
  const burstMat = useMemo(() => new THREE.SpriteMaterial({ map: scGlowTex(), color: '#fff3a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!pos.current) pos.current = scPostTop(v.star)
    const a = anim.current
    let s = 1, b = 0
    if (a && !reduced) {
      if (a.t0 < 0) a.t0 = t
      const e = t - a.t0, CATCH = a.buyer ? 1.1 : 0, DRIFT = 2.2
      const f = a.buyer ? (scFeet[a.buyer] || a.from) : a.from
      if (a.buyer && e < CATCH) { // swoop down to the buyer's head, shrinking into their arms
        const k = Math.min(1, e / 0.8), q = k * k * (3 - 2 * k)
        pos.current.lerpVectors(a.from, _sc.set(f.x, (f.y || 0) + 1.1, f.z), q)
        s = 1 - q * 0.55
        b = e > 0.8 ? (e - 0.8) / 0.3 : 0
        camFocus.x = pos.current.x; camFocus.z = pos.current.z; camFocus.t = t
      } else if (e < CATCH + DRIFT) { // drift along a high arc to the new post
        const k = (e - CATCH) / DRIFT, q = k * k * (3 - 2 * k)
        if (!a.p0) a.p0 = a.buyer ? new THREE.Vector3(f.x, 3.2, f.z) : a.from.clone()
        const mid = a.p0.clone().add(a.to).multiplyScalar(0.5); mid.y += 2.2
        pos.current.copy(a.p0).multiplyScalar((1 - q) ** 2).addScaledVector(mid, 2 * q * (1 - q)).addScaledVector(a.to, q * q)
        s = a.buyer ? Math.min(1, 0.3 + k * 1.4) : 1
        camFocus.x = pos.current.x; camFocus.z = pos.current.z; camFocus.t = t
      } else { anim.current = null; pos.current.copy(a.to) }
    } else if (a) { anim.current = null; pos.current.copy(a.to) }
    const bob = reduced || anim.current ? 0 : Math.sin(t * 1.8) * 0.08
    ref.current.position.set(pos.current.x, pos.current.y + bob, pos.current.z)
    ref.current.scale.setScalar(0.85 * s * (reduced ? 1 : 1 + Math.sin(t * 2.4) * 0.03))
    glow.current.material.opacity = 0.75 + (reduced ? 0 : Math.sin(t * 2) * 0.2)
    burst.current.visible = b > 0 && b < 1
    if (burst.current.visible) { burst.current.scale.setScalar(0.5 + b * 3); burstMat.opacity = 1 - b; burst.current.position.copy(pos.current) }
  })
  return (
    <>
      <group ref={ref}>
        <sprite ref={glow} scale={2.2} material={scGlowMat('#ffd27a')} />
        <Billboard><mesh geometry={SC_GEO.plane} material={face} /></Billboard>
      </group>
      <sprite ref={burst} material={burstMat} visible={false} />
    </>
  )
}

// Someone walking the lantern path as their own cut-out: one hop per space (from the rules' step list), a glide for
// jumps (Bramble walk-backs, ferries, swaps, comets). Coins pop out of them when they gain and tumble when they lose,
// and an item they use flashes over their head.
const scSpot = (sp, slot, n) => {
  const p = SC_SPOTS[sp], a = n > 1 ? (slot / n) * Math.PI * 2 + 0.6 : 0, r = n > 1 ? 0.17 : 0
  return new THREE.Vector3(p.x + Math.cos(a) * r, scY(sp), p.z + Math.sin(a) * r * 0.8)
}
const SC_FIG = 0.95
function ScWalker({ p, v, slot, n, turn, lead, focus }) {
  const pid = p.pid, target = v.pos[pid]
  const face = useFace(p.user_id, 'stage')
  const talk = p.user_id ? face.talk : turn
  const photo = useImgTex(p.user_id ? (face.expr ? face.expr.src : null) : botUrl(botChar(p.bot, p.seat), talk))
  const tex = photo || critterTex(p.user_id ? face.p?.color || '#f4a261' : botChar(p.bot, p.seat).color, talk)
  const aspect = Math.min(1.6, Math.max(0.5, tex.image ? tex.image.width / tex.image.height : 1))
  const h = SC_FIG * (aspect > 1 ? 1 / Math.sqrt(aspect) : 1), w = h * aspect
  const root = useRef(), inner = useRef(), coins = useRef(), itemS = useRef()
  const st = useRef(null)
  const seenLast = useRef(v.last), coinsWas = useRef(v.coins[pid]), pop = useRef(null)
  const [item, setItem] = useState(null)
  if (!st.current) st.current = { at: target, queue: [], from: null, prog: 1, dur: 0.24, glide: false }
  useEffect(() => {
    const s = st.current, l = v.last
    if (l !== seenLast.current) {
      seenLast.current = l
      if (l?.pid === pid && l.path?.length) s.queue.push(...l.path.map(x => ({ s: x })))
      if (l?.pid === pid && l.item) setItem({ id: l.item, t0: -1, k: Math.random() })
    }
    const end = s.queue.length ? s.queue[s.queue.length - 1].s : s.at
    if (end !== target) s.queue.push({ s: target, glide: true })
    const d = v.coins[pid] - coinsWas.current
    coinsWas.current = v.coins[pid]
    if (d) pop.current = { d, t0: -1 }
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const itemMat = useMemo(() => item && new THREE.SpriteMaterial({ map: scIconTex('sc-item-' + item.id, 128, 128, () => {}, item.id, [0, 0, 128, 128]), transparent: true, depthTest: false, toneMapped: false }), [item])
  useFrame(({ clock }, dt) => {
    const s = st.current, t = clock.elapsedTime
    if (s.prog >= 1 && s.queue.length) {
      const nx = s.queue.shift()
      s.from = scSpot(s.at, slot, n); s.at = nx.s; s.glide = !!nx.glide; s.prog = 0
      s.dur = s.glide ? 0.8 : s.queue.length > 6 ? 0.14 : 0.24
    }
    const to = scSpot(s.at, slot, n)
    let y = 0, squash = 0
    if (s.prog < 1 && s.from) {
      s.prog = reduced ? 1 : Math.min(1, s.prog + dt / s.dur)
      const k = s.prog
      root.current.position.lerpVectors(s.from, to, k)
      y = Math.sin(k * Math.PI) * (s.glide ? 0.9 : 0.28)
      squash = k > 0.8 ? (1 - k) * 2.5 : 0
      if (lead) { camFocus.x = root.current.position.x; camFocus.z = root.current.position.z; camFocus.t = t }
    } else {
      root.current.position.lerp(to, reduced ? 1 : Math.min(1, dt * 6))
      if (focus && !s.queue.length) { camFocus.x = to.x; camFocus.z = to.z; camFocus.t = t } // stopped mid-walk for a choice: stay on them
    }
    root.current.position.y = to.y + y
    scFeet[pid] = root.current.position
    // talking: squash and stretch with voice (bots chatter on their turn); a little squish on each landing
    const vol = reduced ? 0 : p.user_id ? (voiceLevels.get(p.user_id) || 0) : talk ? 0.3 + 0.3 * Math.abs(Math.sin(t * 9)) : 0
    const sy = 1 + vol * 0.14 - squash * 0.2, sx = 1 - vol * 0.07 + squash * 0.15
    inner.current.scale.x += (sx - inner.current.scale.x) * 0.4
    inner.current.scale.y += (sy - inner.current.scale.y) * 0.4
    // coin pops: up and out on a gain, tumbling down on a loss
    const P = pop.current, cg = coins.current
    if (P && P.t0 < 0 && !s.queue.length && s.prog >= 1) P.t0 = t // once they've arrived
    const pe = P && P.t0 >= 0 ? t - P.t0 : 9
    cg.visible = !!P && P.t0 >= 0 && pe < 1.4 && !reduced
    if (cg.visible) cg.children.forEach((c, i) => {
      const e = Math.max(0, pe - i * 0.08), up = P.d > 0
      c.visible = i < Math.min(5, Math.ceil(Math.abs(P.d) / 3))
      c.position.set((i - 2) * 0.09 * (up ? 1 : 1.6), up ? h + 0.1 + e * 0.9 - e * e * 0.3 : h + 0.1 - e * e * 1.6, 0)
      c.rotation.y = e * 9
      c.material.opacity = Math.max(0, 1 - e / 1.2)
    })
    else if (P && P.t0 >= 0 && pe >= 1.4) pop.current = null
    // the item they just used, over their head
    const is = itemS.current
    if (is && item) {
      if (item.t0 < 0) item.t0 = t
      const ie = t - item.t0
      is.visible = ie < 2.2
      const k = Math.min(1, ie / 0.25)
      is.scale.setScalar(0.5 * (reduced ? 1 : k * (1 + 0.12 * Math.sin(ie * 8))))
      is.material.opacity = ie > 1.8 ? Math.max(0, (2.2 - ie) / 0.4) : 1
      is.position.y = h + 0.4 + (reduced ? 0 : ie * 0.1)
    }
  })
  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]}><ringGeometry args={[0.12, 0.17, 28]} /><meshBasicMaterial color={p.color} toneMapped={false} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, 0]}><circleGeometry args={[0.16, 24]} /><meshBasicMaterial color="#000" transparent opacity={0.3} depthWrite={false} /></mesh>
      <Billboard lean={0.35}>
        <group ref={inner}>
          <mesh position={[0, h / 2, 0]} renderOrder={1}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} transparent alphaTest={0.04} toneMapped={false} side={THREE.DoubleSide} opacity={p.gone ? 0.45 : 1} /></mesh>
        </group>
        <group ref={coins} visible={false}>
          {[0, 1, 2, 3, 4].map(i => <mesh key={i} geometry={SC_GEO.coin}><meshStandardMaterial color="#f6c244" emissive="#9a6a10" emissiveIntensity={0.5} metalness={0.3} roughness={0.35} transparent /></mesh>)}
        </group>
        {itemMat && <sprite key={item.k} ref={itemS} material={itemMat} renderOrder={3} />}
      </Billboard>
    </group>
  )
}

// The dice tumble over the head of whoever just rolled, then shrink away once they've set off.
function ScDice({ v }) {
  const g = useRef(), t0 = useRef(-1), who = v.last?.dice ? v.last.pid : null
  useEffect(() => { t0.current = -1 }, [v.rolls])
  useFrame(({ clock }) => {
    if (!who) { g.current.visible = false; return }
    if (t0.current < 0) t0.current = clock.elapsedTime
    const e = clock.elapsedTime - t0.current, f = scFeet[who]
    g.current.visible = e < 2.6
    if (f) g.current.position.set(f.x, (f.y || 0) + 1.25, f.z)
    g.current.scale.setScalar(e > 2.2 ? Math.max(0.01, (2.6 - e) / 0.4) * 0.8 : 0.8)
  })
  const dice = v.last?.dice || []
  return (
    <group ref={g} visible={false}>
      {dice.map((d, k) => <DieMesh key={v.rolls + ':' + k} value={d} pos={[(k - (dice.length - 1) / 2) * 0.42, 0, 0]} roll={v.rolls} idx={k} />)}
    </group>
  )
}

function StarchatScene({ v, seats }) {
  const board = useMemo(scBoardTex, [])
  const slots = {}, counts = {}
  if (v) for (const p of v.players) counts[v.pos[p]] = (counts[v.pos[p]] || 0) + 1
  const turnPid = v && v.phase !== 'mini' && !v.winners ? v.order[v.turn] : null
  return (
    <group>
      <ScLights />
      <ScSky />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color={SC_GROUND} roughness={1} /></mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[SC_W, SC_D]} /><meshStandardMaterial map={board} roughness={0.95} /></mesh>
      <ScTiles v={v} />
      <ScBridge />
      <ScLanterns />
      <ScPosts star={v?.star ?? 20} />
      <ScStall i={6} /><ScStall i={22} />
      <ScBuildings />
      <ScTrees />
      <ScFireflies />
      {v && <ScChit star={v.star} offering={v.phase === 'star'} cheer={!!v.last?.ev?.some(e => e.e === 'star')} />}
      {v && <ScStar v={v} />}
      {v && seats.filter(s => v.players.includes(s.pid)).map(s => {
        const sp = v.pos[s.pid]
        slots[sp] = (slots[sp] || 0) + 1
        return <ScWalker key={s.pid} p={s} v={v} slot={slots[sp] - 1} n={counts[sp]} turn={s.pid === turnPid} lead={s.pid === v.last?.pid} focus={s.pid === turnPid && ['star', 'shop', 'fork'].includes(v.phase)} />
      })}
      {v && <ScDice v={v} />}
    </group>
  )
}
// ════════ end of Starchat ════════

const SCENES = { snack: SnackScene, highcard: HighScene, poker: PokerScene, property: PropertyScene, isle: IsleScene, starchat: StarchatScene }

// Puts the camera where this game looks best, pulled back on narrow (phone) screens.
// Teacup Town tokens report where they are while they walk; the camera leans in and follows for everyone watching.
const camFocus = { x: 0, z: 0, t: -9 }
function Rig({ layout }) {
  const { camera, size } = useThree()
  const base = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height)
    if (layout.fit) { // back the camera off along its view line until the board's width fits the screen
      const portrait = aspect < 0.9 && layout.camP
      const look = new THREE.Vector3(...(portrait ? layout.lookP || layout.look : layout.look))
      const dir = new THREE.Vector3(...(portrait ? layout.camP : layout.cam)).sub(look)
      const half = Math.atan(Math.tan((42 / 2) * Math.PI / 180) * aspect)
      const k = Math.max(1, ((portrait ? layout.fit.d : layout.fit.w) / 2) / Math.tan(half) / dir.length())
      return { pos: look.clone().addScaledVector(dir, k), look }
    }
    const k = aspect < 1.25 ? Math.min(1.7, Math.pow(1.25 / aspect, 0.8)) : 1
    // Portrait phones: higher and steeper rather than just further away, so the table fills the width.
    return { pos: new THREE.Vector3(layout.cam[0], layout.cam[1] * (1 + (k - 1) * 1.5), layout.cam[2] * (1 + (k - 1) * 0.55)), look: new THREE.Vector3(...layout.look) }
  }, [size.width, size.height, layout])
  const cur = useRef(null), tp = useRef(new THREE.Vector3()), tl = useRef(new THREE.Vector3())
  useFrame(({ clock }, dt) => {
    if (!cur.current) cur.current = { pos: base.pos.clone(), look: base.look.clone() }
    const follow = layout.follow && !reduced && clock.elapsedTime - camFocus.t < 0.9
    if (follow) { // lean in along the same view direction, centred near the walking token (gentler on phones)
      const portrait = size.width < size.height * 0.9
      const fk = layout.followK ?? (portrait ? 0.55 : 0.8)
      tl.current.set(camFocus.x * fk, layout.followY || 0, camFocus.z * fk)
      tp.current.copy(base.pos).sub(base.look).multiplyScalar(portrait ? 0.8 : 0.6).add(tl.current)
    } else { tp.current.copy(base.pos); tl.current.copy(base.look) }
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.05) * (follow ? 2.2 : 1.6))
    cur.current.pos.lerp(tp.current, k); cur.current.look.lerp(tl.current, k)
    camera.position.copy(cur.current.pos)
    camera.lookAt(cur.current.look)
  })
  return null
}

// Moves each DOM person onto their seat: projected feet, scaled by distance, stacked by depth.
const _v = new THREE.Vector3()
// Pins each nameplate (and speech bubble) just above its cut-out's head, shrinking with distance.
function Projector({ seats, els }) {
  const { camera, size } = useThree()
  useFrame(() => {
    seats.forEach((s, i) => {
      const el = els.current[i]
      if (!el) return
      const top = SEAT_Y + FIG_H + 0.28
      _v.set(s.x, top, s.z).project(camera)
      const x = Math.min(size.width - 70, Math.max(70, (_v.x + 1) / 2 * size.width)), y = Math.max(84, (1 - _v.y) / 2 * size.height) // never under the top bar
      const y0 = (1 - _v.y) / 2 * size.height
      _v.set(s.x, top + 1, s.z).project(camera)
      const d = Math.max(0.6, Math.min(1.05, (y0 - (1 - _v.y) / 2 * size.height) / 110))
      const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      if (el.style.transform !== tf) { el.style.transform = tf; el.style.zIndex = String(Math.round(100 + s.z * 10)); el.style.setProperty('--d', d.toFixed(3)) }
    })
  })
  return null
}

export default function Table3D({ game, v, people, meIdx, me, turnPid, info, winners, pending }) {
  const layout = LAYOUT[game]
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden)
  useEffect(() => {
    const f = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  const n = people.length
  const portrait = innerWidth < innerHeight * 0.9
  const r = layout.seatR * (portrait ? 0.9 : 1)
  const seats = people.map((p, i) => {
    let [x, z, a] = seatAt(i, Math.max(n, 2), meIdx, r, portrait)
    return { ...p, x, z, a, r }
  })
  const others = seats.filter(s => s.pid !== me) // you are the camera: your hand is the dock along the bottom
  const els = useRef([])
  const Scene = SCENES[game]
  return (
    <div className="g3d">
      <Canvas shadows dpr={[1, 1.5]} frameloop={hidden ? 'never' : 'always'} camera={{ fov: 42, near: 0.1, far: 60, position: layout.cam }}
        gl={{ antialias: true, powerPreference: 'low-power' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05 }}>
        <color attach="background" args={[layout.bg || '#2a1f2b']} />
        <fog attach="fog" args={[layout.bg || '#2a1f2b', 18, 40]} />
        <Rig layout={layout} />
        {layout.outdoor ? <Scene v={v} seats={seats} meId={me} pending={pending} /> : <>
          <Lights layout={layout} />
          <Room layout={layout} />
          <TableMesh layout={layout} />
          {seats.filter(s => s.pid !== me).map(s => <Chair key={s.pid} x={s.x * 1.14} z={s.z * 1.14} a={s.a} />)}
          {others.map(s => <Cutout key={s.pid} p={s} x={s.x} z={s.z} turn={s.pid === turnPid} won={winners?.includes(s.pid)} />)}
          {v && <Scene v={v} seats={seats} meId={me} pending={pending} />}
          <Projector seats={others} els={els} />
        </>}
      </Canvas>
      {/* you: your live PNGtuber in the bottom-left corner (like your corner in the stadium crowd), no name.
          Outdoor games (Starchat) walk everyone, you included, on the board and name them in their HUD. */}
      {!layout.outdoor && seats.some(s => s.pid === me) && (
        <div className="g-me" aria-hidden="true">
          <Avatar id={me} size={innerWidth < 700 ? 64 : 112} full mode="stage" vbadge />
          {v && <span className="g-me-info">{info(me)}</span>}
        </div>
      )}
      {!layout.outdoor && others.map((p, i) => (
        <Person key={p.pid} head p={p} elRef={el => { els.current[i] = el }} turn={p.pid === turnPid} info={info(p.pid)} me={p.pid === me} />
      ))}
    </div>
  )
}

