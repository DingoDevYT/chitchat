// Lantern Lift on screen: the same sim the referee replays (lift.js), stepped from the shared start. Hold anywhere
// (mouse, finger, Space) to fill the lantern, let go to float. Chitbots' lanterns drift beside yours as ghosts flown
// from (seed, seat, level), exactly the runs the referee posts for them. Phones in portrait get a tall sky.
import { useEffect, useMemo, useRef, useState } from 'react'
import { BAND, HZ, LANTERNS, SEG, TICKS, botLog, makeLanterns, newRun, replay, step } from './lift.js'
import { Sky } from './art.jsx'
import { TINTS, useFrame, useTall } from './tall.js'
import './trio.css'

export const how = {
  line: 'Three paper lanterns, one at a time. Hold to fill each with warm air, let go, and stop it in the gold band. Too high and it bursts.',
  mouse: 'press and hold anywhere, let go to float',
  touch: 'press and hold anywhere, let go to float',
  keys: 'hold Space (or Up), let go to float',
}

const word = r => (r.burst ? 'burst' : String(r.p))
export function detail(reveal, pid) {
  const r = reveal.runs?.[pid]
  return r ? `${r.score} points: ${r.res.map(word).join(', ')}` : 'Missed the lanterns'
}

const PH = { wait: 0, hold: 1, rise: 2, done: 3 }

function Lantern({ glow = 0, tint = '#f7a24a', burst = false, age = 0 }) {
  if (burst) {
    if (age > 40) return null
    const k = age / 40
    return (
      <g opacity={1 - k}>
        {[[-1, -1], [1, -1.2], [-1.3, 0.3], [1.2, 0.5], [0, -1.5], [0.2, 1]].map(([dx, dy], i) => (
          <path key={i} transform={`translate(${dx * (14 + age * 2)} ${dy * (14 + age * 2)}) rotate(${i * 60 + age * 6})`} d="M-7 -5 L7 -3 L4 6 L-6 4 Z" fill={tint} stroke="#8a5232" strokeWidth="1.5" />
        ))}
        <circle r={10 + age} fill="none" stroke="#ffd877" strokeWidth="3" />
      </g>
    )
  }
  return (
    <g>
      {glow > 0 && <circle r={38 + glow * 14} fill="url(#ll-glow)" opacity={0.4 + glow * 0.6} />}
      <rect x="-14" y="-44" width="28" height="7" rx="3" fill="#8a5232" />
      <path d="M-14 -38 Q-34 -30 -34 0 Q-34 30 -14 36 L14 36 Q34 30 34 0 Q34 -30 14 -38 Z" fill={tint} stroke="#8a5232" strokeWidth="2.5" />
      <path d="M0 -38 V36 M-18 -35 Q-24 0 -18 35 M18 -35 Q24 0 18 35" stroke="#8a5232" strokeOpacity=".45" strokeWidth="1.6" fill="none" />
      <path d="M-24 -18 Q-27 -2 -24 14" stroke="#fff" strokeOpacity=".45" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="-12" y="35" width="24" height="6" rx="3" fill="#8a5232" />
      <path d={`M0 ${30 - glow * 10} Q5 ${36 - glow * 4} 0 40 Q-5 ${36 - glow * 4} 0 ${30 - glow * 10} Z`} fill="#ffd877" opacity={0.5 + glow * 0.5} />
    </g>
  )
}

export function Play({ state, me, nm, act, levels, startAt, phase, canPlay, v }) {
  const tall = useTall()
  const Wv = tall ? 600 : 1000, Hv = tall ? 1000 : 600
  const ground = Hv - 70, top = tall ? 170 : 110, sc = (ground - top) / 900
  const sy = y => ground - y * sc
  const lans = useMemo(() => makeLanterns(state.seed), [state.seed])
  const ghosts = useMemo(() => state.players.filter(p => p.startsWith('bot:')).map(pid => {
    const { log } = botLog(state.seed, state.players.indexOf(pid), levels?.[pid] || 'normal')
    const ys = new Int16Array(TICKS + 1), ph = new Uint8Array(TICKS + 1), score = new Int16Array(TICKS + 1)
    replay(state.seed, log, lans, st => {
      ys[st.n] = st.L.y
      ph[st.n] = st.L.ph === 'done' ? (st.res.at(-1)?.burst ? 4 : 3) : PH[st.L.ph]
      score[st.n] = st.score
    })
    return { pid, ys, ph, score, tint: TINTS[v.players.indexOf(pid) % TINTS.length] }
  }), [state.seed, lans]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = useRef(newRun()), log = useRef([]), down = useRef(0), sent = useRef(false), doneAt = useRef({})
  const [f, setF] = useState(-1)
  useFrame(() => {
    const fr = (Date.now() - startAt) * HZ / 1000
    const st = run.current
    if (canPlay && phase === 'play' && st.n < TICKS) {
      const tick = Math.min(TICKS, Math.floor(fr))
      while (st.n < tick) {
        if (down.current !== st.down) { st.down = down.current; log.current.push([st.n, st.down]) }
        const before = st.res.length
        step(st, lans)
        if (st.res.length > before) doneAt.current[before] = st.n
      }
    }
    if (canPlay && st.n >= TICKS && !sent.current) {
      sent.current = true
      act('move', { move: { type: 'mini', log: log.current, score: st.score } })
    }
    setF(fr)
  }, [startAt, canPlay, phase, lans])

  useEffect(() => {
    const keys = e => {
      if (/input|textarea|select/i.test(e.target.tagName) || e.repeat) return
      const k = e.key
      if (k !== ' ' && k !== 'Enter' && k !== 'ArrowUp' && k.toLowerCase() !== 'w') return
      e.preventDefault()
      down.current = e.type === 'keydown' ? 1 : 0
    }
    const off = () => { down.current = 0 }
    addEventListener('keydown', keys)
    addEventListener('keyup', keys)
    addEventListener('blur', off)
    return () => { removeEventListener('keydown', keys); removeEventListener('keyup', keys); removeEventListener('blur', off) }
  }, [])
  const press = e => { e.currentTarget.setPointerCapture?.(e.pointerId); down.current = 1 }
  const lift = () => { down.current = 0 }

  const st = run.current, tick = Math.max(0, Math.min(TICKS, Math.floor(f)))
  const k = Math.max(0, Math.min(LANTERNS - 1, Math.floor(Math.max(0, f) / SEG)))
  const lan = lans[k]
  const mine = st.k === k ? st.L : { ph: 'wait', y: 0, heat: 0 }
  const myRes = mine.ph === 'done' ? st.res[k] : null
  const myAge = myRes ? st.n - (doneAt.current[k] ?? st.n) : 0
  const n = ghosts.length, half = Wv / 2 - 70, gap = n ? Math.min(120, half / Math.ceil(n / 2)) : 0
  const others = ghosts.map((g, i) => {
    const side = i % 2 ? 1 : -1, x = Wv / 2 + side * gap * (Math.floor(i / 2) + 1)
    let age = 0
    if (g.ph[tick] === 4) { let t = tick; while (t > 0 && g.ph[t - 1] === 4) t--; age = tick - t }
    return { ...g, x, y: g.ys[tick], p: g.ph[tick], age, s: g.score[tick] }
  })
  const segLeft = Math.max(0, Math.ceil(((k + 1) * SEG - Math.max(0, f)) / HZ))
  const say = !canPlay ? "You're watching the lanterns"
    : phase !== 'play' ? 'Get ready to hold'
    : st.n >= TICKS ? 'Lanterns sent to the referee'
    : myRes ? (myRes.burst ? 'It burst! Too high.' : myRes.y >= lan.gold - BAND ? `In the band: +${myRes.p}` : `Too low: +${myRes.p}`)
    : mine.ph === 'hold' ? 'Let go to float' : mine.ph === 'rise' ? 'Floating…' : 'Hold to fill the lantern'
  return (
    <div className={`ll${tall ? ' tall' : ''}`} onPointerDown={canPlay ? press : undefined} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift}>
      <svg className="ll-field" viewBox={`0 0 ${Wv} ${Hv}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lanterns over the meadow">
        <defs>
          <radialGradient id="ll-glow"><stop offset="0" stopColor="#ffe9a8" stopOpacity=".9" /><stop offset=".5" stopColor="#ffb24a" stopOpacity=".3" /><stop offset="1" stopColor="#ffb24a" stopOpacity="0" /></radialGradient>
          <linearGradient id="ll-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b1a45" /><stop offset="1" stopColor="#4a3f78" /></linearGradient>
        </defs>
        <rect width={Wv} height={Hv} fill="url(#ll-sky)" />
        <Sky w={Wv} h={Hv} n={tall ? 46 : 40} />
        <rect x="0" y={top - 40} width={Wv} height={Math.max(0, sy(lan.gold + BAND) - top + 40)} fill="#e7787f" opacity=".12" />
        <text x={Wv - 14} y={sy(lan.gold + BAND) - 10} textAnchor="end" className="ll-mark bad">Too high: it bursts</text>
        <rect x="0" y={sy(lan.gold + BAND)} width={Wv} height={sy(lan.gold - BAND) - sy(lan.gold + BAND)} fill="#ffd45a" opacity=".22" />
        <line x1="0" x2={Wv} y1={sy(lan.gold)} y2={sy(lan.gold)} stroke="#ffd45a" strokeWidth="3" strokeDasharray="14 10" />
        <text x="14" y={sy(lan.gold) - 10} className="ll-mark">Gold line</text>
        <path d={`M0 ${ground - 10} C${Wv * 0.25} ${ground - 34} ${Wv * 0.6} ${ground + 6} ${Wv} ${ground - 18} V${Hv} H0 Z`} fill="#27495a" />
        <path d={`M0 ${ground + 26} C${Wv * 0.3} ${ground + 6} ${Wv * 0.7} ${ground + 30} ${Wv} ${ground + 16} V${Hv} H0 Z`} fill="#3c6b4f" />
        {others.filter(g => g.p !== 4 || g.age <= 40).map(g => (
          <g key={g.pid} transform={`translate(${g.x} ${sy(g.y) - 30}) scale(.62)`} opacity=".5">
            <Lantern tint={g.tint} glow={g.p === 1 ? 1 : g.p === 2 ? 0.5 : 0} burst={g.p === 4} age={g.age} />
            <text y="78" textAnchor="middle" className="ll-tag">{nm(g.pid)}</text>
          </g>
        ))}
        {canPlay && (
          <g transform={`translate(${Wv / 2} ${sy(mine.y) - 44})`}>
            <Lantern glow={mine.ph === 'hold' ? Math.min(1, mine.heat / 160) : mine.ph === 'rise' ? Math.min(1, mine.heat / 240) : 0} burst={!!myRes?.burst} age={myAge} />
            {!myRes?.burst && <text y="62" textAnchor="middle" className="ll-tag me">You</text>}
            {myRes && myAge < 60 && <text y={-60 - myAge} textAnchor="middle" className={`mc-pop${myRes.burst ? ' bad' : ''}`}>{myRes.burst ? 'Burst' : `+${myRes.p}`}</text>}
          </g>
        )}
      </svg>
      <div className="mc-head ll-head">
        <div className="ms-title"><b>Lantern Lift</b><small>Lantern {k + 1} of {LANTERNS}</small></div>
        <div className="mc-ring" style={{ '--p': `${(segLeft / (SEG / HZ)) * 100}%` }}><span>{phase === 'play' ? segLeft : SEG / HZ}</span></div>
      </div>
      <ul className="mc-scores">
        {canPlay && <li className="me"><b>You</b><span>{st.score}</span></li>}
        {others.map(g => <li key={g.pid}><b>{nm(g.pid)}</b><span>{phase === 'play' ? g.s : 0}</span></li>)}
      </ul>
      <ol className="ll-pips" aria-label="Your lanterns">
        {Array.from({ length: LANTERNS }, (_, i) => <li key={i} className={st.res[i] ? (st.res[i].burst ? 'burst' : 'ok') : i === k ? 'now' : ''}>{st.res[i] ? word(st.res[i]) : i + 1}</li>)}
      </ol>
      <div className="ll-say" aria-live="polite">{say}</div>
      {canPlay && <div className={`ll-hold${mine.ph === 'hold' ? ' on' : ''}`} aria-hidden="true">Hold</div>}
    </div>
  )
}
