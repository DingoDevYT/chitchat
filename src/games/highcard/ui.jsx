import { Card, playName } from '../Card'
import { turn } from './rules.js'

export const info = (v, pid) => v.reveal ? null : v.acted?.[pid] === 'swap' ? 'Swapped' : v.acted?.[pid] ? 'Kept' : null
export const lastText = (v, nm) => v.last ? `${nm(v.last.pid)} ${v.last.type === 'swap' ? 'swapped' : 'kept'}.` : ''
export const banner = (v, nm, me) => {
  const t = turn({ pub: v })
  if (!t) return `${nm(v.winner)} wins with the ${playName(v.reveal[v.winner])}!`
  return t === me ? 'Your turn: keep or swap?' : `${nm(t)} is deciding…`
}

export function Controls({ v, me, act }) {
  const mine = turn({ pub: v }) === me
  return (
    <div className="gc-row">
      {v.me && <span className="gc-hand" aria-label={`Your card: ${playName(v.me.card)}`}><Card kind="play" id={v.me.card} /></span>}
      {mine && <>
        <button className="btn primary" onClick={() => act('move', { move: { type: 'keep' } })} aria-keyshortcuts="K"><u>K</u>eep</button>
        <button className="btn ghost" onClick={() => act('move', { move: { type: 'swap' } })} aria-keyshortcuts="S"><u>S</u>wap</button>
      </>}
    </div>
  )
}
export const keys = { k: { type: 'keep' }, s: { type: 'swap' } }

export function Flat({ v }) {
  return <div className="gf-center"><Card kind="play" back /> {v.discards.map(c => <Card key={c} kind="play" id={c} small />)}</div>
}
// Cards in front of a seat in the flat table.
export const seatCards = (v, pid, me) => [{ kind: 'play', id: v.reveal?.[pid] ?? (pid === me ? v.me?.card : null) }]
