// Hot Bun on screen: a picnic blanket with everyone round it, the bun steaming in front of whoever holds it, a steam
// meter with the hidden pop zone, the latest puffs, and three big buttons when it's yours.
import { useEffect } from 'react'
import { alive, risk, whose } from './bun.js'
import { Bun } from './art.jsx'

export const how = {
  line: 'Puff 1, 2 or 3 steam into the bun and pass it on. It pops somewhere from 10 to 20: do not be holding it then.',
  mouse: 'click Puff 1, 2 or 3',
  touch: 'tap one of the three big buttons',
  keys: '1, 2 or 3',
}

export function detail(reveal, pid) {
  const brave = reveal.banked?.[pid] ? `, ${reveal.banked[pid]} brave ${reveal.banked[pid] === 1 ? 'coin' : 'coins'}` : ''
  if (reveal.winner === pid) return `Last one standing${brave}`
  const i = reveal.out.indexOf(pid)
  return `${i === 0 ? 'Popped the first bun' : `Popped bun ${i + 1}`}${brave}`
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh']
export function Reveal({ reveal, nm, me }) {
  return <p className="ms-line">{reveal.winner === me ? 'You held your nerve to the end.' : `${nm(reveal.winner)} held their nerve to the end.`} {reveal.out.length > 1 ? `${reveal.out.length} buns popped.` : ''}</p>
}

const initials = s => (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

export function Play({ state, me, nm, act, phase, canPlay, busy }) {
  const holder = whose(state), n = state.order.length
  const mine = canPlay && phase === 'play' && holder === me && !busy
  const spot = i => { const a = Math.PI / 2 + (2 * Math.PI * (i - state.order.indexOf(me) + n)) / n; return { x: 50 + 40 * Math.cos(a), y: 50 + 36 * Math.sin(a) } }
  const hi = state.hi, at = state.order.indexOf(holder)
  const bunAt = at < 0 ? { x: 50, y: 50 } : (({ x, y }) => ({ x: 50 + (x - 50) * 0.55, y: 50 + (y - 50) * 0.55 }))(spot(at))
  const last = state.log.at(-1)
  const popped = last?.pop && state.steam === 0
  const puff = p => act('move', { move: { type: 'mini', puff: p } })
  const out = state.out.includes(me)
  useEffect(() => {
    if (!mine) return
    const kd = e => { if ('123'.includes(e.key) && e.key.length === 1 && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); puff(+e.key) } }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  }, [mine, state.log.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mb">
      <div className="mb-head ms-title"><b>Hot Bun</b><small>Puff it, pass it, don't be holding it</small></div>
      <div className="mb-blanket">
        {state.order.map((p, i) => {
          const { x, y } = spot(i), isOut = state.out.includes(p)
          return (
            <div key={p} className={`mb-seat${p === holder ? ' hold' : ''}${isOut ? ' out' : ''}${p === me ? ' me' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="mb-face">{initials(p === me ? 'You' : nm(p))}</span>
              <span className="mb-name">{p === me ? 'You' : nm(p)}{isOut ? ' (popped)' : p === holder ? ' holds it' : ''}</span>
            </div>
          )
        })}
        {!state.done && <svg className="mb-bun" style={{ left: `${bunAt.x}%`, top: `${bunAt.y}%` }} viewBox="-50 -60 100 90" aria-hidden="true"><Bun steam={state.steam} hot={state.steam >= state.lo} /></svg>}
        {popped && <div className="mb-pop" key={state.log.length}>POP!<small>{last.pid === me ? 'You' : nm(last.pid)} popped it at {last.pop}</small></div>}
      </div>
      <div className="mb-meter" aria-label={`Steam ${state.steam}`}>
        <small>Steam</small>
        <div className="mb-tube">
          <i className="mb-zone" style={{ bottom: `${((state.lo - 1) / hi) * 100}%`, height: `${((hi - state.lo + 1) / hi) * 100}%` }}><span>?</span></i>
          <i className="mb-fill" style={{ height: `${Math.min(100, (state.steam / hi) * 100)}%` }} />
        </div>
        <b>{state.steam}</b>
      </div>
      <ol className="mb-log">
        <li className="mb-cap">Bun {state.bun} &middot; {alive(state).length} left</li>
        {state.log.slice(-5).reverse().map((e, i) => (
          <li key={state.log.length - i} className={e.pop ? 'pop' : ''}>{e.pid === me ? 'You' : nm(e.pid)} {e.pop ? `popped it at ${e.pop}` : `puffed ${e.puff}`}</li>
        ))}
      </ol>
      <div className="mb-act">
        {mine ? (
          <>
            <p className="mb-say">You hold the bun. Puff it, then it passes on.</p>
            <div className="mb-btns">
              {[1, 2, 3].map(p => {
                const r = Math.round(risk(state, p) * 100)
                return (
                  <button key={p} className={`ms-btn ${p === 1 ? 'sage' : p === 2 ? 'honey' : 'plain'}`} onClick={() => puff(p)} autoFocus={p === 1}>
                    Puff {p}<small>{r ? `${r}% pop` : 'safe'}{state.bonus[p - 1] ? ` · +${state.bonus[p - 1]} coin${state.bonus[p - 1] > 1 ? 's' : ''}` : ''}</small>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mb-say">{!canPlay && !out ? 'Watching the picnic.' : out ? "You're out. Heckle the holder." : phase !== 'play' ? 'Get ready…' : `${nm(holder)} is deciding…`}</p>
        )}
      </div>
    </div>
  )
}
