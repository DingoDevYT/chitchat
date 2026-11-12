// Teacup Tap on screen: cups slide along the tea tray to the kettle's spout on the beats of the seeded chart
// (tap.js). Tap anywhere (mouse, finger, Space) as a cup arrives. Your taps are counted against the shared start on
// your own clock and scored with the same function the referee replays; Chitbots' scores tick up beside yours.
import { useEffect, useMemo, useRef, useState } from 'react'
import { GOOD, HZ, LEAD, PERFECT, TICKS, botLog, makeChart, newRun, settle, tap } from './tap.js'
import { Sky } from './art.jsx'
import { useFrame, useTall } from './tall.js'
import './trio.css'

export const how = {
  line: 'Teacups slide along the tray to the kettle. Tap as each one reaches the spout: on the beat pours a full cup. Taps with no cup spill.',
  mouse: 'click anywhere as a cup arrives',
  touch: 'tap anywhere as a cup arrives',
  keys: 'Space, Enter, F or J',
}

export function detail(reveal, pid) {
  const r = reveal.runs?.[pid]
  return r ? `${r.score} points: ${r.perfect} on the beat, ${r.good} close, ${r.spill} ${r.spill === 1 ? 'spill' : 'spills'}` : 'Missed the tea'
}

function Cup({ full, missed }) {
  return (
    <g opacity={missed ? 0.45 : 1}>
      <ellipse cy="22" rx="40" ry="8" fill="#fff8ec" stroke="#c9a77f" strokeWidth="2" />
      <path d="M-28 -12 L28 -12 Q26 18 0 20 Q-26 18 -28 -12 Z" fill={missed ? '#b8b4c8' : '#fdf3f6'} stroke="#c06d7a" strokeWidth="2.5" />
      <path d="M27 -4 Q42 -4 40 6 Q38 14 24 12" fill="none" stroke="#c06d7a" strokeWidth="3.5" />
      <path d="M-22 2 Q0 8 22 2" stroke="#e7787f" strokeWidth="3" fill="none" />
      <ellipse cy="-12" rx="28" ry="6" fill={full ? '#a8683d' : '#efe0e6'} stroke="#c06d7a" strokeWidth="2" />
      {full && [-10, 4].map((x, i) => <path key={x} className="ms-steam" style={{ animationDelay: `${i * 0.4}s` }} d={`M${x} -22 q-5 -7 0 -14 q5 -7 0 -14`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" />)}
    </g>
  )
}

function Kettle({ pour }) {
  return (
    <g transform={`rotate(${pour ? 14 : 0})`}>
      <path d="M-60 -46 Q-68 -10 -46 18 L46 18 Q68 -10 60 -46 Z" fill="#7cc4a4" stroke="#2f6a52" strokeWidth="3" />
      <path d="M46 -16 Q92 -14 104 34" fill="none" stroke="#2f6a52" strokeWidth="14" strokeLinecap="round" />
      <path d="M46 -16 Q92 -14 104 34" fill="none" stroke="#7cc4a4" strokeWidth="8" strokeLinecap="round" />
      <path d="M-58 -30 Q-96 -24 -84 14 Q-80 22 -56 6" fill="none" stroke="#2f6a52" strokeWidth="7" />
      <ellipse cy="-48" rx="44" ry="10" fill="#9ad8bb" stroke="#2f6a52" strokeWidth="3" />
      <circle cy="-62" r="8" fill="#f7c45a" stroke="#8a5232" strokeWidth="2" />
      <g fill="#24451e"><circle cx="-16" cy="-14" r="3.5" /><circle cx="16" cy="-14" r="3.5" /></g>
      <path d={pour ? 'M-7 -2 Q0 4 7 -2' : 'M-6 -4 Q0 0 6 -4'} stroke="#24451e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  )
}

const WORD = { perfect: 'On the beat!', good: 'Close', spill: 'Spill' }

export function Play({ state, nm, act, levels, startAt, phase, canPlay, v }) {
  const tall = useTall()
  const Wv = tall ? 600 : 1000, Hv = tall ? 1000 : 600
  const trayY = tall ? 640 : 420, hitX = tall ? 190 : 320, fromX = Wv + 60
  const chart = useMemo(() => makeChart(state.seed), [state.seed])
  const ghosts = useMemo(() => state.players.filter(p => p.startsWith('bot:')).map(pid => {
    const { log } = botLog(state.seed, state.players.indexOf(pid), levels?.[pid] || 'normal')
    const sc = new Int16Array(TICKS + 1), st = newRun()
    let j = 0
    for (let t = 0; t <= TICKS; t++) { while (j < log.length && log[j] === t) tap(st, chart, log[j++]); sc[t] = st.score }
    return { pid, sc }
  }), [state.seed, chart]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = useRef(newRun()), log = useRef([]), sent = useRef(false), last = useRef(null)
  const [f, setF] = useState(-1)
  const live = canPlay && phase === 'play'
  useFrame(() => {
    const fr = (Date.now() - startAt) * HZ / 1000
    if (canPlay && fr >= TICKS && !sent.current) {
      sent.current = true
      const st = settle(run.current, chart)
      act('move', { move: { type: 'mini', log: log.current, score: st.score } })
    }
    setF(fr)
  }, [startAt, canPlay, chart])

  const hit = () => {
    if (!live || sent.current) return
    const t = Math.floor((Date.now() - startAt) * HZ / 1000), st = run.current
    if (t < 0 || t >= TICKS || t <= st.last) return
    const before = { p: st.perfect, g: st.good }
    tap(st, chart, t)
    log.current.push(t)
    last.current = { kind: st.perfect > before.p ? 'perfect' : st.good > before.g ? 'good' : 'spill', t }
  }
  const hitRef = useRef(hit)
  hitRef.current = hit
  useEffect(() => {
    const keys = e => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.repeat) return
      if (![' ', 'Enter', 'f', 'j', 'F', 'J'].includes(e.key)) return
      e.preventDefault()
      hitRef.current()
    }
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  }, [])

  const st = run.current, tick = Math.max(0, Math.min(TICKS, Math.floor(f)))
  const hits = new Map(st.hits)
  const px = c => hitX + (c - f) * (fromX - hitX) / LEAD
  const near = chart.some(c => Math.abs(c - f) <= PERFECT)
  const lj = last.current && f - last.current.t < 36 ? last.current : null
  const pour = lj && lj.kind !== 'spill' && f - lj.t < 14
  const left = Math.max(0, Math.ceil((TICKS - Math.max(0, f)) / HZ))
  return (
    <div className={`tt${tall ? ' tall' : ''}`} onPointerDown={canPlay ? hit : undefined}>
      <svg className="tt-field" viewBox={`0 0 ${Wv} ${Hv}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Teacups sliding to the kettle">
        <defs>
          <linearGradient id="tt-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2659" /><stop offset="1" stopColor="#4a3f78" /></linearGradient>
          <linearGradient id="tt-tray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cf9566" /><stop offset="1" stopColor="#a8683d" /></linearGradient>
        </defs>
        <rect width={Wv} height={Hv} fill="url(#tt-wall)" />
        <Sky w={Wv} h={Math.floor(trayY * 0.8)} n={28} />
        <rect x="0" y={trayY + 20} width={Wv} height={Hv - trayY - 20} fill="#5a3f4d" />
        <rect x="-10" y={trayY + 14} width={Wv + 20} height="34" rx="12" fill="url(#tt-tray)" stroke="#6b3e24" strokeWidth="3" />
        <ellipse cx={hitX} cy={trayY + 22} rx="52" ry="12" fill={near ? '#ffd877' : '#fff3dc'} opacity={near ? 0.9 : 0.35} />
        {chart.map((c, i) => {
          if (f < c - LEAD - 4 || f > c + 70) return null
          const k = hits.get(i)
          return <g key={i} transform={`translate(${px(c)} ${trayY - 10})`}><Cup full={!!k} missed={!k && f > c + GOOD} /></g>
        })}
        {pour && <path d={`M${hitX - 11} ${trayY - 92} Q${hitX - 2} ${trayY - 60} ${hitX} ${trayY - 26}`} stroke="#a8683d" strokeWidth="9" fill="none" strokeLinecap="round" opacity=".9" />}
        <g transform={`translate(${hitX - 104} ${trayY - 150})`}><Kettle pour={pour} /></g>
        {lj && <text x={hitX} y={trayY - 190 - (f - lj.t)} textAnchor="middle" className={`mc-pop${lj.kind === 'spill' ? ' bad' : ''}`}>{WORD[lj.kind]}</text>}
      </svg>
      <div className="mc-head tt-head">
        <div className="ms-title"><b>Teacup Tap</b><small>Tap on the beat</small></div>
        <div className="mc-ring" style={{ '--p': `${(left / 20) * 100}%` }}><span>{phase === 'play' ? left : 20}</span></div>
      </div>
      <ul className="mc-scores">
        {canPlay && <li className="me"><b>You</b><span>{st.score}</span></li>}
        {ghosts.map(g => <li key={g.pid}><b>{nm(g.pid)}</b><span>{phase === 'play' ? g.sc[tick] : 0}</span></li>)}
      </ul>
      <ul className="mc-legend tt-legend">
        <li><b>+3</b> on the beat</li>
        <li><b>+2</b> close</li>
        <li><b>-1</b> spill</li>
      </ul>
      {(phase !== 'play' || f < 3 * HZ || f >= TICKS || !canPlay) && <div className="ms-hint">{canPlay ? (f >= TICKS ? 'Taps sent to the referee' : 'Tap anywhere as a cup reaches the spout') : "You're watching the tea"}</div>}
    </div>
  )
}
