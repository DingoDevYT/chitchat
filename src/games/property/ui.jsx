import { BOARD, GROUPS, canBuild, ownable, turn, worth } from './rules.js'

const fmt = n => n.toLocaleString()
export const info = (v, pid) => v.broke[pid] ? 'Out of coins' : `${fmt(v.cash[pid])} coins${v.napping[pid] ? ' · napping' : ''}`
export function lastText(v, nm) {
  const l = v.last
  if (!l) return ''
  const who = nm(l.pid)
  if (l.type === 'roll') return `${who} rolled ${l.dice[0]} and ${l.dice[1]}${l.napped ? ': three doubles, off to nap!' : `, landing on ${BOARD[v.pos[l.pid]].name}.`}${v.fortune ? ` Fortune: ${v.fortune}` : ''}`
  if (l.type === 'buy') return `${who} bought ${BOARD[v.pos[l.pid]].name}.`
  if (l.type === 'build') return `${who} built a cottage on ${BOARD[l.space].name}.`
  if (l.type === 'wake') return `${who} paid 50 to wake up.`
  return ''
}
export const banner = (v, nm, me) => {
  if (v.winner) return `${nm(v.winner)} is the toast of Teacup Town with ${fmt(worth(v, v.winner))}!`
  const t = turn({ pub: v })
  return `${t === me ? 'Your turn' : `${nm(t)}'s turn`} · Round ${v.round}${v.maxRounds ? `/${v.maxRounds}` : ''}`
}

export function Controls({ v, me, act }) {
  if (turn({ pub: v }) !== me) return null
  const mv = move => act('move', { move })
  const here = BOARD[v.pos[me]]
  const builds = v.phase !== 'buy' ? BOARD.map((_, i) => i).filter(i => canBuild(v, me, i)) : []
  return (
    <div className="gc-row">
      {v.phase === 'roll' && v.napping[me] && v.cash[me] >= 50 && <button className="btn ghost" onClick={() => mv({ type: 'wake' })}>Wake up (50)</button>}
      {v.phase === 'roll' && <button className="btn primary big" onClick={() => mv({ type: 'roll' })} aria-keyshortcuts="R">{v.napping[me] ? 'Roll for doubles' : 'Roll'}</button>}
      {v.phase === 'buy' && <>
        <button className="btn primary" disabled={v.cash[me] < here.price} onClick={() => mv({ type: 'buy' })} aria-keyshortcuts="B">Buy {here.name} ({fmt(here.price)})</button>
        <button className="btn ghost" onClick={() => mv({ type: 'pass' })}>No thanks</button>
      </>}
      {builds.map(i => <button key={i} className="btn" onClick={() => mv({ type: 'build', space: i })} style={{ '--g': GROUPS[BOARD[i].g].color }}>Cottage on {BOARD[i].name} ({GROUPS[BOARD[i].g].cottage})</button>)}
      {v.phase === 'end' && <button className="btn primary" onClick={() => mv({ type: 'end' })} aria-keyshortcuts="E">{v.again ? 'Doubles! Roll again' : 'End turn'}</button>}
    </div>
  )
}
export const keys = { r: { type: 'roll' }, e: { type: 'end' } }

// Board coordinates on a 7×7 ring: space i → [col, row], Start at the bottom-right corner, going clockwise toward the left.
export function cell(i) {
  if (i <= 6) return [6 - i, 6]
  if (i <= 12) return [0, 12 - i]
  if (i <= 18) return [i - 12, 0]
  return [6, i - 18]
}

export function Flat({ v, people }) {
  return (
    <div className="gf-board-grid" role="img" aria-label="Teacup Town board">
      {BOARD.map((b, i) => {
        const [c, r] = cell(i)
        const o = v.owner[i]
        return (
          <div key={i} className={`gf-tile k-${b.k}`} style={{ gridColumn: c + 1, gridRow: r + 1, '--g': b.g != null ? GROUPS[b.g].color : 'transparent', '--o': o ? people.find(p => p.pid === o)?.color : 'transparent' }}>
            <span>{b.name}</span>
            {v.cottages[i] > 0 && <i className="gf-cot">{'⌂'.repeat(v.cottages[i])}</i>}
            <span className="gf-tokens">{people.filter(p => v.pos[p.pid] === i && !v.broke[p.pid]).map(p => <i key={p.pid} style={{ background: p.color }} />)}</span>
          </div>
        )
      })}
      <div className="gf-mid"><b>Teacup Town</b><span>{v.dice.join(' + ')}</span>{v.fortune && <em>{v.fortune}</em>}</div>
    </div>
  )
}
export const seatCards = () => []
export { ownable }
