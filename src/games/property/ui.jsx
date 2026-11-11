import { useState } from 'react'
import { BAIL, BOARD, DECKS, GROUPS, canBuild, canMortgage, canSell, canUnmortgage, houseCost, mortgageValue, ownable, turn, unmortgageCost, worth } from './rules.js'

const fmt = n => n.toLocaleString()
const nameOf = sp => BOARD[sp].name
const level = (v, sp) => { const c = v.cottages[sp] || 0; return c === 5 ? 'Inn' : c ? `${c} cottage${c > 1 ? 's' : ''}` : '' }
export const info = (v, pid) => v.broke[pid] ? 'Out of coins' : `${fmt(v.cash[pid])} coins${v.napping[pid] ? ' · napping' : ''}`

export function lastText(v, nm) {
  const l = v.last
  if (!l) return ''
  const who = nm(l.pid)
  if (l.sold) return l.sold.to ? `${nm(l.sold.to)} won ${nameOf(l.sold.sp)} at auction for ${fmt(l.sold.bid)}.` : `Nobody bid on ${nameOf(l.sold.sp)}.`
  switch (l.type) {
    case 'roll': {
      if (l.stay) return `${who} rolled ${l.dice[0]} and ${l.dice[1]}: no doubles, still napping.`
      if (l.napped && !v.card) return `${who} rolled ${l.dice[0]} and ${l.dice[1]}${(l.from + l.dice[0] + l.dice[1]) % 40 === 30 ? ' and landed on Go Nap.' : ': three doubles, off to nap!'}`
      let t = `${who} rolled ${l.dice[0]} and ${l.dice[1]}, landing on ${nameOf((l.from + l.dice[0] + l.dice[1]) % 40)}.`
      if (v.card) t += ` ${DECKS[v.card.deck].name}: ${v.card.text}`
      if (l.rent) t += ` Paid ${fmt(l.rent.amt)} rent to ${nm(l.rent.to)}.`
      if (v.broke[l.pid]) t += ` ${who} is out of coins!`
      return t
    }
    case 'buy': return `${who} bought ${nameOf(l.space)}.`
    case 'pass': return `${who} put ${nameOf(l.space)} up for auction.`
    case 'bid': return `${who} bid ${fmt(l.amount)}.`
    case 'fold': return `${who} dropped out of the auction.`
    case 'build': return `${who} built on ${nameOf(l.space)} (${level(v, l.space)}).`
    case 'sell': return `${who} sold a building on ${nameOf(l.space)}.`
    case 'mortgage': return `${who} mortgaged ${nameOf(l.space)}.`
    case 'unmortgage': return `${who} paid off ${nameOf(l.space)}.`
    case 'bail': return `${who} paid ${BAIL} to wake up.`
    case 'blanket': return `${who} used a blanket card to wake up.`
    case 'offer': return `${who} offered ${nm(v.offer?.to)} a trade.`
    case 'accept': return `${who} accepted the trade.`
    case 'decline': return `${who} turned down the trade.`
  }
  return ''
}

export const banner = (v, nm, me) => {
  if (v.winner) return `${nm(v.winner)} is the toast of Teacup Town with ${fmt(worth(v, v.winner))}!`
  const t = turn({ pub: v })
  if (v.phase === 'auction') return `Auction: ${nameOf(v.auction.sp)} · ${v.auction.high ? `${fmt(v.auction.bid)} by ${nm(v.auction.high)}` : 'no bids yet'} · ${t === me ? 'your bid' : `${nm(t)} bids`}`
  if (v.phase === 'trade') return `${nm(v.offer.from)} offers ${t === me ? 'you' : nm(t)} a trade`
  return `${t === me ? 'Your turn' : `${nm(t)}'s turn`} · Round ${v.round}${v.maxRounds ? `/${v.maxRounds}` : ''}`
}

const Chip = ({ sp }) => <i className="gp-chip" style={{ '--g': BOARD[sp].g != null ? GROUPS[BOARD[sp].g].color : '#c9b79a' }} />
const list = (sps, cash) => [...sps.map(nameOf), cash > 0 && `${fmt(cash)} coins`].filter(Boolean).join(', ') || 'nothing'

export function Controls({ v, me, act, nm, busy }) {
  const [panel, setPanel] = useState(null)
  if (turn({ pub: v }) !== me) return null
  const mv = move => act('move', { move })
  if (v.phase === 'auction') {
    const a = v.auction, cash = v.cash[me]
    return (
      <div className="gc-row">
        <span className="gc-made"><Chip sp={a.sp} /> {nameOf(a.sp)} (list price {fmt(BOARD[a.sp].price)})</span>
        {[10, 50, 100].map(k => <button key={k} className="btn primary" disabled={busy || a.bid + k > cash} onClick={() => mv({ type: 'bid', amount: a.bid + k })}>Bid {fmt(a.bid + k)}</button>)}
        <button className="btn ghost" disabled={busy} onClick={() => mv({ type: 'fold' })}>Drop out</button>
      </div>
    )
  }
  if (v.phase === 'trade') {
    const o = v.offer
    return (
      <div className="gc-pick gp-offer">
        <span><b>{nm(o.from)}</b> gives: {list(o.give, o.cash)}</span>
        <span>You give: {list(o.get, -o.cash)}</span>
        <span className="gc-row">
          <button className="btn primary" disabled={busy} onClick={() => mv({ type: 'accept' })}>Accept</button>
          <button className="btn ghost" disabled={busy} onClick={() => mv({ type: 'decline' })}>No thanks</button>
        </span>
      </div>
    )
  }
  const here = BOARD[v.pos[me]]
  const held = Object.values(v.held).includes(me)
  const toggle = p => setPanel(panel === p ? null : p)
  return (
    <div className="gp-controls">
      {panel === 'streets' && <Streets v={v} me={me} mv={mv} busy={busy} />}
      {panel === 'trade' && <Trade v={v} me={me} nm={nm} busy={busy} send={m => { setPanel(null); mv(m) }} />}
      <div className="gc-row">
        {v.phase === 'roll' && v.napping[me] && <>
          {held && <button className="btn ghost" disabled={busy} onClick={() => mv({ type: 'blanket' })}>Use blanket card</button>}
          <button className="btn ghost" disabled={busy || v.cash[me] < BAIL} onClick={() => mv({ type: 'bail' })}>Wake up ({BAIL})</button>
        </>}
        {v.phase === 'roll' && <button className="btn primary big" disabled={busy} onClick={() => mv({ type: 'roll' })} aria-keyshortcuts="R">{v.napping[me] ? 'Roll for doubles' : 'Roll'}</button>}
        {v.phase === 'buy' && <>
          <button className="btn primary" disabled={busy || v.cash[me] < here.price} onClick={() => mv({ type: 'buy' })} aria-keyshortcuts="B">Buy {here.name} ({fmt(here.price)})</button>
          <button className="btn ghost" disabled={busy} onClick={() => mv({ type: 'pass' })}>Auction it</button>
        </>}
        {v.phase === 'end' && <button className="btn primary" disabled={busy} onClick={() => mv({ type: 'end' })} aria-keyshortcuts="E">{v.again ? 'Doubles! Roll again' : 'End turn'}</button>}
        <button className="btn ghost" aria-pressed={panel === 'streets'} onClick={() => toggle('streets')}>My streets</button>
        {v.phase !== 'buy' && v.offers < 3 && <button className="btn ghost" aria-pressed={panel === 'trade'} onClick={() => toggle('trade')}>Trade</button>}
      </div>
    </div>
  )
}

function Streets({ v, me, mv, busy }) {
  const mine = BOARD.map((_, i) => i).filter(i => v.owner[i] === me)
  if (!mine.length) return <div className="gc-pick gp-panel"><span className="muted">You don't own any streets yet.</span></div>
  return (
    <div className="gc-pick gp-panel" role="list" aria-label="Your streets">
      {mine.map(sp => (
        <div key={sp} className="gp-street" role="listitem">
          <Chip sp={sp} /><b>{nameOf(sp)}</b>
          <span className="muted small">{v.mortgaged[sp] ? 'Mortgaged' : level(v, sp)}</span>
          <span className="spacer" />
          {canBuild(v, me, sp) && <button className="btn small" disabled={busy} onClick={() => mv({ type: 'build', space: sp })}>{(v.cottages[sp] || 0) === 4 ? 'Inn' : 'Cottage'} ({houseCost(sp)})</button>}
          {canSell(v, me, sp) && <button className="btn small ghost" disabled={busy} onClick={() => mv({ type: 'sell', space: sp })}>Sell (+{houseCost(sp) / 2})</button>}
          {canMortgage(v, me, sp) && <button className="btn small ghost" disabled={busy} onClick={() => mv({ type: 'mortgage', space: sp })}>Mortgage (+{mortgageValue(sp)})</button>}
          {v.mortgaged[sp] && <button className="btn small ghost" disabled={busy || !canUnmortgage(v, me, sp)} onClick={() => mv({ type: 'unmortgage', space: sp })}>Pay off ({unmortgageCost(sp)})</button>}
        </div>
      ))}
    </div>
  )
}

const tradable = (v, pid) => BOARD.map((_, i) => i).filter(i => v.owner[i] === pid && !(BOARD[i].k === 'prop' && BOARD.some((b, j) => b.g === BOARD[i].g && v.cottages[j])))

function Trade({ v, me, nm, busy, send }) {
  const others = v.players.filter(p => p !== me && !v.broke[p])
  const [to, setTo] = useState(others[0])
  const [give, setGive] = useState([])
  const [get, setGet] = useState([])
  const [cash, setCash] = useState(0)
  const flip = (arr, set, sp) => set(arr.includes(sp) ? arr.filter(x => x !== sp) : [...arr, sp])
  const side = (pid, arr, set) => tradable(v, pid).map(sp => (
    <label key={sp} className="gp-street"><input type="checkbox" checked={arr.includes(sp)} onChange={() => flip(arr, set, sp)} /><Chip sp={sp} />{nameOf(sp)}{v.mortgaged[sp] ? ' (mortgaged)' : ''}</label>
  ))
  return (
    <div className="gc-pick gp-panel gp-trade">
      <span className="seg" role="radiogroup" aria-label="Trade with">
        {others.map(p => <button key={p} role="radio" aria-checked={to === p} className={to === p ? 'on' : ''} onClick={() => { setTo(p); setGet([]) }}>{nm(p)}</button>)}
      </span>
      <div className="gp-cols">
        <div><b>You give</b>{side(me, give, setGive)}</div>
        <div><b>You get</b>{side(to, get, setGet)}</div>
      </div>
      <label className="gp-cash">Coins <input type="number" step="10" value={cash} onChange={e => setCash(Math.trunc(+e.target.value || 0))} /> <span className="muted small">{cash >= 0 ? 'you pay them' : 'they pay you'}</span></label>
      <button className="btn primary" disabled={busy || (!give.length && !get.length) || cash > v.cash[me] || -cash > v.cash[to]} onClick={() => send({ type: 'offer', to, give, get, cash })}>Send offer</button>
    </div>
  )
}
export const keys = { r: { type: 'roll' }, e: { type: 'end' } }

// The board is an 11×11 ring: space i → [col, row]. Start is the bottom-right corner; play runs clockwise (left along the bottom).
export function cell(i) {
  if (i <= 10) return [10 - i, 10]
  if (i <= 20) return [0, 20 - i]
  if (i <= 30) return [i - 20, 0]
  return [10, i - 30]
}
// Corners are 1.6 tiles wide, like a real board: 2 corners + 9 tiles a side.
export const CORNER = 1.6, SIDE = 2 * CORNER + 9
export const along = c => (c === 0 ? CORNER / 2 : c === 10 ? SIDE - CORNER / 2 : CORNER + c - 0.5)
export const span = c => (c === 0 || c === 10 ? CORNER : 1)

export function Flat({ v, people }) {
  return (
    <div className="gf-board-grid" role="img" aria-label="Teacup Town board">
      {BOARD.map((b, i) => {
        const [c, r] = cell(i)
        const o = v.owner[i]
        return (
          <div key={i} className={`gf-tile k-${b.k}${v.mortgaged[i] ? ' mort' : ''}`} style={{ gridColumn: c + 1, gridRow: r + 1, '--g': b.g != null ? GROUPS[b.g].color : 'transparent', '--o': o ? people.find(p => p.pid === o)?.color : 'transparent' }}>
            <span>{b.name}</span>
            {v.cottages[i] > 0 && <i className="gf-cot">{v.cottages[i] === 5 ? 'Inn' : v.cottages[i]}</i>}
            <span className="gf-tokens">{people.filter(p => v.pos[p.pid] === i && !v.broke[p.pid]).map(p => <i key={p.pid} style={{ background: p.color }} />)}</span>
          </div>
        )
      })}
      <div className="gf-mid"><b>Teacup Town</b><span>{v.dice.join(' + ')}</span>{v.card && <em>{v.card.text}</em>}</div>
    </div>
  )
}
export const seatCards = () => []
export { ownable }
