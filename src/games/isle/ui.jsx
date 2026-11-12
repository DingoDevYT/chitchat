import { EDGES, KINDS, TILES, VERTS, score, turn } from './rules.js'
import { describe } from './moments.js'
import { usePick } from './pick.js'

export const lastText = (v, nm) => describe(v, nm)

export const banner = (v, nm, me) => {
  if (v.winner) return `${nm(v.winner)} ${v.winner === me ? 'win' : 'wins'} with ${score(v, v.winner) + (v.reveal?.[v.winner] || 0)} points!`
  const t = turn({ pub: v })
  if (v.phase === 'place') return `${t === me ? 'Your' : `${nm(t)}'s`} turn to settle in`
  if (v.phase === 'trade') return `${nm(v.offer.from)} offers ${t === me ? 'you' : nm(t)} a trade`
  if (v.phase === 'discard') return `${t === me ? 'You put' : `${nm(t)} puts`} back ${v.discard[t]}`
  return `${t === me ? 'Your turn' : `${nm(t)}'s turn`} · Round ${v.round}`
}

export { Hud } from './hud.jsx'
export const keys = { r: { type: 'roll' }, e: { type: 'end' } }
export const seatCards = () => []
export const info = (v, pid) => `${score(v, pid)} pts`

// Dev lab only (#/table?g=isle&lab=cards|discard|steal): put `me` in a situation to check a picker by eye.
export function lab(s, me, what) {
  const pub = { ...s.pub, turn: s.pub.players.indexOf(me), phase: 'main', played: false, offers: 0, free: 0, offer: null, discard: null, back: null, res: { ...s.pub.res } }
  let priv = s.priv
  if (what === 'cards') {
    pub.res[me] = { twig: 2, wool: 2, clay: 2, berry: 1, tea: 2 }
    priv = { ...priv, [me]: { hand: ['paw', 'picnic', 'paths', 'gossip', 'keep'].map(k => ({ k, at: -1 })) } }
    pub.cards = { ...pub.cards, [me]: 5 }
  } else if (what === 'discard') {
    pub.res[me] = { twig: 3, wool: 3, clay: 2, berry: 2, tea: 1 }
    Object.assign(pub, { phase: 'discard', discard: { [me]: 5 }, back: 'main' })
  } else if (what === 'steal') {
    for (const p of pub.players) if (p !== me) pub.res[p] = { ...pub.res[p], wool: pub.res[p].wool + 2 }
    Object.assign(pub, { phase: 'raccoon', back: 'main' })
  }
  return { ...s, pub, priv }
}

// The flat island (no WebGL): the same tiles, homes, paths and raccoon in SVG, with the same tap-to-place spots.
const S = 40
export function Flat({ v, people }) {
  const pick = usePick()
  const col = pid => people.find(p => p.pid === pid)?.color || '#999'
  const hex = t => VERTS.length && TILES[t].v.map(i => `${VERTS[i].x * S},${VERTS[i].y * S}`).join(' ')
  const on = pick.onPick
  return (
    <svg className="gf-board-grid" viewBox="-200 -180 400 360" role="img" aria-label="Chitter Cove island" style={{ position: 'absolute', inset: '12% 10%', width: '80%', height: '76%' }}>
      {TILES.map((tile, t) => (
        <g key={t} onClick={pick.kind === 'raccoon' && pick.spots.includes(t) ? () => on(t) : undefined} style={{ cursor: pick.kind === 'raccoon' && pick.spots.includes(t) ? 'pointer' : undefined }}>
          <polygon points={hex(t)} fill={KINDS[v.tiles[t].k].color} stroke="#f2e2b8" strokeWidth="3" />
          {v.tiles[t].n > 0 && <><circle cx={tile.x * S} cy={tile.y * S} r="11" fill="#fff4dc" /><text x={tile.x * S} y={tile.y * S + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={[6, 8].includes(v.tiles[t].n) ? '#c8414f' : '#4a3324'}>{v.tiles[t].n}</text></>}
          {t === v.raccoon && <circle cx={tile.x * S + 13} cy={tile.y * S - 11} r="7" fill="#6b6f7a" stroke="#2b2230" strokeWidth="2" />}
        </g>
      ))}
      {Object.entries(v.paths).map(([e, p]) => { const a = VERTS[EDGES[e].a], b = VERTS[EDGES[e].b]; return <line key={e} x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} stroke={col(p)} strokeWidth="6" strokeLinecap="round" /> })}
      {Object.entries(v.homes).map(([i, h]) => <rect key={i} x={VERTS[i].x * S - (h.l === 2 ? 8 : 6)} y={VERTS[i].y * S - (h.l === 2 ? 8 : 6)} width={h.l === 2 ? 16 : 12} height={h.l === 2 ? 16 : 12} rx="3" fill={col(h.p)} stroke="#2b2230" strokeWidth="2" />)}
      {pick.kind === 'path' && pick.spots.map(e => { const a = VERTS[EDGES[e].a], b = VERTS[EDGES[e].b]; return <line key={'p' + e} x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} stroke="#fff3a0" strokeWidth="9" strokeLinecap="round" opacity=".8" style={{ cursor: 'pointer' }} onClick={() => on(e)} /> })}
      {(pick.kind === 'cottage' || pick.kind === 'lodge') && pick.spots.map(i => <circle key={'c' + i} cx={VERTS[i].x * S} cy={VERTS[i].y * S} r="8" fill="#fff3a0" opacity=".85" style={{ cursor: 'pointer' }} onClick={() => on(i)} />)}
    </svg>
  )
}
