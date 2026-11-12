import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './registry.js'
import { gameName } from './useGame'
import { ensureProfiles, profiles } from '../lib/store'
import { ask } from '../Dialog'
import { uiAudio, uiSound } from '../lib/animalese'
import { playSfx, sfxFor } from './sfx'
import Icon from '../icons/Icon'
import { Card } from './Card'
import { LEVEL_NAMES, Person, nameOf, seatList } from './People'
import { botChar, botUrl } from './bots.js'
import * as highcard from './highcard/ui.jsx'
import * as snack from './snack/ui.jsx'
import * as poker from './poker/ui.jsx'
import * as property from './property/ui.jsx'
import * as isle from './isle/ui.jsx'
import * as chitchen from './chitchen/ui.jsx'
import * as flyer from './flyer/ui.jsx'
import * as starchat from './starchat/ui.jsx'
import './games.css'

export const UIS = { highcard, snack, poker, property, isle, chitchen, flyer, starchat }
const Table3D = lazy(() => import('./Table3D'))
const HOUSE = {
  snack: [['stack', 'Stack draw cards'], ['drawUntil', 'Draw until you can play']],
  property: [
    ['quick', 'Quick game: 20 rounds, richest wins (off: play until one player is left)'],
    ['noAuction', 'No auctions: streets nobody buys stay for sale'],
    ['picnicPot', 'Picnic jackpot: taxes and fees pile up on the Picnic Blanket for whoever lands there'],
    ['startDouble', 'Land right on Start: collect 400 instead of 200'],
    ['napNoRent', 'No rent while napping: owners in the Nap Nook collect nothing'],
  ],
  chitchen: [['quick', 'Quick night: 3 chores each, a shorter night and Tea Breaks'], ['hideRoles', 'Hide roles: the night tram keeps its secrets']],
  isle: [
    ['quick', 'Quick game: first to 8 points'],
    ['friendly', "Friendly raccoon: it won't bother anyone under 3 points"],
    ['bigBaskets', 'Big baskets: only put back on a 7 when holding more than 9'],
  ],
  starchat: [
    ['quick', 'Quick: 8 rounds (off: 12)'], ['festival', 'Festival: 16 rounds'], ['openBonus', 'Show the bonus stars from the start'],
    ['noBonus', 'No bonus stars'], ['risingPrice', 'Rising price: each star costs 5 more than the last'], ['noBridge', 'Keep the Firefly Bridge closed'],
  ],
  flyer: [['whistle', 'Kettle Whistle: talking (or sprinkles) fills a meter for a short steam burst you can fly through anything in']],
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

// Draining bar plus a seconds count (bots move in about a second, so the count only shows when it's someone's real timer).
function Timer({ deadline, version }) {
  const left = () => Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
  const [s, setS] = useState(left)
  useEffect(() => { setS(left()); const t = setInterval(() => setS(left()), 250); return () => clearInterval(t) }, [deadline]) // eslint-disable-line react-hooks/exhaustive-deps
  const ms = Math.max(0, Date.parse(deadline) - Date.now())
  return (
    <span key={version} className={`gs-timer${s <= 10 ? ' low' : ''}`} style={{ '--ms': `${ms}ms` }} aria-hidden="true">
      <span className="gs-timer-bar"><i /></span>{s > 3 && <b>{s}s</b>}
    </span>
  )
}

function Confetti() {
  return <div className="gs-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
}

export default function GameScreen({ table, meId, joined, full, onFull, channelName }) {
  const { game, seats, hand, act } = table
  const R = GAMES[game.game], UI = UIS[game.game]
  const title = gameName(game.game, R.meta.name) // the picker name (Chomp Chat, Chatterton…) wins over the rules module name
  const [busy, setBusy] = useState(false)
  const [level, setLevel] = useState('normal')
  useProfiles(seats)
  const v = useMemo(() => game.pub ? R.view({ pub: game.pub, priv: hand ? { [meId]: hand } : {} }, meId) : null, [game.pub, hand, meId, R])
  const playing = game.status === 'playing', lobby = game.status === 'lobby', done = game.status === 'done'
  const people = seatList(seats, lobby ? null : v)
  const seated = seats.some(s => s.user_id === meId)
  const inRound = !!v?.players?.includes(meId) && !lobby
  const host = game.host_id === meId
  const turnPid = playing && v && !R.meta.realtime ? R.turn({ pub: v }) : null // real-time games have no "your turn"
  const winners = done && v ? R.over({ pub: v }) : null
  const nm = pid => nameOf(pid, seats)
  const meIdx = Math.max(0, people.findIndex(p => p.pid === meId))
  // A game with its own HUD (Teacup Town) draws the top bar, last move and dock itself, and shows coins on its own signs.
  const hud = !!(UI.Hud && v && !lobby)
  const info = pid => (v && !lobby && !UI.Hud ? UI.info(v, pid) : null)
  const run = async (action, extra) => { setBusy(true); const r = await act(action, extra); setBusy(false); return r }
  // Your move shows at once (pending) while the referee confirms it; a refusal or the next version clears it.
  const [pending, setPending] = useState(null)
  useEffect(() => setPending(null), [game.version])
  const doAct = async (action, extra) => { if (action === 'move') setPending(extra.move); if (!(await run(action, extra))) setPending(null) }

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
  useEffect(() => { if (playing && turnPid === meId && !UI.Stage) uiSound('got') }, [playing, turnPid === meId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Table sounds (dice, cards, chips, coins, gavel, fanfare) for everyone watching, from what changed in the view.
  const prevV = useRef(v)
  useEffect(() => {
    const a = uiAudio(), cues = sfxFor(game.game, prevV.current, v)
    prevV.current = v
    if (a && cues.length) playSfx(a.ctx, cues, a.volume)
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps

  // Screen readers hear every move and whose turn it is.
  const said = v && !lobby ? [UI.lastText(v, nm), UI.banner(v, nm, meId)].filter(Boolean).join(' ') : ''
  const close = async () => { if (await ask({ text: `Close the ${title} table for everyone?`, confirm: 'Close table', danger: true })) run('leave') }
  const tools = (
    <span className="gs-tools">
      <button className="icon-btn gs-btn" onClick={onFull} aria-pressed={full} title={full ? 'Back to the stadium screen' : 'Full view'} aria-label={full ? 'Back to the stadium screen' : 'Full view'}><Icon name={full ? 'minus' : 'fullscreen'} size={18} /></button>
      {host && <button className="icon-btn gs-btn" onClick={close} title="Close table" aria-label="Close table"><Icon name="close" size={18} /></button>}
    </span>
  )

  // A game with its own full-screen stage (Chatterflies' canvas runner) skips the table, banner and hand.
  if (UI.Stage) return (
    <div className={`gs g-${game.game}${full ? ' full' : ''}`}>
      <UI.Stage v={lobby ? null : v} game={game} seats={seats} people={people} me={meId} nm={nm} act={doAct} refresh={table.refresh} tools={tools} title={title}
        buttons={again => <LobbyButtons again={again} {...{ seated, joined, busy, run, seats, R, level, setLevel, host, game, meId }} />} />
      <div className="sr-only" aria-live="polite">{said}</div>
    </div>
  )

  return (
    <div className={`gs g-${game.game}${full ? ' full' : ''}`}>
      {UI.ownScene && !lobby ? null : canGL // a game with its own world (Midnight Chitchen) draws it in its Hud
        ? <Suspense fallback={<div className="gs-loading">Setting the table…</div>}>
          <Table3D game={UI.ownScene ? 'highcard' : game.game}v={lobby ? null : v} people={people} meIdx={meIdx} me={meId} turnPid={turnPid} info={info} winners={winners} version={game.version} pending={pending} />
        </Suspense>
        : <TableFlat UI={UI} v={lobby ? null : v} people={people} meIdx={meIdx} turnPid={turnPid} info={info} winners={winners} me={meId} />}

      {hud
        ? <UI.Hud v={v} me={meId} nm={nm} act={doAct} busy={busy} pending={pending} people={people} turnPid={turnPid}
          deadline={playing ? game.deadline : null} version={game.version} canPlay={playing && inRound} tools={tools} gameId={game.id} seats={seats} />
        : <div className="gs-top">
          <span className="gs-title"><Icon name="cards" size={18} /> {title}</span>
          {v && !lobby && <span key={turnPid === meId ? 'mine' : 'other'} className={`gs-banner${turnPid === meId ? ' mine' : ''}`}>{UI.banner(v, nm, meId)}{playing && game.deadline && <Timer deadline={game.deadline} version={game.version} />}</span>}
          {tools}
        </div>}
      {!hud && v && !lobby && UI.lastText(v, nm) && <div className="gs-last" key={game.version}>{UI.lastText(v, nm)}</div>}

      {lobby && (
        <div className="gs-panel gs-lobby">
          <h2>{title}</h2>
          <p className="muted">{R.meta.blurb || 'A quick one to warm up.'} {R.meta.min}–{R.meta.max} players.</p>
          <p className="small">{seats.length} seated{seats.length < R.meta.min ? `, need ${R.meta.min - seats.length} more` : ''}. Everyone else watches from the crowd.</p>
          <LobbyButtons {...{ seated, joined, busy, run, seats, R, level, setLevel, host, game, meId }} />
        </div>
      )}

      {playing && inRound && !hud && (
        <div className="gs-hand" aria-label="Your controls">
          <UI.Controls v={v} me={meId} act={doAct} nm={nm} busy={busy} pending={pending} seats={seats} />
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
          <span className="seg" role="radiogroup" aria-label="Bot difficulty">
            {Object.entries(LEVEL_NAMES).map(([k, l]) => <button key={k} role="radio" aria-checked={level === k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{l}</button>)}
          </span>
          <button className="btn ghost" disabled={busy} onClick={() => run('bot', { level })}><Icon name="plus" size={16} /> Add a bot</button>
        </div>
      )}
      {seats.some(s => s.bot) && seated && (
        <div className="gs-row small">
          {seats.filter(s => s.bot).map(s => { const c = botChar(s.bot, s.seat); return <button key={s.seat} className="chip" disabled={busy} onClick={() => run('unbot', { seat: s.seat })} title={`${c.blurb} (${LEVEL_NAMES[s.bot]})`} aria-label={`Send ${c.name} away`}><img src={botUrl(c)} alt="" width="18" height="18" /> {c.name} <Icon name="close" size={12} /></button> })}
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
