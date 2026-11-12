// Pond Skippers on screen: the pond from above, the far bank at the top, you on the near bank at the bottom. Drag or
// swipe from anywhere (forward to throw, or pull back like a slingshot): the direction is your aim, the length your
// power. The sim is pond.js, the same one the referee replays; Chitbots' stones are ghosts thrown from
// (seed, seat, level), exactly the throws the referee posts for them.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AIM, GAP, HOP_T, HZ, L, PAD_R, PMAX, PMIN, ROCK_R, STONES, TICKS, W, X0, Y0, botLog, fling, makePond, padX } from './pond.js'
import { Pad, Rock, Stone, TINTS } from './moreArt.jsx'
import { Sky } from './art.jsx'
import './more.css'

export const how = {
  line: 'Flick three stones across the pond. Skips, lily-pad bounces and distance score; the far bank is a bonus. Rocks and reeds stop a stone.',
  mouse: 'drag (or pull back) from anywhere and let go to throw',
  touch: 'swipe up to flick, or pull back and let go',
  keys: 'Left and Right to aim, Up and Down for power, Space to throw',
}

const END = { bank: 'reached the bank', rock: 'hit a rock', reeds: 'in the reeds', sink: 'sank' }
export function detail(reveal, pid) {
  const r = reveal.runs?.[pid]
  if (!r) return 'No stones thrown'
  const best = r.throws.reduce((a, b) => (b.score > (a?.score ?? -1) ? b : a), null)
  return `${r.score} points${best ? `: best ${best.skips + best.pads} skips, ${END[best.end]}` : ''}`
}

const VY = y => 1060 - y // sim y (0 near bank .. L far bank) to view y
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Where a thrown stone is drawn at tick f: { x, y, lift } or null once it has stopped, plus the hops landed so far.
function at(th, t, f) {
  const k = Math.floor((f - t) / HOP_T)
  if (f < t) return null
  if (k >= th.hops.length) return { done: true }
  const a = k ? th.hops[k - 1] : { x: X0, y: Y0 }, b = th.hops[k], u = (f - t - k * HOP_T) / HOP_T
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, lift: Math.sin(Math.PI * u) * (k ? 14 : 30) }
}

export function Play({ state, me, nm, act, levels, startAt, phase, canPlay, v }) {
  const pond = useMemo(() => makePond(state.seed), [state.seed])
  const ghosts = useMemo(() => state.players.filter(p => p.startsWith('bot:')).map(pid => {
    const { log } = botLog(state.seed, state.players.indexOf(pid), levels?.[pid] || 'normal')
    return { pid, throws: log.map(([t, a, p]) => ({ t, ...fling(pond, t, a, p) })), tint: TINTS[v.players.indexOf(pid) % TINTS.length] }
  }), [state.seed, pond]) // eslint-disable-line react-hooks/exhaustive-deps
  const log = useRef([]), sent = useRef(false), box = useRef(null), drag = useRef(null)
  const [mine, setMine] = useState([]) // my throws: { t, ...fling }
  const [aim, setAim] = useState({ a: 0, p: 60, on: false })
  const aimRef = useRef(aim)
  aimRef.current = aim
  const [f, setF] = useState(0)
  const live = canPlay && phase === 'play'
  const lastT = log.current.length ? log.current.at(-1)[0] : -GAP
  const tick = Math.floor(f)
  const ready = live && log.current.length < STONES && tick < TICKS && tick - lastT >= GAP

  const post = () => {
    if (sent.current || !canPlay) return
    sent.current = true
    const score = mine.reduce((s, x) => s + x.score, 0)
    act('move', { move: { type: 'mini', log: log.current, score } })
  }
  const throwNow = (a, p) => {
    const t = Math.floor((Date.now() - startAt) * HZ / 1000), prev = log.current.length ? log.current.at(-1)[0] : -GAP
    if (!live || log.current.length >= STONES || t >= TICKS || t < 0 || t - prev < GAP) return
    a = clamp(Math.round(a), -AIM, AIM); p = clamp(Math.round(p), PMIN, PMAX)
    log.current = [...log.current, [t, a, p]]
    setMine(m => [...m, { t, ...fling(pond, t, a, p) }])
  }

  useEffect(() => {
    let raf
    const loop = () => { setF((Date.now() - startAt) * HZ / 1000); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [startAt])
  // Post once all three stones have finished skipping, or when the time is up.
  useEffect(() => {
    if (!canPlay || sent.current || phase !== 'play') return
    const allDone = mine.length === STONES && mine.every(m => tick > m.hops.at(-1).t + 12)
    if (allDone || tick >= TICKS) post()
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return
    const kd = e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return
      const k = e.key
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); setAim(s => ({ ...s, on: true, a: clamp(s.a + (k === 'ArrowLeft' ? -2 : 2), -AIM, AIM) })) }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); setAim(s => ({ ...s, on: true, p: clamp(s.p + (k === 'ArrowUp' ? 5 : -5), PMIN, PMAX) })) }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); throwNow(aimRef.current.a, aimRef.current.p) }
    }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  })

  const svgPt = e => {
    const m = box.current?.getScreenCTM()
    return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null
  }
  const fromDrag = (s, e) => {
    let dx = e.x - s.x, dy = e.y - s.y
    if (dy > 0) { dx = -dx; dy = -dy } // pulled back: a slingshot
    const fwd = -dy, len = Math.hypot(dx, dy)
    return { a: fwd < 1 ? (dx < 0 ? -AIM : AIM) : (dx * 100) / fwd, p: PMIN + (len * (PMAX - PMIN)) / 420, len }
  }
  const down = e => { if (!live) return; const p = svgPt(e); if (!p) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: p.x, y: p.y } }
  const move = e => {
    if (!drag.current) return
    const p = svgPt(e); if (!p) return
    const d = fromDrag(drag.current, p)
    if (d.len > 12) setAim({ a: clamp(Math.round(d.a), -AIM, AIM), p: clamp(Math.round(d.p), PMIN, PMAX), on: true })
  }
  const up = e => {
    const s = drag.current
    drag.current = null
    const p = s && svgPt(e)
    if (!p) return
    const d = fromDrag(s, p)
    if (d.len > 24) throwNow(d.a, d.p)
  }

  const left = Math.max(0, Math.ceil((TICKS - Math.max(0, f)) / HZ))
  const myScore = mine.reduce((s, x) => s + x.score, 0)
  const ghostScore = g => g.throws.reduce((s, x) => s + (f > x.hops.at(-1).t ? x.score : 0), 0)
  const stones = (list, tint, mineToo) => list.map((th, i) => {
    const pos = at(th, th.t, f)
    return (
      <g key={`${th.t}:${i}`} opacity={mineToo ? 1 : 0.5}>
        {th.hops.filter(h => f >= h.t && f < h.t + 24).map(h => {
          const u = (f - h.t) / 24
          return <ellipse key={h.t} cx={h.x} cy={VY(h.y)} rx={10 + 40 * u} ry={(10 + 40 * u) * 0.45} fill="none" stroke={h.on === 'pad' ? '#d8f0c9' : h.on === 'rock' ? '#e7787f' : '#cfe7f2'} strokeWidth="3" opacity={1 - u} />
        })}
        {pos && !pos.done && <g transform={`translate(${pos.x} ${VY(pos.y) - pos.lift})`}><Stone tint={tint} /></g>}
        {mineToo && f >= th.hops.at(-1).t && f < th.hops.at(-1).t + 40 && <text x={th.hops.at(-1).x} y={VY(th.hops.at(-1).y) - 24} textAnchor="middle" className="mc-pop">+{th.score}</text>}
      </g>
    )
  })
  // the aim guide: an arrow from the stone, angle from aim, length from power
  const gx = X0 + (aim.a * (aim.p * 3)) / Math.hypot(100, aim.a), gy = VY(Y0) - (100 * (aim.p * 3)) / Math.hypot(100, aim.a)

  return (
    <div className="mp">
      <svg ref={box} className="mp-field" viewBox="0 0 1000 1100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The pond"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null }}>
        <rect x="-600" y="-200" width="2200" height="1500" fill="#1d2f3a" />
        <Sky w={1000} h={120} n={18} />
        <path d="M-600 0 H1600 V70 Q1200 96 1000 72 Q500 40 0 74 Q-300 96 -600 72 Z" fill="#3c6b4f" />
        <rect x="0" y={VY(L)} width={W} height={L - Y0 + 20} rx="60" fill="#2c5f78" />
        <rect x="14" y={VY(L) + 14} width={W - 28} height={L - Y0 - 8} rx="50" fill="none" stroke="#3f7a95" strokeWidth="4" strokeDasharray="2 22" />
        <path d="M-600 1010 Q-200 990 0 1012 Q500 1040 1000 1010 Q1300 990 1600 1012 V1300 H-600 Z" fill="#3c6b4f" />
        {[-40, 1040].map(x => <g key={x}>{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${x + (i % 3) * 8 - 8} ${120 + i * 64} q-6 -30 4 -60`} stroke="#5f8a4a" strokeWidth="6" fill="none" strokeLinecap="round" />)}</g>)}
        <text x="500" y={VY(L) + 34} textAnchor="middle" className="mp-bank">Far bank +20</text>
        {pond.rocks.map((o, i) => <g key={i} transform={`translate(${o.x} ${VY(o.y)})`}><Rock r={ROCK_R} /></g>)}
        {pond.pads.map((p, i) => <g key={i} transform={`translate(${padX(p, Math.max(0, tick))} ${VY(p.y)})`}><Pad r={PAD_R} /></g>)}
        {ghosts.map(g => <g key={g.pid}>{stones(g.throws, g.tint, false)}</g>)}
        {stones(mine, '#f7c45a', true)}
        {live && aim.on && ready && <g className="mp-guide"><line x1={X0} y1={VY(Y0)} x2={gx} y2={gy} /><circle cx={gx} cy={gy} r="9" /></g>}
        {canPlay && <g transform={`translate(${X0} ${VY(Y0)})`} opacity={ready || phase !== 'play' ? 1 : 0.45}><Stone tint="#f7c45a" /></g>}
      </svg>
      <div className="mc-head mp-head">
        <div className="ms-title"><b>Pond Skippers</b><small>{canPlay ? `${STONES - mine.length} of ${STONES} stones left` : 'Everyone at once'}</small></div>
        <div className="mc-ring" style={{ '--p': `${(left / (TICKS / HZ)) * 100}%` }}><span>{phase === 'play' ? left : TICKS / HZ}</span></div>
      </div>
      <ul className="mc-scores mp-scores">
        {canPlay && <li className="me"><b>You</b><span>{myScore}</span></li>}
        {ghosts.map(g => <li key={g.pid}><b>{nm(g.pid)}</b><span>{phase === 'play' ? ghostScore(g) : 0}</span></li>)}
      </ul>
      {live && aim.on && <div className="mp-meter" aria-live="polite"><span>Aim {aim.a > 0 ? `right ${aim.a}` : aim.a < 0 ? `left ${-aim.a}` : 'straight'}</span><i><b style={{ width: `${aim.p}%` }} /></i><span>Power {aim.p}</span></div>}
      <div className="ms-hint">{!canPlay ? "You're watching the pond" : phase !== 'play' ? 'Drag or swipe to flick a stone' : mine.length >= STONES ? 'All stones thrown' : ready ? 'Drag or swipe to flick' : 'Next stone…'}</div>
    </div>
  )
}
