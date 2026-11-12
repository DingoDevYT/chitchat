// Midnight Chitchen, the client: a cozy 3D bakery with everyone as a TV-head whose screen is their live PNGtuber.
// You walk yourself (keys or the touch joystick, with wall collisions) and broadcast where you are (net.js);
// everyone else is interpolated, Chitbots follow the referee's walk plans. Moves go to the referee only when they
// matter (chores, tuck-ins, reports, the bell, fixes, votes), carrying your position for its range checks.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFace } from '../../Avatar'
import { botChar, botUrl } from '../bots.js'
import { THREE, tvHead, bakery, ring, choreMarker, stools, cup, tramStop, TRAM } from './world.js'
import { drawScreen } from './screen.js'
import { SPOTS, FIX, ROOMS, TABLE, spot, dist, seatPos, room as roomOf } from './map.js'
import { step, canSeeAt, hear, SEE } from './space.js'
import { posOf, TUCK, CHECK, USE, REPORT, MISCHIEF, BELLS, MIN_CHORE } from './rules.js'
import { createNet } from './net.js'
import { setProximity } from '../../lib/proximity'
import { Chore } from './chores.jsx'
import './chitchen.css'

const isBot = pid => pid.startsWith('bot:')
const SCREEN_BG = ['#f6c9a0', '#f19c9c', '#9cc79a', '#b9a0e0', '#7f9fd0', '#f2c98a', '#8fc9c0', '#ea8a96']
const MISCHIEF_NAMES = { candles: 'Candles out', flour: 'Flour storm', boil: 'Oven boiling over', jam: 'Pantry jam' }
const EMOTES = ['Hmm…', 'Not me!', 'I saw!', 'Sus crumbs']
const roomName = id => roomOf(id)?.name || 'the bakery'
export function lineText(l, nm) {
  if (!l) return ''
  if (l.k === 'saw') return `I saw ${nm(l.pid)} tuck someone in!`
  if (l.k === 'near') return `${nm(l.pid)} was near the ${roomName(l.room)}…`
  if (l.k === 'did') return l.chore ? `I was doing "${spot(l.chore)?.name}" in the ${roomName(l.room)}!` : `I was busy in the ${roomName(l.room)}!`
  return 'Hmm… I didn\'t see anything.'
}
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// Reads a person's live face (talking, blinking, expressions) into a shared ref for the 3D loop.
function FaceFeed({ pid, uid, into }) {
  const f = useFace(uid, 'stage')
  const src = f.expr?.src || null, color = f.p?.color || '#f4a261'
  useEffect(() => { into.current[pid] = { src, talk: f.talk, color } }, [pid, src, f.talk, color, into])
  return null
}

export default function Chitchen({ v, me, nm, act, people, tools, gameId }) {
  const mount = useRef(), vRef = useRef(v), faces = useRef({}), live = useRef({})
  vRef.current = v
  const mine = v.me
  const inGame = v.players.includes(me)
  const [chore, setChore] = useState(null)
  const [ctx, setCtx] = useState({}) // context buttons, tags, wisps (refreshed ~6×/s)
  const [mapOpen, setMapOpen] = useState(() => typeof matchMedia !== 'undefined' && !matchMedia('(pointer: coarse)').matches)
  const [pocket, setPocket] = useState(false)
  const [point, setPoint] = useState(false)
  const [emotes, setEmotes] = useState({})
  const touch = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches, [])
  const joy = useRef([0, 0]), keys = useRef(new Set())
  const send = useCallback(m => act('move', { move: m }), [act])

  // Game time on this client: the referee's clock at the last update, plus time since we got it.
  const recv = useRef({ clock: v.clock, at: performance.now() })
  if (recv.current.clock !== v.clock) recv.current = { clock: v.clock, at: performance.now() }
  const now = () => recv.current.clock + (performance.now() - recv.current.at)

  // Where I am. Reset to my seat whenever a night shift starts.
  const myPos = useRef(v.seats[me] ? [...v.seats[me]] : [18, 18])
  const lastPhase = useRef(v.phase)
  useEffect(() => {
    if (v.phase === 'play' && lastPhase.current !== 'play' && v.seats[me]) myPos.current = [...v.seats[me]]
    lastPhase.current = v.phase
    if (v.phase !== 'play') { setChore(null); setPocket(false) }
    if (v.phase !== 'talk' && v.phase !== 'vote') setPoint(false)
  }, [v.phase, v.seats, me])

  const net = useMemo(() => createNet(gameId, me, { onEmote: (pid, e) => setEmotes(x => ({ ...x, [pid]: { e, t: performance.now() } })) }), [gameId, me])
  useEffect(() => () => net.stop(), [net])

  // Proximity voice: on while I'm playing; off when this screen goes.
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
      if (k === 'e') live.current.use?.(); if (k === 'r') live.current.report?.(); if (k === 'b') live.current.bell?.()
      if (k === 'q') live.current.tuck?.(); if (k === 'f') setPocket(p => !p); if (k === 'm') setMapOpen(m => !m)
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
    const scene = new THREE.Scene(), bg = new THREE.Color('#1d1830')
    scene.background = bg
    scene.fog = new THREE.FogExp2('#e9dcc8', 0)
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    const hemi = new THREE.HemisphereLight('#7a7fc0', '#6a4a34', 1.5); scene.add(hemi)
    const amb = new THREE.AmbientLight('#ffe6cc', 0.55); scene.add(amb)
    const moon = new THREE.DirectionalLight('#b9c2f2', 0.7); moon.position.set(8, 20, 30); scene.add(moon)
    const lamp = new THREE.PointLight('#ffc98a', 18, 9, 1.5); scene.add(lamp)
    const oven = new THREE.PointLight('#ff8a3a', 12, 7, 1.6); oven.position.set(FIX.dialA.x, 1.2, 14.3); scene.add(oven)
    const warm = [[6, 5], [18, 5], [30, 5], [6, 17], [30, 17]].map(([x, z]) => { const L = new THREE.PointLight('#ffb45a', 14, 11, 1.4); L.position.set(x, 2.2, z); scene.add(L); return L })
    const glows = Array.from({ length: 4 }, () => { const L = new THREE.PointLight('#ffe6f2', 0, 6, 1.4); scene.add(L); return L })
    const world = bakery(); scene.add(world.group)
    const flameMat = world.flames[0]?.material
    const tram = tramStop(); tram.group.visible = false; scene.add(tram.group)
    const seatsG = stools(); scene.add(seatsG)
    const cups = new THREE.Group(); scene.add(cups)
    const markers = new Map() // spot id → marker
    for (const s of SPOTS) { const m = choreMarker(s.x, s.y); m.visible = false; scene.add(m); markers.set(s.id, m) }
    const fixMarks = Object.fromEntries(['fuse', 'dialA', 'dialB'].map(k => { const m = choreMarker(FIX[k].x, FIX[k].y); m.children[0].material = m.children[0].material.clone(); m.children[0].material.color.set('#ff7a7a'); m.visible = false; scene.add(m); return [k, m] }))
    const myRing = ring('#ffcf8a', 1.6, 0.3); scene.add(myRing)

    // People: one TV-head each (look from seat order), plus a slumped "body" for anyone napping where they fell.
    const vp = vRef.current
    const avatars = new Map(), bodies = new Map()
    vp.players.forEach((pid, i) => {
      const a = tvHead(i); a.seat = i; a.key = ''; a.phase = 0; a.prev = null
      a.talkRing = ring('#7fe0bf', 0.75); a.group.add(a.talkRing); a.talkRing.visible = false
      scene.add(a.group); avatars.set(pid, a)
    })
    const bodyOf = pid => {
      if (!bodies.has(pid)) { const b = tvHead(vp.players.indexOf(pid)); b.pose('slump'); b.broken(true); b.key = ''; scene.add(b.group); bodies.set(pid, b) }
      return bodies.get(pid)
    }
    const seatOf = pid => people.find(p => p.pid === pid)?.seat ?? vp.players.indexOf(pid)
    const levelOf = pid => people.find(p => p.pid === pid)?.bot || 'normal'
    const faceOf = (pid, t, V) => {
      if (!isBot(pid)) return faces.current[pid] || { src: null, talk: false, color: '#f4a261' }
      const c = botChar(levelOf(pid), seatOf(pid))
      // Chitbots "speak" their Tea Break line, one after another, mouths flapping.
      const k = V.players.filter(x => V.lines?.[x]).indexOf(pid)
      const since = V.phase === 'talk' && V.meetingStart != null ? t - V.meetingStart : -1
      const talk = k >= 0 && since > k * 2600 && since < k * 2600 + 2200 && Math.floor(t / 140) % 2 === 0
      return { src: botUrl(c, talk), talk, color: c.color }
    }
    const paint = (a, f, state, seat) => {
      const key = `${f.src}|${f.talk}|${state}|${f.color}`
      if (a.key === key) return
      a.key = key
      drawScreen(a.canvas, { src: f.src, color: f.color, talk: f.talk, state, bg: SCREEN_BG[seat % 8] }, () => { a.key = ''; })
      a.tex.needsUpdate = true
    }

    let raf = 0, lastT = performance.now(), meetStart = null, lastHere = 0, lastPhaseLocal = null, revealStart = 0
    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix() }
    const ro = new ResizeObserver(size); ro.observe(el); size()
    const camTo = new THREE.Vector3(), lookTo = new THREE.Vector3(), look = new THREE.Vector3(18, 0, 14)
    cam.position.set(18, 14, 26)

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const tNow = performance.now(), dt = Math.min(0.05, (tNow - lastT) / 1000); lastT = tNow
      const V = vRef.current, t = now(), phase = V.phase
      if (phase !== lastPhaseLocal) { if (phase === 'talk') { meetStart = t; live.current.meetStart = t } if (phase === 'reveal') revealStart = tNow; lastPhaseLocal = phase }
      const Vx = { ...V, meetingStart: meetStart }
      const myStatus = V.status[me] ?? 'out'
      const dark = V.mischief?.kind === 'candles', flour = V.mischief?.kind === 'flour', jam = V.mischief?.kind === 'jam'
      const portrait = cam.aspect < 0.8

      // Walk.
      if (phase === 'play' && (myStatus === 'awake' || myStatus === 'nap') && !live.current.busy) {
        const k = keys.current
        let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + joy.current[0]
        let iy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + joy.current[1]
        if (ix || iy) {
          myPos.current = step(myPos.current, ix, iy, dt, jam)
          live.current.face = Math.atan2(ix, iy)
        }
        net.send(myPos.current[0], myPos.current[1], live.current.face || 0)
      }

      // Everyone's position this frame.
      const pos = {}
      V.players.forEach((pid, i) => {
        if (phase === 'play') pos[pid] = pid === me ? myPos.current : V.bots[pid] ? posOf(V, pid, t) : (() => { const s = net.at(pid); return s ? [s.x, s.y] : posOf(V, pid) })()
        else pos[pid] = V.seats[pid] || seatPos(i, V.players.length)
      })
      posMap.current = pos
      const me2 = pos[me]

      // Tea Break seating: the awake round the back of the table, so every screen faces the room.
      const sitting = phase === 'talk' || phase === 'vote'
      const atTable = sitting ? V.players.filter(x => V.status[x] === 'awake') : phase === 'apron' || phase === 'end' ? V.players.filter(x => V.status[x] !== 'home') : []
      const teaSeat = {}
      atTable.forEach((pid, i) => {
        const n = atTable.length, a = Math.PI * (1.08 + (0.84 * i) / Math.max(1, n - 1))
        teaSeat[pid] = [TABLE.x + 2.55 * Math.cos(a), TABLE.y + 2.55 * Math.sin(a) * 0.85 + 0.2]
      })
      seatsG.children.forEach((s, i) => { const pid = atTable[i]; s.visible = sitting && !!teaSeat[pid]; if (teaSeat[pid]) s.position.set(teaSeat[pid][0], 0.22, teaSeat[pid][1]) })

      // Draw each person.
      let glowN = 0
      for (const [pid, a] of avatars) {
        const st = V.status[pid], seat = a.seat
        const f = faceOf(pid, t, Vx)
        let show = st !== 'home', mode = 'stand', at = pos[pid], screen = 'live', yaw = 0
        if (phase === 'play') {
          if (st === 'nap') { show = myStatus === 'nap' || myStatus === 'home' || myStatus === 'out'; screen = 'broken' }
          if (show && pid !== me && me2 && myStatus !== 'home' && myStatus !== 'out') {
            const d = dist(me2, at), walled = !canSeeAt(me2, at, false, jam)
            show = !walled && d <= (dark ? (f.talk ? SEE : 3.2) : SEE)
          }
          if (dark && !f.talk && pid !== me && screen === 'live') screen = 'standby'
        } else if (phase === 'talk' || phase === 'vote') {
          show = !!teaSeat[pid]; mode = 'sit'; at = teaSeat[pid] || at
          yaw = at ? Math.atan2(TABLE.x - at[0], TABLE.y + 6 - at[1]) : 0
          if (st === 'nap') screen = 'broken'
        } else if (phase === 'reveal') {
          show = V.reveal?.pid === pid
          if (show) {
            const k = Math.min(1, (tNow - revealStart) / 5200)
            at = [TRAM.x - 5 + k * 7.1, TRAM.z + 2 - k * 1.0]; mode = k < 1 ? 'walk' : 'stand'; yaw = 0.55 // three-quarters to the camera, walking right
            if (V.reveal.role === 'nibbler') screen = 'mask'
          }
        } else { at = teaSeat[pid] || at; mode = 'stand'; yaw = at ? Math.atan2(TABLE.x - at[0], TABLE.y + 6 - at[1]) : 0; if (st === 'nap') screen = 'broken' }
        a.group.visible = !!(show && at)
        if (!a.group.visible) { a.prev = null; continue }
        // walking animation from how far they moved
        const moved = a.prev ? dist(a.prev, at) : 0
        const speed = moved / Math.max(dt, 1e-3)
        if (phase === 'play') {
          if (moved > 0.004) { yaw = Math.atan2(at[0] - a.prev[0], at[1] - a.prev[1]); a.yaw = yaw } else yaw = a.yaw ?? 0
          a.phase += Math.min(speed, 4) * dt * 3.2
          a.pose(moved > 0.004 ? 'walk' : 'stand', a.phase, Math.min(1, speed / 2.5))
        } else if (mode === 'walk') { a.phase += dt * 9; a.pose('walk', a.phase, 1) } else a.pose(mode, 0, 0)
        a.prev = [...at]
        a.group.position.set(at[0], phase === 'talk' || phase === 'vote' ? 0.3 : phase === 'reveal' ? 0.35 : 0, at[1])
        a.group.rotation.y = yaw
        a.broken(screen === 'broken')
        a.frame.visible = f.talk && screen !== 'standby'
        a.talkRing.visible = f.talk && phase === 'play'
        paint(a, f, screen, seat)
        if (dark && f.talk && glowN < glows.length) { glows[glowN].position.set(at[0], 1.9, at[1] + 0.8); glows[glowN].intensity = 10; glowN++ }
        live.current.talking ||= {}; live.current.talking[pid] = f.talk
      }
      for (let i = glowN; i < glows.length; i++) glows[i].intensity = 0

      // Bodies where people were tucked in (until a Tea Break finds them).
      for (const [pid, n] of Object.entries(V.naps || {})) {
        const b = bodyOf(pid)
        b.group.visible = phase === 'play' && !n.found && (!me2 || myStatus === 'out' || myStatus === 'home' || canSeeAt(me2, [n.x, n.y], dark, jam))
        b.group.position.set(n.x, 0, n.y)
        paint(b, faceOf(pid, t, Vx), 'broken', vp.players.indexOf(pid))
      }
      for (const [pid, b] of bodies) if (!V.naps?.[pid]) b.group.visible = false

      // Chore spots (mine, not done), fix spots during mischief.
      for (const [id, m] of markers) { m.visible = phase === 'play' && !!mine?.chores.includes(id) && !mine.done.includes(id); if (m.visible) m.userData.spark.position.y = 1.7 + Math.sin(tNow / 300) * 0.08 }
      for (const [k, m] of Object.entries(fixMarks)) m.visible = phase === 'play' && ((k === 'fuse' && dark) || (k !== 'fuse' && V.mischief?.kind === 'boil' && !V.mischief.dials?.[k]))

      // Tea Break cups: a teaspoon per vote in front of each seat; the sugar bowl takes skips.
      if (phase === 'talk' || phase === 'vote') {
        const key = JSON.stringify(V.votes) + atTable.join()
        if (cups.userData.key !== key) {
          cups.userData.key = key; cups.clear()
          const count = {}; for (const x of Object.values(V.votes)) count[x] = (count[x] || 0) + 1
          for (const pid of atTable) { const s = teaSeat[pid]; const c = cup(count[pid] || 0); c.position.set(s[0] + (TABLE.x - s[0]) * 0.33, 0.93, s[1] + (TABLE.y - s[1]) * 0.33); cups.add(c) }
          const bowl = cup(count.skip || 0); bowl.scale.set(1.6, 1, 1.6); bowl.position.set(TABLE.x + 0.5, 0.93, TABLE.y + 0.6); cups.add(bowl)
        }
        cups.visible = true
      } else cups.visible = false

      // Light and weather.
      const dim = dark && phase === 'play'
      hemi.intensity += ((dim ? 0.18 : 1.5) - hemi.intensity) * 0.1; amb.intensity = dim ? 0.04 : 0.55
      moon.intensity = dim ? 0.15 : phase === 'reveal' ? 1 : 0.7
      for (const L of warm) L.intensity = dim || phase === 'reveal' ? 0 : 14
      oven.intensity = phase === 'reveal' ? 0 : dim ? 3 : 12
      if (flameMat) flameMat.emissiveIntensity = dim ? 0 : 2.5
      world.jamDoors.visible = jam && phase === 'play'
      scene.fog.density += ((flour && phase === 'play' ? 0.07 : 0) - scene.fog.density) * 0.05
      bg.set(phase === 'reveal' ? '#141433' : dim ? '#07060f' : '#1d1830')
      tram.group.visible = phase === 'reveal'
      myRing.visible = phase === 'play' && !!me2 && myStatus !== 'home' && myStatus !== 'out'
      if (me2) { myRing.position.set(me2[0], 0.025, me2[1]); lamp.position.set(me2[0], 2.6, me2[1]); lamp.intensity = phase === 'play' ? (dim ? 6 : 18) : 0; lamp.distance = dim ? 3.6 : 9 }

      // Camera: a tilted follow cam on the night shift; the table for Tea Breaks, the start and the end; the tram.
      const follow = phase === 'play' && me2 && myStatus !== 'home' && myStatus !== 'out'
      if (follow) { lookTo.set(me2[0], 0, me2[1]); camTo.copy(lookTo).add(portrait ? new THREE.Vector3(0, 9.5, 8.2) : new THREE.Vector3(0, 10.5, 10.8)) }
      else if (phase === 'play') { lookTo.set(18, 0, 12); camTo.set(18, portrait ? 44 : 30, portrait ? 30 : 30) }
      else if (phase === 'reveal') { lookTo.set(TRAM.x + 0.6, 1.4, TRAM.z); camTo.set(TRAM.x + 1.2, portrait ? 4.5 : 3.4, TRAM.z + (portrait ? 17 : 13)) }
      else { lookTo.set(TABLE.x, 1.05, TABLE.y - 0.4); camTo.set(TABLE.x, portrait ? 6.4 : 4.6, TABLE.y + (portrait ? 8.6 : 7.4)) }
      cam.fov = portrait ? 52 : 40; cam.updateProjectionMatrix()
      const jump = cam.position.distanceTo(camTo) > 25
      cam.position.lerp(camTo, jump ? 1 : 1 - Math.pow(0.002, dt)); look.lerp(lookTo, jump ? 1 : 1 - Math.pow(0.002, dt)); cam.lookAt(look)
      renderer.render(scene, cam)

      // Tell the referee where I am when a Chitbot is close (so bots can range-check me), at most every 4 s.
      if (phase === 'play' && me2 && (myStatus === 'awake' || myStatus === 'nap') && tNow - lastHere > 4000 && V.players.some(b => V.bots[b] && V.status[b] !== 'home' && dist(posOf(V, b, t), me2) < 3)) {
        lastHere = tNow; live.current.sendHere?.()
      }
      live.current.cam = cam; live.current.pos = pos; live.current.teaSeat = teaSeat; live.current.size = [el.clientWidth, el.clientHeight]; live.current.t = t
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- context: buttons, name tags, chatter wisps (a few times a second, not every frame) ------------------
  useEffect(() => {
    const tick = () => {
      const V = vRef.current, L = live.current, cam = L.cam, pos = L.pos
      if (!cam || !pos) return
      const t = now(), me2 = myPos.current, st = V.status[me] ?? 'out', up = st === 'awake', play = V.phase === 'play'
      const m = V.me
      const c = {}
      if (play && m && (up || st === 'nap')) {
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
          if ((V.bells[me] || 0) < BELLS && dist(me2, [FIX.bell.x, FIX.bell.y]) <= USE + 0.8 && mi?.kind !== 'boil') c.bell = t >= V.bellReady ? 'ok' : 'wait'
        }
        if (up && m.role === 'nibbler') {
          c.nibbler = true
          c.tuckWait = Math.max(0, m.ready - t)
          let best = null
          for (const pid of V.players) {
            if (pid === me || V.status[pid] !== 'awake' || m.mates?.includes(pid) || !pos[pid]) continue
            const d = dist(me2, pos[pid])
            if (d <= TUCK * CHECK - 0.3 && (!best || d < best.d)) best = { pid, d }
          }
          if (best) c.tuck = best.pid
          c.mischiefWait = V.mischief ? -1 : Math.max(0, V.mischiefReady - t)
        }
      }
      // name tags above heads (projected), and chatter wisps for talkers you can hear but not see
      const [w, h] = L.size || [1, 1], tags = [], wisps = []
      const proj = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(cam); return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h, p.z < 1] }
      const meet = ['talk', 'vote', 'apron', 'end'].includes(V.phase)
      V.players.forEach(pid => {
        const at = meet ? L.teaSeat?.[pid] : pos[pid]
        if (!at) return
        const visible = meet ? true : V.phase === 'play' && (pid === me || (V.status[pid] !== 'home' && (V.status[pid] !== 'nap' || st === 'nap') && canSeeAt(me2, at, false, V.mischief?.kind === 'jam') && dist(me2, at) <= (V.mischief?.kind === 'candles' ? (L.talking?.[pid] ? SEE : 3.2) : SEE)))
        if (visible) { const [x, y, ok] = proj(at[0], meet ? 2.05 : 2.35, at[1]); if (ok) tags.push({ pid, x, y }) }
        else if (play && L.talking?.[pid] && pid !== me && hear(V, me, pid, pos).gain > 0.02) {
          const a = Math.atan2(at[1] - me2[1], at[0] - me2[0])
          wisps.push({ pid, a })
        }
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
    setChore(null); live.current.busy = false
  }
  live.current.report = () => ctx.report && send({ type: 'report', target: ctx.report, pos: pos() })
  live.current.bell = () => ctx.bell === 'ok' && send({ type: 'bell', pos: pos() })
  live.current.tuck = () => {
    if (!ctx.tuck || ctx.tuckWait > 0) return
    const t = live.current.pos?.[ctx.tuck]
    send({ type: 'tuck', target: ctx.tuck, pos: pos(), ...(isBot(ctx.tuck) ? {} : { tpos: t.map(x => +x.toFixed(2)) }) })
  }

  // ---- HUD -------------------------------------------------------------------------------------------------
  const t = now()
  const dawn = v.dawn - (v.phase === 'play' ? Math.max(0, t - v.clock) : 0)
  const left = v.phaseEnds != null ? v.phaseEnds - t : null
  const myStatus = v.status[me]
  const humans = people.filter(p => p.user_id)
  const meet = v.phase === 'talk' || v.phase === 'vote'
  const canVote = meet && myStatus === 'awake' && !(me in v.votes)
  const voters = v.players.filter(x => v.status[x] === 'awake')
  const vote = target => {
    if (point) { send({ type: 'point', target: v.points?.[me] === target ? null : target }); setPoint(false); return }
    if (canVote) send({ type: 'vote', target })
  }
  const emoteNow = performance.now()
  // Chitbots say their Tea Break lines one at a time (the bubble shows while that bot's mouth flaps).
  const speakers = v.players.filter(x => v.lines?.[x]), since = live.current.meetStart != null ? t - live.current.meetStart : -1
  const speaking = pid => { const k = speakers.indexOf(pid); return k >= 0 && since > k * 2600 && since < k * 2600 + 2500 }

  return (
    <div className={`cc${touch ? ' touch' : ''}${v.mischief?.kind === 'flour' && v.phase === 'play' ? ' flour' : ''}`}>
      {humans.map(p => <FaceFeed key={p.pid} pid={p.pid} uid={p.user_id} into={faces} />)}
      <div ref={mount} className="cc-view" />
      {v.mischief?.kind === 'flour' && v.phase === 'play' && <div className="cc-flour" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}

      {/* name tags, emote stamps, bot lines, chatter wisps */}
      <div className="cc-tags" aria-hidden="true">
        {(ctx.tags || []).map(({ pid, x, y }) => {
          const e = emotes[pid] && emoteNow - emotes[pid].t < 2600 ? emotes[pid].e : null
          const line = meet && v.lines?.[pid]
          return (
            <div key={pid} className="cc-tag-wrap" style={{ left: x, top: y }}>
              {line && v.phase === 'talk' && speaking(pid) && <div className="cc-bubble">{lineText(line, nm)}</div>}
              {e && <div className="cc-stamp">{e}</div>}
              <div className={`cc-tag${pid === me ? ' me' : ''}${v.status[pid] === 'nap' ? ' nap' : ''}`}>
                {pid === me ? 'You' : nm(pid)}{v.meeting?.by === pid && meet ? ' 🔔' : ''}{isBot(pid) && <b>BOT</b>}
                {meet && v.points && Object.values(v.points).includes(pid) && <span title="Pointed at"> 👉{Object.values(v.points).filter(x => x === pid).length}</span>}
              </div>
            </div>
          )
        })}
        {(ctx.wisps || []).map(({ pid, a }) => {
          const r = 0.42, x = 50 + Math.cos(a) * r * 100, y = 50 + Math.sin(a) * r * 100
          return <div key={pid} className="cc-wisp" style={{ left: `${Math.min(92, Math.max(8, x))}%`, top: `${Math.min(86, Math.max(14, y))}%`, '--a': `${a}rad` }}><i /><span>someone's chatting</span></div>
        })}
      </div>

      {/* top bar: the Morning Bake (as of the last Tea Break), the sunrise clock, your role */}
      <div className="cc-top">
        <div className="cc-card cc-bake">
          <div className="cc-row"><b>Morning Bake</b><span className="cc-muted">as of last Tea Break</span></div>
          <div className="cc-bar"><i style={{ width: `${(100 * v.bakeShown) / Math.max(1, v.bakeTotal)}%` }} /></div>
        </div>
        <div className="cc-card cc-dawn" title="Time until sunrise">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#3d3a6b" /><path d={arc(1 - dawn / v.dawnTotal)} fill="#f6b25c" /><circle cx="12" cy="13" r="4.2" fill="#fff1c8" /><circle cx="14" cy="12" r="3.6" fill="#3d3a6b" /></svg>
          <div><b>{fmt(dawn)}</b><span className="cc-muted">to sunrise</span></div>
        </div>
        {mine && <div className={`cc-card cc-role ${mine.role}`}>{mine.role === 'nibbler' ? `Nibbler${mine.mates?.length ? ` · with ${mine.mates.map(nm).join(', ')}` : ''}` : 'Baker'}</div>}
        <div className="cc-tools">{tools}</div>
      </div>

      {/* banners: mischief, napping, the apron */}
      {v.phase === 'play' && v.mischief && <div className={`cc-banner m-${v.mischief.kind}`}>
        <b>{MISCHIEF_NAMES[v.mischief.kind]}!</b>{' '}
        {v.mischief.kind === 'candles' && 'Find people by their voices. Relight the candles at the fuse box in the Front Shop.'}
        {v.mischief.kind === 'flour' && `You can only hear people close by. Clears in ${fmt(v.mischief.ends - t)}.`}
        {v.mischief.kind === 'jam' && `The pantry doors are stuck for ${fmt(v.mischief.ends - t)}.`}
        {v.mischief.kind === 'boil' && <>Two people: turn the dial by the oven and the valve in the Jam Cellar! <b>{fmt(v.mischief.ends - t)}</b> {v.mischief.dials.dialA ? '✓ oven' : '○ oven'} {v.mischief.dials.dialB ? '✓ cellar' : '○ cellar'}</>}
      </div>}
      {v.phase === 'play' && myStatus === 'nap' && <div className="cc-banner nap">You've been tucked in! You're sleepwalking: you can still do chores, and only other nappers can hear you.</div>}
      {v.phase === 'play' && myStatus === 'home' && <div className="cc-banner nap">You're home on the night tram. Watch the rest of the night from above.</div>}
      {v.phase === 'apron' && mine && <div className={`cc-apron ${mine.role}`}>
        <div className="cc-apron-k">Apron up!</div>
        <h2>{mine.role === 'nibbler' ? "You're a Nibbler" : "You're a Baker"}</h2>
        <p>{mine.role === 'nibbler'
          ? <>Pretend to do chores, tuck bakers in for naps (Q) and make mischief (F). {mine.mates?.length ? <>Your fellow Nibbler: <b>{mine.mates.map(nm).join(', ')}</b>.</> : 'You work alone tonight.'}</>
          : <>Do your chores to fill the Morning Bake before sunrise. If you find someone napping, report it, and talk it out over tea.</>}</p>
        <div className="cc-muted">{touch ? 'Joystick to walk · big button to use' : 'WASD or arrows to walk · E use · R report · B bell · M map'}</div>
      </div>}

      {/* your chores */}
      {v.phase === 'play' && mine && <div className="cc-card cc-chores">
        <b>{mine.role === 'nibbler' ? 'Your cover story' : 'Your chores'}</b>
        {mine.chores.map(id => { const s = spot(id); return <div key={id} className={mine.done.includes(id) ? 'done' : ''}>{mine.done.includes(id) ? '✓' : '•'} {s.name} · {roomName(s.room)}</div> })}
      </div>}

      {/* mini-map */}
      {v.phase === 'play' && mapOpen && <div className="cc-card cc-map" aria-label="Map">
        <svg viewBox="-1 -1 38 26" width="100%">
          {ROOMS.map(r => <g key={r.id}><rect x={r.x} y={r.y} width={r.w} height={r.h} className="cc-map-room" /><text x={r.x + r.w / 2} y={r.y + 2.2}>{r.name}</text></g>)}
          {mine && mine.chores.filter(id => !mine.done.includes(id)).map(id => { const s = spot(id); return <circle key={id} cx={s.x} cy={s.y} r="0.7" className="cc-map-chore" /> })}
          {v.mischief?.kind === 'candles' && <circle cx={FIX.fuse.x} cy={FIX.fuse.y} r="0.9" className="cc-map-fix" />}
          {v.mischief?.kind === 'boil' && ['dialA', 'dialB'].filter(d => !v.mischief.dials[d]).map(d => <circle key={d} cx={FIX[d].x} cy={FIX[d].y} r="0.9" className="cc-map-fix" />)}
          <circle cx={FIX.bell.x} cy={FIX.bell.y} r="0.6" fill="#e6b443" />
          <circle cx={myPos.current[0]} cy={myPos.current[1]} r="0.9" className="cc-map-me" />
        </svg>
      </div>}

      {/* action buttons */}
      {v.phase === 'play' && (myStatus === 'awake' || myStatus === 'nap') && !chore && <div className="cc-actions">
        <button className={`cc-act use${ctx.use ? ' ready' : ''}`} disabled={!ctx.use} onClick={() => live.current.use()}>{ctx.use?.kind === 'fix' ? 'Fix' : 'Use'}<small>E</small></button>
        {myStatus === 'awake' && <button className={`cc-act report${ctx.report ? ' ready' : ''}`} disabled={!ctx.report} onClick={() => live.current.report()}>Report<small>R</small></button>}
        {myStatus === 'awake' && <button className={`cc-act bell${ctx.bell === 'ok' ? ' ready' : ''}`} disabled={ctx.bell !== 'ok'} onClick={() => live.current.bell()} title={(v.bells[me] || 0) >= BELLS ? 'You already rang the bell tonight' : 'Ring the tea bell (at the kitchen table)'}>🔔<small>B</small></button>}
        {ctx.nibbler && <button className={`cc-act tuck${ctx.tuck && !ctx.tuckWait ? ' ready' : ''}`} disabled={!ctx.tuck || ctx.tuckWait > 0} onClick={() => live.current.tuck()}>{ctx.tuckWait > 0 ? fmt(ctx.tuckWait) : 'Tuck in'}<small>Q</small></button>}
        {ctx.nibbler && <button className={`cc-act pocket${pocket ? ' on' : ''}`} onClick={() => setPocket(p => !p)} disabled={ctx.mischiefWait !== 0 && !pocket}>{ctx.mischiefWait > 0 ? fmt(ctx.mischiefWait) : 'Mischief'}<small>F</small></button>}
        <button className="cc-act map" onClick={() => setMapOpen(m => !m)} aria-pressed={mapOpen}>Map<small>M</small></button>
      </div>}
      {pocket && ctx.nibbler && ctx.mischiefWait === 0 && <div className="cc-card cc-pocket">{MISCHIEF.map(k => <button key={k} className="cc-btn" onClick={() => { send({ type: 'mischief', kind: k }); setPocket(false) }}>{MISCHIEF_NAMES[k]}</button>)}</div>}
      {touch && v.phase === 'play' && (myStatus === 'awake' || myStatus === 'nap') && !chore && <Joystick into={joy} />}
      {chore && <div className="cc-modal"><Chore spot={chore} onDone={choreDone} onClose={() => { setChore(null); live.current.busy = false }} /></div>}

      {/* Tea Break */}
      {meet && <>
        <div className="cc-card cc-meet">
          <div><h3>Tea Break!</h3><div className="cc-muted">{v.meeting?.why === 'nap' ? `${nm(v.meeting.by)} found ${nm(v.meeting.found)} napping in the ${roomName(v.meeting.room)}` : `${nm(v.meeting?.by)} rang the tea bell`}</div></div>
          <span className="cc-pill">{v.phase === 'talk' ? 'Talk' : 'Vote'} · {fmt(left)}</span>
        </div>
        {Object.entries(v.naps || {}).some(([, n]) => n) && v.players.some(x => v.status[x] === 'nap') && <div className="cc-card cc-window">
          <div className="cc-window-pane">{v.players.filter(x => v.status[x] === 'nap').map(x => <span key={x}>{x === me ? 'You' : nm(x)}</span>)}</div>
          <div className="cc-muted">Napping upstairs · can't talk</div>
        </div>}
        <div className="cc-tray">
          {myStatus === 'awake' ? <>
            <div className="cc-tray-row">
              {voters.filter(x => x !== me).map(x => <button key={x} className={`cc-btn spoon${v.votes[me] === x ? ' on' : ''}${point ? ' pointing' : ''}`} disabled={!canVote && !point} onClick={() => vote(x)}>{point ? '👉 ' : '🥄 '}{nm(x)}</button>)}
              <button className={`cc-btn sugar${v.votes[me] === 'skip' ? ' on' : ''}`} disabled={!canVote || point} onClick={() => vote('skip')}>Sugar bowl (skip)</button>
            </div>
            <div className="cc-tray-row">
              {EMOTES.map((e, i) => <button key={e} className="cc-btn emote" onClick={() => net.emote(e)} title={`${i + 1}`}>{e}</button>)}
              {v.players.some(isBot) && <button className={`cc-btn point${point ? ' on' : ''}`} onClick={() => setPoint(p => !p)} title="Chitbots can't hear you: point at who you suspect and they'll weigh it">👉 Point</button>}
            </div>
          </> : <div className="cc-muted">{myStatus === 'nap' ? "You're napping upstairs: you can watch, but not talk or vote." : 'Watching from the night tram.'}</div>}
          <div className="cc-muted">{Object.keys(v.votes).length} of {voters.length} have put their teaspoon in{me in v.votes ? ' · yours is in' : ''}</div>
        </div>
      </>}

      {/* the night tram */}
      {v.phase === 'reveal' && v.reveal && <div className="cc-card cc-reveal">
        {v.reveal.pid ? <>
          <div className="cc-muted">The night tram</div>
          <h2>{v.reveal.pid === me ? "You're off on the night tram…" : `${nm(v.reveal.pid)} is off on the night tram…`}</h2>
          {v.reveal.role && <h3 className={v.reveal.role}>{v.reveal.role === 'nibbler' ? `${v.reveal.pid === me ? 'You were' : 'They were'} a Nibbler!` : `${v.reveal.pid === me ? 'You were' : 'They were'} a Baker.`}</h3>}
        </> : <h2>Nobody catches the tram tonight.</h2>}
        <div className="cc-spoons">{Object.entries(v.reveal.tally || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="cc-pill">{k === 'skip' ? 'sugar bowl' : nm(k)} ×{n}</span>)}</div>
        {v.reveal.left != null && <div className="cc-muted">{v.reveal.left} Nibbler{v.reveal.left === 1 ? ' is' : 's are'} still in the bakery · back to work in {fmt(left)}</div>}
      </div>}
    </div>
  )
}

// Pie slice for the sunrise clock (k: 0..1 of the night gone).
function arc(k) {
  const a = Math.max(0.001, Math.min(0.999, k)) * Math.PI * 2, x = 17 + 16 * Math.sin(a), y = 17 - 16 * Math.cos(a)
  return `M17 17 L17 1 A16 16 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
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
