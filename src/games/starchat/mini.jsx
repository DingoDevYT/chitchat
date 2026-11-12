// The minigame phase, as one small replaceable piece: a placeholder card over the board until the minigame Stage
// framework lands (it can swap this component out wholesale). Today the only minigame is the Firefly Count
// placeholder: one secret guess inside the hint window.
import { MINIGAMES } from './data.js'
import { Ic } from './Ic.jsx'

export function MiniPhase({ v, me, act, busy, canPlay, short }) {
  const m = v.mini, info = MINIGAMES[m.id] || { name: 'Minigame', text: '' }
  const mine = canPlay && v.players.includes(me) && !m.posted[me]
  const waiting = v.players.filter(p => !m.posted[p])
  const [a, b] = m.state.hint || [0, -1]
  return (
    <div className="sc-mini sc-tray" role="region" aria-label={info.name}>
      <div className="sc-in">
        <span className="sc-ribbon">Minigame</span>
        <h3><Ic n="firefly" /> {info.name}</h3>
        <p>{info.text}</p>
        {mine ? (
          <>
            <p className="sc-mini-q">How many fireflies? ({a} to {b})</p>
            <div className="sc-mini-pick">
              {Array.from({ length: b - a + 1 }, (_, i) => a + i).map(g => (
                <button key={g} type="button" disabled={busy} onClick={() => act('move', { move: { type: 'mini', guess: g } })}>{g}</button>
              ))}
            </div>
          </>
        ) : <p className="sc-mini-q">{waiting.length ? `Waiting for ${waiting.map(short).join(', ')}` : 'Counting the fireflies…'}</p>}
      </div>
    </div>
  )
}
