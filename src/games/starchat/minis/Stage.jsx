// The Star Party minigame Stage: one overlay the board UI mounts all game long (it draws nothing outside a minigame).
//
//   <MiniStage v={view} me={myPid} nm={pid => name} act={act} seats={seats} busy={busy} />
//
// v: the Star Party view (pub). act: GameScreen's act ('move', { move }). seats: the table's seats (a bot seat's
// `bot` level lets Wishfall Catch draw the same bot ghosts the referee flies). It walks through:
//   intro card (title, one-line how-to, mouse / touch / keys) -> 3-2-1 synced to pub.mini.startAt -> the play area
//   -> "waiting for others" (pick and sim games, once you've posted) -> the results reveal (placings and coins, from
//   pub.miniResult, for D.MINI_RESULTS_MS plus a little, or until closed).
// Each minigame plugs in with a rules module (minis/index.js) and a view module (views.js) exporting:
//   how: { line, mouse, touch, keys }   the intro card's text
//   Play({ v, mini, state, cfg, me, nm, act, seats, startAt, phase, canPlay, busy })  the play area; phase is
//        'intro' | 'count' | 'play' so it can draw the field (but not take input) before the start
//   detail(reveal, pid, v) -> string     one line per player in the results ("14 points")
//   Reveal({ reveal, nm, me })            optional: a line or picture above the placings ("17 fireflies")
import { useEffect, useState } from 'react'
import { MINIGAMES, MINI_RESULTS_MS } from '../data.js'
import { VIEWS } from './views.js'
import { Coin, Keys, Mouse, Touch } from './art.jsx'
import './stage.css'

export function useNow(every = 100, on = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [every, on])
  return now
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']
const levelsOf = seats => Object.fromEntries((seats || []).filter(s => s.bot).map(s => [`bot:${s.seat}`, s.bot]))

export default function MiniStage({ v, me, nm = x => x, act, seats, busy }) {
  const live = v?.phase === 'mini' ? v.mini : null
  const res = v?.miniResult
  const key = res ? `${res.id}:${res.round}` : null
  const [closed, setClosed] = useState(null)
  const now = useNow(live ? 100 : 500, !!(live || res))
  const showRes = !live && res && closed !== key && (!res.at || now - res.at < MINI_RESULTS_MS + 4000)
  if (live) return <Live v={v} mini={live} me={me} nm={nm} act={act} seats={seats} busy={busy} now={now} />
  if (showRes) return <Results res={res} v={v} me={me} nm={nm} onClose={() => setClosed(key)} />
  return null
}

function Live({ v, mini, me, nm, act, seats, busy, now }) {
  const V = VIEWS[mini.id], cfg = MINIGAMES[mini.id]
  const t = mini.startAt == null ? 0 : mini.startAt - now
  const phase = t > 3000 ? 'intro' : t > 0 ? 'count' : 'play'
  const canPlay = v.players.includes(me)
  const waiting = canPlay && mini.kind !== 'turn' && mini.posted[me]
  return (
    <div className={`ms ms-${mini.id}`} role="dialog" aria-label={cfg.name}>
      <V.Play v={v} mini={mini} state={mini.state} cfg={cfg} me={me} nm={nm} act={act} seats={seats} levels={levelsOf(seats)}
        startAt={mini.startAt ?? now} phase={phase} canPlay={canPlay && !waiting} busy={busy} />
      {phase === 'intro' && <Intro name={cfg.name} how={V.how} left={t - 3000} canPlay={canPlay} />}
      {phase === 'count' && <div className="ms-321" key={Math.ceil(t / 1000)} aria-live="assertive">{Math.ceil(t / 1000)}</div>}
      {waiting && <Waiting v={v} mini={mini} nm={nm} me={me} />}
    </div>
  )
}

function Intro({ name, how, left, canPlay }) {
  return (
    <div className="ms-veil">
      <div className="ms-card ms-intro">
        <h2>{name}</h2>
        <p className="ms-line">{how.line}</p>
        <ul className="ms-how">
          {how.mouse && <li><Mouse /><span><b>Mouse</b> {how.mouse}</span></li>}
          {how.touch && <li><Touch /><span><b>Touch</b> {how.touch}</span></li>}
          {how.keys && <li className="ms-keys"><Keys /><span><b>Keys</b> {how.keys}</span></li>}
        </ul>
        {!canPlay && <p className="ms-small">You're watching this one.</p>}
        <div className="ms-bar"><i style={{ width: `${Math.max(0, Math.min(100, 100 - left / 35))}%` }} /></div>
      </div>
    </div>
  )
}

function Waiting({ v, mini, nm, me }) {
  const left = v.players.filter(p => !mini.posted[p])
  return (
    <div className="ms-veil soft">
      <div className="ms-card ms-wait" aria-live="polite">
        <h3>Waiting for others</h3>
        <p className="ms-small">Everyone's results stay secret until the last one is in.</p>
        <ul className="ms-who">
          {v.players.map(p => <li key={p} className={mini.posted[p] ? 'in' : ''}><span className="ms-dot" />{p === me ? 'You' : nm(p)}</li>)}
        </ul>
        <p className="ms-small">{left.length ? `${left.length} still playing` : 'Counting up…'}</p>
      </div>
    </div>
  )
}

function Results({ res, v, me, nm, onClose }) {
  const V = VIEWS[res.id], cfg = MINIGAMES[res.id]
  const order = Object.keys(res.place).sort((a, b) => res.place[a] - res.place[b] || res.coins[b] - res.coins[a])
  useEffect(() => { const t = setTimeout(onClose, MINI_RESULTS_MS + 3000); return () => clearTimeout(t) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`ms ms-res ms-${res.id}`} role="dialog" aria-label={`${cfg.name} results`}>
      <div className="ms-veil">
        <div className="ms-card ms-results">
          <h2>{cfg.name}</h2>
          {V.Reveal && <V.Reveal reveal={res.reveal} nm={nm} me={me} />}
          <ol className="ms-places">
            {order.map(p => (
              <li key={p} className={`p${res.place[p]}${p === me ? ' me' : ''}`}>
                <span className="ms-place">{ORD[res.place[p] - 1]}</span>
                <span className="ms-name">{p === me ? 'You' : nm(p)}<small>{V.detail(res.reveal, p, v)}</small></span>
                <span className="ms-coins"><Coin /> +{res.coins[p]}</span>
              </li>
            ))}
          </ol>
          <button className="ms-btn honey" onClick={onClose}>Back to the board</button>
        </div>
      </div>
    </div>
  )
}
