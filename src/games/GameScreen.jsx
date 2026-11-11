import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { GAMES } from './registry.js'
import { ensureProfiles, profiles } from '../lib/store'
import { ask } from '../Dialog'
import { uiSound } from '../lib/animalese'
import Icon from '../icons/Icon'
import { Card } from './Card'
import { LEVEL_NAMES, Person, nameOf, seatList } from './People'
import * as highcard from './highcard/ui.jsx'
import * as snack from './snack/ui.jsx'
import * as poker from './poker/ui.jsx'
import * as property from './property/ui.jsx'
import './games.css'

const UIS = { highcard, snack, poker, property }
const Table3D = lazy(() => import('./Table3D'))
const HOUSE = {
  snack: [['stack', 'Stack draw cards'], ['drawUntil', 'Draw until you can play']],
  property: [['full', 'Full game (no round limit)']],
}

// WebGL, unless ?flat is in the address (forces the 2D table for testing).
const canGL = (() => {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('flat')) return false
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
})()

// The flat table: same people and game, no WebGL. Seats round an oval, you at the bottom.
function TableFlat({ UI, v, people, meIdx, turnPid, info, winners, me }) {
  const n = people.length
  return (
    <div className="gflat">
      <div className="gflat-felt" />
      {v && <UI.Flat v={v} people={people} me={me} />}
      {people.map((p, i) => {
        const a = Math.PI / 2 + (2 * Math.PI * ((i - meIdx + n) % n)) / n
        return (
          <div key={p.pid} className="gflat-seat" style={{ left: `${50 + 40 * Math.cos(a)}%`, top: `${46 + 32 * Math.sin(a)}%` }}>
            <Person p={p} turn={p.pid === turnPid} info={info(p.pid)} me={p.pid === me} won={winners?.includes(p.pid)} />
            {v && <span className="gflat-cards">{UI.seatCards(v, p.pid, me).map((c, k) => <FlatCard key={k} {...c} />)}</span>}
          </div>
        )
      })}
    </div>
  )
}
function FlatCard({ kind, id }) {
  return <Card kind={kind} id={id} back={id == null} small className="mini" />
}

function Timer({ deadline, version }) {
  const ms = Math.max(0, Date.parse(deadline) - Date.now())
  return <span key={version} className="gs-timer" style={{ '--ms': `${ms}ms` }} aria-hidden="true"><i /></span>
}

function Confetti() {
  return <div className="gs-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
}

export default function GameScreen({ table, meId, joined, full, onFull, channelName }) {
  const { game, seats, hand, act } = table
  const R = GAMES[game.game], UI = UIS[game.game]
  const [busy, setBusy] = useState(false)
  const [level, setLevel] = useState('normal')
  useProfiles(seats)
  const v = useMemo(() => game.pub ? R.view({ pub: game.pub, priv: hand ? { [meId]: hand } : {} }, meId) : null, [game.pub, hand, meId, R])
  const playing = game.status === 'playing', lobby = game.status === 'lobby', done = game.status === 'done'
  const people = seatList(seats, lobby ? null : v)
  const seated = seats.some(s => s.user_id === meId)
  const inRound = !!v?.players?.includes(meId) && !lobby
  const host = game.host_id === meId
  const turnPid = playing && v ? R.turn({ pub: v }) : null
  const winners = done && v ? R.over({ pub: v }) : null
  const nm = pid => nameOf(pid, seats)
  const meIdx = Math.max(0, people.findIndex(p => p.pid === meId))
  const info = pid => (v && !lobby ? UI.info(v, pid) : null)
  const run = async (action, extra) => { setBusy(true); await act(action, extra); setBusy(false) }
  const doAct = (action, extra) => run(action, extra)

  // Keyboard: game shortcuts on your turn (K / S, F, R / E…), unless you're typing somewhere.
  useEffect(() => {
    if (!playing || turnPid !== meId || !UI.keys) return
    const kd = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return
      const m = UI.keys[e.key.toLowerCase()]
      if (m) { e.preventDefault(); doAct('move', { move: m }) }
    }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  }, [playing, turnPid, meId, UI, game.version]) // eslint-disable-line react-hooks/exhaustive-deps

  // A little blip (the UI-sound setting applies) when it becomes your turn.
  useEffect(() => { if (playing && turnPid === meId) uiSound('got') }, [playing, turnPid === meId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Screen readers hear every move and whose turn it is.
  const said = v && !lobby ? [UI.lastText(v, nm), UI.banner(v, nm, meId)].filter(Boolean).join(' ') : ''
  const close = async () => { if (await ask({ text: `Close the ${R.meta.name} table for everyone?`, confirm: 'Close table', danger: true })) run('leave') }

  return (
    <div className={`gs g-${game.game}${full ? ' full' : ''}`}>
      {canGL
        ? <Suspense fallback={<div className="gs-loading">Setting the table…</div>}>
          <Table3D game={game.game} v={lobby ? null : v} people={people} meIdx={meIdx} me={meId} turnPid={turnPid} info={info} winners={winners} version={game.version} />
        </Suspense>
        : <TableFlat UI={UI} v={lobby ? null : v} people={people} meIdx={meIdx} turnPid={turnPid} info={info} winners={winners} me={meId} />}

      <div className="gs-top">
        <span className="gs-title"><Icon name="cards" size={18} /> {R.meta.name}</span>
        {v && !lobby && <span key={turnPid === meId ? 'mine' : 'other'} className={`gs-banner${turnPid === meId ? ' mine' : ''}`}>{UI.banner(v, nm, meId)}</span>}
        <span className="spacer" />
        <button className="icon-btn gs-btn" onClick={onFull} aria-pressed={full} title={full ? 'Back to the stadium screen' : 'Full view'} aria-label={full ? 'Back to the stadium screen' : 'Full view'}><Icon name={full ? 'minus' : 'fullscreen'} size={18} /></button>
        {host && <button className="icon-btn gs-btn" onClick={close} title="Close table" aria-label="Close table"><Icon name="close" size={18} /></button>}
      </div>
      {playing && game.deadline && <Timer deadline={game.deadline} version={game.version} />}
      {v && !lobby && UI.lastText(v, nm) && <div className="gs-last" key={game.version}>{UI.lastText(v, nm)}</div>}

      {lobby && (
        <div className="gs-panel gs-lobby">
          <h2>{R.meta.name}</h2>
          <p className="muted">{R.meta.blurb || 'A quick one to warm up.'} {R.meta.min}–{R.meta.max} players.</p>
          <p className="small">{seats.length} seated{seats.length < R.meta.min ? `, need ${R.meta.min - seats.length} more` : ''}. Everyone else watches from the crowd.</p>
          <LobbyButtons {...{ seated, joined, busy, run, seats, R, level, setLevel, host, game, meId }} />
        </div>
      )}

      {playing && inRound && (
        <div className="gs-hand" aria-label="Your controls">
          <UI.Controls v={v} me={meId} act={doAct} nm={nm} busy={busy} />
        </div>
      )}

      {done && (
        <div className="gs-panel gs-results">
          {winners?.length > 0 && <Confetti />}
          <h2>{winners?.includes(meId) ? 'You win!' : `${winners?.map(nm).join(' & ')} wins!`}</h2>
          <p>{UI.banner(v, nm, meId)}</p>
          <LobbyButtons again {...{ seated, joined, busy, run, seats, R, level, setLevel, host, game, meId }} />
        </div>
      )}
      <div className="sr-only" aria-live="polite">{said}</div>
    </div>
  )
}

function LobbyButtons({ again, seated, joined, busy, run, seats, R, level, setLevel, host, game, meId }) {
  const full = seats.length >= R.meta.max
  const house = HOUSE[game.game] || []
  return (
    <>
      <div className="gs-row">
        {!seated && joined && <button className="btn primary" disabled={busy || full} onClick={() => run('sit')}>Sit down</button>}
        {!seated && !joined && <span className="muted small">Join the stadium to take a seat.</span>}
        {seated && !(host && again) && <button className="btn ghost" disabled={busy} onClick={() => run('stand')}>Stand up</button>}
        {host && <button className="btn primary" disabled={busy || seats.length < R.meta.min} onClick={() => run('start')}>{again ? 'Again?' : 'Start'}</button>}
        {!host && again && <span className="muted small">Waiting for the host to go again.</span>}
      </div>
      {seated && !full && (
        <div className="gs-row gs-bots">
          <span className="seg" role="radiogroup" aria-label="Chitbot difficulty">
            {Object.entries(LEVEL_NAMES).map(([k, l]) => <button key={k} role="radio" aria-checked={level === k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{l}</button>)}
          </span>
          <button className="btn ghost" disabled={busy} onClick={() => run('bot', { level })}><Icon name="plus" size={16} /> Add a Chitbot</button>
        </div>
      )}
      {seats.some(s => s.bot) && seated && (
        <div className="gs-row small">
          {seats.filter(s => s.bot).map(s => <button key={s.seat} className="chip" disabled={busy} onClick={() => run('unbot', { seat: s.seat })} aria-label={`Send away Chitbot (${LEVEL_NAMES[s.bot]})`}>Chitbot ({LEVEL_NAMES[s.bot]}) <Icon name="close" size={12} /></button>)}
        </div>
      )}
      {host && house.length > 0 && (
        <div className="gs-row small">
          {house.map(([k, l]) => <label key={k} className="toggle"><input type="checkbox" checked={!!game.opts?.[k]} disabled={busy}
            onChange={e => run('opts', { opts: { ...game.opts, [k]: e.target.checked } })} /> <span>{l}</span></label>)}
        </div>
      )}
    </>
  )
}

function useProfiles(seats) {
  const ids = seats.map(s => s.user_id).filter(Boolean).join(',')
  useEffect(() => { if (ids) ensureProfiles(ids.split(',')) }, [ids])
  profiles.use(s => ids.split(',').map(id => s[id]?.display_name || s[id]?.username || '').join('|'))
}
