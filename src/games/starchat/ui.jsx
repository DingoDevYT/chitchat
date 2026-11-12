// Starchat placeholder UI (milestone 1 is the rules only): plain text and buttons so GameScreen and GameLab can run
// a whole game (#/table?g=starchat&n=4). The board scene and HUD trays come in the visual milestone; the minigame
// Stage (minis/Stage.jsx) is mounted over the whole game screen from Controls.
// ownScene: GameScreen skips the shared 3D table during play (it has no Starchat layout yet).
import { BRIDGE, BOARD_NAME, ITEMS, KINDS, MINIGAMES, SPACES } from './data.js'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { bot, legal, lastLanterns, move, starPrice, timeout, turn } from './rules.js'
import MiniStage from './minis/Stage.jsx'

export const ownScene = true
const spaceName = sp => SPACES[sp]?.name || KINDS[SPACES[sp]?.k]?.name || `Space ${sp}`

export const info = (v, pid) => `${v.stars[pid]} stars, ${v.coins[pid]} coins`
export const seatCards = () => []

export function banner(v, nm, me) {
  if (v.winners) return `${v.winners.map(nm).join(' & ')} ${v.winners.length > 1 ? 'win' : 'wins'} with ${v.stars[v.winners[0]]} stars!`
  if (v.phase === 'mini') return v.mini.posted[me] ? `${MINIGAMES[v.mini.id].name}: waiting for everyone…` : `${MINIGAMES[v.mini.id].name}! ${MINIGAMES[v.mini.id].text}`
  const t = turn({ pub: v })
  const round = `Round ${v.round}/${v.maxRounds}${lastLanterns(v) ? ' (Last Lanterns)' : ''}`
  return `${round}. ${t === me ? 'Your turn' : `${nm(t)}'s turn`}: the star is at ${spaceName(v.star)} (${starPrice(v)} coins).`
}

export function lastText(v, nm) {
  const l = v.last
  if (!l) return ''
  const bits = []
  if (l.dice) bits.push(`rolled ${l.dice.join(' + ')}`)
  if (l.item) bits.push(`used a ${ITEMS[l.item].name}`)
  for (const e of l.ev) {
    if (e.e === 'star') bits.push(`bought ${e.n > 1 ? `${e.n} stars` : 'a star'}`)
    else if (e.e === 'buy') bits.push(`bought a ${ITEMS[e.item].name}`)
    else if (e.e === 'land') bits.push(`landed on ${spaceName(e.sp)}`)
    else if (e.e === 'drift') bits.push(`the star drifted to ${spaceName(e.to)}`)
  }
  return bits.length ? `${nm(l.pid)} ${bits.join(', ')}.` : ''
}

function label(m, v, nm) {
  if (m.type === 'roll') return v.diceN > 1 ? `Roll ${v.diceN} dice` : 'Roll'
  if (m.type === 'item') return `${ITEMS[m.item].name}${m.pick ? ` (${m.pick})` : ''}${m.target ? ` on ${nm(m.target)}` : ''}${m.space != null ? ` at ${spaceName(m.space)}` : ''}`
  if (m.type === 'path') return m.to === BRIDGE.to ? `${BRIDGE.name} (${BRIDGE.toll} coins)` : 'Stay on the loop'
  if (m.type === 'star') return `Buy ${m.n > 1 ? `${m.n} stars` : 'the star'}`
  if (m.type === 'pass') return 'Not now'
  if (m.type === 'buy') return `${ITEMS[m.item].name} (${ITEMS[m.item].price})`
  if (m.type === 'leave') return 'Leave the stall'
  return m.type
}

// The minigame Stage covers the whole game screen (it draws itself only during a minigame and its results).
function StageMount(props) {
  const at = useRef(null), [host, setHost] = useState(null)
  useEffect(() => setHost(at.current?.closest('.gs') || null), [])
  return <span ref={at} hidden>{host && createPortal(<MiniStage {...props} />, host)}</span>
}

export function Controls(props) {
  return <><StageMount {...props} /><BoardControls {...props} /></>
}

function BoardControls({ v, me, act, nm, busy }) {
  const moves = legal(v, me)
  if (!moves.length) return <div className="gc-row muted small">{v.satchel?.[me]?.length ? `Satchel: ${v.satchel[me].map(i => ITEMS[i].name).join(', ')}` : ''}</div>
  if (v.phase === 'mini') return null // the Stage has the controls
  return (
    <div className="gc-row">
      {moves.map((m, i) => <button key={i} className={`btn ${i ? 'ghost' : 'primary'}`} disabled={busy} onClick={() => act('move', { move: m })}>{label(m, v, nm)}</button>)}
    </div>
  )
}

export function Flat({ v }) {
  return (
    <div className="gf-center small">
      <b>{BOARD_NAME}</b> round {v.round}/{v.maxRounds}. Star at {spaceName(v.star)}.
    </div>
  )
}

// Dev lab only: #/table?g=starchat&mini=bun&lab=mini jumps to the first minigame (timeouts on the board), lab=results
// plays it out with bots (you as a hard one) to show the results reveal.
export function lab(s, me, what) {
  let k = 0
  while (s.pub.phase !== 'mini' && k++ < 500) s = move(s, turn(s), timeout(s))
  if (what === 'results') while (s.pub.phase === 'mini' && k++ < 2000) { const w = turn(s); s = move(s, w, bot({ ...s.pub }, w, w === me ? 'hard' : 'normal', Math.random) ?? timeout(s)) }
  return s
}
