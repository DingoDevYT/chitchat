import { useEffect, useState } from 'react'
import { Card, playName } from '../Card'
import { HANDS, best, turn } from './rules.js'

const fmt = n => n.toLocaleString()
const potOf = v => v.pot + Object.values(v.bets || {}).reduce((a, b) => a + b, 0)
export const info = (v, pid) => v.out[pid] ? 'Out' : `${fmt(v.stacks[pid])} acorns${v.bets?.[pid] ? ` · bet ${v.bets[pid]}` : ''}${v.folded?.[pid] ? ' · folded' : ''}`
const WORD = { fold: 'folded', check: 'checked', call: 'called', raise: 'raised to', allin: 'went all in' }
export function lastText(v, nm) {
  if (v.phase === 'showdown' && v.results) return v.results.map(r => `${nm(r.p)} wins ${fmt(r.amt)}${r.hand ? ` with ${r.hand.toLowerCase()}` : ''}`).join('. ') + '.'
  const l = v.last
  if (!l) return ''
  return `${nm(l.pid)} ${WORD[l.type]}${l.type === 'raise' ? ` ${fmt(l.amt)}` : ''}.`
}
export const banner = (v, nm, me) => {
  if (v.winner) return `${nm(v.winner)} wins the night with ${fmt(v.stacks[v.winner])} acorns!`
  if (v.phase === 'showdown') return lastText(v, nm)
  const t = turn({ pub: v })
  return `${t === me ? 'Your turn' : `${nm(t)}'s turn`} · Pot ${fmt(potOf(v))} · Hand ${v.hand}/${v.maxHands}`
}

export function Controls({ v, me, act }) {
  const mine = turn({ pub: v }) === me
  const stack = v.stacks[me] || 0, put = v.bets?.[me] || 0, owe = v.bet - put
  const min = Math.min(v.bet + v.minRaise, put + stack)
  const [to, setTo] = useState(min)
  useEffect(() => setTo(min), [min])
  const cards = v.me?.cards
  const made = cards && v.board?.length >= 3 ? HANDS[best([...cards, ...v.board])[0]] : null
  const mv = move => act('move', { move })
  return (
    <>
      <div className="gc-row">
        {cards && !v.out[me] && <span className="gc-hand" aria-label={`Your cards: ${cards.map(playName).join(' and ')}${made ? `, ${made}` : ''}`}>
          {cards.map(c => <Card key={c} kind="play" id={c} />)}{made && <span className="gc-made">{made}</span>}
        </span>}
        {mine && v.phase === 'showdown' && <button className="btn primary" onClick={() => mv({ type: 'next' })}>Next hand</button>}
      </div>
      {mine && v.phase !== 'showdown' && (
        <div className="gc-row">
          <button className="btn ghost" onClick={() => mv({ type: 'fold' })} aria-keyshortcuts="F">Fold</button>
          {owe > 0
            ? <button className="btn primary" onClick={() => mv({ type: owe >= stack ? 'allin' : 'call' })} aria-keyshortcuts="C">Call {fmt(Math.min(owe, stack))}</button>
            : <button className="btn primary" onClick={() => mv({ type: 'check' })} aria-keyshortcuts="C">Check</button>}
          {stack > owe && <span className="gc-raise">
            <input type="range" min={min} max={put + stack} step={v.bb / 2 || 5} value={to} onChange={e => setTo(+e.target.value)} aria-label="Raise to" />
            <button className="btn" onClick={() => mv(to >= put + stack ? { type: 'allin' } : { type: 'raise', to })}>{to >= put + stack ? 'All in' : `Raise to ${fmt(to)}`}</button>
          </span>}
        </div>
      )}
    </>
  )
}
export const keys = { f: { type: 'fold' } }

export function Flat({ v }) {
  return (
    <div className="gf-center col">
      <div className="gf-board">{[0, 1, 2, 3, 4].map(i => <Card key={i} kind="play" id={v.board[i]} back={v.board[i] == null} small />)}</div>
      <b className="gf-pot">Pot {fmt(potOf(v))}</b>
    </div>
  )
}
export const seatCards = (v, pid, me) => v.out[pid] || v.folded?.[pid] ? [] : [0, 1].map(i => ({ kind: 'play', id: v.shown?.[pid]?.[i] ?? (pid === me ? v.me?.cards?.[i] : null) }))
