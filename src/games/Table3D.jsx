// The 3D game table (lazy chunk: three.js loads only when a game opens). WebGL draws the cozy room, table, lamp,
// cards, chips, dice and board; the people are real DOM <Avatar>s (talking, expressions, GIFs, webcams) projected onto
// their seats every frame, so PNGtubers look exactly like they do in the crowd.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Person } from './People'
import Avatar, { useFace } from '../Avatar'
import { botChar, botUrl } from './bots.js'
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
  isle: { shape: 'round', R: 3.45, felt: '#5fa8bf', seatR: 4.4, cam: [0, 8.4, 6.9], look: [0, -0.1, 0.55], H: 2.2 }, // the felt is the sea
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
// A hex island on a sea-blue table: low hex tiles with little props per kind, number tokens, a sandy rim, docks on the
// coast, wooden plank paths, cozy cottages and lodges in the owner's colour, the raccoon, the dice. Tapping glowing spots
// goes through isle/pick.js (the HUD decides what's tappable).
import { EDGES as ISLE_EDGES, KINDS as ISLE_KINDS, TILES as ISLE_TILES, VERTS as ISLE_VERTS } from './isle/rules.js'
import { usePick as useIslePick, screen as isleScreen } from './isle/pick.js'

const IK = 0.56, ITH = 0.12 // world units per hex size; tile thickness
const iw = (x, y) => [x * IK, y * IK] // island (x, y) → world (x, z)
const ISLE = {
  hex: new THREE.CylinderGeometry(IK * 0.95, IK * 0.97, ITH, 6), // a corner points along +z, like the rules' pointy-top hexes
  sand: new THREE.CylinderGeometry(IK * 1.07, IK * 1.13, 0.07, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 14, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  disc: new THREE.CylinderGeometry(1, 1, 1, 24),
  roof: new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.5, 0), // ridge along x
}
const im = (key, color, o = {}) => mat('isle-' + key, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }))
const ISLE_RES_C = { twig: '#9a6a3e', wool: '#efe8d6', clay: '#c8693f', berry: '#a54a82', tea: '#5f9a4f' }
// A speckled top per tile kind (grass, soil, water), so tiles read as ground and not plastic.
const isleTopTex = k => canvasTex('isle-top-' + k, 128, 128, (g, w, h) => {
  const c = ISLE_KINDS[k].color
  g.fillStyle = c; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 70; i++) {
    const x = (i * 53) % w, y = (i * 97 + i * i) % h
    g.fillStyle = i % 2 ? '#ffffff22' : '#00000018'
    g.beginPath(); g.arc(x, y, 2 + (i % 3), 0, 7); g.fill()
  }
})
const tileMats = k => mat('isle-tile-' + k, () => [im('side', '#a8885f'), new THREE.MeshStandardMaterial({ map: isleTopTex(k), roughness: 0.95 }), im('side', '#a8885f')])
const numTex = n => canvasTex('isle-num-' + n, 128, 128, (g, w) => {
  g.fillStyle = '#fff4dc'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill()
  g.strokeStyle = '#d9c29a'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 5, 0, 7); g.stroke()
  const hot = n === 6 || n === 8
  g.fillStyle = hot ? '#c8414f' : '#4a3324'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `900 ${hot ? 82 : 74}px ${FONT}`; g.fillText(String(n), w / 2, w / 2 - 8)
  const dots = 6 - Math.abs(7 - n)
  for (let i = 0; i < dots; i++) { g.beginPath(); g.arc(w / 2 + (i - (dots - 1) / 2) * 12, w / 2 + 34, 4, 0, 7); g.fill() }
})
const dockTex = k => canvasTex('isle-dock-' + k, 128, 128, (g, w) => {
  g.fillStyle = '#fff4dc'; rrect(g, 4, 4, w - 8, w - 8, 24); g.fill()
  g.strokeStyle = '#8a5a34'; g.lineWidth = 8; rrect(g, 4, 4, w - 8, w - 8, 24); g.stroke()
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a3324'
  if (k === 'any') { g.font = `900 46px ${FONT}`; g.fillText('3:1', w / 2, w / 2 + 2); return }
  g.fillStyle = ISLE_RES_C[k]; g.strokeStyle = '#4a332455'; g.lineWidth = 4
  g.beginPath(); g.arc(w / 2, 44, 24, 0, 7); g.fill(); g.stroke()
  g.fillStyle = '#4a3324'; g.font = `900 36px ${FONT}`; g.fillText('2:1', w / 2, 96)
})
// [x, z, sx, sy, sz, geometry, material key, colour, y] prop parts, in tile space (number token sits in the middle)
function TileProps({ k }) {
  const P = (key, col) => im(key, col)
  const parts = []
  const ring = [[-0.26, -0.14], [0.27, -0.12], [0.02, 0.29], [-0.22, 0.2], [0.22, 0.2]]
  if (k === 'woods') ring.slice(0, 4).forEach(([x, z], i) => {
    parts.push([x, z, 0.025, 0.06, 0.025, 'disc', P('trunk', '#7a4e2d'), 0.03])
    parts.push([x, z, 0.08, 0.17, 0.08, 'cone', P(i % 2 ? 'pine' : 'pine2', i % 2 ? '#2f6b3a' : '#3e7d45'), 0.14])
  })
  if (k === 'meadow') [[-0.24, -0.12], [0.25, 0.08], [-0.05, 0.27]].forEach(([x, z]) => {
    parts.push([x, z, 0.07, 0.055, 0.05, 'ball', P('wool', '#fbf6ea'), 0.06])
    parts.push([x + 0.07, z, 0.03, 0.03, 0.03, 'ball', P('sheepface', '#3a3036'), 0.075])
  })
  if (k === 'clay') {
    parts.push([-0.22, -0.1, 0.13, 0.06, 0.11, 'ball', P('mound', '#b8603a'), 0.01])
    ;[[0.2, 0], [0.28, 0], [0.24, 1]].forEach(([x, up]) => parts.push([x, 0.17, 0.07, 0.035, 0.04, 'box', P('brick', '#c8693f'), up * 0.036]))
    parts.push([0.0, 0.28, 0.09, 0.04, 0.07, 'ball', P('mound2', '#d07a4b'), 0.01])
  }
  if (k === 'berry') [[-0.24, -0.1], [0.25, -0.06], [0.0, 0.27]].forEach(([x, z], i) => {
    parts.push([x, z, 0.08, 0.065, 0.08, 'ball', P('bush', '#3f7a3f'), 0.055])
    ;[[0.04, 0.05], [-0.04, 0.04], [0.0, -0.06]].forEach(([dx, dz]) => parts.push([x + dx, z + dz, 0.022, 0.022, 0.022, 'ball', P(i % 2 ? 'berry2' : 'berry', i % 2 ? '#8f3c70' : '#b64a7a'), 0.1]))
  })
  if (k === 'tea') [-0.2, 0.0, 0.2].forEach((z, i) => {
    parts.push([i === 1 ? -0.27 : 0, z + (i === 1 ? 0 : 0.05), i === 1 ? 0.14 : 0.42, 0.05, 0.07, 'box', P('teabush', '#4f8a43'), 0.03])
    if (i === 1) parts.push([0.27, z, 0.14, 0.05, 0.07, 'box', P('teabush', '#4f8a43'), 0.03])
  })
  if (k === 'pond') {
    parts.push([0, 0, 0.36, 0.01, 0.3, 'disc', mat('isle-water', () => new THREE.MeshStandardMaterial({ color: '#4f9fbf', roughness: 0.2, metalness: 0.1 })), 0.005])
    parts.push([0.1, -0.06, 0.08, 0.006, 0.08, 'disc', P('lily', '#6fb06a'), 0.014])
    parts.push([-0.12, 0.08, 0.05, 0.006, 0.05, 'disc', P('lily', '#6fb06a'), 0.014])
    parts.push([0.12, -0.06, 0.02, 0.02, 0.02, 'ball', P('flower', '#f3a7c0'), 0.03])
  }
  return parts.map(([x, z, sx, sy, sz, geo, m, y], i) => (
    <mesh key={i} geometry={ISLE[geo]} material={m} position={[x * IK * 1.6, ITH + y + (geo === 'box' || geo === 'disc' ? sy / 2 : geo === 'cone' ? sy / 2 : 0), z * IK * 1.6]} scale={[sx, sy, sz]} castShadow />
  ))
}
function IsleNumber({ n, pos, hit }) {
  const ref = useRef(), t0 = useRef(-1)
  useEffect(() => { t0.current = hit ? -2 : -1 }, [hit])
  useFrame(({ clock }) => {
    if (t0.current === -2) t0.current = clock.elapsedTime
    const t = t0.current >= 0 ? clock.elapsedTime - t0.current : 9
    const b = !reduced && t < 1.2 ? Math.abs(Math.sin(t * Math.PI * 2.5)) * (1.2 - t) * 0.25 : 0
    ref.current.position.y = ITH + 0.02 + b
    ref.current.scale.setScalar(1 + b * 1.5)
  })
  return (
    <group position={[pos[0], 0, pos[1]]}><group ref={ref}>
      <mesh geometry={ISLE.disc} scale={[0.2, 0.025, 0.2]} material={[im('numside', '#e6d2ac'), mat('isle-numtop' + n, () => new THREE.MeshStandardMaterial({ map: numTex(n), roughness: 0.7 })), im('numside', '#e6d2ac')]} castShadow />
    </group></group>
  )
}
// A cozy home on a corner: cream walls, a roof in the owner's colour, a door and a lit window; lodges are a two-part house with a tower.
function IsleHome({ color, lodge, pos }) {
  const roof = mat('isle-roof' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
  const wall = im('wall', '#f6ead2', { roughness: 0.85 }), wood = im('door', '#7a4e2d'), glow = mat('isle-glow', () => new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false }))
  const B = (p, s, m, k) => <mesh key={k} geometry={ISLE.box} material={m} position={p} scale={s} castShadow />
  const R = (p, s, k) => <mesh key={k} geometry={ISLE.roof} material={roof} position={p} scale={s} castShadow />
  const parts = lodge ? [
    B([0, 0.06, 0], [0.2, 0.12, 0.13], wall, 1), R([0, 0.12, 0], [0.22, 0.06, 0.09], 2),
    B([0.07, 0.11, -0.01], [0.08, 0.22, 0.09], wall, 3), R([0.07, 0.22, -0.01], [0.1, 0.05, 0.06], 4),
    B([-0.04, 0.035, 0.066], [0.035, 0.07, 0.005], wood, 5), B([0.035, 0.065, 0.066], [0.03, 0.03, 0.005], glow, 6), B([0.07, 0.16, 0.036], [0.03, 0.03, 0.005], glow, 7),
    B([-0.06, 0.18, -0.03], [0.025, 0.06, 0.025], im('chimney', '#b5654a'), 8),
    <mesh key={9} geometry={ISLE.box} material={roof} position={[0, 0.004, 0]} scale={[0.24, 0.008, 0.17]} />,
  ] : [
    B([0, 0.045, 0], [0.11, 0.09, 0.09], wall, 1), R([0, 0.09, 0], [0.13, 0.055, 0.065], 2),
    B([-0.02, 0.03, 0.046], [0.03, 0.055, 0.005], wood, 3), B([0.03, 0.05, 0.046], [0.025, 0.025, 0.005], glow, 4),
    B([0.035, 0.13, -0.015], [0.02, 0.05, 0.02], im('chimney', '#b5654a'), 5),
    <mesh key={6} geometry={ISLE.box} material={roof} position={[0, 0.004, 0]} scale={[0.14, 0.008, 0.12]} />,
  ]
  return <Tw pos={pos} from={[pos[0], pos[1] + 0.8, pos[2]]} speed={7} lift={0}><group scale={1.25}>{parts}</group></Tw>
}
// The raccoon: a round grey body, striped tail, black mask; it bobs where it sits and hops to a new tile.
function Raccoon({ pos }) {
  const bob = useRef()
  useFrame(({ clock }) => { if (bob.current && !reduced) bob.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2.2)) * 0.02 })
  const grey = im('rac-grey', '#9aa0aa'), dark = im('rac-dark', '#34343e'), white = im('rac-white', '#f4f1ea')
  const S = (p, s, m, k) => <mesh key={k} geometry={ISLE.ball} material={m} position={p} scale={s} castShadow />
  return (
    <Tw pos={pos} speed={4} lift={0.6}>
      <group ref={bob} scale={1.15}>
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
function Glow({ children, onPick }) { // a pulsing tappable spot
  const ref = useRef()
  useFrame(({ clock }) => { if (ref.current) ref.current.scale.setScalar(reduced ? 1 : 1 + Math.sin(clock.elapsedTime * 5) * 0.12) })
  return <group ref={ref} onClick={e => { e.stopPropagation(); hover(false); onPick() }} onPointerOver={e => { e.stopPropagation(); hover(true) }} onPointerOut={() => hover(false)}>{children}</group>
}
const glowMat = mat('isle-glowspot', () => new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.9, toneMapped: false }))

function IsleScene({ v, seats }) {
  const pick = useIslePick()
  const { camera, size } = useThree()
  useEffect(() => {
    const p = new THREE.Vector3()
    isleScreen.tile = i => { p.set(ISLE_TILES[i].x * IK, 0.25, ISLE_TILES[i].y * IK).project(camera); return [(p.x + 1) / 2 * size.width, (1 - p.y) / 2 * size.height] }
    return () => { isleScreen.tile = null }
  }, [camera, size])
  useEffect(() => () => hover(false), [])
  const col = pid => seats.find(s => s.pid === pid)?.color || '#999'
  const sum = v.rolls ? v.dice[0] + v.dice[1] : 0
  const vpos = i => iw(ISLE_VERTS[i].x, ISLE_VERTS[i].y)
  const can = id => pick.onPick && pick.spots.includes(id)
  const rt = ISLE_TILES[v.raccoon]
  return (
    <group>
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
            {tap && <Glow onPick={() => pick.onPick(i)}><mesh position={[0, ITH + 0.03, 0]} rotation-x={-Math.PI / 2} material={glowMat}><ringGeometry args={[IK * 0.62, IK * 0.74, 6, 1, Math.PI / 6]} /></mesh></Glow>}
          </group>
        )
      })}
      {v.tiles.map((t, i) => t.n > 0 && <IsleNumber key={'n' + i} n={t.n} pos={iw(ISLE_TILES[i].x, ISLE_TILES[i].y)} hit={t.n === sum ? v.rolls : 0} />)}
      {/* docks: a little pier out from the coast with a sign (3:1 any, 2:1 one resource) */}
      {v.docks.map((d, i) => {
        const a = ISLE_VERTS[ISLE_EDGES[d.e].a], b = ISLE_VERTS[ISLE_EDGES[d.e].b]
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, len = Math.hypot(mx, my), ox = mx / len, oy = my / len
        const [px, pz] = iw(mx + ox * 0.32, my + oy * 0.32), [sx, sz] = iw(mx + ox * 0.62, my + oy * 0.62)
        return (
          <group key={'d' + i}>
            <mesh geometry={ISLE.box} material={im('pier', '#9a6a44')} position={[px, 0.05, pz]} rotation-y={Math.atan2(ox, oy)} scale={[0.12, 0.025, 0.3]} castShadow />
            {[-1, 1].map(s => <mesh key={s} geometry={ISLE.disc} material={im('post', '#6e4a30')} position={[px + s * oy * 0.05, 0.03, pz - s * ox * 0.05]} scale={[0.015, 0.07, 0.015]} />)}
            <group position={[sx, 0.17, sz]}>
              <mesh geometry={ISLE.disc} material={im('post', '#6e4a30')} position={[0, -0.08, 0]} scale={[0.012, 0.16, 0.012]} />
              <mesh rotation-x={-0.35} material={mat('isle-docksign' + d.k, () => new THREE.MeshStandardMaterial({ map: dockTex(d.k), roughness: 0.7 }))}><planeGeometry args={[0.2, 0.2]} /></mesh>
            </group>
          </group>
        )
      })}
      {Object.entries(v.paths).map(([e, p]) => {
        const ed = ISLE_EDGES[e], [ax, az] = vpos(ed.a), [bx, bz] = vpos(ed.b)
        const rot = -Math.atan2(bz - az, bx - ax)
        return (
          <group key={'p' + e} position={[(ax + bx) / 2, ITH + 0.012, (az + bz) / 2]} rotation-y={rot}>
            <mesh geometry={ISLE.box} material={im('plank', '#8a5a34')} position={[0, 0.012, 0]} scale={[IK * 0.62, 0.024, 0.075]} castShadow />
            <mesh geometry={ISLE.box} material={mat('isle-pathc' + col(p), () => new THREE.MeshStandardMaterial({ color: col(p), roughness: 0.55 }))} position={[0, 0.03, 0]} scale={[IK * 0.56, 0.014, 0.05]} castShadow />
          </group>
        )
      })}
      {Object.entries(v.homes).map(([i, h]) => { const [x, z] = vpos(+i); return <IsleHome key={'h' + i + h.l} color={col(h.p)} lodge={h.l === 2} pos={[x, ITH + 0.012, z]} /> })}
      <Raccoon pos={[rt.x * IK + 0.17, ITH + 0.012, rt.y * IK + 0.1]} />
      {(pick.kind === 'cottage' || pick.kind === 'lodge') && pick.spots.map(i => { const [x, z] = vpos(i); return (
        <Glow key={'g' + i} onPick={() => pick.onPick(i)}>
          <mesh geometry={ISLE.ball} material={glowMat} position={[x, ITH + 0.07, z]} scale={0.055} />
          <mesh geometry={ISLE.ball} material={hitMat} position={[x, ITH + 0.07, z]} scale={0.14} />
        </Glow>
      ) })}
      {pick.kind === 'path' && pick.spots.map(e => {
        const ed = ISLE_EDGES[e], [ax, az] = vpos(ed.a), [bx, bz] = vpos(ed.b)
        return (
          <Glow key={'gp' + e} onPick={() => pick.onPick(e)}>
            <group position={[(ax + bx) / 2, ITH + 0.04, (az + bz) / 2]} rotation-y={-Math.atan2(bz - az, bx - ax)}>
              <mesh geometry={ISLE.box} material={glowMat} scale={[IK * 0.5, 0.03, 0.05]} />
              <mesh geometry={ISLE.box} material={hitMat} scale={[IK * 0.6, 0.12, 0.2]} />
            </group>
          </Glow>
        )
      })}
      <DieMesh value={v.dice[0]} pos={[-2.5, 0, 1.95]} roll={v.rolls} idx={0} />
      <DieMesh value={v.dice[1]} pos={[-2.05, 0, 2.3]} roll={v.rolls} idx={1} />
    </group>
  )
}
// ════════ end of Chitter Cove (isle) ════════

const SCENES = { snack: SnackScene, highcard: HighScene, poker: PokerScene, property: PropertyScene, isle: IsleScene }

// Puts the camera where this game looks best, pulled back on narrow (phone) screens.
// Teacup Town tokens report where they are while they walk; the camera leans in and follows for everyone watching.
const camFocus = { x: 0, z: 0, t: -9 }
function Rig({ layout }) {
  const { camera, size } = useThree()
  const base = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height)
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
      tl.current.set(camFocus.x * (portrait ? 0.55 : 0.8), 0, camFocus.z * (portrait ? 0.55 : 0.8))
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
        <color attach="background" args={['#2a1f2b']} />
        <fog attach="fog" args={['#2a1f2b', 18, 40]} />
        <Rig layout={layout} />
        <Lights layout={layout} />
        <Room layout={layout} />
        <TableMesh layout={layout} />
        {seats.filter(s => s.pid !== me).map(s => <Chair key={s.pid} x={s.x * 1.14} z={s.z * 1.14} a={s.a} />)}
        {others.map(s => <Cutout key={s.pid} p={s} x={s.x} z={s.z} turn={s.pid === turnPid} won={winners?.includes(s.pid)} />)}
        {v && <Scene v={v} seats={seats} meId={me} pending={pending} />}
        <Projector seats={others} els={els} />
      </Canvas>
      {/* you: your live PNGtuber in the bottom-left corner (like your corner in the stadium crowd), no name */}
      {seats.some(s => s.pid === me) && (
        <div className="g-me" aria-hidden="true">
          <Avatar id={me} size={innerWidth < 700 ? 64 : 112} full mode="stage" vbadge />
          {v && <span className="g-me-info">{info(me)}</span>}
        </div>
      )}
      {others.map((p, i) => (
        <Person key={p.pid} head p={p} elRef={el => { els.current[i] = el }} turn={p.pid === turnPid} info={info(p.pid)} me={p.pid === me} />
      ))}
    </div>
  )
}

