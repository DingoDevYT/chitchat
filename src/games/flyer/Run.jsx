// Chatterflies: the run itself. One canvas, one requestAnimationFrame loop, a fixed 60 Hz sim (course.js) fed by
// "hold anywhere" (touch / mouse / Space / W / Up), friends as ghosts, Chitbots flown locally from the seed, and a
// light DOM HUD on top that updates ~8 times a second (never per frame).
import { useEffect, useRef, useState } from 'react'
import { talking } from '../../lib/store'
import { DT, PPM, TICK_MS, VIEW_W, VIEW_H, makeWorld, metres, newRun, recorder, speed, step } from './course.js'
import { pilot } from './pilot.js'
import { buildArt } from './art.js'
import { drawFrame, updatePuffs } from './render.js'
import { SEND_EVERY, ghostLink } from './net.js'

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const BEST_KEY = 'flyer-best'
export const readBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0 } catch { return 0 } }
const saveBest = m => { try { if (m > readBest()) localStorage.setItem(BEST_KEY, String(m)) } catch { /* private mode */ } }
const WHISTLE_FILL_S = 6 // seconds of talking to fill the Kettle Whistle

export default function Run({ v, me, people, nm, faces, channelId, submit, lab }) {
  const box = useRef(), cv = useRef(), whistleBtn = useRef(false)
  const [hud, setHud] = useState({ m: 0, spr: 0, alive: true, meter: 0, ready: false, marks: [] })
  const best = useRef(readBest())
  const vr = useRef(v)
  vr.current = v
  const [flying] = useState(() => v.players.includes(me) && !v.results[me]) // fixed for this run: landing doesn't remount

  useEffect(() => {
    const world = makeWorld(v.seed, v.opts), st = newRun(), rec = recorder()
    const botWorld = makeWorld(v.seed, v.opts)
    const bots = people.filter(p => p.bot && v.players.includes(p.pid)).map(p => ({ p, st: newRun(), next: pilot(botWorld, p.bot, v.seed, p.seat) }))
    const humans = people.filter(p => p.user_id && p.pid !== me && v.players.includes(p.pid))
    const link = lab ? null : ghostLink(channelId, me)
    const puffs = []
    let held = false, whistle = false, acc = 0, last = performance.now(), raf = 0, art = null, artK = 0
    let camD = 0, camN = 0, shake = 0, fall = null, sent = false, talkTicks = 0, meter = 0, hudAt = 0, sprSeen = 0
    let cssW = 0, cssH = 0, dpr = 1, scale = 1, ox = 0, oy = 0
    if (!flying) st.alive = false
    // Dev lab only: &auto=1 lets a Chitbot fly for you, &veh=… starts you in a vehicle (screenshots and by-eye checks).
    const q = lab ? new URLSearchParams(location.hash.split('?')[1] || '') : null
    const auto = q?.get('auto') ? pilot(makeWorld(v.seed, v.opts), 'hard', v.seed, 0) : null
    if (q?.get('veh')) { st.veh = q.get('veh'); st.vt = 1e9 }
    if (lab) { window.__flyer = st; window.__flyerWorld = world }

    const resize = () => {
      const r = box.current.getBoundingClientRect()
      cssW = r.width; cssH = r.height
      dpr = Math.min(window.devicePixelRatio || 1, Math.max(cssW, cssH) < 1000 ? 1.5 : 2)
      scale = Math.min(cssW / VIEW_W, cssH / VIEW_H)
      ox = (cssW - VIEW_W * scale) / 2; oy = (cssH - VIEW_H * scale) / 2
      cv.current.width = Math.round(cssW * dpr); cv.current.height = Math.round(cssH * dpr)
      const k = scale * dpr
      if (!art || Math.abs(k - artK) / artK > 0.15) { art = buildArt(k); artK = k }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(box.current)
    resize()

    // Input: hold anywhere (buttons excepted); Space / W / Up on desktop; E for the Kettle Whistle.
    const el = box.current
    const down = e => { if (e.target.closest('button')) return; held = true; try { el.setPointerCapture(e.pointerId) } catch { /* fine */ } e.preventDefault() }
    const up = () => { held = false }
    const typing = e => /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
    const kd = e => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { held = true; e.preventDefault() }
      if (e.code === 'KeyE' && !e.repeat) whistle = true
    }
    const ku = e => { if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') held = false }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up)
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', up)

    const g = cv.current.getContext('2d', { alpha: false })
    const frame = now => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Your flyer: fixed steps from real elapsed time (a hidden tab pauses it instead of fast-forwarding into a wall).
      if (st.alive) {
        acc += dt
        let k = 0
        const talkNow = isTalking(me)
        while (acc >= DT && k++ < 8 && st.alive) {
          const wantWhistle = (whistle || whistleBtn.current) && meter >= 1 && st.wc === 0
          whistle = false; whistleBtn.current = false
          if (wantWhistle) meter = 0
          if (auto) held = auto(st)
          rec.input(st, held, wantWhistle)
          step(st, world, held, wantWhistle)
          if (talkNow) talkTicks++
          acc -= DT
          if (st.n % SEND_EVERY === 0) link?.send(st)
        }
        if (v.opts.whistle) {
          if (talkNow) meter = Math.min(1, meter + dt / WHISTLE_FILL_S)
          if (st.spr > sprSeen) { meter = Math.min(1, meter + (st.spr - sprSeen) / 40); sprSeen = st.spr }
        }
        camD = st.d; camN = st.n
        if (!st.alive) { // bonk
          link?.send(st)
          st.cr = []; st.st = [] // the run is over: no more warnings on screen
          shake = reducedMotion ? 0 : 14
          fall = { x: 0, y: st.y, vy: -420, r: 0 }
          saveBest(metres(st))
          if (!sent) { sent = true; setTimeout(() => submit({ type: 'run', ticks: st.n, m: metres(st), spr: st.spr, log: rec.log, talk: st.n ? Math.round(100 * talkTicks / st.n) : 0 }), 700) }
        }
        if (st.pops > (st._pops || 0)) { st._pops = st.pops; shake = reducedMotion ? 0 : 8 }
      } else {
        // Watching: the camera keeps flying the speed curve on the wall clock.
        const target = Math.floor((Date.now() - v.startAt) / TICK_MS)
        let k = 0
        const lim = target - camN > 60 ? 1e6 : 8 // joined late: catch up at once
        while (camN < target && k++ < lim) { camD += speed(camD) * DT; camN++ }
        if (fall) { fall.vy += 1800 * dt; fall.y = Math.min(VIEW_H - 60, fall.y + fall.vy * dt); fall.x -= speed(camD) * dt * 0.6; fall.r += dt * 6 }
      }
      // Chitbots fly the same sim on the wall clock (the referee flew the same runs).
      const target = Math.floor((Date.now() - v.startAt) / TICK_MS)
      for (const b of bots) { let k = 0; const lim = target - b.st.n > 120 ? 2000 : 20; while (b.st.alive && b.st.n < target && k++ < lim) step(b.st, botWorld, b.next(b.st)) }
      updatePuffs(puffs, dt, st, held, st.d, reducedMotion)

      const ghosts = []
      const fc = pid => faces.current[pid]?.ready ? faces.current[pid].c : null
      for (const b of bots) ghosts.push({ d: b.st.d, y: b.st.y, veh: b.st.veh, flip: b.st.flip, alive: b.st.alive, face: fc(b.p.pid), name: nm(b.p.pid) })
      for (const h of humans) { const s = link?.sample(h.pid); if (s) ghosts.push({ ...s, face: fc(h.pid), name: nm(h.pid) }) }

      g.setTransform(1, 0, 0, 1, 0, 0)
      g.fillStyle = '#4a3024'; g.fillRect(0, 0, cv.current.width, cv.current.height)
      const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0
      shake = Math.max(0, shake - dt * 40)
      g.setTransform(scale * dpr, 0, 0, scale * dpr, (ox + sx) * dpr, (oy + sy) * dpr)
      g.save(); g.beginPath(); g.rect(0, 0, VIEW_W, VIEW_H); g.clip()
      drawFrame(g, { art, world, camD, n: camN, me: flying ? st : null, face: fc(me), ghosts, puffs, t: now / 1000, reduced: reducedMotion, fall })
      g.restore()

      if (now - hudAt > 120) {
        hudAt = now
        const marks = [{ pid: me, m: flying ? metres(st) : null }]
        for (const b of bots) marks.push({ pid: b.p.pid, m: metres(b.st), out: !b.st.alive })
        for (const h of humans) { const r = vr.current.results[h.pid], s = link?.sample(h.pid); marks.push({ pid: h.pid, m: r ? r.m : s ? Math.floor(s.d / PPM) : null, out: !!r }) }
        setHud({ m: metres(st), spr: st.spr, alive: st.alive, meter, ready: meter >= 1 && st.wc === 0, marks, intro: st.n < 200 && flying })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); link?.close()
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up)
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', up)
    }
  }, [v.seed, v.startAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const top = Math.max(500, best.current, ...hud.marks.map(x => x.m || 0)) * 1.12
  return (
    <div className="fly-run" ref={box}>
      <canvas ref={cv} className="fly-canvas" />
      <div className="fly-hud">
        <div className="fly-dist"><b>{hud.m.toLocaleString()} m</b><small>best {Math.max(best.current, hud.m).toLocaleString()} m</small></div>
        <div className="fly-pill fly-spr"><Star /> {hud.spr}</div>
        <div className="fly-bar" aria-hidden="true">
          <i className="fly-bar-track" />
          {best.current > 0 && <span className="fly-best" style={{ left: `${(best.current / top) * 100}%` }}>BEST</span>}
          {hud.marks.map(x => x.m != null && <span key={x.pid} className={`fly-mark${x.pid === me ? ' me' : ''}${x.out ? ' out' : ''}`} style={{ left: `${(x.m / top) * 100}%` }}><Mini pid={x.pid} faces={faces} /></span>)}
        </div>
      </div>
      {hud.intro && <div className="fly-hint">Hold anywhere to fly · let go to fall</div>}
      {v.opts.whistle && flying && hud.alive && (
        <button className={`fly-whistle${hud.ready ? ' ready' : ''}`} style={{ '--p': hud.meter }} onPointerDown={e => { e.stopPropagation(); whistleBtn.current = true }} aria-label="Kettle Whistle (E)" title="Kettle Whistle (E): talk to fill it">
          <span>Whistle</span>
        </button>
      )}
      {flying && !hud.alive && <div className="fly-bonk"><b>Bonk!</b> {hud.m.toLocaleString()} m · {hud.spr} sprinkles<small>Watching the others land…</small></div>}
      {!flying && <div className="fly-bonk watch"><small>{v.results[me] ? 'Watching the others land…' : 'Watching the flight'}</small></div>}
    </div>
  )
}

const isTalking = id => { const s = talking.get(); return (s[id] || 0) > 0 || !!s['v:' + id] }

function Mini({ pid, faces }) {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current, g = c.getContext('2d')
    const t = setInterval(() => { const f = faces.current[pid]; if (f?.ready) { g.clearRect(0, 0, 28, 28); g.drawImage(f.c, 0, 0, 28, 28) } }, 500)
    return () => clearInterval(t)
  }, [pid, faces])
  return <canvas ref={ref} width="28" height="28" />
}
export const Star = () => <svg viewBox="0 0 30 30" width="20" height="20" aria-hidden="true"><path d="M15 2l3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L15 20.6 7.6 24.7l1.6-8.3L3 10.6l8.4-1z" fill="#ffc94a" stroke="#e09a2a" strokeWidth="2" strokeLinejoin="round" /></svg>
