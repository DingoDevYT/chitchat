// Between rounds: Play again (seats filling, "Join next round", the ready-up countdown) and the game night (playlist,
// "Next up" vote, night scoreboard). The pure rules are in night.js; the referee checks everything again.
import { useEffect, useState } from 'react'
import Icon from '../icons/Icon'
import { ensureProfiles } from '../lib/store'
import { gameName } from './useGame'
import { META, QUEUEABLE } from './meta.js'
import { botChar } from './bots.js'
import { nameOf } from './People'
import { CHOICES, MAX_LIST, standings, tally, upcoming, votersOf } from './night.js'

// Seconds left on the ready-up countdown (games.deadline while the table isn't playing), or null.
export function useCountdown(game) {
  const on = game.status !== 'playing' && !!game.deadline
  const left = () => (on ? Math.max(0, Math.ceil((Date.parse(game.deadline) - Date.now()) / 1000)) : null)
  const [s, setS] = useState(left)
  useEffect(() => { setS(left()); if (!on) return; const t = setInterval(() => setS(left()), 250); return () => clearInterval(t) }, [on, game.deadline]) // eslint-disable-line react-hooks/exhaustive-deps
  return s
}

// Seats as dots: filled, Chitbot, free. Phones see the same row; it wraps.
export function SeatDots({ seats, max, min }) {
  const n = seats.length
  return (
    <div className="gn-seats" aria-label={`${n} of ${max} seats taken${n < min ? `, ${min - n} more needed` : ''}`}>
      <span className="gn-dots" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => { const s = seats.find(x => x.seat === i); return <i key={i} className={s ? (s.bot ? 'bot' : 'on') : ''} /> })}
      </span>
      <span className="small">{n} of {max} seats{n < min ? ` · need ${min - n} more` : ''}</span>
    </div>
  )
}

export function Countdown({ s, starting }) {
  if (s == null) return null
  return (
    <div className="gn-count" role="timer" aria-live="off">
      <Icon name="clock" size={16} /> {s > 0 ? <>Next round in <b>{s}</b> s</> : starting ? 'Starting…' : 'Waiting for players'}
      <span className="gn-count-bar" style={{ '--p': `${Math.min(1, s / 20)}` }} aria-hidden="true"><i /></span>
    </div>
  )
}

// A watcher's big button. Mid-round it queues you for the next round (night.js joinQueue).
export function JoinButton({ queued, full, busy, run, playing, compact }) {
  if (queued) return <button className={`btn ghost${compact ? ' gn-join-mini' : ' gn-join'}`} disabled={busy} onClick={() => run('stand')} title="You sit down when this round ends">You're in next round · Cancel</button>
  return (
    <button className={`btn primary${compact ? ' gn-join-mini' : ' gn-join'}`} disabled={busy || (full && !playing)} onClick={() => run('sit')}>
      <Icon name="user-plus" size={compact ? 16 : 18} /> {full && !playing ? 'Table full' : 'Join next round'}
    </button>
  )
}

const CHOICE_TEXT = { next: 'Next game', again: 'Play this again', skip: 'Skip it' }
const CHOICE_ICON = { next: 'chevron-right', again: 'rotate', skip: 'skip' }

function nightName(pid, seats, night) {
  if (pid.startsWith('bot:')) return botChar(night.who?.[pid] || seats.find(s => `bot:${s.seat}` === pid)?.bot || 'normal', +pid.slice(4)).name
  return nameOf(pid, seats)
}

// The night: where we are in the playlist, the vote after each game, the scoreboard, and the host's planner.
export function NightPanel({ game, seats, meId, host, busy, run }) {
  const night = game.night?.list ? game.night : null
  const ids = night ? Object.keys(night.scores || {}).filter(p => !p.startsWith('bot:')).join(',') : ''
  useEffect(() => { if (ids) ensureProfiles(ids.split(',')) }, [ids])
  const [plan, setPlan] = useState(false)
  if (!night) return host ? <Planner game={game} night={null} busy={busy} run={run} open={plan} setOpen={setPlan} /> : null

  const done = game.status === 'done'
  const nextId = upcoming(night)
  const voters = votersOf(seats, game.opts)
  const t = tally(night.votes, voters)
  const myVote = night.votes?.[meId]
  const canVote = done && !night.ended && voters.includes(meId)
  const board = standings(night)
  const choices = nextId ? CHOICES : ['next', 'again'] // the last game: end the night or play it again
  const label = c => (c === 'next' && !nextId ? 'End the night' : c === 'skip' && !night.list[night.at + 2] ? 'Skip and end' : CHOICE_TEXT[c])

  return (
    <div className="gn-night">
      <div className="gn-list" aria-label="Tonight's games">
        {night.list.map((id, i) => (
          <span key={i} className={`gn-step${i < night.at ? ' past' : i === night.at ? ' now' : ''}`}>{gameName(id, META[id]?.name || id)}</span>
        ))}
      </div>

      {done && !night.ended && (
        <div className="gn-vote">
          <p className="gn-up">{nextId ? <>Next up: <b>{gameName(nextId, META[nextId]?.name)}</b></> : <b>Last game of the night</b>}</p>
          <div className="gs-row" role="group" aria-label="Vote">
            {choices.map(c => (
              <button key={c} className={`btn ${myVote === c ? 'primary' : 'ghost'} gn-choice`} disabled={busy || !canVote} aria-pressed={myVote === c} onClick={() => run('vote', { choice: c })}>
                <Icon name={CHOICE_ICON[c]} size={16} /> {label(c)}{t.counts[c] > 0 && <em className="gn-n">{t.counts[c]}</em>}
              </button>
            ))}
          </div>
          <p className="small muted">{t.cast} of {voters.length} voted · majority wins{host ? '' : ', or the host decides'}</p>
          {host && (
            <div className="gs-row small gn-host">
              <span className="muted">Host:</span>
              {choices.map(c => <button key={c} className="chip" disabled={busy} onClick={() => run('next', { choice: c })}>{label(c)} now</button>)}
            </div>
          )}
        </div>
      )}

      {board.length > 0 && (
        <div className={`gn-board${night.ended ? ' final' : ''}`}>
          <h3>{night.ended ? <><Icon name="crown" size={18} /> End of the night</> : 'Night scores'}</h3>
          <ol>
            {board.slice(0, night.ended ? 10 : 6).map(([pid, pts]) => {
              const place = board.findIndex(([, p]) => p === pts) + 1
              return <li key={pid} className={`${pid === meId ? 'me' : ''} p${place}`}><span className="gn-place">{place}</span><span className="gn-who">{nightName(pid, seats, night)}</span><b>{pts}</b></li>
            })}
          </ol>
          <p className="small muted">1st 3 points · 2nd 2 · 3rd 1</p>
        </div>
      )}

      {host && <Planner game={game} night={night} busy={busy} run={run} open={plan} setOpen={setPlan} />}
    </div>
  )
}

// The host queues the games after this one. Phones: chips wrap, the picker is a native select.
function Planner({ game, night, busy, run, open, setOpen }) {
  const rest = night ? night.list.slice(night.at + 1) : []
  const set = list => run('night', { rest: list })
  if (!open) return (
    <div className="gs-row small">
      <button className="btn ghost" disabled={busy} onClick={() => setOpen(true)}><Icon name="stack" size={16} /> {night ? 'Edit the playlist' : 'Plan a game night'}</button>
    </div>
  )
  return (
    <div className="gn-plan">
      <p className="small"><b>{night ? 'Coming up' : 'Game night'}</b>: queue games to play after {gameName(game.game, META[game.game]?.name)}. Night points: 1st 3, 2nd 2, 3rd 1.</p>
      <div className="gs-row small">
        {rest.map((id, i) => <button key={i} className="chip" disabled={busy} onClick={() => set(rest.filter((_, k) => k !== i))} aria-label={`Remove ${gameName(id)}`}>{i + 1}. {gameName(id, META[id]?.name)} <Icon name="close" size={12} /></button>)}
        {rest.length < MAX_LIST && (
          <select className="gn-add" value="" disabled={busy} onChange={e => e.target.value && set([...rest, e.target.value])} aria-label="Add a game to the night">
            <option value="">Add a game…</option>
            {QUEUEABLE.map(id => <option key={id} value={id}>{gameName(id, META[id].name)}{META[id].noBots ? ' (no bots)' : ''}</option>)}
          </select>
        )}
      </div>
      <div className="gs-row small">
        {night && <button className="chip" disabled={busy} onClick={() => run('night', { stop: true })}>End the night</button>}
        <button className="chip" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  )
}
