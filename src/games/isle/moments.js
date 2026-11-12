// Chit Isle HUD moments, worked out from two consecutive public views so everyone watching sees them: the move log lines
// and the resource chips that fly (tile → basket on a roll, basket → basket on a steal or trade). Pure: see moments.test.js.
import { BONUS, CARDS, KINDS, RES, RES_NAME, RES_ONE, TILES, VERTS } from './rules.js'

const RES_C = { twig: '#9a6a3e', wool: '#b8ad94', clay: '#c8693f', berry: '#a54a82', tea: '#5f9a4f' }
export const resColor = k => RES_C[k]
const n1 = (k, n) => (n === 1 ? `a ${RES_ONE[k]}` : `${n} ${RES_NAME[k].toLowerCase()}`)
export const bagText = b => Object.entries(b || {}).filter(([, n]) => n).map(([k, n]) => n1(k, n)).join(' and ') || 'nothing'

// One line for the move just made (also what screen readers hear). who = a name or "You".
export function describe(v, nm) {
  const l = v.last
  if (!l) return ''
  const who = nm(l.pid)
  switch (l.type) {
    case 'cottage': return `${who} settled a cottage${l.got ? ` and gathered ${bagText(l.got)}` : ''}.`
    case 'path': return `${who} laid a path.`
    case 'roll': {
      const sum = l.dice[0] + l.dice[1]
      if (sum === 7) return `${who} rolled 7: the raccoon wakes up!`
      const got = Object.entries(v.gains || {}).map(([p, b]) => `${nm(p)} ${bagText(b)}`)
      return `${who} rolled ${sum}.${got.length ? ` ${got.join(', ')}.` : ' Nothing grows.'}${l.nibbled ? ' The raccoon nibbled one tile.' : ''}`
    }
    case 'discard': return `${who} put back ${bagText(l.give)}.`
    case 'raccoon': return `${who} moved the raccoon to the ${KINDS[v.tiles[l.tile].k].name.toLowerCase()}${l.from ? ` and took a ${RES_ONE[l.took]} from ${nm(l.from)}` : ''}.`
    case 'build': return `${who} built a ${l.kind}${l.free ? ' (Path Party)' : ''}.`
    case 'buy': return `${who} bought a cozy card.`
    case 'play': {
      const c = CARDS[l.card].name
      if (l.card === 'picnic') return `${who} opened a ${c}: ${bagText(Object.fromEntries(RES.map(k => [k, l.res.filter(x => x === k).length])))}.`
      if (l.card === 'gossip') return `${who} poured ${c} and got ${l.got ? n1(l.res, l.got) : `no ${RES_NAME[l.res].toLowerCase()}`}.`
      if (l.card === 'paths') return `${who} threw a ${c}: two free paths.`
      return `${who} played a ${c}.`
    }
    case 'bank': return `${who} traded ${n1(l.give, l.n)} for ${n1(l.get, 1)} at the harbour.`
    case 'offer': return `${who} offered ${nm(l.to)} a trade.`
    case 'accept': return `${who} took the trade: ${bagText(l.offer.give)} for ${bagText(l.offer.get)}.`
    case 'decline': return `${who} said no thanks.`
    case 'end': return ''
  }
  return ''
}

const ICON = { cottage: 'house', path: 'path', roll: 'dice', discard: 'basket', raccoon: 'raccoon', build: 'house', buy: 'cards', play: 'cards', bank: 'anchor', offer: 'swap', accept: 'swap', decline: 'swap' }
const COL = { cottage: '#e0707a', path: '#b9784a', roll: '#c9a77f', discard: '#8a7fb8', raccoon: '#6b6f7a', build: '#6f9a62', buy: '#e2a64a', play: '#e2a64a', bank: '#4f8fac', offer: '#6f9a62', accept: '#6f9a62', decline: '#c9a77f' }
// Log lines for this move: { icon, c, text }.
export function ticks(p, v, short) {
  const out = []
  const l = v.last
  if (l && l.type !== 'end') {
    let text = describe(v, short).replace(/\.$/, '')
    if (l.type === 'build') text = `${short(l.pid)} built a ${l.kind}`
    if (l.type === 'build' && l.kind === 'lodge') text = `${short(l.pid)} grew a cottage into a lodge`
    out.push({ icon: l.type === 'build' && l.kind === 'path' ? 'path' : l.type === 'build' && l.kind === 'lodge' ? 'lodge' : ICON[l.type] || 'leaf', c: COL[l.type] || '#c9a77f', text })
  }
  for (const k of ['path', 'help']) if (v.bonus[k] !== p.bonus?.[k] && v.bonus[k]) out.push({ icon: k === 'path' ? 'path' : 'raccoon', c: '#f7c45a', text: `${short(v.bonus[k])} ${short(v.bonus[k]) === 'You' ? 'have' : 'has'} the ${BONUS[k].name}` })
  if (v.winner && !p.winner) out.push({ icon: 'star', c: '#f7c45a', text: `${short(v.winner)} ${short(v.winner) === 'You' ? 'win' : 'wins'}!` })
  return out
}

// Chips to fly for this move: { from: { tile } | { pid }, to: pid, res }. Capped so a big roll stays readable.
export function flights(p, v) {
  const l = v.last, out = []
  if (!l) return out
  if (l.type === 'roll' && v.rolls !== p.rolls && v.gains) {
    const sum = l.dice[0] + l.dice[1]
    v.tiles.forEach((t, i) => {
      if (t.n !== sum || i === v.raccoon) return
      for (const vx of TILES[i].v) { const h = v.homes[vx]; if (h) for (let k = 0; k < h.l; k++) out.push({ from: { tile: i }, to: h.p, res: KINDS[t.k].res }) }
    })
  } else if (l.type === 'cottage' && l.got) {
    for (const t of VERTS[l.at].t) { const k = KINDS[v.tiles[t].k].res; if (k) out.push({ from: { tile: t }, to: l.pid, res: k }) }
  } else if (l.type === 'raccoon' && l.from) out.push({ from: { pid: l.from }, to: l.pid, res: l.took })
  else if (l.type === 'accept') {
    const o = l.offer
    for (const [k, n] of Object.entries(o.give)) for (let i = 0; i < n; i++) out.push({ from: { pid: o.from }, to: o.to, res: k })
    for (const [k, n] of Object.entries(o.get)) for (let i = 0; i < n; i++) out.push({ from: { pid: o.to }, to: o.from, res: k })
  } else if (l.type === 'play' && l.card === 'gossip' && l.got) {
    for (const q of v.players) { const n = (p.res[q]?.[l.res] || 0) - (v.res[q]?.[l.res] || 0); for (let i = 0; i < n && q !== l.pid; i++) out.push({ from: { pid: q }, to: l.pid, res: l.res }) }
  }
  return out.slice(0, 14)
}

// Per player, how many resources they just gained (for the +n bubbles on the signs).
export const gained = (p, v) => Object.fromEntries(v.players.map(q => [q, RES.reduce((a, k) => a + (v.res[q][k] - (p.res[q]?.[k] ?? v.res[q][k])), 0)]).filter(([, d]) => d))
