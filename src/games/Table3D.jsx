// The 3D game table (lazy chunk: three.js loads only when a game opens). WebGL draws the cozy room, table, lamp,
// cards, chips, dice and board; the people are real DOM <Avatar>s (talking, expressions, GIFs, webcams) projected onto
// their seats every frame, so PNGtubers look exactly like they do in the crowd.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Person } from './People'
import { useFace } from '../Avatar'
import { card as playCard } from './highcard/rules.js'
import { CARDS, FLAVOURS } from './snack/rules.js'
import { BOARD, GROUPS, N } from './property/rules.js'
import { snackFace } from './Card'
import { CORNER, SIDE, along, cell, span } from './property/ui.jsx'

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const CW = 0.56, CH = 0.8 // card size in world units

// ── per-game framing ──
const LAYOUT = {
  snack: { shape: 'round', R: 2.35, felt: '#c7836a', seatR: 3.2, cam: [0, 6.2, 7.4], look: [0, -0.7, 0.2], H: 2.0 },
  highcard: { shape: 'round', R: 2.2, felt: '#3f6b5c', seatR: 3.0, cam: [0, 5.8, 7.0], look: [0, -0.7, 0.2], H: 1.9 },
  poker: { shape: 'round', R: 2.5, felt: '#2f6b4f', seatR: 3.3, cam: [0, 5.6, 7.6], look: [0, -0.6, 0.2], H: 2.1 },
  property: { shape: 'square', R: 3.1, felt: '#d9c7a3', seatR: 4.0, cam: [0, 8.4, 6.4], look: [0, 0, 0.5], H: 2.3 },
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
function seatAt(i, n, meIdx, r) {
  const a = Math.PI / 2 + (2 * Math.PI * ((i - meIdx + n) % n)) / n
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
  const photo = useImgTex(p.user_id && face.expr ? face.expr.src : null)
  const tex = photo || critterTex(p.user_id ? face.p?.color || '#f4a261' : '#ff9f6b', talk, p.bot)
  const aspect = Math.min(1.6, Math.max(0.5, tex.image ? tex.image.width / tex.image.height : 1))
  const h = FIG_H * (aspect > 1 ? 1 / Math.sqrt(aspect) : 1), w = h * aspect
  const g = useRef(), inner = useRef()
  useFrame(({ camera, clock }) => {
    // always faces you, like a standee, leaning back a little so a high camera still sees the face
    const dx = camera.position.x - x, dz = camera.position.z - z
    g.current.rotation.set(-Math.atan2(camera.position.y - SEAT_Y - FIG_H / 2, Math.hypot(dx, dz)) * 0.55, Math.atan2(dx, dz), 0, 'YXZ')
    const t = clock.elapsedTime
    const y = reduced ? 0 : won ? Math.abs(Math.sin(t * 6)) * 0.25 : talk ? 0.06 + Math.abs(Math.sin(t * 14)) * 0.03 : 0
    inner.current.position.y += (y - inner.current.position.y) * 0.3
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
  const reach = Math.min(R * 0.92, s.r - 0.55)
  return (
    <group position={[Math.cos(s.a) * reach, 0.1, Math.sin(s.a) * reach]} rotation-y={Math.PI / 2 - s.a}>
      <group rotation-x={0.42} scale={0.78}>
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
const inwardOf = i => { const [x, z] = tilePos(i); return [-Math.sign(Math.round(x * 10)), -Math.sign(Math.round(z * 10))] }
function doodle(g, k, i) {
  g.lineWidth = 5; g.strokeStyle = '#2b2230'
  if (k === 'cookie') { g.fillStyle = '#e8b86b'; g.beginPath(); g.moveTo(-34, 18); g.quadraticCurveTo(0, -40, 34, 18); g.quadraticCurveTo(0, 0, -34, 18); g.fill(); g.stroke() }
  if (k === 'party') { g.fillStyle = '#fbf3e4'; g.beginPath(); g.moveTo(-26, -14); g.lineTo(26, -14); g.quadraticCurveTo(24, 26, 0, 26); g.quadraticCurveTo(-24, 26, -26, -14); g.fill(); g.stroke(); g.beginPath(); g.arc(30, 2, 10, -1.3, 1.3); g.stroke() }
  if (k === 'rail') { g.fillStyle = '#c86f5a'; rrect(g, -34, -22, 68, 40, 10); g.fill(); g.stroke(); g.fillStyle = '#fbf3e4'; g.fillRect(-26, -14, 22, 14); g.fillRect(4, -14, 22, 14); g.beginPath(); g.arc(-18, 22, 6, 0, 7); g.arc(18, 22, 6, 0, 7); g.fillStyle = '#2b2230'; g.fill() }
  if (k === 'util' && i === 12) { g.fillStyle = '#f2d15c'; rrect(g, -16, -22, 32, 40, 8); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-10, -30); g.lineTo(10, -30); g.stroke() }
  if (k === 'util' && i !== 12) { g.fillStyle = '#8fc7e8'; g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(24, 4, 0, 22); g.quadraticCurveTo(-24, 4, 0, -30); g.fill(); g.stroke() }
  if (k === 'tax') { g.fillStyle = '#e8b86b'; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2b2230'; g.font = `900 26px ${FONT}`; g.fillText('¢', 0, 2) }
}
const boardTex = () => canvasTex('board40', 2048, 2048, (g, W) => {
  const P = W / SIDE // pixels per edge tile
  g.fillStyle = '#cfe0c3'; g.fillRect(0, 0, W, W)
  g.fillStyle = '#e9f0dc'; g.fillRect(CORNER * P, CORNER * P, 9 * P, 9 * P)
  g.strokeStyle = '#2b2230'; g.lineWidth = 4; g.strokeRect(CORNER * P, CORNER * P, 9 * P, 9 * P)
  // centre: the name across the diagonal, a teacup, and the two deck spots
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.save(); g.translate(W / 2, W / 2); g.rotate(-Math.PI / 4)
  g.fillStyle = '#c86f5a'; g.font = `900 170px ${FONT}`; g.fillText('Teacup Town', 0, -10)
  g.strokeStyle = '#7a4a2b'; g.lineWidth = 12; g.fillStyle = '#fbf3e4'
  g.beginPath(); g.moveTo(-90, 110); g.quadraticCurveTo(-80, 220, 0, 220); g.quadraticCurveTo(80, 220, 90, 110); g.closePath(); g.fill(); g.stroke()
  g.beginPath(); g.arc(112, 150, 30, -1.2, 1.4); g.stroke()
  g.restore()
  for (const [x, y, label, col] of [[-1, -1, 'Fortune Cookie', '#e8b86b'], [1, 1, 'Tea Party', '#8fc7e8']]) {
    g.save(); g.translate(W / 2 + x * 2.6 * P, W / 2 + y * 2.6 * P); g.rotate(-Math.PI / 4)
    g.setLineDash([18, 12]); g.strokeStyle = col; g.lineWidth = 8; rrect(g, -1.15 * P, -0.8 * P, 2.3 * P, 1.6 * P, 24); g.stroke(); g.setLineDash([])
    g.fillStyle = '#6b5a4c'; g.font = `800 40px ${FONT}`; g.fillText(label, 0, 1.15 * P)
    g.restore()
  }
  BOARD.forEach((b, i) => {
    const [c, r] = cell(i)
    const side = Math.floor(i / 10), corner = i % 10 === 0
    const w = span(c) * P, h = span(r) * P
    g.save(); g.translate(along(c) * P, along(r) * P)
    g.fillStyle = corner ? '#f2e3c2' : '#fbf3e4'; g.fillRect(-w / 2, -h / 2, w, h)
    g.strokeStyle = '#2b2230'; g.lineWidth = 3; g.strokeRect(-w / 2, -h / 2, w, h)
    g.rotate([0, Math.PI / 2, Math.PI, -Math.PI / 2][side] - (corner ? Math.PI / 4 : 0))
    const tw = P, th = CORNER * P // the tile in its own frame: outer edge at +y
    g.fillStyle = '#2b2230'; g.textAlign = 'center'; g.textBaseline = 'middle'
    if (corner) {
      g.font = `900 46px ${FONT}`; g.fillText(b.name, 0, -24)
      g.font = `700 26px ${FONT}`; g.fillStyle = '#6b5a4c'; g.fillText(b.sub, 0, 22)
      if (i === 0) { g.fillStyle = '#c86f5a'; g.beginPath(); g.moveTo(60, 62); g.lineTo(-40, 62); g.lineTo(-40, 46); g.lineTo(-70, 72); g.lineTo(-40, 98); g.lineTo(-40, 82); g.lineTo(60, 82); g.fill() }
      g.restore(); return
    }
    if (b.g != null) { g.fillStyle = GROUPS[b.g].color; g.fillRect(-tw / 2, -th / 2, tw, th * 0.22); g.strokeRect(-tw / 2, -th / 2, tw, th * 0.22) }
    g.fillStyle = '#2b2230'; g.font = `800 23px ${FONT}`
    const words = b.name.split(' ')
    const top = b.g != null ? -th * 0.2 : -th * 0.36
    words.forEach((wd, k) => g.fillText(wd.toUpperCase(), 0, top + k * 26))
    g.save(); g.translate(0, b.g != null ? th * 0.08 : th * 0.04); doodle(g, b.k, i); g.restore()
    g.font = `800 22px ${FONT}`; g.fillStyle = '#6b5a4c'
    const sub = b.price ? `${b.price}` : b.amt ? `Pay ${b.amt}` : ''
    g.fillText(sub, 0, th * 0.38)
    g.restore()
  })
})
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
  useFrame((_, dt) => {
    const o = ref.current
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
function Cottage({ color, pos, inn }) {
  const s = inn ? [0.24, 0.15, 0.13] : [0.1, 0.09, 0.1]
  return (
    <group position={pos}>
      <mesh position={[0, s[1] / 2, 0]} castShadow><boxGeometry args={s} /><meshStandardMaterial color={inn ? '#c86f5a' : '#6fb06a'} roughness={0.6} /></mesh>
      <mesh position={[0, s[1] + 0.03, 0]} rotation-y={Math.PI / 4} scale={[s[0] / s[2], 1, 1]} castShadow><coneGeometry args={[s[2] * 0.78, 0.07, 4]} /><meshStandardMaterial color={color} /></mesh>
    </group>
  )
}
// A face-down deck pile on its spot in the middle of the board.
function Deck({ pos, color, label }) {
  const top = useMemo(() => mat('deck' + label, () => new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex('deck' + label, 256, 180, (g, w, h) => {
    g.fillStyle = color; rrect(g, 0, 0, w, h, 18); g.fill()
    g.strokeStyle = '#fbf3e4'; g.lineWidth = 6; rrect(g, 10, 10, w - 20, h - 20, 12); g.stroke()
    g.fillStyle = '#2b2230'; g.font = `900 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    label.split(' ').forEach((wd, k, a) => g.fillText(wd, w / 2, h / 2 + (k - (a.length - 1) / 2) * 34))
  }) })), [color, label])
  const side = mat('deckside', () => new THREE.MeshStandardMaterial({ color: '#efe4cf' }))
  return (
    <mesh position={pos} rotation-y={Math.PI / 4} material={[side, side, top, side, side, side]} castShadow>
      <boxGeometry args={[2.3 * U * 0.9, 0.08, 1.6 * U * 0.9]} />
    </mesh>
  )
}
function PropertyScene({ v, seats }) {
  const board = useMemo(boardTex, [])
  const slots = {}
  const d = 2.6 * U
  return (
    <group>
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} /><meshStandardMaterial map={board} roughness={0.8} /></mesh>
      <Deck pos={[-d, 0.05, -d]} color="#e8b86b" label="Fortune Cookie" />
      <Deck pos={[d, 0.05, d]} color="#8fc7e8" label="Tea Party" />
      {Object.entries(v.owner).map(([sp, o]) => {
        const [x, z] = tilePos(+sp), s = seats.find(p => p.pid === o)
        const n = v.cottages[sp] || 0
        const [ix, iz] = inwardOf(+sp)
        const band = CORNER * U * 0.39 // centre of the colour band, toward the middle of the board
        const bx = x + ix * band, bz = z + iz * band
        return (
          <group key={sp}>
            {/* owner tag on the outer edge; mortgaged streets get a pale, flipped-looking tag */}
            <mesh position={[x - ix * band * 1.05, 0.02, z - iz * band * 1.05]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.07, 16]} /><meshBasicMaterial color={v.mortgaged[sp] ? '#bdb3a4' : s?.color || '#999'} /></mesh>
            {n === 5 ? <Cottage inn color={s?.color || '#c86f5a'} pos={[bx, 0.01, bz]} />
              : Array.from({ length: n }, (_, k) => <Cottage key={k} color={s?.color || '#c86f5a'} pos={[bx + (iz ? (k - 1.5) * 0.11 : 0), 0.01, bz + (ix ? (k - 1.5) * 0.11 : 0)]} />)}
          </group>
        )
      })}
      {seats.filter(s => !v.broke[s.pid]).map(s => {
        const sp = v.pos[s.pid]
        slots[sp] = (slots[sp] || 0) + 1
        return <Token key={s.pid} color={s.color} space={sp} slot={slots[sp] - 1} hop={!(v.last?.napped || v.napping[s.pid] === 1 || v.card?.back)} />
      })}
      <DieMesh value={v.dice[0]} pos={[-0.3, 0, 0.6]} roll={v.rolls} idx={0} />
      <DieMesh value={v.dice[1]} pos={[0.3, 0, 0.7]} roll={v.rolls} idx={1} />
    </group>
  )
}

const SCENES = { snack: SnackScene, highcard: HighScene, poker: PokerScene, property: PropertyScene }

// Puts the camera where this game looks best, pulled back on narrow (phone) screens.
function Rig({ layout }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const k = aspect < 1.25 ? Math.min(1.7, Math.pow(1.25 / aspect, 0.8)) : 1
    // Portrait phones: higher and steeper rather than just further away, so the table fills the width.
    camera.position.set(layout.cam[0], layout.cam[1] * (1 + (k - 1) * 1.5), layout.cam[2] * (1 + (k - 1) * 0.55))
    camera.lookAt(...layout.look)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, layout])
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
      const x = Math.min(size.width - 70, Math.max(70, (_v.x + 1) / 2 * size.width)), y = Math.max(96, (1 - _v.y) / 2 * size.height) // never under the top bar
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
  const r = layout.seatR * (innerWidth < 700 ? 0.7 : 1) // phones: pull seats in so side players stay on screen
  const seats = people.map((p, i) => {
    let [x, z, a] = seatAt(i, Math.max(n, 2), meIdx, r)
    return { ...p, x, z, a, r }
  })
  const others = seats.filter(s => s.pid !== me) // you are the camera: your hand is the dock along the bottom
  const els = useRef([])
  const Scene = SCENES[game]
  return (
    <div className="g3d">
      <Canvas shadows dpr={[1, 1.5]} frameloop={hidden ? 'never' : 'always'} camera={{ fov: 42, near: 0.1, far: 60, position: layout.cam }}
        gl={{ antialias: true, powerPreference: 'low-power' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05 }}>
        <color attach="background" args={['#2a1f2b']} />
        <fog attach="fog" args={['#2a1f2b', 18, 40]} />
        <Rig layout={layout} />
        <Lights layout={layout} />
        <Room layout={layout} />
        <TableMesh layout={layout} />
        {seats.filter(s => s.pid !== me).map(s => <Chair key={s.pid} x={s.x * 1.08} z={s.z * 1.08} a={s.a} />)}
        {others.map(s => <Cutout key={s.pid} p={s} x={s.x} z={s.z} turn={s.pid === turnPid} won={winners?.includes(s.pid)} />)}
        {v && <Scene v={v} seats={seats} meId={me} pending={pending} />}
        <Projector seats={others} els={els} />
      </Canvas>
      {others.map((p, i) => (
        <Person key={p.pid} head p={p} elRef={el => { els.current[i] = el }} turn={p.pid === turnPid} info={info(p.pid)} me={p.pid === me} />
      ))}
    </div>
  )
}

