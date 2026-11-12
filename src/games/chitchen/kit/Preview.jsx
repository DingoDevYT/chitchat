// Dev only (#/bakers): the Chitchen kit on a little bakery floor, for checking by eye and screenshots.
//   #/bakers               8 bakers living a night shift: wandering, chores, a tuck-in, a ghost, a vent hop
//   #/bakers?shot=lineup   every state side by side, labelled
//   #/bakers?shot=walk     a 6-frame walk-cycle strip (time frozen)
//   #/bakers?shot=death    a 6-frame strip of the TV smash
//   #/bakers?shot=vent     a 6-frame strip of the vent pop (in, then out)
// The panel plays every sound in kit/sfx.js.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CAST, botUrl } from '../../bots.js'
import { createBaker } from './baker3d.js'
import { Baker, useBakerTexture } from './Baker.jsx'
import { Oven, FlourSack, WorkTable, MeetingTable, Vent } from './Props.jsx'
import { CUES, play, startLoop, isMuted, setMuted, unlockSfx } from './sfx.js'

const q = new URLSearchParams(location.hash.split('?')[1] || '')
const SHOT = q.get('shot') || ''
export const COLORS = ['#e8574f', '#4f8be8', '#5bbf6a', '#f2c14e', '#a46be0', '#f08a3c', '#ef7fb3', '#5fc9c4']
const CAST8 = [...CAST.normal, ...CAST.easy, ...CAST.hard].slice(0, 8)
const URLS = CAST8.map(c => botUrl(c, false))
const URLS_TALK = CAST8.map(c => botUrl(c, true))

function useTextures() {
  const t = URLS.map(u => useBakerTexture(u)) // eslint-disable-line react-hooks/rules-of-hooks
  const tt = URLS_TALK.map(u => useBakerTexture(u)) // eslint-disable-line react-hooks/rules-of-hooks
  return [t, tt]
}

function Lights() {
  return <>
    <hemisphereLight args={['#c9c2ff', '#7a5a44', 1.4]} />
    <directionalLight position={[4, 10, 6]} intensity={1.6} color="#fff1dc" />
    <ambientLight intensity={0.35} color="#ffe6cc" />
  </>
}

const floorTex = () => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#f3e2c4' : '#dca889'; g.fillRect(x * 32, y * 32, 32, 32) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 5); t.magFilter = THREE.NearestFilter
  return t
}
function Floor({ w = 14, d = 10 }) {
  const tex = useMemo(floorTex, [])
  return <group>
    <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[w, d]} /><meshLambertMaterial map={tex} /></mesh>
    {[[0, -d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]].map(([x, z, len, r], i) =>
      <mesh key={i} position={[x, 0.5, z]} rotation-y={r}><boxGeometry args={[len, 1, 0.25]} /><meshLambertMaterial color="#e9d3b4" /></mesh>)}
  </group>
}

// ---- live: 8 bakers on a night shift (driven through the plain three.js API, like the game loop would) ------------
const BOUND = { x: 6.2, z: 4.2 }, TABLE_R = 2.1, VENTS = [[-5.2, 3.2], [5.2, -3.2]]
const TASKS = [[-4.2, -3.3], [-1.5, -3.6], [4.2, 2.6], [2.5, -3.5], [-4.8, 1]]
function Live({ tex, texTalk, vents }) {
  const group = useRef()
  const sim = useMemo(() => COLORS.map((color, i) => ({
    b: createBaker(), color, i, x: -5 + (i % 4) * 3.2, z: i < 4 ? -1.8 : 2.4, yaw: 0, tx: 0, tz: 0, state: 'idle', timer: 1 + i * 0.4, talkT: 0, speed: 0,
  })), [])
  useEffect(() => { sim.forEach(s => group.current.add(s.b.group)); return () => sim.forEach(s => { group.current?.remove(s.b.group); s.b.dispose() }) }, [sim])
  const pick = s => {
    for (let k = 0; k < 20; k++) {
      const x = (Math.random() * 2 - 1) * BOUND.x, z = (Math.random() * 2 - 1) * BOUND.z
      if (Math.hypot(x, z) > TABLE_R + 0.4) { s.tx = x; s.tz = z; return }
    }
  }
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    for (const s of sim) {
      s.timer -= dt
      const walkTo = (sp) => {
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz)
        if (d < 0.08) return true
        const st = Math.min(d, sp * dt)
        s.x += (dx / d) * st; s.z += (dz / d) * st; s.yaw = Math.atan2(dx, dz)
        const r = Math.hypot(s.x, s.z); if (r < TABLE_R) { s.x *= TABLE_R / r; s.z *= TABLE_R / r }
        return false
      }
      s.speed = 0
      if (s.i === 6) { // the one who keeps getting tucked in
        if (s.state === 'idle' && s.timer <= 0) { s.state = 'dead'; s.timer = 5; play('kill') }
        else if (s.state === 'dead' && s.timer <= 0) { s.state = 'idle'; s.timer = 3 }
        s.yaw = 0.4
      } else if (s.i === 5) { // a ghost drifting about
        s.state = 'ghost'
        if (walkTo(1.4)) pick(s); else s.speed = 1.4
      } else if (s.i === 7) { // vent hopper
        if (s.state === 'walk' && walkTo(2.4)) { s.state = 'ventIn'; s.timer = 0.9; play('vent'); vents.current[s.v] = 1.2 }
        else if (s.state === 'walk') s.speed = 2.4
        else if (s.state === 'ventIn' && s.timer <= 0) { s.v = 1 - s.v; s.x = VENTS[s.v][0]; s.z = VENTS[s.v][1]; s.state = 'ventOut'; s.timer = 1.2; play('vent'); vents.current[s.v] = 1.2 }
        else if (s.state === 'ventOut' && s.timer <= 0) { s.state = 'idle'; s.timer = 2 }
        else if (s.state === 'idle' && s.timer <= 0) { s.v ??= 0; s.tx = VENTS[s.v][0]; s.tz = VENTS[s.v][1]; s.state = 'walk' }
      } else { // crewmates: wander, stop to do chores, chat
        if (s.state === 'walk') { if (walkTo(2.4)) { s.state = Math.random() < 0.45 ? 'task' : 'idle'; s.timer = s.state === 'task' ? 3 : 1.2; if (s.state === 'task') s.yaw = Math.PI } else s.speed = 2.4 }
        else if (s.timer <= 0) {
          if (s.state === 'task' && s.i === 0) play('taskDone')
          s.state = 'walk'
          if (Math.random() < 0.5) { const t = TASKS[(Math.random() * TASKS.length) | 0]; s.tx = t[0]; s.tz = t[1] + 0.9 } else pick(s)
        }
      }
      s.talkT -= dt
      if (s.talkT < -2 - s.i) s.talkT = 1.5 + Math.random() * 2
      const talking = s.talkT > 0 && s.state !== 'dead'
      s.b.group.position.set(s.x, 0, s.z)
      s.b.update(dt, { texture: (talking && Math.floor(performance.now() / 140) % 2 ? texTalk : tex)[s.i], color: s.color, state: s.state, facing: s.yaw, speed: s.speed, talking, onStep: s.i === 0 ? () => play('step') : undefined })
    }
    for (const k of [0, 1]) vents.current[k] = Math.max(0, vents.current[k] - dt)
  })
  return <group ref={group} />
}

function VentPair({ vents }) {
  const [open, setOpen] = useState([false, false])
  useFrame(() => { const o = vents.current.map(v => v > 0); if (o[0] !== open[0] || o[1] !== open[1]) setOpen(o) })
  return VENTS.map(([x, z], i) => <Vent key={i} position={[x, 0, z]} open={open[i]} />)
}

function Bakery({ ring }) {
  return <>
    <Floor />
    <Oven position={[-4.2, 0, -4.2]} />
    <Oven position={[2.5, 0, -4.3]} />
    <WorkTable position={[-1.5, 0, -4.2]} />
    <WorkTable position={[4.2, 0, 1.8]} rotation-y={Math.PI / 2} />
    {[[-6, -3], [-6.1, -2.3], [-5.5, -3.3], [6, 3.9], [5.4, 4]].map(([x, z], i) => <FlourSack key={i} seed={i} position={[x, 0, z]} />)}
    <MeetingTable position={[0, 0, 0]} ring={ring} />
  </>
}

// ---- static shots ---------------------------------------------------------------------------------------------------
function OrthoFit({ width, look = [0, 0.9, 0], pos = [0, 5, 10] }) {
  const { camera, size } = useThree()
  useEffect(() => {
    camera.position.set(...pos); camera.zoom = size.width / width; camera.lookAt(...look); camera.updateProjectionMatrix()
  }, [camera, size, width]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const LINEUP = [['idle', 'idle + talking'], ['walk', 'walk'], ['task', 'task'], ['dead', 'tucked in'], ['ghost', 'ghost'], ['ventOut', 'vent pop'], ['win', 'win'], ['lose', 'lose']]
function Lineup({ tex }) {
  const [k, setK] = useState(0)
  useEffect(() => { const t = setInterval(() => setK(x => x + 1), 2400); return () => clearInterval(t) }, [])
  return LINEUP.map(([state], i) => <Baker key={state === 'ventOut' ? `v${k}` : state} position={[-5.25 + i * 1.5, 0, 0]} texture={tex[i]} color={COLORS[i]} state={state}
    facing={state === 'walk' ? 0.6 : state === 'dead' ? 0.5 : 0} talking={i === 0} speed={state === 'walk' ? 2.4 : 0} />)
}

const STRIPS = {
  walk: { label: i => `frame ${i + 1}`, props: i => ({ state: 'walk', phase: (i / 6) * Math.PI * 2, facing: Math.PI / 2, speed: 2.4 }) },
  death: { label: i => `${[0, 0.08, 0.25, 0.4, 0.6, 1.6][i]} s`, props: i => ({ state: 'dead', stateTime: [0, 0.08, 0.25, 0.4, 0.6, 1.6][i], facing: 0.9 }) },
  vent: { label: i => ['in 0.05', 'in 0.22', 'in 0.42', 'out 0.12', 'out 0.35', 'out 0.6'][i], props: i => i < 3 ? { state: 'ventIn', stateTime: [0.05, 0.22, 0.42][i] } : { state: 'ventOut', stateTime: [0.12, 0.35, 0.6][i - 3] } },
}
function Strip({ tex, kind }) {
  const S = STRIPS[kind]
  return Array.from({ length: 6 }, (_, i) => <Baker key={i} position={[-5 + i * 2, 0, 0]} texture={tex[1]} color={COLORS[1]} {...S.props(i)} />)
}

// ---- page -----------------------------------------------------------------------------------------------------------
const panel = { position: 'fixed', top: 8, right: 8, background: '#1d1830e0', color: '#fff6e8', padding: 10, borderRadius: 10, font: '12px system-ui', display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 300, zIndex: 2 }
const btn = { background: '#3b3150', color: '#fff6e8', border: 0, borderRadius: 6, padding: '4px 7px', cursor: 'pointer', font: 'inherit' }
function SoundPanel({ onBell }) {
  const [muted, setM] = useState(isMuted())
  const [loop, setLoop] = useState(null)
  useEffect(() => () => loop?.(), [loop])
  return <div style={panel} onPointerDown={unlockSfx}>
    <b style={{ width: '100%' }}>Chitchen kit sounds</b>
    {Object.keys(CUES).map(k => <button key={k} style={btn} onClick={() => { play(k); if (k === 'meeting') onBell() }}>{k}</button>)}
    <button style={{ ...btn, background: loop ? '#c8414f' : btn.background }} onClick={() => setLoop(l => (l ? (l(), null) : startLoop('sabotage')))}>sabotage loop</button>
    <label style={{ width: '100%', marginTop: 4 }}><input type="checkbox" checked={muted} onChange={e => { setMuted(e.target.checked); setM(e.target.checked) }} /> mute (remembered)</label>
  </div>
}

export default function Preview() {
  const [tex, texTalk] = useTextures()
  const vents = useRef([0, 0])
  const [ring, setRing] = useState(false)
  const onBell = () => { setRing(true); setTimeout(() => setRing(false), 100) }
  const strip = STRIPS[SHOT]
  const labels = SHOT === 'lineup' ? LINEUP.map(l => l[1]) : strip ? Array.from({ length: 6 }, (_, i) => strip.label(i)) : null
  return <div style={{ position: 'fixed', inset: 0, background: '#1d1830' }}>
    {SHOT === 'lineup' || strip
      ? <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 100 }}>
          <color attach="background" args={['#2a2342']} />
          <Lights />
          <OrthoFit width={12} pos={strip && SHOT === 'walk' ? [0, 1.6, 10] : [0, 5, 10]} />
          <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[16, 6]} /><meshLambertMaterial color="#c4956a" /></mesh>
          {SHOT === 'lineup' ? <Lineup tex={tex} /> : <Strip tex={tex} kind={SHOT} />}
        </Canvas>
      : <Canvas dpr={[1, 1.5]} camera={{ position: [0, 11, 10.5], fov: 42 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0.5)}>
          <color attach="background" args={['#1d1830']} />
          <Lights />
          <Bakery ring={ring} />
          <VentPair vents={vents} />
          <Live tex={tex} texTalk={texTalk} vents={vents} />
        </Canvas>}
    {labels && <div style={{ position: 'fixed', left: 0, right: 0, bottom: '18%', display: 'flex', color: '#fff6e8', font: 'bold 14px system-ui', textAlign: 'center', pointerEvents: 'none' }}>
      {labels.map((l, i) => <div key={i} style={{ flex: 1 }}>{l}</div>)}
    </div>}
    {!SHOT && <SoundPanel onBell={onBell} />}
  </div>
}
