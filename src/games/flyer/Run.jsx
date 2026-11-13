// Jetpack Dash: the run itself. One canvas, one requestAnimationFrame loop, a fixed 60 Hz sim (course.js) fed by
// "hold anywhere" (touch / mouse / Space / W / Up), friends as ghosts, Chitbots flown locally from the seed, and a
// light DOM HUD on top that updates ~8 times a second (never per frame).
//
// Everything here beyond the sim is presentation: sounds (sound.js) and particles fire from what changed in the
// flyer's state each frame, the camera is a wide window on the tunnel, and a bonk plays out as a slow-motion tumble
// that skids along the floor. None of it feeds back into the sim, so the referee's replay is untouched.
import { useEffect, useRef, useState } from 'react'
import { talking, voiceLevels } from '../../lib/store'
import { BOT, BUBBLE_TICKS, CRANE_LOCK, CRANE_TRACK, DT, HZ, LOOM_CHARGE, PPM, PX, STEAM_CHARGE, TICK_MS, makeWorld, metres, missionOf, missionText, newRun, recorder, speed, step, touches } from './course.js'
import { pilot } from './pilot.js'
import { buildArt } from './art.js'
import { BEEP_EVERY, LOCK_EVERY, burstFx, camera, drawFrame, dustFx, glintFx, thrustFx, updateFx } from './render.js'
import { addArt, drawExtras } from './extras.js'
import { SEND_EVERY, ghostLink } from './net.js'
import { flyerAudio } from './sound.js'
import { SoundControl } from './SoundControl.jsx'
import './extras.css'

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const BEST_KEY = 'flyer-best'
export const readBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0 } catch { return 0 } }
const saveBest = m => { try { if (m > readBest()) localStorage.setItem(BEST_KEY, String(m)) } catch { /* private mode */ } }
const WHISTLE_FILL_S = 6 // seconds of talking to fill the Kettle Whistle
const MILESTONE = 500 // metres between distance banners
const CONFETTI = ['#f2a07a', '#8fcf8a', '#9fd0ea', '#f2a7c3', '#f6d37a', '#b597e0']

// A tiny spring for squash and stretch: [sx, sy] eases back to 1 with a little wobble.
const spring = () => ({ s: [1, 1], v: [0, 0] })
function springStep(sp, dt, tx = 1, ty = 1) {
  const T = [tx, ty]
  for (let i = 0; i < 2; i++) { sp.v[i] += ((T[i] - sp.s[i]) * 320 - sp.v[i] * 16) * dt; sp.s[i] += sp.v[i] * dt }
}
const kick = (sp, sx, sy) => { if (!reducedMotion) { sp.s[0] = sx; sp.s[1] = sy; sp.v[0] = sp.v[1] = 0 } }

export default function Run({ v, me, people, nm, faces, channelId, submit, lab }) {
  const box = useRef(), cv = useRef(), whistleBtn = useRef(false)
  const [hud, setHud] = useState({ m: 0, spr: 0, alive: true, meter: 0, ready: false, marks: [], ms: 0 })
  const best = useRef(readBest())
  const vr = useRef(v)
  vr.current = v
  const [flying] = useState(() => v.players.includes(me) && !v.results[me]) // fixed for this run: landing doesn't remount

  useEffect(() => {
    const world = makeWorld(v.seed, v.opts), st = newRun(), rec = recorder()
    const botWorld = makeWorld(v.seed, v.opts)
    const bots = people.filter(p => p.bot && v.players.includes(p.pid)).map(p => ({ p, st: newRun({ bot: true }), next: pilot(botWorld, p.bot, v.seed, p.seat) }))
    const humans = people.filter(p => p.user_id && p.pid !== me && v.players.includes(p.pid))
    const link = lab ? null : ghostLink(channelId, me)
    const audio = flyerAudio()
    const fx = [], emit = { n: 0 }, sq = spring()
    const pointers = new Set()
    let keyHeld = false, held = false, whistle = false, acc = 0, last = performance.now(), raf = 0, art = null, artK = 0
    let camD = 0, camN = 0, wcD = 0, wcN = 0, shake = 0, fall = null, sent = false, talkTicks = 0, meter = 0, hudAt = 0, sprSeen = 0, duckAt = 0
    let rescueBy = null, saved = null, savedAt = 0, revivesSeen = 0, revivedAt = -1e9
    const savedSet = new Set() // bubbles I've already popped (pid:n0)
    let cssW = 0, cssH = 0, dpr = 1, cam = camera(1280, 800)
    // What the flyer looked like last frame, to turn state changes into sounds and particles.
    const was = { spr: 0, lastP: -1, veh: null, pops: 0, brews: 0, whistles: 0, held: false, spin: false, bub: false, revives: 0 }
    let streak = 0, streakAt = 0, nextMs = MILESTONE, ms = 0, msAt = 0
    const craneSeen = new WeakMap(), steamSeen = new WeakSet(), steamFired = new WeakSet(), loomSeen = new Set()
    if (!flying) st.alive = false
    // Dev lab only: &auto=1 lets a Chitbot fly for you, &veh=… starts you in a vehicle (screenshots and by-eye checks).
    const q = lab ? new URLSearchParams(location.hash.split('?')[1] || '') : null
    const auto = q?.get('auto') ? pilot(makeWorld(v.seed, v.opts), 'hard', v.seed, 0) : null
    if (q?.get('veh')) { st.veh = q.get('veh'); st.vt = 1e9; was.veh = st.veh }
    if (q?.get('tok')) st.tok = Math.min(3, +q.get('tok') || 0)
    if (lab) { window.__flyer = st; window.__flyerWorld = world }

    const resize = () => {
      const r = box.current.getBoundingClientRect()
      cssW = r.width; cssH = r.height
      dpr = Math.min(window.devicePixelRatio || 1, Math.max(cssW, cssH) < 1000 ? 1.5 : 2)
      cam = camera(cssW || 1, cssH || 1)
      cv.current.width = Math.round(cssW * dpr); cv.current.height = Math.round(cssH * dpr)
      const k = cam.scale * dpr
      if (!art || Math.abs(k - artK) / artK > 0.15) { art = addArt(buildArt(k)); artK = k }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(box.current)
    resize()

    // Input: hold anywhere (controls excepted), with every finger tracked, so pressing the whistle with one thumb
    // while the other holds doesn't drop your thrust. Space / W / Up on desktop; E for the Kettle Whistle.
    const el = box.current
    const sync = () => { held = keyHeld || pointers.size > 0 }
    const down = e => {
      audio.unlock(); audio.music(true)
      if (e.target.closest('button, input, .fly-snd, .fly-rotate')) return
      pointers.add(e.pointerId); sync()
      try { el.setPointerCapture(e.pointerId) } catch { /* fine */ }
      e.preventDefault()
    }
    const up = e => { pointers.delete(e.pointerId); sync() }
    const clear = () => { pointers.clear(); keyHeld = false; sync() }
    const typing = e => /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable
    const kd = e => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      audio.unlock(); audio.music(true)
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { keyHeld = true; sync(); e.preventDefault() }
      if (e.code === 'KeyE' && !e.repeat) whistle = true
    }
    const ku = e => { if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') { keyHeld = false; sync() } }
    const vis = () => { if (document.hidden) { audio.pause(); audio.suspend() } else audio.resume() }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up)
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', clear)
    document.addEventListener('visibilitychange', vis)
    audio.music(true)

    const shakeBy = s => { if (!reducedMotion) shake = Math.max(shake, s) }

    // Sounds and particles from what changed this frame.
    const react = now => {
      const y = st.y
      if (st.spr > was.spr) {
        const got = st.spr - was.spr
        if (now - streakAt > 700) streak = 0
        streakAt = now
        for (let i = 0; i < Math.min(got, 2); i++) audio.play('sprinkle', { i: streak + i })
        streak += got
        glintFx(fx, PX + 12, y, st.d, reducedMotion)
      }
      if (st.lastP !== was.lastP && st.lastP >= 0) {
        audio.play('parcel')
        burstFx(fx, PX + 20, y, CONFETTI, 1, reducedMotion)
      }
      if (st.veh && !was.veh) { audio.play('mount'); kick(sq, 0.8, 1.25) }
      if (!st.veh && was.veh) {
        if (st.pops > was.pops) { audio.play('pop'); shakeBy(9); burstFx(fx, PX, y, ['#ffffff', '#cfe6f2', '#f2a7c3'], 1.2, reducedMotion) } else audio.play('unmount')
      }
      if (st.brews > was.brews) { audio.play('shield'); shakeBy(6); burstFx(fx, PX, y, ['#f2c14e', '#ffdf7e', '#fff3c4'], 1, reducedMotion) }
      if (st.whistles > was.whistles) audio.play('whistle')
      // Paper cranes: a blip each time the warning blinks, faster once it locks, then the whoosh past.
      for (const c of st.cr) {
        const age = st.n - c.n0
        if (age < 0) continue
        const stage = age < CRANE_TRACK ? Math.floor(age / BEEP_EVERY) : age < CRANE_TRACK + CRANE_LOCK ? 1000 + Math.floor((age - CRANE_TRACK) / LOCK_EVERY) : 2000
        if (craneSeen.get(c) !== stage) { craneSeen.set(c, stage); audio.play(stage >= 2000 ? 'crane' : stage >= 1000 ? 'lock' : 'beep') }
      }
      for (const s of st.st) {
        const age = st.n - s.n0
        if (!steamSeen.has(s)) { steamSeen.add(s); if (age < STEAM_CHARGE) audio.play('charge', { dur: (STEAM_CHARGE - age) / 60 }) }
        if (age >= STEAM_CHARGE && !steamFired.has(s)) { steamFired.add(s); audio.play('blast'); shakeBy(4) }
      }
      // Yarn looms: a rising hum while the thread trembles, then the snap when the strand goes taut.
      for (const L of st.lm || []) {
        const age = st.n - L.n0
        L.beams.forEach((b, i) => {
          const a = age - b.at, key = L.n0 + ':' + i
          if (a >= 0 && a < LOOM_CHARGE && !loomSeen.has(key + 'c')) { loomSeen.add(key + 'c'); audio.play('charge', { dur: (LOOM_CHARGE - a) / 60 }) }
          if (a >= LOOM_CHARGE && !loomSeen.has(key + 'f')) { loomSeen.add(key + 'f'); audio.play('pop'); shakeBy(3) }
        })
      }
      // The Second Brew spin, a revive, and the Flock's rescue bubble.
      if (st.spin && !was.spin) audio.play('parcel')
      if (st.revives > was.revives) { audio.play('shield'); burstFx(fx, PX, y, ['#f2c14e', '#ffdf7e', '#8fcf8a'], 1.2, reducedMotion) }
      if (st.bub && !was.bub) audio.play('mount')
      if (!st.bub && was.bub && st.alive) { audio.play('pop'); burstFx(fx, PX, y, ['#ffffff', '#cfefff', '#8fd3b4'], 1, reducedMotion) }
      was.spin = !!st.spin; was.bub = !!st.bub; was.revives = st.revives
      const m = metres(st)
      if (m >= nextMs) { ms = Math.floor(m / MILESTONE) * MILESTONE; msAt = now; nextMs = ms + MILESTONE; audio.play('milestone') }
      was.spr = st.spr; was.lastP = st.lastP; was.veh = st.veh; was.pops = st.pops; was.brews = st.brews; was.whistles = st.whistles
    }

    const g = cv.current.getContext('2d', { alpha: false })
    const frame = now => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // The wall-clock camera (what watchers see, and where you rejoin after a bonk).
      const target = Math.floor((Date.now() - v.startAt) / TICK_MS)
      for (let k = 0; wcN < target && k < 40000; k++) { wcD += speed(wcD) * DT; wcN++ }
      let fdt = dt // effect time: slowed during the bonk
      // Your flyer: fixed steps from real elapsed time (a hidden tab pauses it instead of fast-forwarding into a wall).
      if (st.alive) {
        acc += dt
        let k = 0
        const talkNow = isTalking(me)
        if (held && !was.held && !st.veh) kick(sq, 0.84, 1.18) // thrust: a quick stretch upward
        if (held && !was.held && st.veh === 'trotter' && st.y >= BOT - 0.5) kick(sq, 0.82, 1.22)
        was.held = held
        while (acc >= DT && k++ < 8 && st.alive) {
          const wantWhistle = (whistle || whistleBtn.current) && meter >= 1 && st.wc === 0 && !st.bub && !st.spin
          whistle = false; whistleBtn.current = false
          if (wantWhistle) meter = 0
          if (auto) held = auto(st)
          // Flock: in a bubble, a friend's 'r' message or a Chitbot flying through it pops it.
          if (st.bub && !rescueBy) {
            rescueBy = link?.rescued() || null
            for (const b of bots) if (!rescueBy && b.st.alive && !b.st.bub && !b.st.spin && touches(st.bub, b.st.n, b.st.d, b.st.y)) rescueBy = b.p.pid
          } else if (!st.bub) while (link?.rescued());
          const rs = !!(st.bub && rescueBy)
          if (rs) { rec.log.rb = rescueBy; saved = { by: rescueBy }; savedAt = performance.now(); rescueBy = null }
          const y0 = st.y, vy0 = st.vy
          rec.input(st, held, wantWhistle, rs)
          step(st, world, held, wantWhistle, rs)
          // Touchdown on the floor: thud, dust, squash (harder landings, bigger everything).
          if (st.alive && !st.bub && !st.spin && y0 < BOT - 0.5 && st.y >= BOT - 0.5 && vy0 > 180 && st.veh !== 'brolly') {
            const hard = Math.min(1, vy0 / 900)
            audio.play(st.veh === 'cup' ? 'bounce' : 'land', { k: 0.4 + 0.6 * hard }); dustFx(fx, PX, hard, st.d, reducedMotion)
            kick(sq, 1 + 0.3 * hard, 1 - 0.28 * hard)
            if (hard > 0.8) shakeBy(3)
          }
          if (talkNow) talkTicks++
          acc -= DT
          if (st.n % SEND_EVERY === 0) link?.send(st)
        }
        // Flock: fly through a friend's bubble (where the referee will look for you) to pop it.
        if (v.opts.flock && st.alive && !st.bub && !st.spin) for (const h of humans) {
          const s = link?.sample(h.pid)
          if (!s?.bub || savedSet.has(h.pid + ':' + s.bub.n0) || st.n - s.bub.n0 > BUBBLE_TICKS) continue
          if (touches(s.bub, st.n, st.d, st.y)) { savedSet.add(h.pid + ':' + s.bub.n0); link.rescue(h.pid, st.n); saved = { to: h.pid }; savedAt = performance.now() }
        }
        if (st.revives > revivesSeen) { revivesSeen = st.revives; revivedAt = performance.now() }
        if (v.opts.whistle) {
          if (talkNow) meter = Math.min(1, meter + dt / WHISTLE_FILL_S)
          if (st.spr > sprSeen) { meter = Math.min(1, meter + (st.spr - sprSeen) / 40); sprSeen = st.spr }
        }
        camD = st.d; camN = st.n
        react(now)
        // held thrust: steam, sparks and the whoosh (a softer one under the brolly)
        const thrusting = st.alive && held && !st.spin && !st.bub && (!st.veh || st.veh === 'brolly' || st.veh === 'rocket')
        audio.thrust(thrusting, st.veh === 'rocket' ? 1.3 : st.veh ? 0.35 : 1)
        if (thrusting && !st.veh) thrustFx(fx, dt, st.y, st.d, reducedMotion, emit)
        springStep(sq, dt, held && !st.veh ? 0.95 : 1, held && !st.veh ? 1.05 : 1)
        if (!st.alive) { // bonk
          link?.send(st)
          st.cr = []; st.st = []; st.lm = [] // the run is over: no more warnings on screen
          shakeBy(16)
          audio.thrust(false); audio.play('bonk')
          burstFx(fx, PX, st.y, ['#fff8ec', '#ffd27a', '#f2a7c3'], 1, reducedMotion)
          // The classic tumble: a slow-motion knock up, a couple of bounces, then a long skid to a stop.
          fall = { d: st.d, y: st.y, vy: -560, vx: speed(st.d), r: 0, vr: 10, t: 0, floor: false, rest: 0, back: false, x: 0, dust: 0, sp: spring(), sq: [1, 1] }
          saveBest(metres(st))
          if (!sent) { sent = true; setTimeout(() => submit({ type: 'run', ticks: st.n, m: metres(st), spr: st.spr, log: rec.log, talk: st.n ? Math.round(100 * talkTicks / st.n) : 0 }), 700) }
        }
      } else if (fall) {
        fall.t += dt
        const ts = reducedMotion ? 1 : fall.t < 0.45 ? 0.22 : Math.min(1, 0.22 + (fall.t - 0.45) * 1.6)
        fdt = dt * ts
        fall.vy += 2200 * fdt; fall.y += fall.vy * fdt
        if (fall.y >= BOT) {
          fall.y = BOT
          if (fall.vy > 260) { // bounce
            const k = Math.min(1, fall.vy / 1200)
            audio.play('bounce', { k }); dustFx(fx, PX + fall.x, k, fall.d, reducedMotion); shakeBy(5 * k)
            kick(fall.sp, 1.3, 0.72)
            fall.vy *= -0.42; fall.vr *= 0.7
          } else { fall.vy = 0; fall.floor = true }
        }
        if (fall.floor) {
          fall.vx = Math.max(0, fall.vx - 820 * fdt)
          fall.vr = fall.vx * 0.008 // rolls as it skids, stops as it stops
          fall.dust += fdt * fall.vx / 60
          while (fall.dust > 1) { fall.dust--; dustFx(fx, PX + fall.x - 10, 0.35, fall.d, reducedMotion) }
        }
        audio.skid(fall.floor ? Math.min(1, fall.vx / 700) : 0)
        fall.r += fall.vr * fdt
        fall.d += fall.vx * fdt
        springStep(fall.sp, fdt); fall.sq = fall.sp.s
        if (fall.floor && fall.vx === 0) fall.rest += dt
        // At rest for a moment: the camera glides off to catch up with everyone still flying.
        if (fall.rest > 1.3 && flying) fall.back = true
        if (fall.back) camD += (Math.max(wcD, fall.d) - camD) * Math.min(1, dt * 1.6)
        else camD = fall.d
        camN = st.n + Math.round(fall.t * 60 * (fall.back ? 1 : ts))
        fall.x = fall.d - camD
      } else {
        // Watching: the camera keeps flying the speed curve on the wall clock.
        camD = wcD; camN = wcN
      }
      // Chitbots fly the same sim on the wall clock (the referee flew the same runs).
      for (const b of bots) { let k = 0; const lim = target - b.st.n > 120 ? 2000 : 20; while (b.st.alive && b.st.n < target && k++ < lim) { const h = b.next(b.st); step(b.st, botWorld, h, b.next.w) } }
      updateFx(fx, fdt)

      // Duck under voices (whoever is loudest), a few times a second.
      if (now - duckAt > 90) {
        duckAt = now
        let lv = 0
        for (const x of voiceLevels.values()) if (x > lv) lv = x
        audio.duck(Math.min(1, lv * 3))
      }

      const ghosts = []
      const fc = pid => faces.current[pid]?.ready ? faces.current[pid].c : null
      for (const b of bots) ghosts.push({ d: b.st.d, y: b.st.y, veh: b.st.veh, flip: b.st.flip, alive: b.st.alive, face: fc(b.p.pid), name: nm(b.p.pid) })
      for (const h of humans) { const s = link?.sample(h.pid); if (s) ghosts.push({ ...s, bub: v.opts.flock && s.alive ? s.bub : null, face: fc(h.pid), name: nm(h.pid) }) }

      g.setTransform(1, 0, 0, 1, 0, 0)
      g.fillStyle = '#4a3024'; g.fillRect(0, 0, cv.current.width, cv.current.height)
      const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0
      shake = Math.max(0, shake - dt * 40)
      const s = cam.scale * dpr, V = cam.view
      g.setTransform(s, 0, 0, s, (cam.tx + sx) * dpr, (cam.ty + sy) * dpr)
      g.save(); g.beginPath(); g.rect(V.x0, V.y0, V.x1 - V.x0, V.y1 - V.y0); g.clip()
      const scene = { art, world, camD, n: camN, me: flying ? st : null, face: fc(me), ghosts, fx, t: now / 1000, reduced: reducedMotion, fall, view: V, sq: sq.s }
      drawFrame(g, scene)
      drawExtras(g, scene)
      g.restore()

      if (now - hudAt > 120) {
        hudAt = now
        audio.music(true) // (no-op once playing; picks up after a hidden tab or a late unlock)
        const marks = [{ pid: me, m: flying ? metres(st) : null }]
        for (const b of bots) marks.push({ pid: b.p.pid, m: metres(b.st), out: !b.st.alive })
        for (const h of humans) { const r = vr.current.results[h.pid], s = link?.sample(h.pid); marks.push({ pid: h.pid, m: r ? r.m : s ? Math.floor(s.d / PPM) : null, out: !!r }) }
        const mis = (vr.current.missions || []).map(x => ({ text: missionText(x), at: missionOf(x, st), n: x.n }))
        const flock = v.opts.flock ? marks.reduce((a, x) => a + (x.m || 0), 0) : null
        const say = saved && now - savedAt < 2500 ? (saved.to ? `You saved ${nm(saved.to)}!` : `${nm(saved.by)} saved you!`) : now - revivedAt < 2500 ? 'A Second Brew! Fly on!' : null
        setHud({
          m: metres(st), spr: st.spr, alive: st.alive, meter, ready: meter >= 1 && st.wc === 0, marks, intro: st.n < 200 && flying,
          ms: now - msAt < 1700 ? ms : 0, streak: now - streakAt < 700 && streak >= 5 ? streak : 0,
          tok: st.tok, mis, flock, say, bub: st.bub ? Math.max(0, Math.ceil((BUBBLE_TICKS - (st.n - st.bub.n0)) / HZ)) : null,
          spun: st.spun, done: mis.filter(x => x.at >= x.n).length,
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); link?.close()
      audio.pause()
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up)
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [v.seed, v.startAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const top = Math.max(500, best.current, ...hud.marks.map(x => x.m || 0)) * 1.12
  return (
    <div className="fly-run" ref={box}>
      <canvas ref={cv} className="fly-canvas" />
      <div className="fly-hud">
        <div className="fly-dist"><b>{hud.m.toLocaleString()} m</b><small>best {Math.max(best.current, hud.m).toLocaleString()} m</small></div>
        <div className="fly-pill fly-spr"><Star /> {hud.spr}{hud.streak > 0 && <i key={hud.streak} className="fly-streak">x{hud.streak}</i>}</div>
        {flying && hud.tok > 0 && <div className="fly-pill fly-tok" title="Brew tokens: spent on the Second Brew spin when you bonk"><Token /> {hud.tok}</div>}
        {hud.flock != null && <div className="fly-pill fly-flock" title="Flock: everyone's distance together">Flock {hud.flock.toLocaleString()} m</div>}
        <div className="fly-bar" aria-hidden="true">
          <i className="fly-bar-track" />
          {best.current > 0 && <span className="fly-best" style={{ left: `${(best.current / top) * 100}%` }}>BEST</span>}
          {hud.marks.map(x => x.m != null && <span key={x.pid} className={`fly-mark${x.pid === me ? ' me' : ''}${x.out ? ' out' : ''}`} style={{ left: `${(x.m / top) * 100}%` }}><Mini pid={x.pid} faces={faces} /></span>)}
        </div>
        <SoundControl />
      </div>
      {hud.ms > 0 && <div key={hud.ms} className="fly-milestone" role="status"><b>{hud.ms.toLocaleString()} m</b><small>{hud.ms >= best.current && best.current > 0 ? 'new best!' : 'keep flying!'}</small></div>}
      {flying && hud.mis?.length > 0 && (
        <ul className="fly-missions" aria-label="Missions">
          {hud.mis.map((x, i) => <li key={i} className={x.at >= x.n ? 'done' : ''}><i aria-hidden="true" />{x.text}{x.at < x.n && x.n > 1 && <small>{x.at}/{x.n}</small>}</li>)}
        </ul>
      )}
      {hud.intro && <div className="fly-hint">Hold anywhere to fly · let go to fall</div>}
      {hud.say && <div className="fly-say">{hud.say}</div>}
      {flying && hud.bub != null && <div className="fly-bonk bubble"><b>In a bubble!</b>A friend can fly through it to save you · {hud.bub}s</div>}
      {v.opts.whistle && flying && hud.alive && (
        <button className={`fly-whistle${hud.ready ? ' ready' : ''}`} style={{ '--p': hud.meter }} onPointerDown={e => { e.stopPropagation(); whistleBtn.current = true }} aria-label="Kettle Whistle (E)" title="Kettle Whistle (E): talk to fill it">
          <span>Whistle</span>
        </button>
      )}
      {flying && !hud.alive && <div className="fly-bonk"><b>Bonk!</b> {hud.m.toLocaleString()} m · {hud.spr} sprinkles{hud.mis?.length > 0 && <> · {hud.done}/{hud.mis.length} missions</>}<small>{hud.spun > 0 ? `${hud.spun} sprinkles from the Second Brew spin · ` : ''}Watching the others land…</small></div>}
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
export const Token = () => <svg viewBox="0 0 30 30" width="20" height="20" aria-hidden="true"><path d="M15 3v5" stroke="#a07a5a" strokeWidth="2" /><rect x="11" y="1" width="8" height="5" rx="1.5" fill="#f6a64a" /><path d="M8 9h14l2 16q-9 3-18 0z" fill="#f3e3c7" stroke="#d8bf96" strokeWidth="1.5" /><circle cx="15" cy="17" r="4.5" fill="#b5733f" /></svg>
export const Star = () => <svg viewBox="0 0 30 30" width="20" height="20" aria-hidden="true"><path d="M15 2l3.6 7.6 8.4 1-6.2 5.8 1.6 8.3L15 20.6 7.6 24.7l1.6-8.3L3 10.6l8.4-1z" fill="#ffc94a" stroke="#e09a2a" strokeWidth="2" strokeLinejoin="round" /></svg>
