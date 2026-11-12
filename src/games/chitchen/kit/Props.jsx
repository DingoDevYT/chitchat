// Cozy bakery props for Midnight Chitchen, procedural and cheap: shared geometries, shared toon materials (the same
// look as the bakers), 3 to 12 meshes each, no textures. Each prop has a plain three.js factory (for the game's own
// loop) and an R3F component.
//
//   makeOven() / <Oven />                  brick oven with a glowing mouth (a task spot)
//   makeFlourSack() / <FlourSack />        tied sack, slightly slumped
//   makeWorkTable() / <WorkTable />        rectangular table with a dough ball and a rolling pin
//   makeMeetingTable() / <MeetingTable ring />   round table, checked cloth, the emergency bell in the middle
//   makeVent() / <Vent open />             a vent styled as a round bread-oven floor hatch; the lid flips open
//
// Animated ones return { group, update(dt, { ring, open }) }; the R3F components call update for you.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { toonMat as T } from './baker3d.js'

const G = new Map()
const geo = (key, make) => G.get(key) || (G.set(key, make()), G.get(key))
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d))
const rbox = (w, h, d, r) => geo(`r${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r))
const cyl = (rt, rb, h, seg = 12) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
const sph = (r, w = 12, h = 8) => geo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h))
const mesh = (g, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent?.add(o); return o }
let glowM = null
const ovenGlow = () => (glowM ||= new THREE.MeshBasicMaterial({ color: '#ffa04a', toneMapped: false }))
const checkTex = () => geo('checkTex', () => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#fff6e8' : '#e8857a'; g.fillRect(x * 8, y * 8, 8, 8) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3)
  t.magFilter = THREE.NearestFilter
  return t
})

// ---- factories ------------------------------------------------------------------------------------------------------
export function makeOven() {
  const g = new THREE.Group(), brick = T('#c0664a'), dark = T('#5a3a2e'), gold = T('#e6b443')
  mesh(rbox(1.7, 0.9, 1.3, 0.08), brick, 0, 0.45, 0, g)
  const dome = mesh(geo('ovenDome', () => new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), brick, 0, 0.9, 0, g); dome.scale.set(1, 0.85, 0.78)
  mesh(geo('ovenArch', () => new THREE.CircleGeometry(0.34, 14, 0, Math.PI)), ovenGlow(), 0, 0.92, 0.635, g)
  mesh(box(0.8, 0.08, 0.1), dark, 0, 0.9, 0.64, g)
  mesh(cyl(0.12, 0.14, 0.6, 10), dark, 0.45, 1.6, -0.2, g)
  const dial = mesh(cyl(0.09, 0.09, 0.05, 12), gold, 0.62, 0.5, 0.66, g); dial.rotation.x = Math.PI / 2
  for (let i = 0; i < 3; i++) { const loaf = mesh(sph(0.13), T('#d99a55'), -0.3 + i * 0.3, 1.0, 0.45, g); loaf.scale.set(1.3, 0.6, 0.9) }
  let t = Math.random() * 10
  return { group: g, update(dt) { t += dt; ovenGlow().color.setRGB(1, 0.55 + Math.sin(t * 7) * 0.05 + Math.sin(t * 2.3) * 0.05, 0.25) } }
}

export function makeFlourSack(seed = 0) {
  const g = new THREE.Group(), sack = T('#e9dcc2'), tie = T('#a8703f')
  const b = mesh(rbox(0.62, 0.7, 0.48, 0.2), sack, 0, 0.33, 0, g); b.rotation.z = ((seed * 37) % 7 - 3) * 0.03
  mesh(cyl(0.07, 0.16, 0.2, 8), sack, 0, 0.76, 0, g)
  mesh(cyl(0.085, 0.085, 0.05, 8), tie, 0, 0.72, 0, g)
  mesh(box(0.5, 0.16, 0.01), T('#86b6e8'), 0, 0.36, 0.245, g)
  g.rotation.y = seed * 1.3
  return { group: g }
}

export function makeWorkTable() {
  const g = new THREE.Group(), wood = T('#9a6a45'), dark = T('#6e4a33')
  mesh(rbox(2, 0.12, 1.1, 0.04), wood, 0, 0.82, 0, g)
  for (const x of [-0.85, 0.85]) for (const z of [-0.42, 0.42]) mesh(box(0.1, 0.78, 0.1), dark, x, 0.39, z, g)
  mesh(box(1.8, 0.05, 0.9), dark, 0, 0.22, 0, g)
  const dough = mesh(sph(0.22), T('#f4e3c6'), -0.4, 0.95, 0, g); dough.scale.y = 0.55
  const pin = mesh(cyl(0.05, 0.05, 0.6, 8), T('#d9b07a'), 0.35, 0.93, 0.1, g); pin.rotation.z = Math.PI / 2; pin.rotation.y = 0.4
  mesh(geo('flourPuff', () => new THREE.CircleGeometry(0.32, 12)), T('#fffaf2'), -0.35, 0.885, 0.05, g).rotation.x = -Math.PI / 2
  return { group: g }
}

export function makeMeetingTable() {
  const g = new THREE.Group(), wood = T('#8a5a3c'), brass = T('#e6b443'), red = T('#d94f5c')
  mesh(cyl(1.6, 1.6, 0.1, 28), wood, 0, 0.78, 0, g)
  const cloth = mesh(cyl(1.35, 1.35, 0.012, 28), new THREE.MeshToonMaterial({ map: checkTex(), color: '#ffffff' }), 0, 0.84, 0, g)
  cloth.material.gradientMap = T('#fff').gradientMap
  mesh(cyl(0.25, 0.42, 0.75, 14), wood, 0, 0.37, 0, g)
  mesh(cyl(0.7, 0.75, 0.06, 18), wood, 0, 0.03, 0, g)
  // the emergency bell: a brass shop bell on a cushion, with a big plunger on top
  mesh(cyl(0.32, 0.36, 0.1, 16), red, 0, 0.9, 0, g)
  const bell = new THREE.Group(); bell.position.set(0, 0.95, 0); g.add(bell)
  const dome = mesh(geo('bellDome', () => new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), brass, 0, 0.02, 0, bell); dome.scale.y = 0.9
  mesh(cyl(0.26, 0.26, 0.03, 16), brass, 0, 0.02, 0, bell)
  const plunger = mesh(cyl(0.025, 0.025, 0.12, 6), brass, 0, 0.26, 0, bell)
  const knob = mesh(sph(0.055), red, 0, 0.33, 0, bell)
  let ringT = 9
  return {
    group: g, bell,
    update(dt, { ring } = {}) {
      if (ring && ringT > 0.6) ringT = 0
      ringT += dt
      const k = Math.max(0, 1 - ringT / 0.6)
      bell.rotation.z = Math.sin(ringT * 55) * 0.12 * k
      bell.scale.setScalar(1 + k * 0.08 * Math.abs(Math.sin(ringT * 30)))
      const press = ringT < 0.12 ? 0.05 : 0
      plunger.position.y = 0.26 - press; knob.position.y = 0.33 - press
    },
  }
}

// A vent, as a round iron bread-oven hatch set into the floor. open: the lid flips up and the warm inside shows.
export function makeVent() {
  const g = new THREE.Group(), iron = T('#4a4250'), rim = T('#8e8a93'), brass = T('#e6b443')
  const ring = mesh(geo('ventRim', () => new THREE.TorusGeometry(0.46, 0.07, 6, 20)), rim, 0, 0.03, 0, g); ring.rotation.x = Math.PI / 2
  const hole = mesh(geo('ventHole', () => new THREE.CircleGeometry(0.44, 20)), ovenGlow(), 0, 0.012, 0, g); hole.rotation.x = -Math.PI / 2
  const hinge = new THREE.Group(); hinge.position.set(0, 0.04, -0.42); g.add(hinge)
  const lid = new THREE.Group(); lid.position.z = 0.42; hinge.add(lid)
  mesh(cyl(0.43, 0.43, 0.05, 20), iron, 0, 0, 0, lid)
  for (let i = -2; i <= 2; i++) mesh(box(0.06, 0.03, 0.62 - Math.abs(i) * 0.1), rim, i * 0.14, 0.035, 0, lid)
  mesh(geo('ventHandle', () => new THREE.TorusGeometry(0.08, 0.02, 5, 10, Math.PI)), brass, 0, 0.04, 0.3, lid)
  let openK = 0, wob = 0
  return {
    group: g,
    update(dt, { open } = {}) {
      const target = open ? 1 : 0, prev = openK
      openK += (target - openK) * (1 - Math.exp(-14 * dt))
      if (Math.abs(target - prev) > 0.5) wob = 1
      wob = Math.max(0, wob - dt * 2.5)
      hinge.rotation.x = -openK * 1.9 - Math.sin(wob * 30) * wob * 0.15
    },
  }
}

// ---- R3F components -------------------------------------------------------------------------------------------------
function useProp(make, live = false, args) {
  const p = useMemo(() => make(args), []) // eslint-disable-line react-hooks/exhaustive-deps
  const props = useRef(live)
  props.current = live
  useFrame((_, dt) => p.update?.(Math.min(dt, 0.05), props.current || {}))
  return p
}
export const Oven = props => <primitive object={useProp(makeOven).group} {...props} />
export const FlourSack = ({ seed = 0, ...props }) => <primitive object={useProp(makeFlourSack, null, seed).group} {...props} />
export const WorkTable = props => <primitive object={useProp(makeWorkTable).group} {...props} />
export function MeetingTable({ ring = false, ...props }) { return <primitive object={useProp(makeMeetingTable, { ring }).group} {...props} /> }
export function Vent({ open = false, ...props }) { return <primitive object={useProp(makeVent, { open }).group} {...props} /> }
