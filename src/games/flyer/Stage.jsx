// Chatterflies takes over the whole game screen (no 3D table): the chimney-pot line-up and countdown, the run, and
// the cake podium. GameScreen hands us the lobby buttons, so seats, Chitbots, house rules and "Again?" work as in
// every other stadium game.
import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../../Avatar'
import { toast } from '../../lib/store'
import { callGame } from '../useGame'
import { botChar, botUrl } from '../bots.js'
import { TICK_MS } from './course.js'
import { ranking } from './rules.js'
import { FaceFeed } from './faces.jsx'
import Run, { Star } from './Run.jsx'
import './flyer.css'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmtTime = ticks => { const s = Math.round(ticks * TICK_MS / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function useNow(on, ms = 200) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [on, ms])
  return now
}

function Face({ p, size }) {
  if (p.user_id) return <Avatar id={p.user_id} size={size} full mode="stage" />
  return <span className="avatar fly-botface" style={{ width: size, height: size }}><img src={botUrl(botChar(p.bot, p.seat), false)} alt="" width={size} height={size} draggable="false" /><i>BOT</i></span>
}

export function Stage({ v, game, seats, people, me, nm, act, refresh, buttons, tools, title }) {
  const faces = useRef({})
  const lobby = game.status === 'lobby'
  const startAt = v?.startAt || 0
  const now = useNow(true, 250)
  const [skip, setSkip] = useState(null)
  const gRef = useRef(game)
  gRef.current = game
  const roster = lobby || !v ? people : people.filter(p => v.players.includes(p.pid))

  // Post your landing; the referee may be busy with someone else's (version conflict), so retry quietly.
  const submit = async move => {
    for (let i = 0; i < 6; i++) {
      const g = gRef.current
      if (g.pub?.results?.[me]) return
      if (g.id === 'lab') return act('move', { move })
      const r = await callGame({ action: 'move', gameId: g.id, version: g.version, move }, true)
      if (r) { refresh?.(); return }
      await refresh?.()
      await sleep(400 + Math.random() * 700)
    }
    toast("Couldn't post your flight. Check your connection.")
  }

  // Bots' distances count from the start, but their ghosts are still flying: hold the podium until they land.
  const flyingUntil = useMemo(() => v && !lobby ? Math.max(0, ...Object.values(v.results).map(r => startAt + r.ticks * TICK_MS)) : 0, [v, lobby, startAt])
  const phase = lobby || !v ? 'lineup' : now < startAt ? 'countdown' : game.status === 'done' && (now >= flyingUntil || skip === game.version) ? 'podium' : 'run'

  return (
    <div className="fly">
      {roster.map(p => <FaceFeed key={p.pid} p={p} faces={faces} />)}
      {(phase === 'lineup' || phase === 'countdown') && <LineUp {...{ roster, me, nm, buttons, lobby, title, count: phase === 'countdown' ? Math.ceil((startAt - now) / 1000) : null, whistle: lobby ? game.opts?.whistle : v?.opts.whistle }} />}
      {phase === 'run' && <Run key={startAt} v={v} me={me} people={roster} nm={nm} faces={faces} channelId={game.channel_id} submit={submit} lab={game.id === 'lab'} />}
      {phase === 'run' && game.status === 'done' && <button className="btn fly-skip" onClick={() => setSkip(game.version)}>Results</button>}
      {phase === 'podium' && <Podium v={v} roster={roster} me={me} nm={nm} buttons={buttons} />}
      <div className="fly-tools">{tools}</div>
    </div>
  )
}

function LineUp({ roster, me, nm, buttons, lobby, title, count, whistle }) {
  return (
    <div className="fly-lineup">
      <div className="fly-sky" aria-hidden="true">
        <svg className="fly-bunting" viewBox="0 0 1000 80" preserveAspectRatio="none">
          <path d="M0 10 Q250 60 500 30 T1000 12" stroke="#7a4a32" strokeWidth="2.5" fill="none" />
          {Array.from({ length: 16 }, (_, i) => { const x = 20 + i * 62, y = 10 + 30 * Math.sin((i / 15) * Math.PI) ; return <path key={i} d={`M${x - 11} ${y} L${x + 11} ${y} L${x} ${y + 24}z`} fill={['#f2a07a', '#8fcf8a', '#9fd0ea', '#f2a7c3', '#f6d37a', '#b597e0'][i % 6]} /> })}
        </svg>
        <i className="fly-cloud a" /><i className="fly-cloud b" /><i className="fly-cloud c" />
        <i className="fly-hills" />
      </div>
      <div className="fly-badge">{title}</div>
      <div className="fly-sign">
        <b>{count != null ? (count > 0 ? count : 'Boil!') : 'Perch up, flyers!'}</b>
        <small>{count != null ? 'Hold anywhere to thrust, let go to fall' : `${roster.length} perched · the host boils the kettles`}</small>
      </div>
      <div className="fly-perches">
        {roster.map(p => (
          <div key={p.pid} className={`fly-perch${p.pid === me ? ' me' : ''}`} style={{ '--seat': p.color }}>
            <div className="fly-perch-face"><Face p={p} size={96} /><span className="fly-perch-kettle" /></div>
            <div className="fly-pot" />
            <div className="fly-plate"><b>{nm(p.pid)}{p.pid === me ? ' (you)' : ''}</b><small>{p.bot ? `Chitbot` : count != null ? 'Ready' : 'Perched'}</small></div>
          </div>
        ))}
      </div>
      {count == null && <div className="fly-dock">{buttons(!lobby)}</div>}
      <p className="fly-keys">Hold to thrust (Space, W, mouse or touch){whistle ? ' · E to whistle · talk to fill your whistle' : ''}</p>
    </div>
  )
}

function Podium({ v, roster, me, nm, buttons }) {
  const rk = ranking(v), res = v.results
  const p = pid => roster.find(x => x.pid === pid) || { pid, user_id: pid.startsWith('bot:') ? null : pid, bot: 'normal', seat: 0 }
  const top = [rk[1], rk[0], rk[2]].filter(Boolean)
  const longest = Math.max(...rk.map(x => res[x].ticks || 0))
  const by = (f, pick = Math.max) => { const vals = rk.map(x => f(res[x])).filter(x => x != null); if (!vals.length) return null; const b = pick(...vals); return { who: rk.find(x => f(res[x]) === b), val: b } }
  const magpie = by(r => r.spr || 0), shave = by(r => r.shave ?? null, Math.min), chorus = by(r => r.talk || 0)
  const ribbons = [
    magpie?.val > 0 && { k: 'magpie', name: 'Sprinkle Magpie', who: magpie.who, text: `${nm(magpie.who)} grabbed ${magpie.val} sprinkles` },
    shave && { k: 'shave', name: 'Closest Shave', who: shave.who, text: `${nm(shave.who)} slipped past by ${shave.val} px` },
    chorus?.val > 0 && { k: 'chorus', name: 'Kettle Chorus', who: chorus.who, text: `${nm(chorus.who)} talked for ${chorus.val}% of the flight` },
  ].filter(Boolean)
  const won = rk[0] === me
  return (
    <div className="fly-podium">
      <div className="fly-results-head"><h2>{won ? 'You flew farthest!' : 'What a flight!'}</h2><small>Free Flight · the Long Burrow · {rk.length} {rk.length === 1 ? 'flyer' : 'flyers'} · {fmtTime(longest)} in the air</small></div>
      <div className="fly-cakes">
        {top.map(pid => {
          const place = rk.indexOf(pid) + 1
          return (
            <div key={pid} className={`fly-cake c${place}`}>
              <div className="fly-cake-who"><span className="fly-tag">{nm(pid)} · {res[pid].m.toLocaleString()} m</span><Face p={p(pid)} size={place === 1 ? 120 : 96} />{place === 1 && <i className="fly-medal">1</i>}</div>
              <div className="fly-cake-tier"><span>{place}</span></div>
            </div>
          )
        })}
        <div className="fly-cake-board" />
      </div>
      <div className="fly-side">
        {rk.length > 3 && <><h3>Everyone else</h3>
          <ol className="fly-rest" start={4}>{rk.slice(3).map((pid, i) => <li key={pid}><span className="n">{i + 4}</span><Face p={p(pid)} size={36} /><b>{nm(pid)}</b>{pid.startsWith('bot:') && <i className="fly-bot">BOT</i>}<span className="m">{res[pid].out ? 'flew off' : `${res[pid].m.toLocaleString()} m`}</span></li>)}</ol></>}
        <h3>Ribbons</h3>
        <div className="fly-ribbons">
          {ribbons.map(r => <div key={r.k} className={`fly-ribbon ${r.k}`}><i /><b>{r.name}</b><small>{r.text}</small><span className="fly-ribbon-face"><Face p={p(r.who)} size={40} /></span></div>)}
          <div className="fly-ribbon spr"><Star /><b>Your sprinkles</b><small>{res[me] ? `${res[me].spr} this flight` : 'Watched this one'}</small></div>
        </div>
        <div className="fly-dock end">{buttons(true)}</div>
      </div>
    </div>
  )
}
