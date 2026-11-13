// Star Party's HUD, matching the Lantern Hollow mockups: cream cards on wooden trays. A plank with whose turn, the round
// lanterns (Last Lanterns glow warm) and the turn timer; player cards with coins, stars and satchel; the star card;
// the Lantern Hollow news ticker; your satchel and moves (roll, items, the fork, the star offer, Marzipan's stall);
// big moments (a star caught, the star drifting, an item used, Last Lanterns); and the bonus-star ceremony at the end.
// Phones: a 4-up ticket strip at the top and everything you can do in one bottom sheet. GameScreen renders this
// instead of its shared top bar, last-move toast and dock.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Avatar from '../../Avatar'
import { botChar, botUrl } from '../bots.js'
import { BONUS, BRIDGE, HOSTS, ITEMS, MINIGAMES, MINI_RESULTS_MS, ROUNDS } from './data.js'
import { dists, lastLanterns, legal, ranking, starPrice, turn } from './rules.js'
import { bonusOf, miniNews, news, spaceName } from './news.js'
import { Ic } from './Ic.jsx'
import MiniStage from './minis/Stage.jsx'
import './hud.css'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const BONUS_ICON = { firefly: 'firefly', wanderer: 'boot', chatterbox: 'mic', glow: 'glow', bramble: 'bramble', spender: 'coin' }
const statText = (id, n) => ({ firefly: `${n} coins`, wanderer: `${n} spaces`, chatterbox: n >= 60000 ? `${Math.round(n / 60000)} min` : `${Math.round(n / 1000)} s`, glow: `${n} Glows`, bramble: `${n} mishaps`, spender: `${n} coins` })[id]

export function Face({ p, size = 32 }) {
  if (!p) return null
  if (p.user_id) return <span className="sc-face" style={{ width: size, height: size }}><Avatar id={p.user_id} size={size} /></span>
  return <span className="sc-face" style={{ width: size, height: size }}><img src={botUrl(botChar(p.bot, p.seat))} alt="" width={size} height={size} draggable="false" /></span>
}

export function Hud({ v, me, nm, act, busy, pending, people, deadline, version, canPlay, tools, seats }) {
  const short = pid => (pid === me ? 'You' : nm(pid))
  const person = pid => people.find(p => p.pid === pid)
  const mv = move => act('move', { move })
  const t = turn({ pub: v })
  const mine = canPlay && t === me && v.phase !== 'mini'
  const off = busy || !!pending
  const ll = lastLanterns(v)

  // What just happened: ticker lines, coin bubbles and a big moment. Everyone watching sees them.
  const prev = useRef(null)
  const [log, setLog] = useState([])
  const [delta, setDelta] = useState(null)
  const [moment, setMoment] = useState(null)
  const seq = useRef(0)
  useEffect(() => {
    const p = prev.current
    prev.current = v
    if (p === v) return
    const id = ++seq.current
    const newMini = p && v.miniResult && (p.miniResult?.round !== v.miniResult.round || p.miniResult?.id !== v.miniResult.id)
    const lines = [...(newMini ? miniNews(v, short) : []), ...(p ? news(v, short, short) : [])]
    if (lines.length) setLog(l => [...l, ...lines.map((x, k) => ({ ...x, id: `${id}-${k}`, pid: v.last?.pid }))].slice(-4))
    if (p) {
      const d = {}
      for (const q of v.players) if (v.coins[q] !== p.coins[q]) d[q] = v.coins[q] - p.coins[q]
      if (Object.keys(d).length) setDelta({ d, id })
      const pickM = k => lines.find(x => x.k === k)
      const m = pickM('star') || pickM('lastLanterns') || pickM('item') || pickM('drift')
      if (m) setMoment({ ...m, id, who: v.last?.pid })
    }
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!moment) return; const k = setTimeout(() => setMoment(null), moment.k === 'star' ? 3400 : 2600); return () => clearTimeout(k) }, [moment])
  useEffect(() => { if (!delta) return; const k = setTimeout(() => setDelta(null), 2600); return () => clearTimeout(k) }, [delta])

  const walking = v.walk ? v.walk.left : null // stopped mid-walk for a choice
  const plank = v.winners ? 'Bonus stars' : v.phase === 'mini' ? MINIGAMES[v.mini.id]?.name || 'Minigame'
    : v.phase === 'star' ? `${t === me ? 'You' : nm(t)} reached ${spaceName(v.star)}`
      : v.phase === 'shop' ? `${t === me ? 'You' : nm(t)} at ${HOSTS.stall}'s stall`
        : v.phase === 'fork' ? (t === me ? 'Which way?' : `${nm(t)} is choosing a path`)
          : t === me ? 'Your turn' : `${nm(t)}'s turn`
  const sub = `Round ${v.round} of ${v.maxRounds}${walking ? ` · ${walking} to go` : ''}${ll && !v.winners ? ' · Last Lanterns' : ''}`

  return (
    <div className={`sc${ll ? ' sc-ll' : ''}`}>
      <div className="sc-title"><Ic n="star" /><b>Star Party</b><small>Lantern Hollow</small></div>
      <div className="sc-plank">
        <div className="sc-who"><b>{plank}</b><small>{sub}</small></div>
        <Lanterns v={v} />
        {deadline && !v.winners && <Timer deadline={deadline} version={version} />}
      </div>
      <div className="sc-tools">{tools}</div>

      <div className="sc-cards" style={{ '--n': v.order.length }}>
        {v.order.map((pid, i) => {
          const d = delta?.d[pid]
          return (
            <div key={pid} className={`sc-card${pid === t && !v.winners ? ' now' : ''}${pid === me ? ' me' : ''}`} style={{ '--c': person(pid)?.color }}>
              <span className="sc-ord">{i + 1}</span>
              <Face p={person(pid)} size={34} />
              <div className="sc-cmid">
                <b className="sc-nm">{short(pid)}</b>
                <span className="sc-nums"><span><Ic n="star" />{v.stars[pid]}</span><span><Ic n="coin" />{v.coins[pid]}</span></span>
              </div>
              <span className="sc-bag" aria-label={`Satchel: ${v.satchel[pid].map(x => ITEMS[x].name).join(', ') || 'empty'}`}>
                {v.satchel[pid].map((x, k) => <Ic key={k} n={x} />)}
              </span>
              {d ? <span key={delta.id} className={`sc-bub ${d < 0 ? 'neg' : 'pos'}`} aria-hidden="true">{d > 0 ? '+' : '-'}{Math.abs(d)}</span> : null}
            </div>
          )
        })}
      </div>

      {!v.winners && <StarCard v={v} me={me} t={t} short={short} />}

      <div className="sc-news sc-tray" aria-hidden="true">
        <div className="sc-in">
          <span className="sc-k">Lantern Hollow news</span>
          {!log.length && <div className="sc-line muted">The lanterns are lit. Roll to begin.</div>}
          {log.slice(-3).map((x, k, all) => (
            <div key={x.id} className={`sc-line${k === all.length - 1 ? ' new' : ''}`}>
              <span className="sc-lic"><Ic n={x.icon} /></span>
              <span className="sc-lt">{x.text}</span>
              {x.amt ? <b className={x.amt < 0 ? 'neg' : 'pos'}>{x.amt > 0 ? '+' : ''}{x.amt}</b> : null}
            </div>
          ))}
        </div>
      </div>

      <StageMount v={v} me={me} nm={nm} act={act} seats={seats} busy={off} />
      {!v.winners && v.phase !== 'mini' && <Dock v={v} me={me} t={t} mine={mine} off={off} mv={mv} short={short} canPlay={canPlay} nm={nm} />}
      {mine && v.phase === 'star' && <StarOffer v={v} me={me} off={off} mv={mv} />}
      {mine && v.phase === 'shop' && <Shop v={v} me={me} off={off} mv={mv} />}

      {moment && <Moment key={moment.id} m={moment} p={person(moment.who)} />}
      {v.winners && <AfterResults v={v}><Ceremony v={v} people={people} short={short} me={me} /></AfterResults>}
    </div>
  )
}

// The minigame Stage (minis/Stage.jsx) covers the whole game screen, for players and spectators alike; it draws itself
// only during a minigame and its results reveal, so it stays mounted all game long.
function StageMount(props) {
  const at = useRef(null), [host, setHost] = useState(null)
  useEffect(() => setHost(at.current?.closest('.gs') || null), [])
  return <span ref={at} hidden>{host && createPortal(<MiniStage {...props} />, host)}</span>
}
// The final round's minigame results show first; the ceremony starts once they've had their moment.
function AfterResults({ v, children }) {
  const left = v.miniResult?.at ? v.miniResult.at + MINI_RESULTS_MS + 4000 - Date.now() : 0
  const [ok, setOk] = useState(left <= 0)
  useEffect(() => { if (ok) return; const k = setTimeout(() => setOk(true), Math.min(left, 15000)); return () => clearTimeout(k) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return ok ? children : null
}

// One lantern per round: lit for rounds played, the current one flickering, Last Lanterns rounds in warm orange.
function Lanterns({ v }) {
  return (
    <div className="sc-lanterns" role="img" aria-label={`Round ${v.round} of ${v.maxRounds}`}>
      {Array.from({ length: v.maxRounds }, (_, i) => {
        const r = i + 1
        return <i key={i} className={`${r < v.round || v.winners ? 'lit' : r === v.round ? 'cur' : ''}${r > v.maxRounds - ROUNDS.lastLanterns ? ' ll' : ''}`} />
      })}
    </div>
  )
}

function Timer({ deadline, version }) {
  const end = Date.parse(deadline)
  const [start, setStart] = useState(Date.now)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { setStart(Date.now()); setNow(Date.now()) }, [deadline, version])
  useEffect(() => { const k = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(k) }, [])
  const left = Math.max(0, end - now), total = Math.max(1000, end - start)
  return <span className={`sc-timer${left < 10000 ? ' low' : ''}`} aria-hidden="true"><i style={{ width: `${Math.min(1, left / total) * 100}%` }} /></span>
}

function StarCard({ v, me, t, short }) {
  const ref = v.players.includes(me) ? me : t
  const d = dists(v.pos[ref])[v.star]
  return (
    <div className="sc-starcard sc-tray">
      <div className="sc-in">
        <Ic n="star" className="sc-big" />
        <div>
          <b>Star at {spaceName(v.star)}</b>
          <small>{starPrice(v)} coins · {d === 0 ? `${ref === me ? "you're" : `${short(ref)} is`} here` : `${d} spaces ahead${ref === me ? '' : ` of ${short(ref)}`}`}</small>
        </div>
      </div>
    </div>
  )
}

// Your satchel and moves. Desktop: a tray in the bottom-right corner. Phones: the bottom sheet.
function Dock({ v, me, t, mine, off, mv, short, canPlay, nm }) {
  const [choose, setChoose] = useState(null) // an item that needs a pick (Paper Boat roll, Snail Shell target)
  useEffect(() => setChoose(null), [v.phase, v.turn, v.used])
  if (!canPlay) return (
    <div className="sc-dock sc-tray watch"><div className="sc-in"><div className="sc-dh"><b>{t ? `${nm(t)}'s turn` : ''}</b><small>Watching from the crowd</small></div></div></div>
  )
  const moves = mine ? legal(v, me) : []
  const bag = v.satchel[me] || []
  const price = starPrice(v), coins = v.coins[me]
  const itemMoves = id => moves.filter(m => m.type === 'item' && m.item === id)
  const useItem = id => {
    const ms = itemMoves(id)
    if (!ms.length) return
    if (ITEMS[id].use === 'pick' || ITEMS[id].use === 'snail') setChoose(choose === id ? null : id)
    else mv(ms[0])
  }
  const head = mine ? (v.phase === 'fork' ? 'Which way?' : `Your turn, ${nm(me)}`) : t ? (v.walk ? `${nm(t)} is walking` : `${nm(t)}'s turn`) : ''
  const roll = moves.find(m => m.type === 'roll')
  return (
    <div className={`sc-dock sc-tray${mine ? ' mine' : ''}`} role="toolbar" aria-label="Your moves">
      <div className="sc-in">
        <div className="sc-grab" aria-hidden="true" />
        <div className="sc-dh">
          <b>{head}</b>
          <small><Ic n="coin" />{coins} coins{coins >= price ? `: enough for the star (${price})` : `: the star costs ${price}`}</small>
        </div>
        {mine && v.phase === 'fork' ? (
          <div className="sc-fork">
            {v.fork.map(to => (
              <button key={to} type="button" className={to === BRIDGE.to ? 'bridge' : ''} disabled={off} onClick={() => mv({ type: 'path', to })}>
                <Ic n={to === BRIDGE.to ? 'bridge' : 'loop'} />
                <b>{to === BRIDGE.to ? BRIDGE.name : 'Stay on the loop'}</b>
                <small>{to === BRIDGE.to ? `${BRIDGE.toll} coins: straight to ${HOSTS.tea}'s Tea House` : 'The long way round the pond'}</small>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="sc-satk"><span>Your satchel</span><span>Use before you roll</span></div>
            <div className="sc-sat">
              {[0, 1, 2].map(k => {
                const id = bag[k]
                if (!id) return <span key={k} className="sc-slot empty">empty</span>
                const usable = !!itemMoves(id).length
                return (
                  <button key={k} type="button" className={`sc-slot${choose === id ? ' on' : ''}`} disabled={off || !usable} onClick={() => useItem(id)}
                    title={`${ITEMS[id].name}: ${ITEMS[id].text}`} aria-label={`Use ${ITEMS[id].name}: ${ITEMS[id].text}`} aria-pressed={choose === id}>
                    <Ic n={id} /><span>{ITEMS[id].name.replace('Big Firefly Jar', 'Big Jar').replace('Firefly Jar', 'Jar')}</span>
                  </button>
                )
              })}
            </div>
            {choose && (
              <div className="sc-choose" role="group" aria-label={ITEMS[choose].use === 'pick' ? 'Pick your roll' : 'Who gets the Snail Shell?'}>
                {itemMoves(choose).map((m, k) => (
                  <button key={k} type="button" disabled={off} onClick={() => { setChoose(null); mv(m) }}>{m.pick ?? short(m.target)}</button>
                ))}
              </div>
            )}
            <button type="button" className="sc-roll" disabled={!roll || off} onClick={() => mv({ type: 'roll' })} aria-keyshortcuts="R">
              <Ic n="die" />{!mine ? (v.walk ? 'Walking…' : 'Waiting') : v.boat ? `Roll a ${v.boat}` : v.diceN > 1 ? `Roll ${v.diceN} dice` : 'Roll'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// Chit offers the star in a jar (mockup 2): coins before and after, catch one (or two in Last Lanterns), or walk on.
function StarOffer({ v, me, off, mv }) {
  const moves = legal(v, me), price = starPrice(v), coins = v.coins[me]
  const two = moves.find(m => m.type === 'star' && m.n === 2)
  return (
    <div className="sc-offer sc-tray" role="dialog" aria-label="Catch the star?">
      <div className="sc-in">
        <span className="sc-jar"><Ic n="star" /></span>
        <div className="sc-otext">
          <span className="sc-k">{HOSTS.star}: a wish just drifted down</span>
          <h3>Catch the star?</h3>
          <p>Once it's caught, the star drifts off to another Wishing Post somewhere else in the hollow.</p>
          <div className="sc-math"><Ic n="coin" />{coins}<Ic n="arrow" className="sc-arr" /><b>{coins - price}</b><em>price {price}</em><em>you'd have {v.stars[me] + 1} {v.stars[me] ? 'stars' : 'star'}</em></div>
        </div>
        <div className="sc-obtn">
          <button type="button" className="go" disabled={off || !moves.some(m => m.type === 'star' && m.n === 1)} onClick={() => mv({ type: 'star', n: 1 })}><Ic n="star" />Catch it</button>
          {two && <button type="button" className="go two" disabled={off} onClick={() => mv(two)}><Ic n="star" />Catch two</button>}
          <button type="button" disabled={off} onClick={() => mv({ type: 'pass' })}>Keep walking</button>
        </div>
      </div>
    </div>
  )
}

// Marzipan's Lantern Stall: today's stock as little cards.
function Shop({ v, me, off, mv }) {
  const moves = legal(v, me)
  return (
    <div className="sc-shop sc-tray" role="dialog" aria-label={`${HOSTS.stall}'s stall`}>
      <div className="sc-in">
        <span className="sc-ribbon">{HOSTS.stall}'s Lantern Stall</span>
        <div className="sc-stock">
          {v.shop.stock.map(id => {
            const ok = moves.some(m => m.type === 'buy' && m.item === id)
            return (
              <button key={id} type="button" className="sc-ware" disabled={off || !ok} onClick={() => mv({ type: 'buy', item: id })} aria-label={`Buy ${ITEMS[id].name} for ${ITEMS[id].price} coins: ${ITEMS[id].text}`}>
                <Ic n={id} className="sc-big" /><b>{ITEMS[id].name}</b><small>{ITEMS[id].text}</small><span className="sc-price"><Ic n="coin" />{ITEMS[id].price}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="sc-leave" disabled={off} onClick={() => mv({ type: 'leave' })}>Leave the stall</button>
      </div>
    </div>
  )
}

// A big moment in the middle of the screen: a star caught, the star drifting, an item used, Last Lanterns.
function Moment({ m, p }) {
  return (
    <div className={`sc-moment k-${m.k}`} aria-hidden="true">
      {m.k === 'star' && <div className="sc-rays" />}
      <div className="sc-mcard">
        <span className="sc-mic">{m.k === 'star' && p ? <Face p={p} size={52} /> : null}<Ic n={m.icon} /></span>
        <b>{m.k === 'star' ? m.text.replace(/ from .*/, '!') : m.k === 'lastLanterns' ? 'Last Lanterns!' : m.text}</b>
        {m.k === 'lastLanterns' && <small>Glow and Drizzle count double, two stars at once, and a hand for whoever's last.</small>}
      </div>
    </div>
  )
}

// The end: three bonus-star cards flip one at a time on the festival stage, then the podium rises.
function Ceremony({ v, people, short }) {
  const person = pid => people.find(p => p.pid === pid)
  const rk = ranking(v), podium = [rk[1], rk[0], rk[2]].filter(Boolean)
  const awards = v.awards || []
  const host = botChar('normal', 0)
  return (
    <div className="sc-cer" role="region" aria-label="Bonus stars and the final standings">
      <div className="sc-fw" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="sc-cerhead"><b>Bonus Stars</b><small>The last lantern is lit · {awards.length ? `${awards.length === 1 ? 'one wish' : `${['', '', 'two', 'three'][awards.length] || awards.length} wishes`} for the road` : 'no bonus stars tonight'}</small></div>
      <div className="sc-awards">
        {awards.map((a, i) => {
          const b = bonusOf(a.id) || BONUS[0]
          return (
            <div key={a.id} className="sc-award" style={{ '--i': i }}>
              <div className="sc-flip">
                <div className="sc-aback"><Ic n="star" /></div>
                <div className="sc-afront">
                  <span className="sc-amed"><Ic n={BONUS_ICON[a.id] || 'star'} /></span>
                  <b>{b.name}</b><small>{b.text}</small>
                  <div className="sc-awin">
                    {a.to.length ? a.to.map(p => <span key={p}><Face p={person(p)} size={22} />{short(p)}</span>) : <span>Nobody this time</span>}
                    {a.to.length > 0 && <em>{statText(a.id, a.value)}</em>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="sc-stage">
        <div className="sc-host"><img src={botUrl(host, true)} alt="" width="64" height="64" /><span className="sc-say"><small>{HOSTS.star}</small>And the brightest wish of the night goes to… {v.winners.map(short).join(' & ')}!</span></div>
        <div className="sc-podium">
          {podium.map(pid => {
            const place = rk.indexOf(pid) + 1
            return (
              <div key={pid} className={`sc-step p${place}`} style={{ '--c': person(pid)?.color }}>
                <Face p={person(pid)} size={place === 1 ? 64 : 52} />
                <div className="sc-block"><big>{place}</big><b>{short(pid)}</b><span><Ic n="star" />{v.stars[pid]} <Ic n="coin" />{v.coins[pid]}</span></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
