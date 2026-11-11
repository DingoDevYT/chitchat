import { useState } from 'react'
import { Card } from '../Card'
import { CARDS, FLAVOURS, cardLabel, playable, turn } from './rules.js'

export const info = (v, pid) => `${v.counts[pid]} card${v.counts[pid] === 1 ? '' : 's'}${v.counts[pid] === 1 && v.called[pid] ? ' · Last bite!' : ''}`
export function lastText(v, nm) {
  const l = v.last
  if (!l) return ''
  if (l.type === 'play') return `${nm(l.pid)} played ${cardLabel(l.card)}${CARDS[l.card].f === 4 ? `, picking ${FLAVOURS[v.flavour].name}` : ''}.`
  if (l.type === 'draw') return `${nm(l.pid)} drew ${l.n === 1 ? 'a card' : `${l.n} cards`}.`
  if (l.type === 'pass') return `${nm(l.pid)} passed.`
  if (l.type === 'lastbite') return `${nm(l.pid)}: Last bite!`
  if (l.type === 'catch') return `${nm(l.pid)} caught ${nm(l.target)}! Two cards for them.`
  return ''
}
export const banner = (v, nm, me) => {
  const t = turn({ pub: v })
  if (!t) return `${nm(v.winner)} cleared their plate!`
  const pend = v.pending ? ` (${v.pending} to draw)` : ''
  return t === me ? `Your turn${pend}` : `${nm(t)}'s turn${pend}`
}

export function Controls({ v, me, act, nm }) {
  const [wild, setWild] = useState(null) // card id waiting for a flavour
  const hand = v.me?.hand || []
  const mine = turn({ pub: v }) === me
  const ok = id => mine && (v.drew == null || id === v.drew) && playable(v, id)
  const play = (id, flavour) => act('move', { move: { type: 'play', card: id, ...(flavour != null && { flavour }), ...(hand.length === 2 && { bite: true }) } })
  const catchable = v.players.find(p => p !== me && v.counts[p] === 1 && !v.called[p])
  const sorted = [...hand].sort((a, b) => CARDS[a].f - CARDS[b].f || String(CARDS[a].v).localeCompare(String(CARDS[b].v)))
  return (
    <>
      {wild != null && (
        <div className="gc-pick" role="dialog" aria-label="Pick a flavour">
          <span>Pick a flavour</span>
          {FLAVOURS.map((f, i) => <button key={f.name} className="btn" style={{ '--f': f.color }} onClick={() => { setWild(null); play(wild, i) }}>{f.name}</button>)}
          <button className="btn ghost" onClick={() => setWild(null)}>Cancel</button>
        </div>
      )}
      <div className="gc-hand fan" role="group" aria-label={`Your hand, ${hand.length} cards`}>
        {sorted.map(id => (
          <button key={id} className={`gc-card${ok(id) ? ' ok' : ''}${v.drew === id ? ' drew' : ''}`} disabled={!ok(id)}
            aria-label={cardLabel(id) + (ok(id) ? '' : ', can’t play now')} onClick={() => (CARDS[id].f === 4 ? setWild(id) : play(id))}>
            <Card kind="snack" id={id} />
          </button>
        ))}
      </div>
      <div className="gc-row">
        {mine && v.drew == null && <button className="btn primary" onClick={() => act('move', { move: { type: 'draw' } })}>{v.pending ? `Take ${v.pending}` : 'Draw'}</button>}
        {mine && v.drew != null && <button className="btn ghost" onClick={() => act('move', { move: { type: 'pass' } })}>Keep it, pass</button>}
        {hand.length <= 2 && hand.length > 0 && !v.called[me] && <button className="btn bite" onClick={() => act('move', { move: { type: 'lastbite' } })}>Last bite!</button>}
        {catchable && <button className="btn danger" onClick={() => act('move', { move: { type: 'catch', target: catchable } })}>Catch {nm(catchable)}!</button>}
      </div>
    </>
  )
}

export function Flat({ v }) {
  return (
    <div className="gf-center">
      <span className="gf-deck"><Card kind="snack" back /><b>{v.deck}</b></span>
      <Card kind="snack" id={v.top} />
      <span className={`gf-dir${v.dir < 0 ? ' rev' : ''}`} style={{ '--f': FLAVOURS[v.flavour].color }} aria-label={`Flavour ${FLAVOURS[v.flavour].name}, ${v.dir > 0 ? 'clockwise' : 'counter-clockwise'}`}>{v.dir > 0 ? '↻' : '↺'}</span>
    </div>
  )
}
export const seatCards = (v, pid, me) => pid === me ? [] : Array.from({ length: Math.min(v.counts[pid], 8) }, () => ({ kind: 'snack', id: null }))
