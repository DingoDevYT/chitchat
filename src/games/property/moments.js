// Property Tycoon HUD moments, worked out from two consecutive public views (like sfx.js), so everyone watching sees them:
// ticker lines, money changes (who paid whom, and a receipt), and the card that was just drawn. Pure: tested in moments.test.js.
import { BAIL, BOARD, DECKS, GROUPS, SALARY } from './rules.js'

const fmt = n => n.toLocaleString()
const name = sp => BOARD[sp].name
export const spColor = sp => (BOARD[sp].g != null ? GROUPS[BOARD[sp].g].color : BOARD[sp].k === 'rail' ? '#8a7a68' : '#e2a64a')
const landed = v => v.pos[v.last.pid]
const passedStart = v => v.last.type === 'roll' && !v.last.stay && v.last.from + v.last.dice[0] + v.last.dice[1] >= 40 && !(v.last.napped && !v.card) // three doubles: straight to nap, no walk
const cardOf = c => c && DECKS[c.deck].cards.find(x => x.text === c.text)

// Cash change per player since the last view (only the ones that moved).
export const cashDiff = (p, v) => Object.fromEntries(v.players.map(pid => [pid, v.cash[pid] - (p.cash[pid] ?? v.cash[pid])]).filter(([, d]) => d))

// The card drawn by this move, with its coin effect for the drawer ("+150", "-15", "+30 total"), or null.
export function drawn(p, v) {
  if (!v.card || (p.card && p.rolls === v.rolls && p.card.text === v.card.text)) return null
  const c = cardOf(v.card), pid = v.last?.pid
  const others = v.players.filter(o => o !== pid && !p.broke[o]).length
  const fx = c?.cash ? `${c.cash > 0 ? '+' : '-'}${fmt(Math.abs(c.cash))}` : c?.each ? `${c.each > 0 ? '+' : '-'}${fmt(Math.abs(c.each) * others)} total` : c?.to === 0 ? `+${SALARY}` : ''
  return { deck: v.card.deck, text: v.card.text, fx, pid }
}

// Ticker lines for this move: { icon, c (colour), text, amt (signed, from the mover's side) }.
export function ticks(p, v, short) {
  const l = v.last
  if (!l) return []
  const who = short(l.pid), out = []
  const t = (icon, c, text, amt) => out.push({ icon, c, text, amt })
  if (l.sold) l.sold.to ? t('gavel', '#f0a050', `${short(l.sold.to)} won ${name(l.sold.sp)}`, -l.sold.bid) : t('gavel', '#f0a050', `Nobody bid on ${name(l.sold.sp)}`)
  switch (l.type) {
    case 'roll': {
      if (l.stay) { t('moon', '#8a7fb8', `${who} rolled ${l.dice[0]} and ${l.dice[1]}, still napping`); break }
      if (passedStart(v)) t('flag', '#6f9a62', `${who} passed Start`, SALARY)
      const sp = landed(v), b = BOARD[sp]
      if (l.napped) { t('moon', '#8a7fb8', `${who} went to the Nap Nook`); break }
      const card = drawn(p, v)
      if (card) t(card.deck === 'cookie' ? 'cookie' : 'cup', card.deck === 'cookie' ? '#e2a64a' : '#6fa9c4', `${who} drew a ${DECKS[card.deck].name}`)
      if (l.rent) t('house', spColor(sp), `${who} paid ${short(l.rent.to)} rent, ${b.name}`, -l.rent.amt)
      else if (b.k === 'tax') t('tax', '#b08a5e', `${who} paid ${b.name}`, -b.amt)
      else if (!card) t('dice', '#c9a77f', `${who} rolled ${l.dice[0] + l.dice[1]}, ${b.name}`)
      if (v.broke[l.pid] && !p.broke[l.pid]) t('moon', '#c84f58', `${who} is out of coins`)
      break
    }
    case 'buy': t('bag', spColor(l.space), `${who} bought ${name(l.space)}`, -BOARD[l.space].price); break
    case 'pass': t('gavel', '#f0a050', `${name(l.space)} goes to auction`); break
    case 'bid': t('gavel', '#f0a050', `${who} bid ${fmt(l.amount)}`); break
    case 'fold': if (!l.sold) t('gavel', '#c9a77f', `${who} dropped out`); break
    case 'build': t('house', spColor(l.space), `${who} built on ${name(l.space)}`, -(p.cash[l.pid] - v.cash[l.pid])); break
    case 'sell': t('house', spColor(l.space), `${who} sold a cottage on ${name(l.space)}`, v.cash[l.pid] - p.cash[l.pid]); break
    case 'mortgage': t('moon', '#7fa8a0', `${who} mortgaged ${name(l.space)}`, v.cash[l.pid] - p.cash[l.pid]); break
    case 'unmortgage': t('moon', '#7fa8a0', `${who} woke up ${name(l.space)}`, v.cash[l.pid] - p.cash[l.pid]); break
    case 'bail': t('moon', '#8a7fb8', `${who} paid to wake up`, -BAIL); break
    case 'blanket': t('moon', '#8a7fb8', `${who} used a blanket card`); break
    case 'offer': t('swap', '#6f9a62', `${who} offered ${short(v.offer.to)} a trade`); break
    case 'accept': t('swap', '#6f9a62', `${who} took the trade`); break
    case 'decline': t('swap', '#c9a77f', `${who} said no thanks`); break
  }
  if (v.winner && !p.winner) t('star', '#f7c45a', `${short(v.winner)} wins!`)
  return out
}

// Money moment: per-player deltas plus a receipt { icon, c, title, sub } for the big ones (rent, tax, buying, auction, Start, bail).
export function money(p, v, nm) {
  const d = cashDiff(p, v)
  if (!Object.keys(d).length || !v.last) return null
  const l = v.last, sp = v.pos[l.pid], b = BOARD[sp]
  let r = null
  if (l.rent) {
    const c = v.cottages[sp] || 0
    r = { icon: 'house', c: spColor(sp), title: `Rent paid · ${fmt(l.rent.amt)}`, sub: `${b.name}${c ? `, ${c === 5 ? 'an inn' : `${c} cottage${c > 1 ? 's' : ''}`}` : ''}. To ${nm(l.rent.to)}` }
  } else if (l.sold?.to) r = { icon: 'gavel', c: spColor(l.sold.sp), title: `Sold at auction · ${fmt(l.sold.bid)}`, sub: `${name(l.sold.sp)} to ${nm(l.sold.to)}` }
  else if (l.type === 'buy') r = { icon: 'bag', c: spColor(l.space), title: `Bought · ${fmt(BOARD[l.space].price)}`, sub: `${name(l.space)} for ${nm(l.pid)}` }
  else if (l.type === 'roll' && b.k === 'tax' && !v.card) r = { icon: 'tax', c: '#b08a5e', title: `${b.name} · ${fmt(b.amt)}`, sub: `${nm(l.pid)} paid the bank` }
  else if (l.type === 'bail') r = { icon: 'moon', c: '#8a7fb8', title: `Woke up · ${BAIL}`, sub: `${nm(l.pid)} paid the bank` }
  else if (l.type === 'roll' && passedStart(v) && !v.card) r = { icon: 'flag', c: '#6f9a62', title: `Passed Start · ${SALARY}`, sub: `${nm(l.pid)} collects ${SALARY}` }
  return { d, receipt: r }
}
