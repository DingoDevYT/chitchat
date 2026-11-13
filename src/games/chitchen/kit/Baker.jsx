// <Baker>: the Impostor character for @react-three/fiber. A thin wrapper round createBaker() (baker3d.js),
// which plain three.js code can use directly.
//
//   <Baker texture={tex} color="#86b6e8" state="walk" facing={yaw} speed={2.4} talking position={[x, 0, z]} />
//
// state:   'idle' | 'walk' | 'task' | 'dead' | 'ghost' | 'ventIn' | 'ventOut' | 'win' | 'lose'
// facing:  radians about Y, 0 = facing +Z (same as the game's atan2(dx, dz)); the baker turns to it smoothly
// speed:   world units per second (walk cadence and stride; ghost leans forward when > 0.1)
// talking: boolean, or a 0..1 voice level; the head bobs, the screen brightens and a mint rim glows
// instant: with state="dead", skip the smash and lie there already (a body found later)
// onStep:  called once per footfall while walking (hook footsteps to kit/sfx.js)
// phase, stateTime: pin the walk phase / the time into the current state (previews and frame strips only)
// Anything else (position, scale, visible, onClick…) goes to the outer group.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createBaker } from './baker3d.js'
import { useFace } from '../../../Avatar'

export { STATES, BAKER_HEIGHT } from './baker3d.js'

export function Baker({ texture = null, color = '#86b6e8', state = 'idle', facing, speed, talking = false, instant = false, onStep, phase, stateTime, ...rest }) {
  const b = useMemo(() => createBaker(), [])
  useEffect(() => () => b.dispose(), [b])
  const props = useRef()
  props.current = { texture, color, state, facing, speed, talking, instant, onStep, phase, stateTime }
  useFrame((_, dt) => b.update(dt, props.current))
  return <primitive object={b.group} {...rest} />
}

// A body left where someone was tucked in: the smashed baker, already fallen.
export const BakerBody = props => <Baker {...props} state="dead" instant />

// An image URL (avatar PNG, GIF frame, data: SVG) as a cached texture; null while loading. Like Table3D's useImgTex.
const cache = new Map()
const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null
export function useBakerTexture(src) {
  const [tex, setTex] = useState(() => cache.get(src)?.tex || null)
  useEffect(() => {
    if (!src || !loader) return
    let on = true, e = cache.get(src)
    if (!e) {
      e = { p: new Promise(res => loader.load(src, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t) }, undefined, () => res(null))) }
      cache.set(src, e)
    }
    e.p.then(t => { e.tex = t; if (on && t) setTex(t) })
    return () => { on = false }
  }, [src])
  return src ? tex : null
}

// A Chitchat user's live face for a baker: their current PNGtuber frame (talking, blinking), colour and talking flag.
export function useBakerFace(uid) {
  const f = useFace(uid, 'stage')
  const texture = useBakerTexture(f.expr?.src || null)
  return { texture, color: f.p?.color || '#f4a261', talking: !!f.talk }
}
