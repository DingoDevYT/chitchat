import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../icons/Icon'
import { Card, playName } from '../Card'
import { equity, turn } from './rules.js'
import { RANKINGS, STAGES, bestFive, handWords, moveBadge, moveSentence, raiseSizes, showdownText, stageTip, strength } from './words.js'
import './poker.css'

const fmt = n => n.toLocaleString()
const potOf = v => v.pot + Object.values(v.bets || {}).reduce((a, b) => a + b, 0)

// Dealer and blinds, worked out the same way rules.js deal() picks them.
function roles(v, pid) {
  const n = v.players.length, next = i => { for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (!v.out[v.players[j]]) return j } return -1 }
  const sbI = v.players.filter(p => !v.out[p]).length === 2 ? v.button : next(v.button), bbI = next(sbI)
  const r = []
  if (v.players[v.button] === pid) r.push('Dealer')
  if (v.phase === 'preflop') { if (v.players[sbI] === pid) r.push(`Small blind ${v.sb}`); if (v.players[bbI] === pid) r.push(`Big blind ${v.bb}`) }
  return r
}
// What this player just did, for the badge on their nameplate.
function badge(v, pid) {
  if (v.phase === 'showdown') { const r = v.results?.find(x => x.p === pid); return r ? ['won', `Won ${fmt(r.amt)}`] : v.folded?.[pid] ? ['folded', 'Folded'] : null }
  if (v.folded?.[pid]) return ['folded', 'Folded']
  const l = v.last
  if (l?.pid === pid && (v.acted?.[pid] || v.allin?.[pid])) return [`fresh ${l.type}`, moveBadge(l)]
  if (v.allin?.[pid]) return ['allin', 'All in!']
  if (v.acted?.[pid] && !v.bets?.[pid]) return ['check', 'Checked']
  return null
}
export const info = (v, pid) => {
  if (v.out[pid]) return 'Out of acorns'
  const tags = roles(v, pid), b = badge(v, pid)
  return (
    <>
      {fmt(v.stacks[pid])} acorns{v.bets?.[pid] ? ` · put in ${fmt(v.bets[pid])}` : ''}
      {(tags.length > 0 || b) && <span className="pk-tags">
        {tags.map(t => <i key={t} className="pk-role">{t}</i>)}
        {b && <b key={`${v.hand}-${v.phase}-${b[1]}`} className={`pk-badge ${b[0]}`}>{b[1]}</b>}
      </span>}
    </>
  )
}

export function lastText(v, nm) {
  if (v.phase === 'showdown' && v.results) return showdownText(v, nm).join(' ')
  return v.last ? moveSentence(nm(v.last.pid), v.last) : ''
}
export const banner = (v, nm, me) => {
  if (v.winner) return `${nm(v.winner)} wins the night with ${fmt(v.stacks[v.winner])} acorns!`
  if (v.phase === 'showdown') return (v.results || []).map(r => `${nm(r.p)} wins ${fmt(r.amt)} acorns`).join(' · ')
  const t = turn({ pub: v })
  return `${t === me ? 'Your turn' : `${nm(t)}'s turn`} · Pot ${fmt(potOf(v))} · Hand ${v.hand} of ${v.maxHands}`
}

export function Controls({ v, me, act, nm }) {
  const t = turn({ pub: v }), mine = t === me, show = v.phase === 'showdown'
  const who = p => (p === me ? 'You' : nm(p))
  const stack = v.stacks[me] || 0, put = v.bets?.[me] || 0, owe = Math.max(0, v.bet - put), pot = potOf(v)
  const sizes = raiseSizes({ bet: v.bet, minRaise: v.minRaise, pot, put, stack })
  const [to, setTo] = useState(sizes.min)
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState(false) // phones: the longer explanations
  const help = useRef(null)
  useEffect(() => { setTo(sizes.min); setPicking(false) }, [sizes.min, mine, v.phase, v.hand])
  const cards = v.me?.cards
  const inHand = !!cards && !v.out[me] && !v.folded?.[me]
  const opp = v.players.filter(p => p !== me && !v.folded?.[p] && !v.out[p]).length
  // ~200 random run-outs: enough for weak / okay / strong, cheap enough to redo once per new card.
  const str = useMemo(() => (inHand && !show ? strength(equity(cards, v.board, Math.max(1, opp), 200), Math.max(1, opp)) : null),
    [cards?.join(), v.board.join(), opp, inHand, show]) // eslint-disable-line react-hooks/exhaustive-deps
  const mv = move => act('move', { move })
  const step = v.bb / 2 || 5, clamp = x => Math.max(sizes.min, Math.min(sizes.max, x))
  const stage = STAGES.findIndex(s => s[0] === v.phase)
  const mineRoles = roles(v, me)

  const need = show ? null
    : v.out[me] ? "You're out of acorns. Thanks for playing!"
    : v.folded?.[me] ? "You folded, so you're sitting this hand out. A new hand starts soon."
    : v.allin?.[me] ? "You're all in. No more choices this hand, just watch the cards."
    : mine ? (owe > 0 ? `To stay in you need to put in ${fmt(Math.min(owe, stack))} more.` : 'No bet yet, so you can check (stay in for free).')
    : `Waiting for ${nm(t)} to choose.`

  return (
    <div className={`pk-dock${open ? ' open' : ''}`}>
      <div className="pk-in">
        <div className="pk-strip">
          <ol className="pk-track" aria-label="Stage of this hand">
            {STAGES.map(([k, l], i) => <li key={k} className={i < stage ? 'done' : i === stage ? 'now' : ''} aria-current={i === stage ? 'step' : undefined}>{l}</li>)}
          </ol>
          {!show && <span className="pk-pot">Pot <b>{fmt(pot)}</b></span>}
          <button className="pk-link pk-more" onClick={() => setOpen(o => !o)} aria-expanded={open}><Icon name={open ? 'chevron-down' : 'chevron-up'} size={14} />{open ? 'Less' : 'Explain'}</button>
          <button className="pk-link" onClick={() => help.current?.showModal()}>How to play</button>
        </div>
        <p className="pk-explain">{stageTip(v.phase, v.sb, v.bb)}{str ? ` ${str.tip}` : ''}</p>
        {need && <p className={`pk-need${mine && owe > 0 ? ' owe' : ''}`}>{need}</p>}

        {show ? <Results v={v} who={who} /> : cards && !v.out[me] && (
          <div className="pk-hand">
            <span className="gc-hand" aria-label={`Your cards: ${cards.map(playName).join(' and ')}`}>{cards.map(c => <Card key={c} kind="play" id={c} />)}</span>
            <span className="pk-hand-words">
              {inHand ? <span>You have: <b>{handWords(cards, v.board)}</b></span> : <span>Folded</span>}
              {str && <span className={`pk-str ${str.word}`}>Looks {str.word}</span>}
              {mineRoles.map(r => <i key={r} className="pk-role">{r === 'Dealer' ? "You're the dealer" : `You paid the ${r.toLowerCase()}`}</i>)}
            </span>
          </div>
        )}

        {mine && show && <div className="pk-acts"><button className="btn primary pk-act" onClick={() => mv({ type: 'next' })}><b>Next hand</b></button></div>}
        {mine && !show && !picking && (
          <div className="pk-acts">
            <button className="btn ghost pk-act pk-fold" onClick={() => mv({ type: 'fold' })} aria-keyshortcuts="F"><b>Fold</b><small>give up this hand</small></button>
            {owe === 0 ? <button className="btn primary pk-act" onClick={() => mv({ type: 'check' })}><b>Check</b><small>bet nothing, stay in</small></button>
              : owe >= stack ? <button className="btn primary pk-act" onClick={() => mv({ type: 'allin' })}><b>All in ({fmt(stack)})</b><small>all your acorns, to stay in</small></button>
              : <button className="btn primary pk-act" onClick={() => mv({ type: 'call' })}><b>Call {fmt(owe)}</b><small>match the bet to stay in</small></button>}
            {stack > owe && (sizes.min >= sizes.max
              ? <button className="btn pk-act" onClick={() => mv({ type: 'allin' })}><b>All in ({fmt(stack)})</b><small>bet all your acorns</small></button>
              : <button className="btn pk-act" onClick={() => setPicking(true)}><b>Raise…</b><small>bet more; others must match</small></button>)}
          </div>
        )}
        {mine && !show && picking && (
          <div className="pk-raise" role="group" aria-label="Choose your raise">
            <div className="pk-presets">
              {[['Min', sizes.min], ['½ pot', sizes.half], ['Pot', sizes.pot], ['All in', sizes.max]].map(([l, x]) =>
                <button key={l} className={`pk-chip${to === x ? ' on' : ''}`} aria-pressed={to === x} onClick={() => setTo(x)}>{l}</button>)}
            </div>
            <div className="pk-slide">
              <button className="icon-btn" onClick={() => setTo(clamp(to - step))} aria-label="Less"><Icon name="minus" size={16} /></button>
              <input type="range" min={sizes.min} max={sizes.max} step={step} value={to} onChange={e => setTo(+e.target.value)} aria-label="Raise to" />
              <button className="icon-btn" onClick={() => setTo(clamp(to + step))} aria-label="More"><Icon name="plus" size={16} /></button>
            </div>
            <p className="pk-sum">Raise to <b>{fmt(to)}</b> (adds {fmt(to - put)} from your {fmt(stack)} acorns)</p>
            <div className="pk-acts">
              <button className="btn ghost pk-act" onClick={() => setPicking(false)}><b>Back</b></button>
              <button className="btn primary pk-act" onClick={() => mv(to >= sizes.max ? { type: 'allin' } : { type: 'raise', to })}><b>{to >= sizes.max ? `All in (${fmt(stack)})` : `Raise to ${fmt(to)}`}</b></button>
            </div>
          </div>
        )}
      </div>
      <Help dlg={help} />
    </div>
  )
}
export const keys = { f: { type: 'fold' } }

// Who won and why, with the five cards that did it lit up.
function Results({ v, who }) {
  const top = v.results?.[0], hole = top && v.shown?.[top.p]
  const all = hole ? [...hole, ...v.board] : null
  const five = all ? new Set(bestFive(all)) : null
  return (
    <div className="pk-results">
      {showdownText(v, who).map((l, i) => <p key={i}>{l}</p>)}
      {five && <>
        <div className="pk-win-cards" aria-label={`Winning cards: ${[...five].map(playName).join(', ')}`}>
          {all.map((c, i) => <Card key={c} kind="play" id={c} small className={`${five.has(c) ? 'win' : 'dim'}${i === 2 ? ' gap' : ''}`} />)}
        </div>
        <small>Lit up: the 5 cards that made the winning hand ({who(top.p) === 'You' ? 'your' : `${who(top.p)}'s`} 2 cards, then the 5 shared ones).</small>
      </>}
    </div>
  )
}

function Help({ dlg }) {
  return (
    <dialog ref={dlg} className="pk-help" onClick={e => { if (e.target === dlg.current) dlg.current.close() }} aria-label="How to play Acorn Hold'em">
      <button className="icon-btn pk-close" onClick={() => dlg.current.close()} aria-label="Close"><Icon name="close" size={18} /></button>
      <h2>How to play</h2>
      <p>Acorns are pretend, so relax and have fun. <b>The goal:</b> win acorns from the pot, either by having the best hand at the end, or by being the last one still in when everyone else gives up.</p>
      <h3>A hand, step by step</h3>
      <ol>
        <li><b>Deal:</b> you get 2 secret cards. The two players after the dealer put in small starter bets called <b>blinds</b>, so there's always something to win.</li>
        <li><b>Flop:</b> 3 shared cards go face up in the middle. Everyone can use them.</li>
        <li><b>Turn:</b> a 4th shared card.</li>
        <li><b>River:</b> the 5th and last shared card.</li>
        <li><b>Showdown:</b> anyone still in shows their cards. Your best 5 out of your 2 plus the 5 shared wins.</li>
      </ol>
      <p>After each step there's a round of betting, going around the table.</p>
      <h3>Your choices</h3>
      <dl>
        <dt>Check</dt><dd>Bet nothing and stay in. Only when nobody has bet yet.</dd>
        <dt>Call</dt><dd>Put in just enough to match the biggest bet, to stay in.</dd>
        <dt>Raise</dt><dd>Bet more than everyone else. They must match it or give up.</dd>
        <dt>Fold</dt><dd>Give up this hand. You lose what you already put in, nothing more.</dd>
        <dt>All in</dt><dd>Bet every acorn you have. You can't be asked for more this hand.</dd>
      </dl>
      <h3>Hands, best to worst</h3>
      <table className="pk-ranks"><tbody>
        {RANKINGS.map(([n, d, ex]) => <tr key={n}><th>{n}</th><td>{d}</td><td className="pk-ex">{ex}</td></tr>)}
      </tbody></table>
      <p className="muted small">The dock shows what you have right now and how strong it looks, so you can learn as you go.</p>
    </dialog>
  )
}

export function Flat({ v }) {
  return (
    <div className="gf-center col">
      <div className="gf-board">{[0, 1, 2, 3, 4].map(i => <Card key={i} kind="play" id={v.board[i]} back={v.board[i] == null} small />)}</div>
      <b className="gf-pot">Pot {fmt(potOf(v))}</b>
    </div>
  )
}
export const seatCards = (v, pid, me) => v.out[pid] || v.folded?.[pid] ? [] : [0, 1].map(i => ({ kind: 'play', id: v.shown?.[pid]?.[i] ?? (pid === me ? v.me?.cards?.[i] : null) }))
