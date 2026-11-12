import { useEffect, useRef } from 'react'
import { BAIL, BOARD, DECKS, GROUPS, ownable, turn, worth } from './rules.js'
import { boardCanvas } from './boardArt.js'
import { cell } from './geom.js'

const fmt = n => n.toLocaleString()
const nameOf = sp => BOARD[sp].name
const level = (v, sp) => { const c = v.cottages[sp] || 0; return c === 5 ? 'Inn' : c ? `${c} cottage${c > 1 ? 's' : ''}` : '' }

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

export { Hud } from './hud.jsx'
export const keys = { r: { type: 'roll' }, e: { type: 'end' } }

export { CORNER, SIDE, along, cell, span } from './geom.js'

// The same painted board as the 3D table, as a flat picture under the grid.
function PaintedBoard() {
  const ref = useRef(null)
  useEffect(() => {
    let live = true
    boardCanvas().ready.then(c => {
      const el = ref.current
      if (live && el) el.getContext('2d').drawImage(c, 0, 0, el.width, el.height)
    })
    return () => { live = false }
  }, [])
  return <canvas ref={ref} width={1024} height={1024} className="gf-board-art" aria-hidden="true" />
}

export function Flat({ v, people }) {
  return (
    <div className="gf-board-grid" role="img" aria-label="Teacup Town board">
      <PaintedBoard />
      {BOARD.map((b, i) => {
        const [c, r] = cell(i)
        const o = v.owner[i]
        return (
          <div key={i} className={`gf-tile k-${b.k}${v.mortgaged[i] ? ' mort' : ''}`} style={{ gridColumn: c + 1, gridRow: r + 1, '--g': b.g != null ? GROUPS[b.g].color : 'transparent', '--o': o ? people.find(p => p.pid === o)?.color : 'transparent' }}>
            <span className="gf-name">{b.name}</span>
            {v.cottages[i] > 0 && <i className="gf-cot">{v.cottages[i] === 5 ? 'Inn' : v.cottages[i]}</i>}
            <span className="gf-tokens">{people.filter(p => v.pos[p.pid] === i && !v.broke[p.pid]).map(p => <i key={p.pid} style={{ background: p.color }} />)}</span>
          </div>
        )
      })}
      <div className="gf-mid"><span>{v.dice.join(' + ')}</span>{v.card && <em>{v.card.text}</em>}</div>
    </div>
  )
}
export const seatCards = () => []
export { ownable }
