// Drawing Duel takes over the whole game screen: lobby, drawing pad, voice booth, the battles, the round recap and
// the podium. GameScreen hands us the lobby buttons, so seats, Chitbots, house rules and "Again?" work as in every
// other stadium game.
import { Fragment, useEffect, useRef, useState } from 'react'
import { toast } from '../../lib/store'
import { callGame } from '../useGame'
import { boutOf, champOf, sidesOf, standings } from './rules.js'
import { audio, audioLocked, upload } from './audio.js'
import { Doodle } from './Doodle.jsx'
import DrawPad from './DrawPad.jsx'
import Booth from './Booth.jsx'
import Arena, { HouseIcon } from './Arena.jsx'
import { Face, champName } from './bits.jsx'
import Icon from '../../icons/Icon'
import './pillow.css'

const sleep = ms => new Promise(r => setTimeout(r, ms))
function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export const Logo = ({ size = 64 }) => (
  <svg className="pcf-logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <rect x="6" y="16" width="52" height="34" rx="14" fill="#fffdf8" stroke="#4a3b32" strokeWidth="3" />
    <path d="M14 26q18 8 36 0" stroke="#f2a7c3" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M10 18l-4-6 M54 18l4-6 M10 48l-4 6 M54 48l4 6" stroke="#4a3b32" strokeWidth="3" strokeLinecap="round" />
    <circle cx="24" cy="36" r="2.4" fill="#4a3b32" /><circle cx="40" cy="36" r="2.4" fill="#4a3b32" /><path d="M28 41q4 3 8 0" stroke="#4a3b32" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
)

function TimerRing({ left, total }) {
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  return (
    <span className={`pcf-timer${left <= 10 ? ' low' : ''}`} aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" className="bg" /><circle cx="20" cy="20" r="16" className="fg" style={{ strokeDashoffset: 100.5 * (1 - f) }} /></svg>
      <b>{left}</b>
    </span>
  )
}

const PHASE = { draw: 'Draw', voice: 'Battle cry', battle: 'Battle', recap: 'Round results', end: 'Podium' }

export function Stage({ v, game, people, me, nm, act, refresh, buttons, tools, title }) {
  const lobby = game.status === 'lobby' || !v
  const now = useNow()
  const gRef = useRef(game)
  gRef.current = game
  const [mine, setMine] = useState(null) // what I drew this round (shown while I wait)
  const [myVote, setMyVote] = useState(undefined)
  const [sending, setSending] = useState(false)
  const lab = game.id === 'lab'
  const roster = pid => people.find(p => p.pid === pid) || (pid && { pid, user_id: pid.startsWith('bot:') ? null : pid, bot: 'normal', seat: +pid.slice(4) || 0 })
  const boutKey = v ? `${v.round}:${v.bi}:${v.phase}` : ''
  useEffect(() => setMyVote(undefined), [boutKey])
  useEffect(() => { if (v?.phase === 'draw') setMine(m => (m?.round === v.round ? m : null)) }, [v?.round, v?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time moves: the referee may be busy with someone else's write, so retry quietly a few times.
  const send = async (move, tries = 4) => {
    if (lab) { await act('move', { move }); return true }
    for (let i = 0; i < tries; i++) {
      const g = gRef.current
      const r = await callGame({ action: 'move', gameId: g.id, version: g.version, move }, i < tries - 1, g.game)
      if (r) { refresh?.(); return true }
      await refresh?.()
      await sleep(250 + Math.random() * 500)
    }
    return false
  }

  if (lobby) return <div className="pcf"><Lobby people={people} me={me} nm={nm} buttons={buttons} title={title} again={game.status === 'done'} /><div className="pcf-tools-slot">{tools}</div></div>

  const isPlayer = v.players.includes(me)
  const left = Math.max(0, Math.ceil(((v.epoch ?? 0) + v.until - now) / 1000))
  const total = Math.round((v.until - v.from) / 1000)
  const myChamp = isPlayer ? v.champs[champOf(v, me)] : null
  const maker = isPlayer && v.makers.includes(me)
  const myBout = maker ? boutOf(v, me) : null
  const done = game.status === 'done' || v.phase === 'end'

  const drawSubmit = async (art, name) => {
    setSending(true)
    setMine({ round: v.round, art, name })
    const ok = await send({ type: 'draw', art, name })
    setSending(false)
    if (!ok) { setMine(null); toast("Couldn't hand in your drawing. Check your connection.") }
  }
  const crySend = async baked => {
    const ok = await upload(game.id, me, v.round, baked)
    if (!ok) { toast("Couldn't upload your battle cry, so your champion will squeak."); return send({ type: 'cry', none: true }) }
    return send({ type: 'cry', ext: baked.ext, ms: baked.ms })
  }
  const vote = side => { setMyVote(side); send({ type: 'vote', side }, 3) }

  let body
  if (done) body = <Podium v={v} me={me} nm={nm} roster={roster} buttons={buttons} />
  else if (v.phase === 'draw' && maker && !v.drawn[me] && !mine) body = <DrawPad key={v.round} prompt={myBout?.prompt} left={left} onSubmit={drawSubmit} sending={sending} />
  else if (v.phase === 'voice' && maker && !myChamp?.cry) body = <Booth key={v.round} champ={myChamp} prompt={myBout?.prompt} left={left} onSend={crySend} onNone={text => send({ type: 'cry', none: true, ...(text?.trim() ? { text: text.trim() } : {}) })} />
  else if (v.phase === 'draw' || v.phase === 'voice') body = <Waiting v={v} me={me} nm={nm} roster={roster} mine={mine} isPlayer={isPlayer} />
  else if (v.phase === 'battle') body = <Arena v={v} gameId={game.id} me={me} roster={roster} nm={nm} vote={vote} myVote={myVote} now={now} />
  else if (v.phase === 'recap') body = <Recap v={v} me={me} nm={nm} roster={roster} left={left} />

  return (
    <div className={`pcf ph-${v.phase}`}>
      <header className="pcf-top">
        <span className="pcf-badge"><Logo size={26} /><b>{title}</b></span>
        <span className="pcf-phase">{done ? 'Final podium' : `Round ${v.round} of ${v.opts.rounds} · ${PHASE[v.phase]}`}</span>
        {!done && v.phase !== 'battle' && <TimerRing left={left} total={total} />}
        {v.phase === 'battle' && audioLocked() && <button className="pcf-sound" onClick={() => audio()} aria-label="Tap for sound"><Icon name="volume" size={16} /> <span>Tap for sound</span></button>}
        <span className="pcf-tools-slot">{tools}</span>
      </header>
      <main className="pcf-body">{body}</main>
    </div>
  )
}

function Lobby({ people, me, nm, buttons, title, again }) {
  return (
    <div className="pcf-lobby">
      <div className="pcf-title"><Logo size={72} /><div><h2>{title}</h2><p>Draw a champion, give it a battle cry, and let the call decide who gets bonked.</p></div></div>
      <ol className="pcf-steps">
        <li><b>Draw</b><small>You and a rival get the same silly title. Draw your champion for it.</small></li>
        <li><b>Voice it</b><small>Record a battle cry and run it through up to three silly filters.</small></li>
        <li><b>Battle</b><small>Everyone else votes live. Winners defend their title next round.</small></li>
      </ol>
      <div className="pcf-roster">
        {people.map(p => <span key={p.pid} className={`pcf-seat${p.pid === me ? ' me' : ''}`}><Face p={p} size={52} /><small>{nm(p.pid)}{p.bot ? ' · bot' : ''}</small></span>)}
      </div>
      <div className="pcf-dock">{buttons(again)}</div>
      {people.length === 2 && !people.some(p => p.bot) && <p className="pcf-hint" role="status">Just the two of you? You battle head to head every round.</p>}
      <p className="pcf-small">2 to 8 players, any number. Odd one out? One bout becomes a three-way brawl, and later an old champion comes back to fight. Chitbots only join if the host adds them. Your battle cry stays with this table and is deleted when it closes.</p>
    </div>
  )
}

function Waiting({ v, me, nm, roster, mine, isPlayer }) {
  const inMakers = v.makers.includes(me)
  const holdKey = b => sidesOf(b).map(s => b[s]).find(k => b[b.back] !== k && v.champs[k].owner === me && v.champs[k].streak > 0)
  const holder = isPlayer && !inMakers ? v.bouts.find(holdKey) : null
  const champ = holder ? v.champs[holdKey(holder)] : inMakers ? v.champs[champOf(v, me)] : null
  const art = champ?.art || (mine?.round === v.round ? mine.art : null)
  const ready = m => (v.phase === 'draw' ? !!v.drawn[m] : !!v.champs[champOf(v, m)]?.cry)
  const head = holder ? 'Your champion is resting' : inMakers ? (v.phase === 'draw' ? 'Drawing is in!' : 'Battle cry is in!') : v.phase === 'draw' ? 'The artists are drawing' : 'Battle cries are being recorded'
  const sub = holder ? `It defends its title next against a new challenger: "${holder.prompt}"` : inMakers ? 'Waiting for the others to finish.' : 'The battles start soon.'
  return (
    <div className="pcf-wait">
      {art && <div className="pcf-wait-card"><Doodle art={art} label={champ?.name || mine?.name || 'Your champion'} /><b>{champ?.name || mine?.name || 'Your champion'}</b>{holder && <span className="pcf-belt"><Icon name="crown" size={14} /> {champ.streak} {champ.streak === 1 ? 'win' : 'wins'}</span>}</div>}
      <h2>{head}</h2>
      <p>{sub}</p>
      <div className="pcf-progress" aria-label="Who is done">
        {v.makers.map(m => <span key={m} className={`pcf-seat${ready(m) ? ' ready' : ''}`}><Face p={roster(m)} size={44} /><small>{nm(m)}</small>{ready(m) && <i className="pcf-tick"><Icon name="check" size={12} /></i>}</span>)}
      </div>
      <div className="pcf-upnext">
        <h3>The bouts this round</h3>
        <ul>{v.bouts.map((b, i) => {
          const who = s => {
            const c = v.champs[b[s]]
            if (b.back === s) return <><Icon name="crown" size={12} /> {champName(c, nm)} <em>is back</em></>
            if (c.streak > 0) return <><Icon name="crown" size={12} /> {champName(c, nm)}</>
            return c.house ? <><HouseIcon /> House</> : nm(c.owner)
          }
          return <li key={i} className={b.c ? 'three' : ''}>{sidesOf(b).map((s, j) => <Fragment key={s}><span>{who(s)}</span>{j < sidesOf(b).length - 1 && <i>vs</i>}</Fragment>)}<small>{b.c ? 'Three-way brawl: ' : ''}{b.prompt}</small></li>
        })}</ul>
      </div>
    </div>
  )
}

function Recap({ v, me, nm, roster, left }) {
  const order = standings(v)
  return (
    <div className="pcf-recap">
      <h2>Round {v.round} is in the books</h2>
      <p>These champions defend their titles in round {v.round + 1}{left ? ` (starts in ${left}s)` : ''}.</p>
      <div className="pcf-holders">
        {v.holders.map(k => { const c = v.champs[k]; return (
          <div key={k} className="pcf-holder"><span className="pcf-holder-art"><Doodle art={c.art} label={champName(c, nm)} /></span><b>{champName(c, nm)}</b>
            <small>{c.house ? 'House champion' : nm(c.owner)} · <Icon name="crown" size={12} /> {c.streak} {c.streak === 1 ? 'win' : 'wins'}</small></div>) })}
      </div>
      <Scores order={order} v={v} me={me} nm={nm} roster={roster} />
    </div>
  )
}

function Scores({ order, v, me, nm, roster, from = 0 }) {
  return (
    <ol className="pcf-scores" start={from + 1}>
      {order.slice(from).map((pid, i) => <li key={pid} className={pid === me ? 'me' : ''}><span className="n">{from + i + 1}</span><Face p={roster(pid)} size={30} /><b>{nm(pid)}</b><span className="pts">{(v.scores[pid] || 0).toLocaleString()}</span></li>)}
    </ol>
  )
}

function Podium({ v, me, nm, roster, buttons }) {
  const order = standings(v)
  const top = [order[1], order[0], order[2]].filter(Boolean)
  const champs = Object.entries(v.champs)
  const bestOf = pid => champs.filter(([, c]) => c.owner === pid && c.art).sort((x, y) => y[1].best - x[1].best || y[1].wins - x[1].wins)[0]?.[1]
  const streak = champs.reduce((b, [, c]) => (c.best > (b?.best || 0) ? c : b), null)
  const fav = v.log.reduce((b, l) => { const n = Math.max(l.va, l.vb, l.vc || 0); return n > (b?.n || 0) ? { n, champ: v.champs[l[l.w]] } : b }, null)
  const winners = order.filter(p => (v.scores[p] || 0) === (v.scores[order[0]] || 0))
  return (
    <div className="pcf-podium">
      <h2>{winners.includes(me) ? 'You are the Pillow Champion!' : `${winners.map(nm).join(' & ')} ${winners.length > 1 ? 'share' : 'takes'} the crown!`}</h2>
      <div className="pcf-pedestals">
        {top.map(pid => {
          const place = order.indexOf(pid) + 1, c = bestOf(pid)
          return (
            <div key={pid} className={`pcf-ped p${place}`}>
              <div className="pcf-ped-who">
                {c ? <span className="pcf-ped-art"><Doodle art={c.art} label={champName(c, nm)} /></span> : null}
                <span className="pcf-ped-face"><Face p={roster(pid)} size={place === 1 ? 56 : 44} />{place === 1 && <i className="pcf-medal"><Icon name="crown" size={14} /></i>}</span>
                <b>{nm(pid)}</b><small>{(v.scores[pid] || 0).toLocaleString()} pts</small>
              </div>
              <div className="pcf-ped-pillow"><span>{place}</span></div>
            </div>
          )
        })}
      </div>
      <div className="pcf-side">
        <div className="pcf-ribbons">
          {streak?.best > 0 && <div className="pcf-ribbon"><i /><b>Longest streak</b><small>{champName(streak, nm)}: {streak.best} {streak.best === 1 ? 'win' : 'wins in a row'}</small></div>}
          {fav && <div className="pcf-ribbon b"><i /><b>Crowd favourite</b><small>{champName(fav.champ, nm)}: {fav.n} {fav.n === 1 ? 'vote' : 'votes'} in one bout</small></div>}
        </div>
        {order.length > 3 && <Scores order={order} v={v} me={me} nm={nm} roster={roster} from={3} />}
        <div className="pcf-dock">{buttons(true)}</div>
      </div>
    </div>
  )
}

