// Last Lantern Standing on screen: five numbered lanterns in a row (bigger numbers, bigger lanterns), the scoreboard,
// last round's lanterns with who lit each (doubles blown out, the one left standing glowing), and a card to light yours.
import { useEffect, useState } from 'react'
import { open } from './standing.js'
import { Lantern, LanternDefs, TINTS, initials } from './moreArt.jsx'
import './more.css'

export const how = {
  line: 'Secretly light a lantern from 1 to 5. Any number two people pick blows out; the highest lantern left standing scores its number.',
  mouse: 'click a lantern, then Light it',
  touch: 'tap a lantern, then Light it',
  keys: '1 to 5 to choose, Enter to light it',
}

const who = (p, me, nm) => (p === me ? 'You' : nm(p))

export function detail(reveal, pid) {
  const won = reveal.history.filter(h => h.winner === pid)
  return `${reveal.points[pid] ?? 0} points${won.length ? `, ${won.length === 1 ? 'one lantern' : `${won.length} lanterns`} left standing` : ''}`
}

export function Reveal({ reveal, nm, me }) {
  const stood = reveal.history.filter(h => h.winner).length
  return <p className="ms-line">{stood ? `${stood} of ${reveal.history.length} rounds had a lantern left standing.` : 'Every lantern blew out, every round!'}{reveal.history.at(-1)?.winner ? ` The last one was ${who(reveal.history.at(-1).winner, me, nm)}'s ${reveal.history.at(-1).value}.` : ''}</p>
}

export function Play({ state, me, nm, act, phase, canPlay, busy, v }) {
  const may = canPlay && phase === 'play' && open(state, me) && !busy
  const [sel, setSel] = useState(null)
  const [mine, setMine] = useState({}) // round -> pick, this browser only
  const r = state.round, last = state.history.at(-1)
  useEffect(() => setSel(null), [r])
  const send = () => { if (may && sel != null) { act('move', { move: { type: 'mini', pick: sel } }); setMine(m => ({ ...m, [r]: sel })) } }
  useEffect(() => {
    if (!may) return
    const kd = e => {
      if (/input|textarea|select/i.test(e.target.tagName)) return
      const d = /^Digit([1-9])$/.exec(e.code)
      if (d && +d[1] <= state.top) { e.preventDefault(); setSel(+d[1]) }
      else if (e.key === 'Enter') { e.preventDefault(); send() }
    }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  })
  const tint = p => TINTS[v.players.indexOf(p) % TINTS.length]
  const nums = Array.from({ length: state.top }, (_, i) => i + 1)
  const say = !canPlay ? 'Watching the lanterns.'
    : phase !== 'play' ? 'Get ready…'
    : may ? (sel == null ? 'Pick a lantern to light.' : `Light lantern ${sel}?`)
    : mine[r] != null ? `You lit lantern ${mine[r]}. Waiting for the others…` : 'Waiting for the others…'
  return (
    <div className="ml mls">
      <div className="ml-head ms-title"><b>Last Lantern Standing</b><small>{state.done ? 'Done' : `Round ${r} of ${state.rounds}`}</small></div>
      <ul className="ml-seats">
        {[...state.order].sort((a, b) => state.points[b] - state.points[a]).map(p => (
          <li key={p} className={`${state.picked.includes(p) ? 'in' : ''}${p === me ? ' me' : ''}`}>
            <span className="ml-face" style={{ background: tint(p) }}>{initials(who(p, me, nm))}</span>
            <span className="ml-nm">{who(p, me, nm)}<small>{state.picked.includes(p) ? 'Lit' : 'Choosing'}</small></span>
            <b>{state.points[p]}</b>
          </li>
        ))}
      </ul>
      <div className="ml-stage mls-row">
        {nums.map(n => (
          <button key={n} className={`ml-lantern mls-l${sel === n && may ? ' sel' : ''}`} style={{ '--s': 0.72 + n * 0.07 }} disabled={!may} onClick={() => setSel(n)} aria-label={`Lantern ${n}`} aria-pressed={sel === n}>
            <svg viewBox="-60 -80 120 170" aria-hidden="true"><LanternDefs /><Lantern n={n} lit={!may || sel === n} tint={['#f2c14e', '#f2a65a', '#e7787f', '#c49ad8', '#8fcf7a'][(n - 1) % 5]} /></svg>
          </button>
        ))}
      </div>
      {last && (
        <div className="ml-news mls-last" key={last.round}>
          <b>Round {last.round}: {last.winner ? `${who(last.winner, me, nm)} stands with ${last.value}` : 'every lantern blew out'}</b>
          <div className="mls-grid">
            {nums.map(n => {
              const by = Object.keys(last.picks).filter(p => last.picks[p] === n), blown = by.length > 1
              return (
                <div key={n} className={`mls-cell${blown ? ' out' : ''}${last.value === n ? ' win' : ''}`}>
                  <svg viewBox="-60 -80 120 140" aria-hidden="true"><Lantern n={n} lit={!!by.length} out={blown} tint="#f2c14e" /></svg>
                  <span>{by.map(p => <i key={p} style={{ background: tint(p) }} title={who(p, me, nm)}>{initials(who(p, me, nm))}</i>)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="mb-act ml-act">
        <p className="mb-say">{say}</p>
        {may && <button className="ms-btn honey ml-go" disabled={sel == null} onClick={send}>Light it<small>{sel == null ? 'tap a lantern first' : `lantern ${sel}`}</small></button>}
        {!may && <p className="ml-left">{state.picked.length} of {state.order.length} lanterns lit</p>}
      </div>
    </div>
  )
}
