// Starchat's UI module for GameScreen: the board is Table3D's StarchatScene, the HUD is starchat/hud.jsx (it replaces
// the shared top bar and dock), and Flat is the no-WebGL board. banner/lastText feed the screen reader.
import { BOARD_NAME, ITEMS, KINDS, MINIGAMES, SPACES } from './data.js'
import { bot, lastLanterns, legal, move, starPrice, timeout, turn } from './rules.js'
import { BOARD_D, BOARD_W, PATH, POND, SPOTS } from './geom.js'
import { news, spaceName } from './news.js'

export { Hud } from './hud.jsx'
export const keys = { r: { type: 'roll' } }

export const info = (v, pid) => `${v.stars[pid]} stars, ${v.coins[pid]} coins`
export const seatCards = () => []

export function banner(v, nm, me) {
  if (v.winners) return `${v.winners.map(nm).join(' & ')} ${v.winners.length > 1 ? 'win' : 'wins'} with ${v.stars[v.winners[0]]} star${v.stars[v.winners[0]] === 1 ? '' : 's'}!`
  if (v.phase === 'mini') return v.mini.posted[me] ? `${MINIGAMES[v.mini.id].name}: waiting for everyone.` : `${MINIGAMES[v.mini.id].name}! ${MINIGAMES[v.mini.id].text}`
  const t = turn({ pub: v })
  const round = `Round ${v.round} of ${v.maxRounds}${lastLanterns(v) ? ' (Last Lanterns)' : ''}`
  return `${round}. ${t === me ? 'Your turn' : `${nm(t)}'s turn`}: the star is at ${spaceName(v.star)} (${starPrice(v)} coins).`
}

export function lastText(v, nm) {
  const lines = news(v, nm).map(l => l.text)
  return lines.length ? lines.join('. ') + '.' : ''
}

// Plain buttons (only used if the HUD is ever skipped).
export function Controls({ v, me, act, busy }) {
  const moves = legal(v, me)
  if (v.phase === 'mini' || !moves.length) return null
  const label = m => m.type === 'item' ? `${ITEMS[m.item].name}${m.pick ? ` (${m.pick})` : ''}` : m.type === 'buy' ? ITEMS[m.item].name : m.type === 'path' ? `Go to ${spaceName(m.to)}` : m.type === 'star' ? `Buy ${m.n} star${m.n > 1 ? 's' : ''}` : m.type
  return <div className="gc-row">{moves.map((m, i) => <button key={i} className={`btn ${i ? 'ghost' : 'primary'}`} disabled={busy} onClick={() => act('move', { move: m })}>{label(m)}</button>)}</div>
}

// The flat board (no WebGL): the loop round the pond as an SVG, tiles in their kind colours, the star and tokens.
export function Flat({ v, people }) {
  const X = x => x + BOARD_W / 2, Z = z => z + BOARD_D / 2
  const d = PATH.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(2)} ${Z(z).toFixed(2)}`).join('') + 'Z'
  return (
    <svg className="gf-center" viewBox={`0 0 ${BOARD_W} ${BOARD_D}`} style={{ position: 'absolute', inset: '12% 6%', width: '88%', height: '76%' }} role="img" aria-label={`${BOARD_NAME}: the star is at ${spaceName(v.star)}`}>
      <rect width={BOARD_W} height={BOARD_D} rx="0.6" fill="#2f5c4e" />
      <ellipse cx={X(POND.x)} cy={Z(POND.z)} rx={POND.rx} ry={POND.rz} fill="#24507e" />
      <path d={d} fill="none" stroke="#a58c62" strokeWidth="0.7" strokeLinejoin="round" />
      <line x1={X(SPOTS[26].x)} y1={Z(SPOTS[26].z)} x2={X(SPOTS[9].x)} y2={Z(SPOTS[9].z)} stroke="#8a5c3a" strokeWidth="0.5" />
      {SPACES.map((s, i) => <circle key={i} cx={X(SPOTS[i].x)} cy={Z(SPOTS[i].z)} r="0.28" fill={KINDS[s.k].color} stroke={i === v.star ? '#fff3a0' : '#00000040'} strokeWidth={i === v.star ? 0.12 : 0.04} />)}
      {people.filter(p => v.pos[p.pid] != null).map((p, k) => <circle key={p.pid} cx={X(SPOTS[v.pos[p.pid]].x) + (k % 2 - 0.5) * 0.2} cy={Z(SPOTS[v.pos[p.pid]].z) + (Math.floor(k / 2) % 2 - 0.5) * 0.2} r="0.14" fill={p.color} stroke="#fff" strokeWidth="0.04" />)}
    </svg>
  )
}

// GameLab test situations (#/table?g=starchat&n=4&lab=star): put the lab player (me) straight into a moment.
// lab=mini jumps to the first minigame (with &mini=catch|bun|count), lab=results plays it out to show the reveal.
export function lab(st, me, name) {
  if (name === 'mini' || name === 'results') {
    let s = st, k = 0
    while (s.pub.phase !== 'mini' && k++ < 500) s = move(s, turn(s), timeout(s))
    if (name === 'results') while (s.pub.phase === 'mini' && k++ < 2000) { const w = turn(s); s = move(s, w, bot({ ...s.pub }, w, w === me ? 'hard' : 'normal', Math.random) ?? timeout(s)) }
    return s
  }
  const pub = JSON.parse(JSON.stringify(st.pub))
  const at = pub.order.indexOf(me)
  const mine = () => Object.assign(pub, { turn: at, phase: 'roll', walk: null, fork: null, shop: null, used: false, diceN: 1, boat: null })
  if (name === 'star') { mine(); Object.assign(pub, { phase: 'star', walk: { left: 2, chk: 1 } }); pub.pos[me] = pub.star; pub.coins[me] = 34 }
  if (name === 'shop') { mine(); Object.assign(pub, { phase: 'shop', walk: { left: 3, chk: 2 }, shop: { at: 6, stock: ['jar', 'boat', 'gust'] } }); pub.pos[me] = 6; pub.coins[me] = 26 }
  if (name === 'fork') { mine(); pub.round = 2; Object.assign(pub, { phase: 'fork', walk: { left: 3, chk: 2, choice: null }, fork: [27, 36] }); pub.pos[me] = 26; pub.coins[me] = 30 }
  if (name === 'items') { mine(); pub.satchel[me] = ['jar', 'boat', 'snail']; pub.coins[me] = 23 }
  if (name === 'last') { mine(); pub.round = pub.maxRounds - 1 }
  return { ...st, pub }
}
