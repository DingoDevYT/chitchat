import { BAIL, BOARD, DECKS, GROUPS, ownable, turn, worth } from './rules.js'

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
