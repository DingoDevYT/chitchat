// Owl Says on screen: Inkwell hoots the seeded calls (owl.js) from the branch; four big lantern buttons sit near your
// thumbs. Taps are counted against the shared start on your own clock and scored with the same function the referee
// replays; Chitbots' scores tick up beside yours.
import { useEffect, useMemo, useRef, useState } from 'react'
import { DIRS, HZ, PTS, TICKS, WINDOW, botLog, makeCalls, newRun, settle, tap } from './owl.js'
import { Sky } from './art.jsx'
import { useFrame, useTall } from './tall.js'
import './trio.css'

export const how = {
  line: 'Inkwell calls a direction or a colour. Tap it fast, but only if the owl says "Owl says". Wrong buttons and jumping early cost points.',
  mouse: 'click the lantern buttons',
  touch: 'tap the lantern buttons',
  keys: 'arrow keys or W A S D',
}

export function detail(reveal, pid) {
  const r = reveal.runs?.[pid]
  if (!r) return 'Missed the owl'
  const avg = r.right ? `, ${(r.avg / 1000).toFixed(2)} s on average` : ''
  return `${r.score} points: ${r.right} right${avg}${r.fooled ? `, fooled ${r.fooled}` : ''}`
}

const LABEL = { up: 'Up', right: 'Right', down: 'Down', left: 'Left', honey: 'Honey', berry: 'Berry', sage: 'Sage', plum: 'Plum' }
const FILL = { honey: '#f7c45a', berry: '#e7787f', sage: '#8fcf7a', plum: '#a78bd8' }
const KEYS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 }
const SAY = { right: n => `+${n}`, wrong: () => `Wrong ${PTS.wrong}`, fooled: () => `The owl didn't say! ${PTS.fooled}`, early: () => `Too soon ${PTS.early}` }

function Owl({ calling }) {
  return (
    <g>
      <path d="M-150 70 Q0 52 150 74" stroke="#6b3e24" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M-40 -58 L-30 -88 L-14 -66 Z M40 -58 L30 -88 L14 -66 Z" fill="#2c3870" />
      <ellipse cy="0" rx="62" ry="72" fill="#3b4a8a" stroke="#222b55" strokeWidth="3" />
      <ellipse cy="22" rx="38" ry="44" fill="#8fa0d8" />
      <path d="M-20 18 q6 5 12 0 M8 18 q6 5 12 0 M-14 34 q6 5 12 0 M2 34 q6 5 12 0" stroke="#5f6fae" strokeWidth="2" fill="none" />
      <circle cx="-24" cy="-26" r="20" fill="#fff8ec" stroke="#222b55" strokeWidth="2.5" />
      <circle cx="24" cy="-26" r="20" fill="#fff8ec" stroke="#222b55" strokeWidth="2.5" />
      {calling
        ? <g fill="#1d1b33"><circle cx="-24" cy="-26" r="9" /><circle cx="24" cy="-26" r="9" /><circle cx="-21" cy="-29" r="3" fill="#fff" /><circle cx="27" cy="-29" r="3" fill="#fff" /></g>
        : <path d="M-38 -24 Q-24 -16 -10 -24 M10 -24 Q24 -16 38 -24" stroke="#1d1b33" strokeWidth="3.5" fill="none" strokeLinecap="round" />}
      <path d={calling ? 'M-9 -6 L0 4 L9 -6 L0 14 Z' : 'M-8 -6 L0 6 L8 -6 Z'} fill="#f7c45a" stroke="#8a5232" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M-24 70 l-6 8 M-16 70 l0 9 M-8 70 l6 8 M8 70 l-6 8 M16 70 l0 9 M24 70 l6 8" stroke="#f2a65a" strokeWidth="3.5" strokeLinecap="round" />
    </g>
  )
}

function Arrow({ dir }) {
  return (
    <svg viewBox="-24 -24 48 48" width="44" height="44" aria-hidden="true">
      <path transform={`rotate(${DIRS.indexOf(dir) * 90})`} d="M0 -20 L17 0 H7 V18 H-7 V0 H-17 Z" fill="#fff8ec" stroke="#3a2a3f" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}

export function Play({ state, nm, act, levels, startAt, phase, canPlay }) {
  const tall = useTall()
  const sched = useMemo(() => makeCalls(state.seed), [state.seed])
  const ghosts = useMemo(() => state.players.filter(p => p.startsWith('bot:')).map(pid => {
    const { log } = botLog(state.seed, state.players.indexOf(pid), levels?.[pid] || 'normal')
    const sc = new Int16Array(TICKS + 1), st = newRun()
    let j = 0
    for (let t = 0; t <= TICKS; t++) {
      settle(st, sched, t)
      while (j < log.length && log[j][0] === t) { tap(st, sched, t, log[j][1]); j++ }
      sc[t] = st.score
    }
    return { pid, sc }
  }), [state.seed, sched]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = useRef(newRun()), log = useRef([]), sent = useRef(false), last = useRef(null), lastT = useRef(-1)
  const [f, setF] = useState(-1)
  const [flash, setFlash] = useState(null)
  const live = canPlay && phase === 'play'
  useFrame(() => {
    const fr = (Date.now() - startAt) * HZ / 1000
    if (live && fr >= 0) settle(run.current, sched, Math.min(TICKS, Math.floor(fr)))
    if (canPlay && fr >= TICKS && !sent.current) {
      sent.current = true
      const st = settle(run.current, sched)
      act('move', { move: { type: 'mini', log: log.current, score: st.score } })
    }
    setF(fr)
  }, [startAt, canPlay, live, sched])

  const press = b => {
    if (!live || sent.current) return
    const t = Math.floor((Date.now() - startAt) * HZ / 1000), st = run.current
    if (t < 0 || t >= TICKS || t <= lastT.current) return
    const before = st.score
    const kind = tap(st, sched, t, b)
    lastT.current = t
    log.current.push([t, b])
    last.current = { kind, n: st.score - before, t }
    setFlash({ b, t })
  }
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const keys = e => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.repeat) return
      const b = KEYS[e.key.toLowerCase()]
      if (b == null) return
      e.preventDefault()
      pressRef.current(b)
    }
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  }, [])

  const st = run.current, tick = Math.max(0, Math.min(TICKS, Math.floor(f)))
  const ci = sched.calls.findIndex(c => f >= c.t && f < c.t + WINDOW)
  const call = ci >= 0 ? sched.calls[ci] : null
  const word = call ? LABEL[call.by === 'dir' ? DIRS[call.btn] : sched.colours[call.btn]] : null
  const lj = last.current && f - last.current.t < 50 ? last.current : null
  const left = Math.max(0, Math.ceil((TICKS - Math.max(0, f)) / HZ))
  const Wv = tall ? 600 : 1000, Hv = tall ? 560 : 300
  return (
    <div className={`ow${tall ? ' tall' : ''}`}>
      <svg className="ow-sky" viewBox={`0 0 ${Wv} ${Hv}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width={Wv} height={Hv} fill="#1f1d4d" />
        <Sky w={Wv} h={Hv} n={30} />
        <circle cx={Wv - 90} cy={tall ? 250 : 70} r="34" fill="#fff3c4" opacity=".85" />
      </svg>
      <div className="ow-perch">
        <svg className="ow-owl" viewBox="-160 -100 320 190" role="img" aria-label="Inkwell the owl"><Owl calling={!!call} /></svg>
        <div className={`ow-bubble${call ? (call.says ? ' says' : ' plain') : ' quiet'}`} aria-live="assertive">
          {phase !== 'play' ? 'Listen for "Owl says"…' : call ? (call.says ? <>Owl says: <b>{word}!</b></> : <b>{word}!</b>) : 'Hoo…'}
          {call && <i className="ow-time" style={{ width: `${Math.max(0, 100 - (f - call.t) * 100 / WINDOW)}%` }} />}
        </div>
      </div>
      <div className="mc-head ow-head">
        <div className="ms-title"><b>Owl Says</b><small>Only when the owl says so</small></div>
        <div className="mc-ring" style={{ '--p': `${(left / 30) * 100}%` }}><span>{phase === 'play' ? left : 30}</span></div>
      </div>
      <ul className="mc-scores">
        {canPlay && <li className="me"><b>You</b><span>{st.score}</span></li>}
        {ghosts.map(g => <li key={g.pid}><b>{nm(g.pid)}</b><span>{phase === 'play' ? g.sc[tick] : 0}</span></li>)}
      </ul>
      {lj && <div key={lj.t} className={`ow-chip ${lj.kind}`}>{SAY[lj.kind](lj.n)}</div>}
      <div className="ow-pad" role="group" aria-label="Lantern buttons">
        {DIRS.map((d, b) => (
          <button key={d} className={`ow-btn ow-${d}${flash?.b === b && f - flash.t < 10 ? ' hit' : ''}`} style={{ '--c': FILL[sched.colours[b]] }}
            disabled={!canPlay} aria-label={`${LABEL[d]}, ${LABEL[sched.colours[b]]}`}
            onPointerDown={e => { e.preventDefault(); press(b) }} onKeyDown={e => e.key === 'Enter' && e.preventDefault()}>
            <Arrow dir={d} />
            <small>{LABEL[sched.colours[b]]}</small>
          </button>
        ))}
      </div>
      {!canPlay && <div className="ms-hint">You're watching the owl</div>}
    </div>
  )
}
