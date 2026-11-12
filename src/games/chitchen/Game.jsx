// Midnight Chitchen, the client: the classic hidden-impostor party game in a cozy 3D bakery, everyone a TV-head whose
// screen is their live PNGtuber. Bakers (the crew) do tasks; Nibblers (the impostors) smash TVs, sabotage and vent.
// You walk yourself (keys or the touch joystick, with wall collisions) and broadcast where you are (net.js);
// everyone else is interpolated, Chitbots follow the referee's walk plans. A fog of war hides whatever your TV-head
// can't see (walls block it), and only the players inside your vision are drawn. Moves go to the referee only when
// they matter (tasks, kills, reports, the emergency bell, fixes, vents, votes), carrying your position.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Avatar, { useFace } from '../../Avatar'
import { botChar, botUrl } from '../bots.js'
import { THREE, bakery, ring, choreMarker, stools, tramStop, TRAM, LOOKS, FOG, fogify, visMask } from './world.js'
import { drawScreen } from './screen.js'
import { SPOTS, FIX, ROOMS, TABLE, VENTS, spot, dist, seatPos, vent, ventLinks, room as roomOf } from './map.js'
import { step, drift, canSeeAt, hear, visionOf, sightPolygon, ghostly } from './space.js'
import { posOf, TUCK, CHECK, USE, REPORT, MISCHIEF, BELLS, MIN_CHORE, MS } from './rules.js'
import { WHY } from './ui.jsx'
import { createNet } from './net.js'
import { setProximity } from '../../lib/proximity'
import { Chore } from './chores.jsx'
import { createBaker } from './kit/baker3d.js'
import { play as sfx, startLoop } from './kit/sfx.js'
import './chitchen.css'

const isBot = pid => pid.startsWith('bot:')
const SCREEN_BG = ['#f6c9a0', '#f19c9c', '#9cc79a', '#b9a0e0', '#7f9fd0', '#f2c98a', '#8fc9c0', '#ea8a96']
const SAB = {
  candles: { name: 'Lights out', icon: '🕯️', where: 'shop', tip: "Cuts bakers' vision to almost nothing" },
  boil: { name: 'Oven boil-over', icon: '♨️', where: 'kitchen', tip: 'Two bakers must turn both dials, or you win' },
  flour: { name: 'Flour storm', icon: '🌫️', where: 'garden', tip: 'Voices only carry close by' },
  jam: { name: 'Jam the pantry', icon: '🚪', where: 'pantry', tip: 'Shuts the pantry doors for a while' },
}
const EMOTES = ['Not me!', 'I saw!', 'Skip?', 'Hmm…']
const roomName = id => roomOf(id)?.name || 'the bakery'
export function lineText(l, nm) {
  if (!l) return ''
  if (l.k === 'saw') return `I saw ${nm(l.pid)} smash someone's TV!`
  if (l.k === 'vent') return `I saw ${nm(l.pid)} hop down a crumb chute! That's a Nibbler!`
  if (l.k === 'near') return `${nm(l.pid)} was near the ${roomName(l.room)}…`
  if (l.k === 'found') return `I found the body in the ${roomName(l.room)}.`
  if (l.k === 'did') return l.chore ? `I was doing "${spot(l.chore)?.name}" in the ${roomName(l.room)}.` : `I was doing tasks in the ${roomName(l.room)}.`
  return "I didn't see anything. Skip?"
}
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const secs = ms => `${Math.max(0, Math.ceil(ms / 1000))}s`
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const remains = n => `${plural(n, 'Nibbler', 'Nibblers')} ${n === 1 ? 'remains' : 'remain'}.`
const HOWTO_KEY = 'cc-howto-v2'
const seenHowto = () => { try { return localStorage.getItem(HOWTO_KEY) === '1' } catch { return true } }

// Reads a person's live face (talking, blinking, expressions) into a shared ref for the 3D loop.
function FaceFeed({ pid, uid, into }) {
  const f = useFace(uid, 'stage')
  const src = f.expr?.src || null, color = f.p?.color || '#f4a261'
  useEffect(() => { into.current[pid] = { src, talk: f.talk, color } }, [pid, src, f.talk, color, into])
  return null
}

// A little TV with the player on its screen (role reveal, meeting cards, the end). Smashed when dead.
function TvCard({ who, size = 64, dead, children, className = '' }) {
  if (!who) return null
  const look = LOOKS[who.idx % LOOKS.length]
  return (
    <div className={`cc-tv${dead ? ' dead' : ''} ${className}`} style={{ '--casing': look.casing, '--trim': look.trim, '--sz': `${size}px` }}>
      <div className="cc-tv-screen" style={{ background: SCREEN_BG[who.idx % 8] }}>
        {who.user_id ? <Avatar id={who.user_id} size={Math.round(size * 0.66)} /> : <img src={botUrl(botChar(who.bot, who.seat))} alt="" draggable="false" />}
        {dead && <i className="cc-tv-crack" />}
      </div>
      <i className="cc-tv-knob" />
      {children}
    </div>
  )
}

export default function Chitchen({ v, me, nm: nmRaw, act, people, tools, gameId }) {
  const mount = useRef(), vRef = useRef(v), faces = useRef({}), live = useRef({})
  vRef.current = v
  const mine = v.me
  const inGame = v.players.includes(me)
  const nm = useCallback(pid => (pid === me ? 'You' : nmRaw(pid)), [me, nmRaw])
  const [chore, setChore] = useState(null)
  const [ctx, setCtx] = useState({}) // context buttons, tags, wisps (refreshed ~6×/s)
  const [mapOpen, setMapOpen] = useState(false)
  const [sabOpen, setSabOpen] = useState(false)
  const [ventOpen, setVentOpen] = useState(false)
  const [howto, setHowto] = useState(false)
  const [emotes, setEmotes] = useState({})
  const [, setTick] = useState(0)
  const touch = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, [])
  const joy = useRef([0, 0]), keys = useRef(new Set())
  const send = useCallback(m => act('move', { move: m }), [act])
  const who = useCallback(pid => { const p = people.find(x => x.pid === pid); return p && { ...p, idx: Math.max(0, v.players.indexOf(pid)) } }, [people, v.players])

  // Game time on this client: the referee's clock at the last update, plus time since we got it.
  const recv = useRef({ clock: v.clock, at: performance.now() })
  if (recv.current.clock !== v.clock) recv.current = { clock: v.clock, at: performance.now() }
  const now = () => recv.current.clock + (performance.now() - recv.current.at)

  // When the phase changed on this screen (for the splashes), and where I am (back to my seat each night shift).
  const myPos = useRef(v.seats[me] ? [...v.seats[me]] : [18, 18])
  const phaseAt = useRef({ phase: v.phase, at: performance.now() })
  const [smashedAt, setSmashedAt] = useState(0)
  const lastStatus = useRef(v.status[me])
  useEffect(() => {
    if (v.phase === 'play' && phaseAt.current.phase !== 'play' && v.seats[me]) myPos.current = [...v.seats[me]]
    if (phaseAt.current.phase !== v.phase) phaseAt.current = { phase: v.phase, at: performance.now() }
    if (v.phase !== 'play') { setChore(null); setSabOpen(false); setVentOpen(false); setMapOpen(false); live.current.busy = false }
    if (v.phase === 'play' && !seenHowto() && inGame) setHowto(true)
  }, [v.phase, v.seats, me, inGame])
  // Sound cues for the big moments, and the alarm loop while a sabotage runs.
  useEffect(() => {
    if (v.phase === 'talk') sfx(v.meeting?.why === 'nap' ? 'report' : 'meeting')
    if (v.phase === 'apron') sfx('sting')
    if (v.phase === 'end' && inGame) sfx(v.winners?.includes(me) ? 'win' : 'lose')
    if (v.phase !== 'reveal') return
    const id = setTimeout(() => { sfx('eject'); sfx('sting', { delay: 1.2 }) }, 3200)
    return () => clearTimeout(id)
  }, [v.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  const sabKind = v.phase === 'play' ? v.mischief?.kind : null
  useEffect(() => (sabKind ? startLoop('sabotage') : undefined), [sabKind])
  useEffect(() => {
    if (lastStatus.current === 'awake' && v.status[me] === 'nap' && v.phase === 'play') { setSmashedAt(performance.now()); setChore(null); live.current.busy = false; sfx('kill') }
    lastStatus.current = v.status[me]
  }, [v.status, v.phase, me])
  // Overlays with timers (splashes, typewriter text, countdowns) redraw a few times a second.
  useEffect(() => { const id = setInterval(() => setTick(x => x + 1), 250); return () => clearInterval(id) }, [])

  const net = useMemo(() => createNet(gameId, me, { onEmote: (pid, e) => setEmotes(x => ({ ...x, [pid]: { e, t: performance.now() } })) }), [gameId, me])
  useEffect(() => () => net.stop(), [net])

  // Proximity voice: on while I'm playing; off when this screen goes. Ghosts are silent to the living (space.hear).
  const posMap = useRef({})
  useEffect(() => {
    if (!inGame) return
    setProximity(id => hear(vRef.current, me, id, posMap.current))
    return () => setProximity(null)
  }, [inGame, me])

  // Keyboard.
  useEffect(() => {
    const typing = e => /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
    const kd = e => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.current.add(k); e.preventDefault(); return }
      const L = live.current
      if (k === 'e' || k === ' ') L.use?.(); if (k === 'r') L.report?.(); if (k === 'b') L.bell?.()
      if (k === 'q') L.kill?.(); if (k === 'v') L.vent?.(); if (k === 'f') L.sabotage?.(); if (k === 'm') setMapOpen(m => !m)
      if (k === 'escape') { setMapOpen(false); setSabOpen(false); setVentOpen(false) }
      if (/^[1-4]$/.test(k) && (vRef.current.phase === 'talk' || vRef.current.phase === 'vote')) net.emote(EMOTES[+k - 1])
    }
    const ku = e => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur)
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur) }
  }, [net])

  // ---- the 3D world -------------------------------------------------------------------------------------------
  useEffect(() => {
    const el = mount.current
    const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene(), bg = new THREE.Color('#141024')
    scene.background = bg
    scene.fog = new THREE.FogExp2('#e9dcc8', 0)
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    const hemi = new THREE.HemisphereLight('#7a7fc0', '#6a4a34', 1.5); scene.add(hemi)
    const amb = new THREE.AmbientLight('#ffe6cc', 0.55); scene.add(amb)
    const moon = new THREE.DirectionalLight('#b9c2f2', 0.7); moon.position.set(8, 20, 30); scene.add(moon)
    const lamp = new THREE.PointLight('#ffc98a', 14, 9, 1.5); scene.add(lamp)
    const oven = new THREE.PointLight('#ff8a3a', 12, 7, 1.6); oven.position.set(FIX.dialA.x, 1.2, 14.3); scene.add(oven)
    const warm = [[6, 5], [18, 5], [30, 5], [6, 17], [30, 17]].map(([x, z]) => { const L = new THREE.PointLight('#ffb45a', 14, 11, 1.4); L.position.set(x, 2.2, z); scene.add(L); return L })
    const world = bakery(); scene.add(world.group)
    const flameMat = world.flames[0]?.material
    const tram = tramStop(); tram.group.visible = false; scene.add(tram.group)
    const seatsG = stools(); scene.add(seatsG)
    const markers = new Map() // spot id → marker
    for (const s of SPOTS) { const m = choreMarker(s.x, s.y); m.visible = false; scene.add(m); markers.set(s.id, m) }
    const fixMarks = Object.fromEntries(['fuse', 'dialA', 'dialB'].map(k => { const m = choreMarker(FIX[k].x, FIX[k].y); m.children[0].material = m.children[0].material.clone(); m.children[0].material.color.set('#ff5a5a'); m.visible = false; scene.add(m); return [k, m] }))
    const bellRing = ring('#ff6b6b', 1.3, 0.7); bellRing.position.set(FIX.bell.x, 0.04, FIX.bell.y); scene.add(bellRing)
    const ventRings = VENTS.map(x => { const r = ring('#ff6b6b', 0.75, 0.6); r.position.set(x.x, 0.06, x.y); r.visible = false; scene.add(r); return r })
    const myRing = ring('#ffcf8a', 0.6, 0.6); scene.add(myRing)
    const mask = visMask()

    // People: one kit baker each (colour from seat order), with its own screen canvas (drawScreen) as the TV
    // texture, plus a smashed baker lying where anyone fell.
    const vp = vRef.current
    const avatars = new Map(), bodies = new Map()
    const makeOne = i => {
      const b = createBaker(), canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 144
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace
      scene.add(b.group)
      return { b, group: b.group, canvas, tex, seat: i, key: '', prev: null, spd: 0, want: 0, yaw: 0, color: LOOKS[i % LOOKS.length].body }
    }
    vp.players.forEach((pid, i) => avatars.set(pid, makeOne(i)))
    const bodyOf = (pid, fresh) => {
      if (!bodies.has(pid)) { const b = makeOne(vp.players.indexOf(pid)); b.instant = !fresh; b.want = (vp.players.indexOf(pid) * 1.7) % 6.28; bodies.set(pid, b) }
      return bodies.get(pid)
    }
    const fogAll = () => scene.traverse(o => { if (o.material) [].concat(o.material).forEach(fogify) })
    fogAll()
    let fogN = 0
    const seatOf = pid => people.find(p => p.pid === pid)?.seat ?? vp.players.indexOf(pid)
    const levelOf = pid => people.find(p => p.pid === pid)?.bot || 'normal'
    const faceOf = (pid, t) => {
      if (!isBot(pid)) return faces.current[pid] || { src: null, talk: false, color: '#f4a261' }
      const c = botChar(levelOf(pid), seatOf(pid))
      return { src: botUrl(c, false), talk: false, color: c.color }
    }
    const paint = (a, f, state, seat) => {
      const key = `${f.src}|${f.talk}|${state}|${f.color}`
      if (a.key === key) return
      a.key = key
      drawScreen(a.canvas, { src: f.src, color: f.color, talk: f.talk, state, bg: SCREEN_BG[seat % 8] }, () => { a.key = '' })
      a.tex.needsUpdate = true
    }

    let raf = 0, lastT = performance.now(), lastHere = 0, revealStart = 0, lastPhaseLocal = null, R = 5.5
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix() }
    const ro = new ResizeObserver(size); ro.observe(el); size()
    const camTo = new THREE.Vector3(), lookTo = new THREE.Vector3(), look = new THREE.Vector3(18, 0, 14)
    cam.position.set(18, 14, 26)

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const tNow = performance.now(), dt = Math.min(0.05, (tNow - lastT) / 1000); lastT = tNow
      const V = vRef.current, t = now(), phase = V.phase, secsNow = tNow / 1000
      if (phase !== lastPhaseLocal) { if (phase === 'reveal') revealStart = tNow; lastPhaseLocal = phase }
      const myStatus = V.status[me] ?? 'out'
      const ghostMe = ghostly(myStatus), out = myStatus === 'out'
      const nib = V.me?.role === 'nibbler'
      const dark = V.mischief?.kind === 'candles', flour = V.mischief?.kind === 'flour', jam = V.mischief?.kind === 'jam'
      const portrait = cam.aspect < 0.8
      const play = phase === 'play'

      // Walk (ghosts float through walls).
      if (play && !out && !live.current.busy) {
        const k = keys.current
        const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + joy.current[0]
        const iy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + joy.current[1]
        if (ix || iy) {
          myPos.current = ghostMe ? drift(myPos.current, ix, iy, dt) : step(myPos.current, ix, iy, dt, jam)
          live.current.face = Math.atan2(ix, iy)
        }
        net.send(myPos.current[0], myPos.current[1], live.current.face || 0)
      }

      // Everyone's position this frame.
      const pos = {}
      V.players.forEach((pid, i) => {
        if (play) pos[pid] = pid === me ? myPos.current : V.bots[pid] ? posOf(V, pid, t) : (() => { const s = net.at(pid); return s ? [s.x, s.y] : V.seats[pid] })()
        else pos[pid] = V.seats[pid] || seatPos(i, V.players.length)
      })
      posMap.current = pos
      const me2 = pos[me]

      // Vision and the fog of war.
      const want = play ? visionOf(V, me) : Infinity
      const fogOn = play && want !== Infinity && !!me2
      if (fogOn) {
        R += (want - R) * Math.min(1, dt * 3) // lights going out closes in, not snaps
        mask.draw(renderer, me2, sightPolygon(me2, R + 0.4, jam))
        FOG.uMe.value.set(me2[0], me2[1]); FOG.uR.value = R
      } else R = want === Infinity ? 5.5 : want
      FOG.uOn.value = fogOn ? 1 : 0
      const seesNow = q => !fogOn || canSeeAt(me2, q, R, jam)
      live.current.R = fogOn ? R : Infinity

      // Meeting seating: the living round the back of the table, so every screen faces the room.
      const sitting = phase === 'talk' || phase === 'vote'
      const atTable = sitting ? V.players.filter(x => V.status[x] === 'awake') : phase === 'apron' || phase === 'end' ? [...V.players] : []
      const teaSeat = {}
      atTable.forEach((pid, i) => {
        const n = atTable.length, a = Math.PI * (1.08 + (0.84 * i) / Math.max(1, n - 1))
        teaSeat[pid] = [TABLE.x + 2.55 * Math.cos(a), TABLE.y + 2.55 * Math.sin(a) * 0.85 + 0.2]
      })
      seatsG.children.forEach((s, i) => { const pid = atTable[i]; s.visible = sitting && !!teaSeat[pid]; if (teaSeat[pid]) s.position.set(teaSeat[pid][0], 0.22, teaSeat[pid][1]) })

      // Draw each person: only the ones inside my vision; ghosts only for ghosts (and people watching).
      if (++fogN % 30 === 0) fogAll() // the kit makes ghost and sparkle materials on the fly: darken those too
      for (const [pid, a] of avatars) {
        const st = V.status[pid], seat = a.seat, ghost = ghostly(st)
        const f = faceOf(pid, t)
        ;(live.current.talking ||= {})[pid] = f.talk
        let show = true, mode = 'stand', at = pos[pid], yaw = null
        if (play) {
          if (ghost) show = ghostMe || out
          if (show && pid !== me) show = ghost ? true : seesNow(at)
        } else if (sitting) {
          show = !!teaSeat[pid]; mode = 'sit'; at = teaSeat[pid] || at
          yaw = at ? Math.atan2(TABLE.x - at[0], TABLE.y + 6 - at[1]) : 0
        } else if (phase === 'reveal') {
          show = V.reveal?.pid === pid
          if (show) {
            const k = Math.min(1, Math.max(0, (tNow - revealStart - 3200) / 4200))
            at = [TRAM.x - 5 + k * 7.1, TRAM.z + 2 - k * 1.0]; mode = k > 0 && k < 1 ? 'walk' : 'stand'; yaw = 0.55
          }
        } else { at = teaSeat[pid] || at; yaw = at ? Math.atan2(TABLE.x - at[0], TABLE.y + 6 - at[1]) : 0; show = !!at }
        a.group.visible = !!(show && at)
        if (!a.group.visible) { a.prev = null; a.spd = 0; continue }
        // Animation: smoothed speed (no flicker between walking and standing), smoothed turning.
        const moved = a.prev ? dist(a.prev, at) : 0
        if (moved > 2) { a.prev = null; a.spd = 0 } // a teleport (vent, meeting): no stride
        const inst = a.prev ? moved / Math.max(dt, 1e-3) : 0
        a.spd += (inst - a.spd) * Math.min(1, dt * 8)
        let state = 'idle', speed = 0
        if (play) {
          if (moved > 0.01 && moved < 2) a.want = Math.atan2(at[0] - a.prev[0], at[1] - a.prev[1])
          speed = a.spd > 0.5 ? Math.min(a.spd, 4.5) : 0
          state = ghost ? 'ghost' : speed ? 'walk' : live.current.busy && pid === me ? 'task' : 'idle'
        } else if (mode === 'walk') { state = 'walk'; speed = 2.6; a.want = yaw } else {
          a.want = yaw ?? a.want
          if (phase === 'end') state = V.winners?.includes(pid) ? 'win' : 'lose'
        }
        a.prev = [...at]
        a.group.position.set(at[0], sitting ? 0.42 : phase === 'reveal' ? 0.35 : 0, at[1])
        paint(a, f, phase === 'reveal' && V.reveal?.role === 'nibbler' && tNow - revealStart > 5000 ? 'mask' : 'live', seat)
        a.b.update(dt, { texture: a.tex, color: a.color, state, facing: a.want, speed, talking: f.talk && !ghost })
      }

      // Smashed TVs where people fell (until a meeting clears them): only if I can see the spot.
      for (const [pid, n] of Object.entries(V.naps || {})) {
        const vis = play && !n.found && seesNow([n.x, n.y])
        if (!vis && !bodies.has(pid)) continue
        const b = bodyOf(pid, t - n.t < 2500) // seen falling: the full smash; found later: already lying there
        b.group.visible = vis
        b.group.position.set(n.x, 0, n.y)
        if (vis) { paint(b, faceOf(pid, t), 'live', b.seat); b.b.update(dt, { texture: b.tex, color: b.color, state: 'dead', instant: b.instant, facing: b.want, speed: 0 }) }
      }
      for (const [pid, b] of bodies) if (!V.naps?.[pid]) b.group.visible = false

      // Task spots (mine, not done), fix spots during sabotage, chutes for Nibblers, the emergency bell.
      for (const [id, m] of markers) { m.visible = play && !out && !!V.me?.chores.includes(id) && !V.me.done.includes(id); if (m.visible) m.userData.spark.position.y = 1.7 + Math.sin(tNow / 300) * 0.08 }
      for (const [k, m] of Object.entries(fixMarks)) m.visible = play && ((k === 'fuse' && dark) || (k !== 'fuse' && V.mischief?.kind === 'boil' && !V.mischief.dials?.[k]))
      ventRings.forEach(r => { r.visible = play && nib && myStatus === 'awake' })
      bellRing.visible = play && myStatus === 'awake'
      bellRing.material.opacity = 0.35 + 0.3 * Math.sin(tNow / 260)

      // Light and weather. Lights-out dims the room for bakers (Nibblers see fine in the dark).
      const dim = dark && play && !nib && !ghostMe
      hemi.intensity += ((dim ? 0.25 : 1.5) - hemi.intensity) * 0.1; amb.intensity = dim ? 0.06 : 0.55
      moon.intensity = dim ? 0.15 : phase === 'reveal' ? 1 : 0.7
      for (const L of warm) L.intensity = dim || phase === 'reveal' ? 0 : 14
      oven.intensity = phase === 'reveal' ? 0 : dim ? 3 : 12
      if (flameMat) flameMat.emissiveIntensity = dim ? 0 : 2.5
      world.jamDoors.visible = jam && play
      scene.fog.density += ((flour && play ? 0.06 : 0) - scene.fog.density) * 0.05
      bg.set(phase === 'reveal' ? '#141433' : '#0c0a16')
      tram.group.visible = phase === 'reveal'
      myRing.visible = play && !!me2 && !out
      if (me2) { myRing.position.set(me2[0], 0.025, me2[1]); lamp.position.set(me2[0], 2.6, me2[1]); lamp.intensity = play && !ghostMe ? (dim ? 8 : 12) : 0; lamp.distance = dim ? 4 : 9 }

      // Camera: a close, nearly top-down follow cam on the night shift; the table for meetings; the tram.
      const follow = play && me2 && !out
      if (follow) { lookTo.set(me2[0], 0, me2[1]); camTo.copy(lookTo).add(portrait ? new THREE.Vector3(0, 28, 17) : new THREE.Vector3(0, 24, 15)) }
      else if (play) { lookTo.set(18, 0, 12); camTo.set(18, portrait ? 44 : 30, portrait ? 26 : 24) }
      else if (phase === 'reveal') { lookTo.set(TRAM.x + 0.6, 1.4, TRAM.z); camTo.set(TRAM.x + 1.2, portrait ? 4.5 : 3.4, TRAM.z + (portrait ? 17 : 13)) }
      else { lookTo.set(TABLE.x, 1.05, TABLE.y - 0.4); camTo.set(TABLE.x, portrait ? 6.4 : 4.6, TABLE.y + (portrait ? 8.6 : 7.4)) }
      cam.fov = follow ? (portrait ? 32 : 22) : portrait ? 52 : 42; cam.updateProjectionMatrix() // narrow when following: less lean at the edges
      const jump = cam.position.distanceTo(camTo) > 25
      cam.position.lerp(camTo, jump ? 1 : 1 - Math.pow(0.002, dt)); look.lerp(lookTo, jump ? 1 : 1 - Math.pow(0.002, dt)); cam.lookAt(look)
      renderer.render(scene, cam)

      // Tell the referee where I am when a Chitbot could see me (so bots can range-check and notice me).
      if (play && me2 && !out && tNow - lastHere > 3500 && V.players.some(b => V.bots[b] && V.status[b] === 'awake' && canSeeAt(posOf(V, b, t), me2, 7, jam))) {
        lastHere = tNow; live.current.sendHere?.()
      }
      live.current.cam = cam; live.current.pos = pos; live.current.teaSeat = teaSeat; live.current.size = [el.clientWidth, el.clientHeight]; live.current.t = t
      live.current.sees = seesNow
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mask.dispose(); for (const a of [...avatars.values(), ...bodies.values()]) { a.b.dispose(); a.tex.dispose() } renderer.dispose(); renderer.domElement.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- context: buttons, name tags, chatter wisps (a few times a second, not every frame) ------------------
  useEffect(() => {
    const tick = () => {
      const V = vRef.current, L = live.current, cam = L.cam, pos = L.pos
      if (!cam || !pos) return
      const t = now(), me2 = myPos.current, st = V.status[me] ?? 'out', up = st === 'awake', play = V.phase === 'play'
      const m = V.me, jam = V.mischief?.kind === 'jam'
      const c = {}
      if (play && m && st !== 'out') {
        const ch = m.chores.filter(id => !m.done.includes(id)).map(spot).find(s => dist(me2, [s.x, s.y]) <= USE - 0.15)
        if (ch) c.use = { kind: 'chore', spot: ch }
        const mi = V.mischief
        if (up && mi) {
          const fx = (mi.kind === 'candles' ? ['fuse'] : mi.kind === 'boil' ? ['dialA', 'dialB'].filter(d => !mi.dials[d]) : []).find(k => dist(me2, [FIX[k].x, FIX[k].y]) <= USE - 0.15)
          if (fx) c.use = { kind: 'fix', what: fx }
        }
        if (up) {
          const nap = Object.entries(V.naps || {}).find(([pid, n]) => !n.found && pid !== me && dist(me2, [n.x, n.y]) <= REPORT - 0.2)
          if (nap) c.report = nap[0]
          if (dist(me2, [FIX.bell.x, FIX.bell.y]) <= USE + 0.8) c.bell = (V.bells[me] || 0) >= BELLS ? 'used' : mi?.kind === 'boil' ? 'boil' : t >= V.bellReady ? 'ok' : 'wait'
        }
        if (up && m.role === 'nibbler') {
          c.nibbler = true
          c.killWait = Math.max(0, m.ready - t)
          let best = null
          for (const pid of V.players) {
            if (pid === me || V.status[pid] !== 'awake' || m.mates?.includes(pid) || !pos[pid]) continue
            const d = dist(me2, pos[pid])
            if (d <= TUCK * CHECK - 0.3 && (!best || d < best.d) && canSeeAt(me2, pos[pid], 99, jam)) best = { pid, d }
          }
          if (best) c.kill = best.pid
          c.sabWait = V.mischief ? -1 : Math.max(0, V.mischiefReady - t)
          const vn = VENTS.find(x => dist(me2, [x.x, x.y]) <= USE - 0.2)
          if (vn) c.vent = vn.id
          c.ventWait = Math.max(0, (m.vented || 0) + MS.vent - t)
        }
      }
      // name tags above heads (projected), and chatter wisps for talkers you can hear but not see
      const [w, h] = L.size || [1, 1], tags = [], wisps = []
      const proj = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(cam); return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h, p.z < 1] }
      if (play) V.players.forEach(pid => {
        const at = pos[pid]
        if (!at) return
        const ghost = ghostly(V.status[pid])
        const visible = pid === me || (ghost ? ghostly(st) || st === 'out' : L.sees?.(at))
        if (visible) { const [x, y, ok] = proj(at[0], ghost ? 2.7 : 2.35, at[1]); if (ok) tags.push({ pid, x, y, ghost }) }
        else if (L.talking?.[pid] && pid !== me && hear(V, me, pid, pos).gain > 0.02) wisps.push({ pid, a: Math.atan2(at[1] - me2[1], at[0] - me2[0]) })
      })
      c.tags = tags; c.wisps = wisps
      setCtx(c)
    }
    const id = setInterval(tick, 160)
    return () => clearInterval(id)
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- actions ---------------------------------------------------------------------------------------------
  const pos = () => myPos.current.map(x => +x.toFixed(2))
  live.current.sendHere = () => send({ type: 'here', pos: pos() })
  const choreStart = useRef(0)
  live.current.use = () => {
    const u = ctx.use
    if (!u || chore) return
    if (u.kind === 'fix') return send({ type: 'fix', what: u.what, pos: pos() })
    choreStart.current = performance.now(); live.current.busy = true
    send({ type: 'start', id: u.spot.id, pos: pos() }); setChore(u.spot)
  }
  const choreDone = () => {
    const s = chore
    const wait = Math.max(0, MIN_CHORE + 400 - (performance.now() - choreStart.current))
    setTimeout(() => send({ type: 'chore', id: s.id, pos: pos() }), wait)
    setChore(null); live.current.busy = false; sfx('taskDone')
  }
  live.current.report = () => ctx.report && send({ type: 'report', target: ctx.report, pos: pos() })
  live.current.bell = () => ctx.bell === 'ok' && send({ type: 'bell', pos: pos() })
  live.current.kill = () => {
    if (!ctx.kill || ctx.killWait > 0) return
    const t = live.current.pos?.[ctx.kill]
    sfx('kill')
    send({ type: 'tuck', target: ctx.kill, pos: pos(), ...(isBot(ctx.kill) ? {} : { tpos: t.map(x => +x.toFixed(2)) }) })
  }
  live.current.vent = () => { if (ctx.vent && !ctx.ventWait) setVentOpen(o => !o) }
  live.current.sabotage = () => { if (ctx.nibbler) { setSabOpen(o => !o); setMapOpen(false) } }
  const hop = to => {
    const from = ctx.vent
    if (!from) return
    send({ type: 'vent', from, to, pos: pos() }); sfx('vent')
    const d = vent(to); myPos.current = [d.x, d.y]; setVentOpen(false)
  }
  const sabotage = kind => { send({ type: 'mischief', kind }); setSabOpen(false) }

  // ---- HUD -------------------------------------------------------------------------------------------------
  const t = now(), tNow = performance.now()
  const since = tNow - phaseAt.current.at
  const left = v.phaseEnds != null ? v.phaseEnds - t : null
  const myStatus = v.status[me] ?? 'out'
  const ghostMe = ghostly(myStatus)
  const humans = people.filter(p => p.user_id)
  const play = v.phase === 'play'
  const nibMe = mine?.role === 'nibbler'
  const emoteNow = tNow
  const mi = v.mischief

  return (
    <div className={`cc${touch ? ' touch' : ''}${mi?.kind === 'flour' && play ? ' flour' : ''}${ghostMe && play ? ' ghosting' : ''}`}>
      {humans.map(p => <FaceFeed key={p.pid} pid={p.pid} uid={p.user_id} into={faces} />)}
      <div ref={mount} className="cc-view" />
      {mi?.kind === 'flour' && play && <div className="cc-flour" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}

      {/* name tags and chatter wisps */}
      {play && <div className="cc-tags" aria-hidden="true">
        {(ctx.tags || []).map(({ pid, x, y, ghost }) => {
          const e = emotes[pid] && emoteNow - emotes[pid].t < 2600 ? emotes[pid].e : null
          return (
            <div key={pid} className="cc-tag-wrap" style={{ left: x, top: y }}>
              {e && <div className="cc-stamp">{e}</div>}
              <div className={`cc-tag${pid === me ? ' me' : ''}${mine?.mates?.includes(pid) || (pid === me && nibMe) ? ' mate' : ''}${ghost ? ' ghost' : ''}`}>
                {pid === me ? 'You' : nm(pid)}{isBot(pid) && <b>BOT</b>}
              </div>
            </div>
          )
        })}
        {(ctx.wisps || []).map(({ pid, a }) => {
          const r = 0.42, x = 50 + Math.cos(a) * r * 100, y = 50 + Math.sin(a) * r * 100
          return <div key={pid} className="cc-wisp" style={{ left: `${Math.min(92, Math.max(8, x))}%`, top: `${Math.min(86, Math.max(14, y))}%`, '--a': `${a}rad` }}><i /><span>someone's talking</span></div>
        })}
      </div>}

      {/* top-left: the shared task bar and my task list */}
      {play && <div className="cc-hud-left">
        <div className="cc-taskbar" title="Every baker's tasks, done so far. Fill it and the Bakers win.">
          <span>TOTAL TASKS COMPLETED</span>
          <div className="cc-bar"><i style={{ width: `${(100 * v.bakeDone) / Math.max(1, v.bakeTotal)}%` }} /></div>
        </div>
        {mine && <div className={`cc-tasks${nibMe ? ' nib' : ''}`}>
          {nibMe && <div className="cc-tasks-nib">You're a <b>Nibbler</b> (impostor). Smash bakers' TVs, sabotage, vent, and fake these tasks to blend in.{mine.mates?.length ? <> Fellow Nibbler: <b>{mine.mates.map(nm).join(', ')}</b>.</> : ''}</div>}
          {ghostMe && !nibMe && <div className="cc-tasks-ghost">You're a ghost. Finish your tasks to help the bakers win!</div>}
          <div className="cc-tasks-h">{nibMe ? 'Fake tasks' : 'Tasks'}</div>
          {mine.chores.map(id => { const s = spot(id); const done = mine.done.includes(id); return <div key={id} className={done ? 'done' : ''}>{roomName(s.room)}: {s.name}{done ? ' ✓' : ''}</div> })}
        </div>}
      </div>}

      {/* top-right: sunrise, help, map, the stadium tools */}
      <div className="cc-hud-right">
        {play && <span className="cc-sun" title="If the bake isn't done by sunrise, the Nibblers win">☀ {fmt(v.dawn - Math.max(0, t - v.clock))}</span>}
        <button className="cc-round" onClick={() => setHowto(h => !h)} title="How to play" aria-label="How to play">?</button>
        {play && <button className="cc-round" onClick={() => { setMapOpen(m => !m); setSabOpen(false) }} title="Map (M)" aria-label="Map">🗺</button>}
        <div className="cc-tools">{tools}</div>
      </div>

      {/* sabotage alarm */}
      {play && mi && <div className={`cc-alarm m-${mi.kind}`} role="alert">
        {mi.kind === 'candles' && <><b>LIGHTS OUT!</b> {nibMe ? "The bakers can barely see. Go!" : 'Relight the candles at the fuse box in the Front Shop.'}</>}
        {mi.kind === 'flour' && <><b>FLOUR STORM!</b> Voices only carry close by · {fmt(mi.ends - t)}</>}
        {mi.kind === 'jam' && <><b>PANTRY DOORS STUCK!</b> · {fmt(mi.ends - t)}</>}
        {mi.kind === 'boil' && <><b>OVEN BOILING OVER! {fmt(mi.ends - t)}</b> Two bakers: turn the oven dial (Kitchen) and the valve (Jam Cellar) · {mi.dials.dialA ? '✓' : '○'} oven {mi.dials.dialB ? '✓' : '○'} cellar</>}
      </div>}

      {/* action buttons, bottom right */}
      {play && !chore && myStatus !== 'out' && <div className="cc-actions">
        {ctx.nibbler && <button className={`cc-act sab${sabOpen ? ' on' : ''}`} disabled={ctx.sabWait !== 0} onClick={() => live.current.sabotage()}>
          {ctx.sabWait > 0 && <em>{Math.ceil(ctx.sabWait / 1000)}</em>}<span className="cc-ico">⚠</span>SABOTAGE<small>F</small></button>}
        {ctx.nibbler && ctx.vent && <button className="cc-act vent ready" disabled={ctx.ventWait > 0} onClick={() => live.current.vent()}><span className="cc-ico">▤</span>VENT<small>V</small></button>}
        {ctx.nibbler && <button className={`cc-act kill${ctx.kill && !ctx.killWait ? ' ready' : ''}`} disabled={!ctx.kill || ctx.killWait > 0} onClick={() => live.current.kill()}>
          {ctx.killWait > 0 && <em>{Math.ceil(ctx.killWait / 1000)}</em>}<span className="cc-ico">✖</span>SMASH<small>Q · kill</small></button>}
        {myStatus === 'awake' && <button className={`cc-act report${ctx.report ? ' ready' : ''}`} disabled={!ctx.report} onClick={() => live.current.report()}><span className="cc-ico">📢</span>REPORT<small>R</small></button>}
        {ctx.bell
          ? <button className={`cc-act emergency${ctx.bell === 'ok' ? ' ready' : ''}`} disabled={ctx.bell !== 'ok'} onClick={() => live.current.bell()} title={ctx.bell === 'used' ? 'You already called your emergency meeting' : ctx.bell === 'boil' ? 'Fix the oven first' : ''}>
            {ctx.bell === 'wait' && <em>{Math.ceil((v.bellReady - t) / 1000)}</em>}<span className="cc-ico">🔔</span>{ctx.bell === 'used' ? 'USED' : 'EMERGENCY'}<small>B</small></button>
          : <button className={`cc-act use${ctx.use ? ' ready' : ''}`} disabled={!ctx.use} onClick={() => live.current.use()}><span className="cc-ico">✋</span>{ctx.use?.kind === 'fix' ? 'FIX' : 'USE'}<small>E</small></button>}
      </div>}
      {ventOpen && ctx.vent && <div className="cc-vents">
        <div className="cc-vents-h">Crumb chute: hop to…</div>
        {ventLinks(ctx.vent).map(id => <button key={id} className="cc-btn big" onClick={() => hop(id)}>→ {roomName(vent(id).room)}</button>)}
      </div>}
      {touch && play && myStatus !== 'out' && !chore && <Joystick into={joy} />}
      {chore && <div className="cc-modal"><Chore spot={chore} onDone={choreDone} onClose={() => { setChore(null); live.current.busy = false }} /></div>}

      {/* the map (and the Nibblers' sabotage map) */}
      {play && (mapOpen || sabOpen) && <MapView v={v} me={me} mine={mine} at={myPos.current} sab={sabOpen} sabWait={ctx.sabWait} onSab={sabotage} onClose={() => { setMapOpen(false); setSabOpen(false) }} />}

      {/* ghost note, how to play */}
      {play && ghostMe && <div className="cc-ghostnote">👻 You're a ghost: walk through walls, finish your tasks. Only other ghosts can hear you.</div>}
      {howto && play && <HowTo nib={nibMe} onClose={() => { setHowto(false); try { localStorage.setItem(HOWTO_KEY, '1') } catch { /* private mode */ } }} />}
      {howto && !play && <HowTo nib={nibMe} onClose={() => setHowto(false)} />}

      {/* splashes and screens */}
      {smashedAt > 0 && tNow - smashedAt < 2600 && <div className="cc-splash kill"><div className="cc-splash-tv"><i /></div><h1>SMASHED!</h1><p>A Nibbler got you. You're a ghost now.</p></div>}
      {v.phase === 'apron' && <RoleReveal v={v} me={me} nm={nm} who={who} since={since} />}
      {(v.phase === 'talk' || v.phase === 'vote' || (v.phase === 'reveal' && since < 3200)) &&
        <Meeting v={v} me={me} nm={nm} who={who} send={send} t={t} left={left} since={since} emotes={emotes} net={net} />}
      {(v.phase === 'talk' && since < 2600) && <MeetingSplash v={v} nm={nm} who={who} />}
      {v.phase === 'reveal' && since >= 3200 && v.reveal && <Ejection v={v} me={me} nm={nm} since={since - 3200} />}
      {v.phase === 'end' && <EndScreen v={v} me={me} nm={nm} who={who} />}
    </div>
  )
}

// "Shhh…", then your role, big. Bakers see everyone (one of them is a Nibbler); Nibblers see their fellow Nibblers.
function RoleReveal({ v, me, nm, who, since }) {
  const mine = v.me
  if (since < 1500 || !mine) return (
    <div className="cc-screen reveal"><div className="cc-shh">{mine ? 'Shhh…' : 'The night shift is starting…'}</div></div>
  )
  const nib = mine.role === 'nibbler'
  const crew = nib ? [me, ...(mine.mates || [])] : [me, ...v.players.filter(x => x !== me)]
  return (
    <div className={`cc-screen reveal ${nib ? 'nib' : 'baker'}`}>
      <div className="cc-role-k">You are a</div>
      <h1 className="cc-role">{nib ? 'Nibbler' : 'Baker'}</h1>
      <div className="cc-role-sub">{nib ? '(the impostor)' : '(the crew)'}</div>
      <p className="cc-role-line">{nib
        ? <>Smash bakers' TVs when nobody's looking, sabotage, and hop through crumb chutes. Fake your tasks. Don't get voted out!</>
        : <>There {v.nibblers === 1 ? 'is' : 'are'} <b>{plural(v.nibblers, 'Nibbler', 'Nibblers')}</b> hiding among the bakers. Do your tasks, report smashed TVs, and vote the Nibblers onto the night tram.</>}</p>
      <div className="cc-lineup">{crew.map((pid, i) => <div key={pid} className={`cc-lineup-p${i === 0 ? ' me' : ''}`} style={{ '--i': i }}><TvCard who={who(pid)} size={i === 0 ? 108 : 74} /><span className={nib ? 'red' : ''}>{nm(pid)}</span></div>)}</div>
    </div>
  )
}

function MeetingSplash({ v, nm, who }) {
  const body = v.meeting?.why === 'nap'
  return (
    <div className={`cc-splash meet ${body ? 'body' : 'bell'}`}>
      {body ? <TvCard who={who(v.meeting.found)} size={120} dead /> : <div className="cc-splash-bell">🔔</div>}
      <h1>{body ? 'SMASHED TV REPORTED' : 'EMERGENCY MEETING'}</h1>
      <p>{body ? `${nm(v.meeting.by)} found ${nm(v.meeting.found)} in the ${roomName(v.meeting.room)}` : `${nm(v.meeting?.by)} rang the tea bell`}</p>
    </div>
  )
}

// The meeting: a grid of player cards. Talk first, then vote (tap a card, confirm ✓), or Skip Vote. "I voted"
// stamps show who's voted, never for whom, until the votes are counted.
function Meeting({ v, me, nm, who, send, t, left, since, emotes, net }) {
  const [pick, setPick] = useState(null)
  const results = v.phase === 'reveal'
  const talk = v.phase === 'talk', voting = v.phase === 'vote'
  const myUp = v.status[me] === 'awake'
  const votes = results ? v.reveal?.votes || {} : null
  const voted = results ? Object.keys(votes) : v.voted || []
  const iVoted = voted.includes(me)
  const canVote = voting && myUp && !iVoted
  const bots = v.players.some(isBot)
  useEffect(() => { if (!canVote) setPick(null) }, [canVote])
  const vote = target => { send({ type: 'vote', target }); setPick(null); sfx('vote') }
  const order = [...v.players.filter(x => v.status[x] === 'awake'), ...v.players.filter(x => v.status[x] !== 'awake')]
  // Chitbots' lines, one every couple of seconds, like a chat log.
  const lines = v.players.filter(x => v.lines?.[x]).slice(0, Math.max(0, Math.floor((since - 1800) / 2200) + 1))
  const pointsAt = pid => Object.values(v.points || {}).filter(x => x === pid).length
  return (
    <div className="cc-screen meeting">
      <div className="cc-meet">
        <div className="cc-meet-head">
          <h2>Who is the Nibbler?</h2>
          <div className={`cc-meet-timer${voting && left < 10000 ? ' low' : ''}`}>
            {results ? 'Votes are in!' : talk ? <>Discuss! Voting begins in <b>{secs(left)}</b></> : <>Voting ends in <b>{secs(left)}</b></>}
          </div>
        </div>
        <div className="cc-meet-why">{v.meeting?.why === 'nap' ? `📢 ${nm(v.meeting.by)} reported ${nm(v.meeting.found)}'s smashed TV in the ${roomName(v.meeting.room)}` : `🔔 ${nm(v.meeting?.by)} called an emergency meeting`}</div>
        <div className="cc-cards">
          {order.map(pid => {
            const st = v.status[pid], up = st === 'awake'
            const e = emotes[pid] && performance.now() - emotes[pid].t < 2600 ? emotes[pid].e : null
            const mates = v.me?.mates?.includes(pid) || (pid === me && v.me?.role === 'nibbler')
            return (
              <div key={pid} className={`cc-pcard${up ? '' : ' dead'}${pick === pid ? ' picked' : ''}${canVote && up ? ' votable' : ''}`}
                onClick={() => { if (canVote && up) setPick(pid) }} role={canVote && up ? 'button' : undefined} tabIndex={canVote && up ? 0 : undefined}
                onKeyDown={ev => { if (ev.key === 'Enter' && canVote && up) setPick(pid) }}>
                <TvCard who={who(pid)} size={52} dead={!up} />
                <div className="cc-pcard-name">
                  <span className={mates ? 'red' : ''}>{nm(pid)}</span>
                  {isBot(pid) && <b className="cc-bot">BOT</b>}
                  {v.meeting?.by === pid && <span title="Called this meeting"> 📢</span>}
                  {!up && <small>{st === 'home' ? 'ejected' : 'smashed'}</small>}
                </div>
                {!results && voted.includes(pid) && <span className="cc-voted">I VOTED</span>}
                {pointsAt(pid) > 0 && !results && <span className="cc-points" title="Pointed at">👉{pointsAt(pid)}</span>}
                {e && <span className="cc-pcard-emote">{e}</span>}
                {results && <div className="cc-chips">{Object.entries(votes).filter(([, x]) => x === pid).map(([from]) => <TvCard key={from} who={who(from)} size={22} />)}</div>}
                {pick === pid && <div className="cc-confirm" onClick={ev => ev.stopPropagation()}>
                  <button className="yes" onClick={() => vote(pid)} aria-label={`Vote for ${nm(pid)}`}>✓</button>
                  <button className="no" onClick={() => setPick(null)} aria-label="Cancel">✗</button>
                </div>}
                {bots && myUp && up && pid !== me && !results && <button className={`cc-point${v.points?.[me] === pid ? ' on' : ''}`} title="Chitbots can't hear voice: point at who you suspect"
                  onClick={ev => { ev.stopPropagation(); send({ type: 'point', target: v.points?.[me] === pid ? null : pid }) }}>👉</button>}
              </div>
            )
          })}
        </div>
        <div className="cc-meet-foot">
          {results
            ? <div className="cc-skipped">Skipped: {Object.entries(votes).filter(([, x]) => x === 'skip').map(([from]) => <TvCard key={from} who={who(from)} size={22} />)}</div>
            : myUp ? (pick === 'skip'
              ? <span className="cc-confirm inline"><button className="yes" onClick={() => vote('skip')}>✓ Skip</button><button className="no" onClick={() => setPick(null)}>✗</button></span>
              : <button className="cc-skip" disabled={!canVote} onClick={() => setPick('skip')}>SKIP VOTE</button>)
              : <span className="cc-muted">👻 You're a ghost: watch quietly, the living can't hear you.</span>}
          <span className="cc-muted">{talk && myUp ? 'Talk it out: voting opens when the timer runs out.' : voting ? `${voted.length} of ${v.players.filter(x => v.status[x] === 'awake').length} have voted${iVoted ? ' · yours is in' : canVote ? ' · tap a card to vote' : ''}` : ''}</span>
          {myUp && !results && <span className="cc-emotes">{EMOTES.map((e, i) => <button key={e} className="cc-btn emote" onClick={() => net.emote(e)} title={`${i + 1}`}>{e}</button>)}</span>}
        </div>
      </div>
      {lines.length > 0 && <div className="cc-chat">
        <div className="cc-chat-h">Chitbots say</div>
        {lines.map(pid => <div key={pid} className="cc-chat-line"><TvCard who={who(pid)} size={28} /><div><b>{nm(pid)}</b>{lineText(v.lines[pid], nm)}</div></div>)}
      </div>}
    </div>
  )
}

// "Doodle was not a Nibbler. 1 Nibbler remains." typed out over the night tram.
function Ejection({ v, me, nm, since }) {
  const r = v.reveal
  const name = r.pid === me ? 'You' : nm(r.pid)
  const line = r.pid
    ? r.role == null ? `${name} ${r.pid === me ? 'were' : 'was'} ejected.` : `${name} ${r.pid === me ? 'were' : 'was'} ${r.role === 'nibbler' ? '' : 'not '}a Nibbler.`
    : `No one was ejected. (${r.why === 'tie' ? 'Tie' : 'Skipped'})`
  const shown = line.slice(0, Math.floor(since / 45))
  return (
    <div className="cc-screen eject">
      <div className="cc-eject-line">{shown}<i className="cc-caret" /></div>
      {r.left != null && shown.length === line.length && <div className="cc-eject-sub">{remains(r.left)}</div>}
    </div>
  )
}

function EndScreen({ v, me, nm, who }) {
  const won = v.winners?.includes(me), playing = v.players.includes(me)
  const bakers = v.winner === 'bakers'
  return (
    <div className={`cc-screen end ${bakers ? 'baker' : 'nib'}`}>
      <h1 className={`cc-end-title ${playing ? (won ? 'win' : 'lose') : ''}`}>{playing ? (won ? 'VICTORY' : 'DEFEAT') : bakers ? 'BAKERS WIN' : 'NIBBLERS WIN'}</h1>
      <div className="cc-end-why">{bakers ? 'Bakers win! ' : 'Nibblers win! '}{WHY[v.why] || ''}</div>
      <div className="cc-lineup">{(v.winners || []).map((pid, i) => <div key={pid} className="cc-lineup-p" style={{ '--i': i }}><TvCard who={who(pid)} size={78} dead={v.status[pid] !== 'awake'} /><span>{nm(pid)}</span></div>)}</div>
      <div className="cc-end-roles">{v.players.map(pid => <span key={pid} className={v.roles?.[pid] === 'nibbler' ? 'nib' : ''}>{nm(pid)}: {v.roles?.[pid] === 'nibbler' ? 'Nibbler' : 'Baker'}</span>)}</div>
    </div>
  )
}

function HowTo({ nib, onClose }) {
  return (
    <div className="cc-howto" role="dialog" aria-label="How to play">
      <h3>How to play Midnight Chitchen</h3>
      <ol>
        <li><b>Bakers</b> (the crew): do the tasks on your list (walk to the gold sparkles, press <kbd>E</kbd>). Fill the task bar to win.</li>
        <li><b>Nibblers</b> (the impostors): smash bakers' TVs (<kbd>Q</kbd>) when nobody's looking, sabotage (<kbd>F</kbd>), hop through chutes (<kbd>V</kbd>).</li>
        <li>Find a smashed TV? <b>Report</b> it (<kbd>R</kbd>). Suspicious? Ring the <b>emergency bell</b> on the kitchen table (<kbd>B</kbd>).</li>
        <li>In the meeting, talk, then <b>vote</b>. Most votes rides the night tram. Catch every Nibbler to win!</li>
      </ol>
      <p className="cc-muted">You can only see what's in your TV's light. Smashed players become ghosts: they finish tasks, but the living can't hear them.{nib ? ' You see a little further than the bakers, even in the dark.' : ''}</p>
      <button className="cc-btn big" onClick={onClose}>Got it</button>
    </div>
  )
}

// The map: rooms, your tasks, sabotage to fix. For Nibblers in sabotage mode, a button on each room's sabotage.
function MapView({ v, me, mine, at, sab, sabWait, onSab, onClose }) {
  const mi = v.mischief
  return (
    <div className="cc-mapwrap" onClick={onClose}>
      <div className={`cc-map${sab ? ' sab' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="cc-map-h">{sab ? <>Sabotage {sabWait > 0 ? `· ready in ${secs(sabWait)}` : sabWait < 0 ? '· one is already running' : ''}</> : 'The Chitchen'}<button className="cc-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="cc-map-box">
          <svg viewBox="-0.5 -0.5 37 25" width="100%">
            {ROOMS.map(r => <g key={r.id}><rect x={r.x} y={r.y} width={r.w} height={r.h} className={`cc-map-room r-${r.id}`} /><text x={r.x + r.w / 2} y={r.y + 1.9}>{r.name}</text></g>)}
            {mine && !sab && mine.chores.filter(id => !mine.done.includes(id)).map(id => { const s = spot(id); return <text key={id} x={s.x} y={s.y + 0.6} className="cc-map-task">!</text> })}
            {mi?.kind === 'candles' && <circle cx={FIX.fuse.x} cy={FIX.fuse.y} r="0.9" className="cc-map-fix" />}
            {mi?.kind === 'boil' && ['dialA', 'dialB'].filter(d => !mi.dials[d]).map(d => <circle key={d} cx={FIX[d].x} cy={FIX[d].y} r="0.9" className="cc-map-fix" />)}
            {mine?.role === 'nibbler' && VENTS.map(x => <rect key={x.id} x={x.x - 0.5} y={x.y - 0.35} width="1" height="0.7" className="cc-map-vent" />)}
            <circle cx={FIX.bell.x} cy={FIX.bell.y} r="0.7" className="cc-map-bell" />
            {v.status[me] && <circle cx={at[0]} cy={at[1]} r="0.8" className="cc-map-me" />}
          </svg>
          {sab && MISCHIEF.map(k => { const r = roomOf(SAB[k].where); return (
            <button key={k} className="cc-sab" disabled={sabWait !== 0} style={{ left: `${((r.x + r.w / 2 + 0.5) / 37) * 100}%`, top: `${((r.y + r.h / 2 + 1.2) / 25) * 100}%` }} onClick={() => onSab(k)} title={SAB[k].tip}>
              <span>{SAB[k].icon}</span>{SAB[k].name}
            </button>) })}
        </div>
        {!sab && <div className="cc-map-legend"><span><i className="t" />your tasks</span><span><i className="b" />emergency bell</span>{mi && <span><i className="f" />fix the sabotage</span>}</div>}
      </div>
    </div>
  )
}

// Floating joystick for touch: drag anywhere in the bottom-left zone.
function Joystick({ into }) {
  const [knob, setKnob] = useState(null)
  const origin = useRef(null)
  const move = e => {
    if (!origin.current) return
    const dx = e.clientX - origin.current[0], dy = e.clientY - origin.current[1], r = 46, d = Math.hypot(dx, dy), k = d > r ? r / d : 1
    into.current = [(dx * k) / r, (dy * k) / r]
    setKnob([origin.current[0], origin.current[1], dx * k, dy * k])
  }
  const end = () => { origin.current = null; into.current = [0, 0]; setKnob(null) }
  return (
    <div className="cc-joy-zone" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); origin.current = [e.clientX, e.clientY]; move(e) }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {knob ? <div className="cc-joy" style={{ left: knob[0], top: knob[1] }}><i style={{ transform: `translate(${knob[2]}px, ${knob[3]}px)` }} /></div>
        : <div className="cc-joy idle"><i /></div>}
    </div>
  )
}
