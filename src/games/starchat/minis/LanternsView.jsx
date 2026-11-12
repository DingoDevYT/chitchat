// Three Lanterns on screen: three paper lanterns on a cord over the meadow, everyone round the edge (the hider marked),
// the hider's point, and a card at the bottom to hide the star (hider) or pick a lantern (seekers). Where you hid it or
// what you picked is remembered only in this browser until the reveal; the referee keeps the real thing secret.
import { useEffect, useState } from 'react'
import { N, open } from './lanterns.js'
import { Lantern, LanternDefs, StarMini, TINTS, initials } from './moreArt.jsx'
import './more.css'

export const how = {
  line: 'One player hides the star under a lantern and may point at one, truthfully or not. Everyone else picks a lantern. Bluff out loud!',
  mouse: 'click a lantern, then the button to lock it in',
  touch: 'tap a lantern, then the button',
  keys: '1, 2 or 3 to choose, Shift with 1-3 to point (hider), Enter to lock it in',
}

const who = (p, me, nm) => (p === me ? 'You' : nm(p))

export function detail(reveal, pid) {
  const hid = reveal.history.filter(h => h.hider === pid)
  const found = reveal.history.filter(h => h.found.includes(pid)).length
  const fooled = hid.reduce((a, h) => a + h.hiderGot, 0)
  const parts = [`${reveal.points[pid] ?? 0} points`]
  if (found) parts.push(`found it ${found === 1 ? 'once' : `${found} times`}`)
  if (hid.length) parts.push(`${fooled} from hiding`)
  return parts.join(', ')
}

export function Reveal({ reveal, nm, me }) {
  const last = reveal.history.at(-1)
  return last ? <p className="ms-line">Last round {who(last.hider, me, nm)} hid the star under lantern {last.at + 1}{last.tease != null ? ` and pointed at ${last.tease + 1}` : ''}.</p> : null
}

function RoundNews({ h, me, nm }) {
  if (!h) return null
  const names = l => (l.length ? l.map(p => who(p, me, nm)).join(', ') : 'nobody')
  return (
    <div className="ml-news" key={h.round}>
      <b>Round {h.round}</b>
      <span>{who(h.hider, me, nm)} hid it under lantern {h.at + 1}{h.tease != null ? (h.tease === h.at ? ' and pointed right at it' : ` but pointed at ${h.tease + 1}`) : ''}.</span>
      <span>Found it: {names(h.found)}. Fooled: {names(h.fooled)}.</span>
    </div>
  )
}

export function Play({ state, me, nm, act, phase, canPlay, busy, v }) {
  const hiding = state.step === 'hide', iHide = state.hider === me
  const mayHide = canPlay && phase === 'play' && hiding && iHide && !busy
  const maySeek = canPlay && phase === 'play' && open(state, me) && !busy
  const [sel, setSel] = useState(null), [tease, setTease] = useState(null)
  const [mine, setMine] = useState({}) // round -> { hid, picked } (this browser only)
  const r = state.round
  useEffect(() => { setSel(null); setTease(null) }, [r, state.step])
  const last = state.history.at(-1)
  const [fresh, setFresh] = useState(false)
  useEffect(() => { if (!last) return; setFresh(true); const t = setTimeout(() => setFresh(false), 3500); return () => clearTimeout(t) }, [state.history.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    if (sel == null) return
    if (mayHide) { act('move', { move: { type: 'mini', lantern: sel, tease } }); setMine(m => ({ ...m, [r]: { hid: sel, tease } })) }
    else if (maySeek) { act('move', { move: { type: 'mini', lantern: sel } }); setMine(m => ({ ...m, [r]: { picked: sel } })) }
  }
  useEffect(() => {
    if (!mayHide && !maySeek) return
    const kd = e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return
      const d = /^Digit([1-3])$/.exec(e.code)
      if (d) { e.preventDefault(); const l = +d[1] - 1; if (e.shiftKey && mayHide) setTease(t => (t === l ? null : l)); else setSel(l) }
      else if (e.key === 'Enter') { e.preventDefault(); send() }
    }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  })

  const my = mine[r] || {}
  const pointAt = hiding ? (mayHide ? tease : null) : state.tease
  const showStar = !hiding && my.hid != null ? my.hid : fresh && last && hiding ? last.at : null
  const lastPicks = fresh && hiding && last ? last.picks : null
  const n = state.order.length
  const say = !canPlay ? 'Watching the lanterns.'
    : phase !== 'play' ? 'Get ready…'
    : mayHide ? (sel == null ? 'Your turn to hide the star: pick a lantern.' : 'Point at a lantern to bluff (or not), then hide it.')
    : hiding ? `${nm(state.hider)} is hiding the star…`
    : iHide ? `The star is under lantern ${my.hid != null ? my.hid + 1 : '?'}. Talk them into the wrong one.`
    : maySeek ? (sel == null ? 'Which lantern is the star under?' : `Lantern ${sel + 1}?`)
    : my.picked != null ? `You picked lantern ${my.picked + 1}. Waiting for the others…` : 'Waiting for the others…'

  return (
    <div className="ml">
      <div className="ml-head ms-title"><b>Three Lanterns</b><small>Round {r} of {state.rounds}</small></div>
      <ul className="ml-seats">
        {state.order.map((p, i) => (
          <li key={p} className={`${p === state.hider ? 'hider' : ''}${state.picked.includes(p) ? ' in' : ''}${p === me ? ' me' : ''}`}>
            <span className="ml-face" style={{ background: TINTS[v.players.indexOf(p) % TINTS.length] }}>{initials(who(p, me, nm))}</span>
            <span className="ml-nm">{who(p, me, nm)}<small>{p === state.hider ? 'Hider' : state.picked.includes(p) ? 'Picked' : hiding ? 'Seeker' : 'Choosing'}</small></span>
            <b>{state.points[p]}</b>
          </li>
        ))}
      </ul>
      <div className="ml-stage">
        <svg className="ml-cord" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 Q300 46 600 6" stroke="#4a3328" strokeWidth="3" fill="none" /></svg>
        {Array.from({ length: N }, (_, l) => {
          const chosen = sel === l && (mayHide || maySeek)
          return (
            <button key={l} className={`ml-lantern${chosen ? ' sel' : ''}`} disabled={!(mayHide || maySeek)} onClick={() => setSel(l)} aria-label={`Lantern ${l + 1}`} aria-pressed={chosen}>
              {pointAt === l && <span className="ml-point">{hiding ? 'You point here' : `${who(state.hider, me, nm)} points here`}</span>}
              <svg viewBox="-60 -80 120 170" aria-hidden="true">
                <LanternDefs />
                {showStar === l && <g transform="translate(0 70) scale(2)"><StarMini /></g>}
                <g transform={showStar === l ? 'translate(0 -10)' : undefined}><Lantern n={l + 1} tint={['#f2a65a', '#e7787f', '#8fcf7a'][l]} lit={chosen || showStar === l || !(mayHide || maySeek)} /></g>
              </svg>
              {lastPicks && (
                <span className="ml-picks">
                  {Object.entries(lastPicks).filter(([, x]) => x === l).map(([p]) => <i key={p} style={{ background: TINTS[v.players.indexOf(p) % TINTS.length] }}>{initials(who(p, me, nm))}</i>)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <RoundNews h={last} me={me} nm={nm} />
      <div className="mb-act ml-act">
        <p className="mb-say">{say}</p>
        {mayHide && (
          <div className="ml-tease" role="group" aria-label="Point at">
            <span>Point at</span>
            {[null, 0, 1, 2].map(t => <button key={String(t)} className={`ml-chip${tease === t ? ' on' : ''}`} onClick={() => setTease(t)}>{t == null ? 'None' : t + 1}</button>)}
          </div>
        )}
        {(mayHide || maySeek) && (
          <button className="ms-btn honey ml-go" disabled={sel == null} onClick={send}>
            {mayHide ? 'Hide the star' : 'Pick this lantern'}<small>{sel == null ? 'tap a lantern first' : `lantern ${sel + 1}`}</small>
          </button>
        )}
        {!hiding && !mayHide && <p className="ml-left">{state.picked.length} of {n - 1} seekers have picked</p>}
      </div>
    </div>
  )
}
