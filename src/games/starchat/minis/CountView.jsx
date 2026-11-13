// Firefly Count on screen: a jar of fireflies blinks for six seconds from the shared start, then a number dial for
// one secret guess before the pick timer runs out.
import { useEffect, useState } from 'react'
import { BLINK_MS } from './count.js'

export const how = {
  line: 'Fireflies blink in the jar for 6 seconds. Count them, then guess how many. Closest wins; exact earns a bonus.',
  mouse: 'click minus and plus (or drag the slider), then Lock it in',
  touch: 'tap minus and plus, then Lock it in',
  keys: 'Up and Down to change, Enter to lock it in',
}

export function detail(reveal, pid) {
  const g = reveal.guesses?.[pid]
  if (g == null) return 'No guess'
  const off = Math.abs(g - reveal.target)
  return off ? `Guessed ${g} (${off} off)` : `Guessed ${g}: exact!`
}

export function Reveal({ reveal }) {
  return (
    <div className="mf-reveal">
      <JarArt small />
      <p className="ms-line">There were <b>{reveal.target}</b> fireflies in the jar.</p>
    </div>
  )
}

function JarArt({ children, small }) {
  return (
    <svg className={`mf-jar${small ? ' small' : ''}`} viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <radialGradient id="mf-glow"><stop offset="0" stopColor="#fbff9e" /><stop offset=".35" stopColor="#d9f56a" stopOpacity=".9" /><stop offset="1" stopColor="#d9f56a" stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="22" y="2" width="56" height="10" rx="4" fill="#b9784a" stroke="#6b3e24" strokeWidth="1.5" />
      <path d="M26 12 h48 q6 0 8 6 q6 10 6 22 v54 q0 12 -12 12 h-52 q-12 0 -12 -12 v-54 q0 -12 6 -22 q2 -6 8 -6 z" fill="#1d2747" fillOpacity=".85" stroke="#9ccbe0" strokeWidth="2" />
      <path d="M20 40 q0 -8 4 -14" stroke="#fff" strokeOpacity=".4" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {children}
    </svg>
  )
}

export function Play({ state, act, startAt, phase, canPlay, busy }) {
  const [now, setNow] = useState(Date.now())
  const el = now - startAt, watching = el < state.showMs
  useEffect(() => {
    let raf
    const loop = () => { setNow(Date.now()); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const [g, setG] = useState(Math.round((state.lo + state.hi) / 2))
  const [sent, setSent] = useState(false)
  const pickLeft = Math.max(0, Math.ceil((startAt + state.showMs + state.pickMs - now) / 1000))
  const lock = () => { if (!sent) { setSent(true); act('move', { move: { type: 'mini', guess: g } }) } }
  const pickable = canPlay && phase === 'play' && !watching && !sent && !busy
  const keys = e => {
    if (/input|textarea/i.test(e.target.tagName) && e.key !== 'Enter') return
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setG(x => Math.min(state.hi, x + 1)) }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setG(x => Math.max(state.lo, x - 1)) }
    if (e.key === 'Enter') lock()
  }
  useEffect(() => {
    if (!pickable) return
    addEventListener('keydown', keys)
    return () => removeEventListener('keydown', keys)
  })
  const lit = phase === 'play' && watching ? state.blinks.filter(b => el >= b.t && el < b.t + BLINK_MS) : []
  return (
    <div className="mf">
      {/* after the pick timer the referee needs a few seconds to settle it: say so instead of sitting on "0s left" */}
      <div className="mf-head ms-title"><b>Firefly Count</b><small>{phase !== 'play' ? 'Watch the jar closely' : watching ? `Watch and count… ${Math.ceil((state.showMs - el) / 1000)}` : pickLeft ? 'How many were there?' : 'Time is up. Counting the guesses…'}</small></div>
      <div className="mf-stage">
        <JarArt>
          {lit.map((b, i) => {
            const k = (el - b.t) / BLINK_MS, a = 1 - Math.abs(2 * k - 1)
            return <g key={`${b.t}:${b.x}:${b.y}:${i}`} opacity={a}><circle cx={b.x} cy={b.y + 8} r={b.s * 2.4} fill="url(#mf-glow)" /><circle cx={b.x} cy={b.y + 8} r={b.s * 0.45} fill="#fffde0" /></g>
          })}
        </JarArt>
      </div>
      {phase === 'play' && !watching && (
        <div className="mf-pick">
          {canPlay || sent ? (
            <>
              <div className="mf-dial">
                <button className="ms-btn plain round" aria-label="One fewer" disabled={!pickable || !pickLeft || g <= state.lo} onClick={() => setG(x => Math.max(state.lo, x - 1))}>-</button>
                <output className="mf-num" aria-live="polite">{g}</output>
                <button className="ms-btn plain round" aria-label="One more" disabled={!pickable || !pickLeft || g >= state.hi} onClick={() => setG(x => Math.min(state.hi, x + 1))}>+</button>
              </div>
              {!sent && <input className="mf-slide" type="range" min={state.lo} max={state.hi} value={g} disabled={!pickable || !pickLeft} onChange={e => setG(+e.target.value)} aria-label="Your guess" />}
              {sent
                ? <button className="ms-btn honey locked" disabled aria-pressed="true">Locked in: {g}<small>{pickLeft ? 'waiting for the others' : 'counting…'}</small></button>
                : <button className="ms-btn honey" disabled={!pickable || !pickLeft} onClick={lock} autoFocus>{pickLeft ? 'Lock it in' : "Time's up"}<small>{pickLeft ? `${pickLeft}s left` : 'counting…'}</small></button>}
            </>
          ) : <p className="mb-say">Watching the jar.</p>}
        </div>
      )}
    </div>
  )
}
