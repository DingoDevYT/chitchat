// Wishfall Catch on screen: the same sim the referee replays (catch.js), stepped from the shared start, drawn as an
// SVG night sky. Your jar follows the pointer (or a finger, or the arrow keys); Chitbots show as soft ghost jars
// flown from (seed, seat, level), exactly the runs the referee posts for them.
import { useEffect, useMemo, useRef, useState } from 'react'
import { HZ, LAND, TICKS, VALUE, W, botLog, makeSky, newRun, replay, step } from './catch.js'
import { Cloud, Dust, Ico, Jar, Sky, Star } from './art.jsx'

export const how = {
  line: 'Catch the falling stars in your jam jar and dodge the grey dud clouds. 30 seconds, everyone at once.',
  mouse: 'move over the sky to slide your jar',
  touch: 'drag anywhere, left and right',
  keys: 'Left and Right arrows, or A and D',
}

export function detail(reveal, pid) {
  const r = reveal.runs?.[pid]
  return r ? `${r.score} points: ${r.big} big, ${r.dust} dust, ${r.cloud} ${r.cloud === 1 ? 'cloud' : 'clouds'}` : 'Missed the sky'
}

const TINTS = ['#f2a65a', '#8f8fe0', '#7cc4a4', '#e7787f', '#f2c14e', '#9ccbe0', '#c49ad8', '#b9784a']
const TOP = 40

export function Play({ state, me, nm, act, levels, startAt, phase, canPlay, v }) {
  const sky = useMemo(() => makeSky(state.seed), [state.seed])
  // Bot ghosts: each bot's jar position and score at every tick.
  const ghosts = useMemo(() => state.players.filter(p => p.startsWith('bot:')).map(pid => {
    const { log } = botLog(state.seed, state.players.indexOf(pid), levels?.[pid] || 'normal')
    const xs = new Int16Array(TICKS + 1).fill(W / 2), sc = new Int16Array(TICKS + 1)
    replay(state.seed, log, sky, st => { xs[st.n] = st.x; sc[st.n] = st.score })
    return { pid, xs, sc, tint: TINTS[v.players.indexOf(pid) % TINTS.length] }
  }), [state.seed, sky]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = useRef(newRun()), log = useRef([]), tgt = useRef(W / 2), sent = useRef(false), held = useRef({ l: false, r: false })
  const [f, setF] = useState(0)
  const box = useRef(null)

  useEffect(() => {
    let raf
    const loop = () => {
      const fr = (Date.now() - startAt) * HZ / 1000
      const st = run.current
      if (canPlay && phase === 'play' && st.n < TICKS) {
        const target = Math.max(0, Math.min(W, Math.round(tgt.current)))
        const tick = Math.min(TICKS, Math.floor(fr))
        while (st.n < tick) {
          if (target !== st.tgt) { st.tgt = target; log.current.push([st.n, target]) }
          step(st, sky)
        }
      }
      if (canPlay && st.n >= TICKS && !sent.current) {
        sent.current = true
        act('move', { move: { type: 'mini', log: log.current, score: st.score } })
      }
      setF(fr)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [startAt, canPlay, phase, sky]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const keys = e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return
      const k = e.key.toLowerCase(), down = e.type === 'keydown'
      if (k === 'arrowleft' || k === 'a') held.current.l = down
      else if (k === 'arrowright' || k === 'd') held.current.r = down
      else return
      e.preventDefault()
      const { l, r } = held.current
      tgt.current = l && !r ? 0 : r && !l ? W : run.current.x
    }
    addEventListener('keydown', keys)
    addEventListener('keyup', keys)
    return () => { removeEventListener('keydown', keys); removeEventListener('keyup', keys) }
  }, [])

  const point = e => {
    const svg = box.current
    if (!svg) return
    const m = svg.getScreenCTM()
    if (!m) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    tgt.current = p.x
  }

  const st = run.current, tick = Math.max(0, Math.min(TICKS, Math.floor(f)))
  const caught = new Set(st.ev)
  const left = Math.max(0, Math.ceil((TICKS - Math.max(0, f)) / HZ))
  const pops = st.ev.slice(-4).map(i => sky[i]).filter(o => st.n - o.arr < 22)
  const others = ghosts.map(g => ({ ...g, x: g.xs[tick], score: g.sc[tick] }))
  return (
    <div className="mc">
      <svg ref={box} className="mc-field" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet"
        onPointerMove={point} onPointerDown={point} role="img" aria-label="Falling stars">
        <defs>
          <linearGradient id="mc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f1d4d" /><stop offset="1" stopColor="#4a3f78" /></linearGradient>
        </defs>
        <rect width="1000" height="600" fill="url(#mc-sky)" />
        <Sky />
        <path d="M0 470 C200 440 420 480 600 462 S880 440 1000 468 V600 H0 Z" fill="#27495a" />
        <path d="M0 540 C260 515 560 540 760 530 S940 520 1000 534 V600 H0 Z" fill="#3c6b4f" />
        {sky.map((o, i) => {
          if (f < o.t0 || caught.has(i) || f > o.arr + 8) return null
          const y = TOP + (f - o.t0) / (o.arr - o.t0) * (LAND - TOP)
          const s = o.k === 'big' ? 2.6 : o.k === 'dust' ? 2 : 2.4
          return <g key={i} transform={`translate(${o.x} ${y}) scale(${s})`} opacity={f > o.arr ? 0.4 : 1}>{o.k === 'big' ? <Star /> : o.k === 'dust' ? <Dust /> : <Cloud />}</g>
        })}
        {others.map(g => <g key={g.pid} transform={`translate(${g.x} ${LAND + 22})`} opacity=".42"><Jar tint={g.tint} /><text y="54" textAnchor="middle" className="mc-tag">{nm(g.pid)}</text></g>)}
        {canPlay && <g transform={`translate(${st.x} ${LAND + 22})`}><Jar tint="#f7c45a" /><text y="54" textAnchor="middle" className="mc-tag me">You</text></g>}
        {pops.map(o => <text key={o.arr + ':' + o.x} x={st.x} y={LAND - 30 - (st.n - o.arr) * 2} textAnchor="middle" className={`mc-pop ${VALUE[o.k] < 0 ? 'bad' : ''}`}>{VALUE[o.k] > 0 ? `+${VALUE[o.k]}` : VALUE[o.k]}</text>)}
      </svg>
      <div className="mc-head">
        <div className="ms-title"><b>Wishfall Catch</b><small>Everyone at once</small></div>
        <div className="mc-ring" style={{ '--p': `${(left / 30) * 100}%` }}><span>{phase === 'play' ? left : 30}</span></div>
      </div>
      <ul className="mc-scores">
        {canPlay && <li className="me"><b>You</b><span>{st.score}</span></li>}
        {others.map(g => <li key={g.pid}><b>{nm(g.pid)}</b><span>{phase === 'play' ? g.score : 0}</span></li>)}
      </ul>
      <ul className="mc-legend">
        <li><Ico><Star face={false} glow={false} /></Ico>Big star +3</li>
        <li><Ico><Dust /></Ico>Stardust +1</li>
        <li><Ico><Cloud /></Ico>Dud cloud -2</li>
      </ul>
      <div className="ms-hint">{canPlay ? (st.n >= TICKS ? 'Jar sent to the referee' : 'Drag or use the arrow keys to move') : "You're watching the sky"}</div>
    </div>
  )
}
