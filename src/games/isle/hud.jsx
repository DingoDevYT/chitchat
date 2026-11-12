// Chitter Cove's HUD, in the Teacup Town "Tea Tray" style (it reuses that HUD's tt-* trays, plank, signs and dock):
// whose turn + timer on the plank, everyone's points and baskets on hanging signs, your basket above a round-button dock
// (Roll / Build / Trade / Cards / End turn), the build menu, trade builder, offer, put-back and steal pickers, a move log
// in the bottom-right corner, and resource chips flying from tiles to baskets. Taps on the island go through pick.js.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../icons/Icon'
import { BONUS, CARDS, COST, OFFERS, RES, RES_NAME, TILES, has, left, legal, missing, rate, score, total, turn, victims } from './rules.js'
import { bagText, flights, gained, resColor, ticks } from './moments.js'
import { screen, setPick } from './pick.js'
import '../property/hud.css'
import './hud.css'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const SYMBOLS = {
  twig: '<path d="M3 21 19 5" stroke="#8a5a34" stroke-width="3.2" stroke-linecap="round"/><path d="M10 14l6 1.5M7.5 16.5 6.5 10" stroke="#8a5a34" stroke-width="2.2" stroke-linecap="round"/><path d="M18 6c1-3 4-3.5 4-3.5s.5 3.5-2.5 4.5c-1.2.4-1.8-.2-1.5-1z" fill="#6fb06a"/>',
  wool: '<g fill="#fbf6ea" stroke="#b8ad94" stroke-width="1.6"><circle cx="8" cy="13" r="5"/><circle cx="16" cy="13" r="5"/><circle cx="12" cy="9" r="5"/><circle cx="12" cy="15.5" r="4.5"/></g><path d="M9 11.5c1.5-1 4.5-1 6 0" stroke="#d8cdb4" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  clay: '<rect x="3" y="12" width="9" height="6" rx="1.6" fill="#c8693f"/><rect x="12.5" y="12" width="9" height="6" rx="1.6" fill="#b85a33"/><rect x="7.5" y="5.5" width="9" height="6" rx="1.6" fill="#d9804f"/><path d="M5 14.5h4M14.5 14.5h4M9.5 8h4" stroke="#f3b48c" stroke-width="1.2" stroke-linecap="round"/>',
  berry: '<circle cx="8" cy="15" r="4.2" fill="#a54a82"/><circle cx="15.5" cy="15.5" r="4.2" fill="#8f3c70"/><circle cx="12" cy="9.5" r="4.2" fill="#b65a93"/><circle cx="10.5" cy="8.3" r="1.1" fill="#fff" opacity=".7"/><path d="M12 5.5c1-2.5 4-3 5-2.5-1 2-3 2.8-5 2.5z" fill="#6fb06a"/>',
  tea: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#5f9a4f"/><path d="M5 19 15 9M9 15l-.5-3.5M12 12l3 .5" stroke="#cfe8b8" stroke-width="1.5" stroke-linecap="round"/>',
  house: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="10" y="14" width="4" height="7" rx="1" fill="#fff" opacity=".8"/>',
  lodge: '<path d="M2 10 12 2.5 22 10v10.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="16" y="3.5" width="3" height="5" fill="currentColor"/><rect x="5" y="11" width="3.2" height="3.2" rx=".6" fill="#fff" opacity=".8"/><rect x="15.8" y="11" width="3.2" height="3.2" rx=".6" fill="#fff" opacity=".8"/><rect x="10.3" y="14" width="3.4" height="7.5" rx="1" fill="#fff" opacity=".8"/>',
  path: '<rect x="2" y="9" width="20" height="6" rx="2" fill="currentColor" transform="rotate(-25 12 12)"/><path d="M7 14.5 6 9.5M12 12.2l-1-5M17 10l-1-5" stroke="#fff" stroke-width="1.3" opacity=".6" transform="rotate(-5 12 12)"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><g fill="#fff"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="16" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="8" cy="16" r="1.7"/></g>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cards: '<rect x="3" y="6" width="11" height="15" rx="2.5" fill="currentColor" opacity=".55" transform="rotate(-10 8 13)"/><rect x="9" y="4" width="11" height="15" rx="2.5" fill="currentColor"/><path d="M14.5 8.5c1.2-1.4 3.4 0 1.8 1.8L14.5 12l-1.8-1.7c-1.6-1.8.6-3.2 1.8-1.8z" fill="#fff" opacity=".8"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z" fill="currentColor"/>',
  star: '<path d="M12 2l2.6 6.6L21 9.3l-5 4.5 1.5 7L12 17.3 6.5 20.8 8 13.8 3 9.3l6.4-.7z" fill="currentColor"/>',
  check: '<path d="M5 12.5 10 17 19 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  leaf: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="currentColor"/>',
  basket: '<path d="M3 10h18l-2 10a1.5 1.5 0 0 1-1.5 1.2h-11A1.5 1.5 0 0 1 5 20z" fill="currentColor"/><path d="M7 10l3-6M17 10l-3-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 13v5M12 13v5M16 13v5" stroke="#fff" stroke-width="1.4" opacity=".55"/>',
  anchor: '<circle cx="12" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V21M7 11h10M4 14c0 4 4 7 8 7s8-3 8-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  raccoon: '<path d="M4 4l4 4M20 4l-4 4" stroke="#6b6f7a" stroke-width="3" stroke-linecap="round"/><ellipse cx="12" cy="13" rx="9" ry="7.5" fill="#9aa0aa"/><path d="M3.5 12c2-2.5 5.5-2.5 8.5 0 3-2.5 6.5-2.5 8.5 0-1.5 2.5-5.5 3-8.5 1-3 2-7 1.5-8.5-1z" fill="#3a3a44"/><circle cx="8.3" cy="12.2" r="1.3" fill="#fff"/><circle cx="15.7" cy="12.2" r="1.3" fill="#fff"/><ellipse cx="12" cy="17" rx="2" ry="1.4" fill="#3a3a44"/>',
}
const Sprite = () => <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: Object.entries(SYMBOLS).map(([k, d]) => `<symbol id="ci-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('') }} />
export const I = ({ n, className = '' }) => <svg className={`tt-i ${className}`} aria-hidden="true" focusable="false"><use href={`#ci-${n}`} /></svg>

// A row of resource chips: { twig: 2, … } (zero counts left out).
const Bag = ({ b, need }) => {
  const e = Object.entries(b || {}).filter(([, n]) => n)
  if (!e.length) return <span className="ci-none">nothing</span>
  return <span className="ci-bag">{e.map(([k, n]) => <span key={k} className={`ci-chip${need && (need[k] || 0) < n ? ' short' : ''}`} title={RES_NAME[k]}><I n={k} />{n}</span>)}</span>
}

const PLACE_HINT = {
  cottage: 'Tap a glowing corner for your cottage',
  path: 'Tap a glowing side for your path',
  lodge: 'Tap one of your cottages to grow it into a lodge',
  raccoon: 'Tap a tile to move the raccoon there',
}

export function Hud({ v, me, nm, act, busy, pending, people, turnPid, deadline, version, canPlay, tools }) {
  const short = pid => (pid === me ? 'You' : nm(pid))
  const mv = move => act('move', { move })
  const t = turn({ pub: v })
  const mine = canPlay && t === me
  const off = busy || !!pending
  const ph = v.phase
  const myTurn = canPlay && v.players[v.turn] === me && ph !== 'place'
  const [panel, setPanel] = useState(null) // 'build' | 'trade' | 'cards'
  const [building, setBuilding] = useState(null) // 'path' | 'cottage' | 'lodge' while you choose a spot
  const [steal, setSteal] = useState(null) // the raccoon's new tile, when more than one neighbour lives there
  const [draft, setDraft] = useState(null) // a counter-offer waiting in the trade builder
  const root = useRef(null), signs = useRef({}), chips = useRef({})
  const toggle = p => setPanel(panel === p ? null : p)

  useEffect(() => { setSteal(null); if (!myTurn || !(ph === 'main' || v.free > 0)) setBuilding(null) }, [ph, v.turn, v.free, myTurn])
  useEffect(() => { if (ph !== 'main') setPanel(p => (p === 'build' ? null : p)) }, [ph])

  // What the island waits for you to tap right now.
  const tap = useMemo(() => {
    if (!mine) return null
    if (ph === 'place') { const kind = v.place.at == null ? 'cottage' : 'path'; return { kind, spots: legal(v, me, kind) } }
    if (ph === 'raccoon') return steal == null ? { kind: 'raccoon', spots: TILES.map((_, i) => i).filter(i => i !== v.raccoon) } : null
    const k = building || (v.free > 0 && (ph === 'main' || ph === 'roll') ? 'path' : null)
    if (k && (ph === 'main' || k === 'path')) return { kind: k, spots: legal(v, me, k) }
    return null
  }, [v, mine, building, steal, me, ph])
  const pickRef = useRef(null)
  pickRef.current = id => {
    if (!tap || off) return
    if (tap.kind === 'raccoon') {
      const vs = victims(v, me, id)
      if (vs.length > 1) setSteal(id)
      else mv({ type: 'raccoon', tile: id, from: vs[0] })
    } else if (ph === 'place') mv(tap.kind === 'cottage' ? { type: 'cottage', v: id } : { type: 'path', e: id })
    else {
      mv(tap.kind === 'path' ? { type: 'build', kind: 'path', e: id } : { type: 'build', kind: tap.kind, v: id })
      if (!(tap.kind === 'path' && v.free > 1)) setBuilding(null)
    }
  }
  const tapKey = tap && !off ? `${tap.kind}:${tap.spots.join(',')}` : ''
  useEffect(() => { setPick(tapKey ? { ...tap, onPick: id => pickRef.current(id) } : null) }, [tapKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setPick(null), [])

  // What changed since the last view: log lines, flying chips, +n bubbles. Everyone watching sees them.
  const prev = useRef(v)
  const [log, setLog] = useState([])
  const [fly, setFly] = useState(null)
  const seq = useRef(0)
  useEffect(() => {
    const p = prev.current
    prev.current = v
    if (!p || p === v || JSON.stringify(p) === JSON.stringify(v)) return
    const id = ++seq.current
    const lines = ticks(p, v, short).map((x, k) => ({ ...x, id: `${id}-${k}` }))
    if (lines.length) setLog(l => [...l, ...lines].slice(-4))
    const f = flights(p, v), g = gained(p, v)
    if (f.length || Object.keys(g).length) setFly({ id, list: f, g })
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!fly) return; const k = setTimeout(() => setFly(null), 2800); return () => clearTimeout(k) }, [fly])

  const plank = v.winner ? `${short(v.winner)} ${v.winner === me ? 'win' : 'wins'}!`
    : ph === 'place' ? (mine ? (v.place.at == null ? 'Place a cottage' : 'Now a path') : `${short(t)} is settling in`)
      : ph === 'discard' ? (mine ? `Put back ${v.discard[me]}` : `${short(t)} is putting back`)
        : ph === 'raccoon' ? (mine ? 'Move the raccoon' : `${short(t)} moves the raccoon`)
          : ph === 'trade' ? (mine ? 'Your call' : `${short(t)} is deciding`)
            : t === me ? 'Your turn' : `${short(t)}'s turn`
  const canBuildNow = myTurn && ph === 'main'

  return (
    <div className="tt ci" ref={root}>
      <Sprite />
      <div className="tt-gtitle"><I n="leaf" />Chitter Cove</div>
      <div className="tt-plank">
        <div className="tt-who"><b>{plank}</b><small>{ph === 'place' ? 'Settling in' : `Round ${v.round}`} · first to {v.target}</small></div>
        {!v.winner && v.rolls > 0 && <span className="ci-dice" aria-label={`Last roll ${v.dice[0]} and ${v.dice[1]}`}><b>{v.dice[0]}</b><b>{v.dice[1]}</b></span>}
        {deadline && !v.winner && <Steep deadline={deadline} version={version} />}
      </div>
      <div className="tt-tools">{tools}</div>

      <div className="tt-signs" style={{ '--n': people.length }}>
        {people.map(p => {
          const r = v.res[p.pid] || {}, d = fly?.g?.[p.pid]
          return (
            <div key={p.pid} ref={el => { signs.current[p.pid] = el }} style={{ '--c': p.color }} className={`tt-sign ci-sign${p.pid === turnPid ? ' now' : ''}`}
              title={`${p.pid === me ? 'You' : nm(p.pid)}: ${RES.map(k => `${RES_NAME[k]} ${r[k] || 0}`).join(', ')}`}>
              <span className="tt-av">{short(p.pid)[0]}</span>
              <div>
                <b><span className="tt-long">{p.pid === me ? 'You' : nm(p.pid)}</span><span className="tt-short">{short(p.pid)}</span></b>
                <span className="tt-amt ci-amt">
                  <span className="ci-pts"><I n="star" />{score(v, p.pid)}{v.reveal?.[p.pid] ? `+${v.reveal[p.pid]}` : ''}</span>
                  <span className="ci-mini"><I n="basket" />{total(r)}</span>
                  <span className="ci-mini"><I n="cards" />{v.cards[p.pid] || 0}</span>
                  {v.bonus.path === p.pid && <span className="ci-badge" title={BONUS.path.name}><I n="path" /></span>}
                  {v.bonus.help === p.pid && <span className="ci-badge" title={BONUS.help.name}><I n="raccoon" /></span>}
                </span>
              </div>
              {d ? <span key={fly.id} className={`tt-bub ${d < 0 ? 'neg' : 'pos'}`} aria-hidden="true">{d > 0 ? '+' : '-'}{Math.abs(d)}</span> : null}
            </div>
          )
        })}
      </div>

      {fly?.list.length > 0 && <Flights key={'f' + fly.id} list={fly.list} signs={signs} chips={chips} root={root} me={me} />}

      <div className="tt-ticker ci-log" aria-hidden="true">
        {log.map((x, k) => (
          <div key={x.id} className={`tt-tk${k === log.length - 1 ? ' new' : ''}`} style={{ '--c': x.c, '--age': log.length - 1 - k }}>
            <span className="tt-em"><I n={x.icon} /></span><span className="ci-tktext">{x.text}</span>
          </div>
        ))}
      </div>

      {ph === 'trade' && canPlay && v.offer.to === me && (
        <Offer v={v} me={me} short={short} off={off} mv={mv} counter={() => {
          const o = v.offer
          mv({ type: 'decline' })
          setDraft({ with: o.from, give: o.get, get: o.give, at: Date.now() })
          setPanel('trade')
        }} />
      )}
      {ph === 'discard' && mine && <Discard key={v.discard[me]} n={v.discard[me]} res={v.res[me]} off={off} send={give => mv({ type: 'discard', give })} />}
      {steal != null && mine && ph === 'raccoon' && (
        <div className="tt-offer tt-tray ci-steal" role="dialog" aria-label="Take from whom">
          <div className="tt-in">
            <h4><I n="raccoon" />Take one from…</h4>
            <div className="tt-with">{victims(v, me, steal).map(p => <button key={p} type="button" disabled={off} onClick={() => mv({ type: 'raccoon', tile: steal, from: p })}>{nm(p)} <small>({total(v.res[p])})</small></button>)}</div>
            <p className="tt-hint"><button type="button" className="ci-link" onClick={() => setSteal(null)}>Pick another tile</button></p>
          </div>
        </div>
      )}
      {panel === 'build' && canPlay && <BuildMenu v={v} me={me} off={off || !canBuildNow} close={() => setPanel(null)}
        choose={k => { setBuilding(k); setPanel(null) }} buy={() => mv({ type: 'buy' })} />}
      {panel === 'trade' && canPlay && (
        <TradeBuilder key={draft?.at || 'new'} v={v} me={me} nm={nm} short={short} init={draft} canSend={canBuildNow && !off}
          close={() => { setPanel(null); setDraft(null) }} send={m => { if (m.type === 'offer') { setPanel(null); setDraft(null) } mv(m) }} />
      )}
      {panel === 'cards' && canPlay && <CardsPanel v={v} me={me} nm={nm} off={off} can={myTurn && t === me && (ph === 'roll' || ph === 'main')} mv={m => { setPanel(null); mv(m) }} close={() => setPanel(null)} />}

      {canPlay && (
        <div className="ci-bottom">
          {tap && !off && (
            <div className="ci-hint" role="status">
              <I n={tap.kind === 'raccoon' ? 'raccoon' : tap.kind === 'path' ? 'path' : tap.kind === 'lodge' ? 'lodge' : 'house'} />
              <span>{tap.spots.length ? PLACE_HINT[tap.kind] : 'Nowhere to put that right now'}{v.free > 0 && tap.kind === 'path' ? ` · ${v.free} free` : ''}</span>
              {building && <button type="button" onClick={() => setBuilding(null)}>Cancel</button>}
            </div>
          )}
          <div className="ci-basket" aria-label="Your basket">
            {RES.map(k => <span key={k} ref={el => { chips.current[k] = el }} className="ci-res" title={RES_NAME[k]}><I n={k} /><b>{v.res[me]?.[k] ?? 0}</b></span>)}
          </div>
          <div className="tt-dock ci-dock" role="toolbar" aria-label="Your moves">
            <Bb icon="dice" label="Roll" on={mine && ph === 'roll'} off={off} pri onClick={() => mv({ type: 'roll' })} kbd="R" />
            <Bb icon="house" label="Build" on={canBuildNow || panel === 'build'} go={panel === 'build' || !!building} pressed={panel === 'build'} onClick={() => { setBuilding(null); toggle('build') }} />
            <Bb icon="swap" label="Trade" on={canBuildNow || panel === 'trade' || !!draft} go={panel === 'trade'} pressed={panel === 'trade'} onClick={() => toggle('trade')} />
            <Bb icon="cards" label={`Cards${v.cards[me] ? ` · ${v.cards[me]}` : ''}`} aria="Cozy cards" on go={panel === 'cards'} pressed={panel === 'cards'} onClick={() => toggle('cards')} />
            <Bb icon="moon" label="End turn" on={mine && ph === 'main'} off={off} pri onClick={() => mv({ type: 'end' })} kbd="E" />
          </div>
        </div>
      )}
    </div>
  )
}

function Bb({ icon, label, on, off, pri, go, pressed, onClick, kbd, aria }) {
  return (
    <button type="button" className={`tt-bb${pri && on && !off ? ' pri' : ''}${go ? ' go' : ''}`} disabled={!on || off} onClick={onClick}
      aria-pressed={pressed} aria-keyshortcuts={kbd} aria-label={aria}>
      <span className="tt-ci"><I n={icon} /></span>{label}
    </button>
  )
}

function Steep({ deadline, version }) {
  const end = Date.parse(deadline)
  const [start, setStart] = useState(Date.now)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { setStart(Date.now()); setNow(Date.now()) }, [deadline, version])
  useEffect(() => { const k = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(k) }, [])
  const left = Math.max(0, end - now), tot = Math.max(1000, end - start), s = Math.ceil(left / 1000)
  return (
    <div className={`tt-steep${s <= 10 ? ' low' : ''}`} aria-hidden="true">
      <span style={{ width: `calc(${Math.min(1, left / tot) * 100}% - 6px)` }} />
      <b><I n="leaf" />{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>
    </div>
  )
}

// Resource chips arcing from a tile (or a basket) to a basket. Your own land on your basket strip.
function Flights({ list, signs, chips, root, me }) {
  const [items, setItems] = useState([])
  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect()
    if (!r || reduced()) return
    const rectAt = el => { const b = el?.getBoundingClientRect(); return b ? [b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top] : null }
    const to = (pid, res) => (pid === me && chips.current[res] ? rectAt(chips.current[res]) : rectAt(signs.current[pid]))
    setItems(list.map((f, i) => {
      const a = f.from.tile != null ? screen.tile?.(f.from.tile) || [r.width / 2, r.height / 2] : rectAt(signs.current[f.from.pid])
      const b = to(f.to, f.res)
      if (!a || !b) return null
      const lift = Math.min(160, Math.abs(b[0] - a[0]) * 0.3 + 60)
      return { i, res: f.res, d: `M${a[0].toFixed(0)} ${a[1].toFixed(0)} C ${a[0].toFixed(0)} ${(a[1] - lift).toFixed(0)}, ${b[0].toFixed(0)} ${(b[1] - lift).toFixed(0)}, ${b[0].toFixed(0)} ${b[1].toFixed(0)}` }
    }).filter(Boolean))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null
  return (
    <div className="tt-coins ci-fly" aria-hidden="true">
      <svg>{items.map(x => <path key={x.i} d={x.d} />)}</svg>
      {items.map(x => <span key={x.i} className="tt-fly" style={{ offsetPath: `path('${x.d}')`, animationDelay: `${x.i * 0.08}s`, '--rc': resColor(x.res) }}><I n={x.res} /></span>)}
    </div>
  )
}

function Offer({ v, me, short, off, mv, counter }) {
  const o = v.offer, can = has(v.res[me], o.get)
  return (
    <div className="tt-offer tt-tray" role="region" aria-label="Trade offer">
      <div className="tt-in">
        <h4><I n="swap" className="tt-sage" />{short(o.from)} offers a trade</h4>
        <div className="tt-env">
          <div className="tt-side"><small>You give</small><Bag b={o.get} need={v.res[me]} /></div>
          <div className="tt-side"><small>You get</small><Bag b={o.give} /></div>
        </div>
        <div className="tt-yn">
          <button type="button" className="y" disabled={off || !can} title={can ? undefined : "You don't have all of that"} onClick={() => mv({ type: 'accept' })}><I n="check" />Deal</button>
          <button type="button" className="n" disabled={off} onClick={() => mv({ type: 'decline' })}>No thanks</button>
          <button type="button" className="c" disabled={off} onClick={counter} title="Turn this down and start your own offer back">Counter</button>
        </div>
      </div>
    </div>
  )
}

// +/- steppers for each resource (max = how many there are), used to put back on a 7 and to build offers.
function Steppers({ max, val, set, label }) {
  return (
    <div className="ci-steps">
      {RES.map(k => (
        <div key={k} className={`ci-step${val[k] ? ' on' : ''}`}>
          <I n={k} />
          <button type="button" disabled={!val[k]} onClick={() => set({ ...val, [k]: val[k] - 1 })} aria-label={`${label} one fewer ${RES_NAME[k]}`}>-</button>
          <b>{val[k] || 0}<small>/{max[k] ?? 0}</small></b>
          <button type="button" disabled={(val[k] || 0) >= (max[k] ?? 0)} onClick={() => set({ ...val, [k]: (val[k] || 0) + 1 })} aria-label={`${label} one more ${RES_NAME[k]}`}>+</button>
        </div>
      ))}
    </div>
  )
}

function Discard({ n, res, off, send }) {
  const [give, setGive] = useState({})
  const sum = total(give)
  return (
    <div className="tt-trade tt-tray ci-discard" role="dialog" aria-label="Put some back">
      <div className="tt-in">
        <h4><I n="raccoon" />The raccoon is about! Put back {n}</h4>
        <p className="tt-hint">More than 7 in your basket: half goes back to the bank.</p>
        <Steppers max={res} val={give} set={setGive} label="Put back" />
        <div className="tt-yn"><button type="button" className="y" disabled={off || sum !== n} onClick={() => send(give)}><I n="check" />Put back {sum}/{n}</button></div>
      </div>
    </div>
  )
}

const BUILDS = [
  { k: 'path', name: 'Path', sub: 'Joins your homes', icon: 'path' },
  { k: 'cottage', name: 'Cottage', sub: '1 point', icon: 'house' },
  { k: 'lodge', name: 'Lodge', sub: '2 points · grows from a cottage', icon: 'lodge' },
  { k: 'card', name: 'Cozy card', sub: 'A secret surprise', icon: 'cards' },
]
function BuildMenu({ v, me, off, choose, buy, close }) {
  const l = left(v, me), res = v.res[me]
  return (
    <div className="tt-trade tt-tray ci-build" role="dialog" aria-label="Build">
      <div className="tt-in">
        <div className="tt-atop"><h4><I n="house" className="tt-sage" />Build</h4><button type="button" className="tt-x" onClick={close} aria-label="Close build menu"><Icon name="close" size={18} /></button></div>
        {BUILDS.map(b => {
          const lack = missing(res, COST[b.k])
          const spots = b.k === 'card' ? null : legal(v, me, b.k)
          const why = Object.keys(lack).length ? `Need ${bagText(lack)}`
            : b.k === 'card' ? (v.deck > 0 ? null : 'The pile is empty')
              : l[b.k] <= 0 ? `All your ${b.k === 'lodge' ? 'lodges' : b.k + 's'} are out`
                : !spots.length ? (b.k === 'cottage' ? 'No free corner at the end of your paths' : b.k === 'lodge' ? 'Build a cottage first' : 'Nowhere to join a path') : null
          return (
            <div key={b.k} className="ci-brow">
              <span className="ci-bic"><I n={b.icon} /></span>
              <div className="ci-bname"><b>{b.name}</b><small>{b.sub}{b.k === 'card' ? ` · ${v.deck} left` : ` · ${l[b.k]} left`}</small></div>
              <Bag b={COST[b.k]} need={res} />
              <button type="button" className="ci-go" disabled={off || !!why} title={why || undefined} onClick={() => (b.k === 'card' ? buy() : choose(b.k))}>{b.k === 'card' ? 'Buy' : 'Place'}</button>
              {why && <small className="tt-why">{why}</small>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TradeBuilder({ v, me, nm, short, init, canSend, close, send }) {
  const others = v.players.filter(p => p !== me)
  const [w, setW] = useState(init?.with && others.includes(init.with) ? init.with : 'harbour')
  const [give, setGive] = useState(init?.give || {})
  const [get, setGet] = useState(init?.get || {})
  const [hg, setHg] = useState(null), [hw, setHw] = useState(null) // harbour: give / want
  const res = v.res[me]
  return (
    <div className="tt-trade tt-tray ci-tradep" role="dialog" aria-label="Trade">
      <div className="tt-in">
        <div className="tt-atop"><h4><I n="swap" className="tt-sage" />Trade</h4><button type="button" className="tt-x" onClick={close} aria-label="Close trade"><Icon name="close" size={18} /></button></div>
        <div className="tt-with" role="radiogroup" aria-label="Trade with">
          <button type="button" role="radio" aria-checked={w === 'harbour'} className={w === 'harbour' ? 'on' : ''} onClick={() => setW('harbour')}><I n="anchor" /> Harbour</button>
          {others.map(p => <button key={p} type="button" role="radio" aria-checked={w === p} className={w === p ? 'on' : ''} onClick={() => { setW(p); setGet({}) }}>{nm(p)}</button>)}
        </div>
        {w === 'harbour' ? (
          <>
            <p className="tt-hint ci-left">Give the harbour 4 of one kind for 1 of another. A dock by your home does better.</p>
            <div className="ci-hrow"><small>Give</small>{RES.map(k => { const n = rate(v, me, k); return <button key={k} type="button" className={`ci-pickres${hg === k ? ' on' : ''}`} disabled={res[k] < n} onClick={() => setHg(k)} aria-label={`Give ${n} ${RES_NAME[k]}`}><I n={k} /><span>{n}:1</span></button> })}</div>
            <div className="ci-hrow"><small>Get</small>{RES.map(k => <button key={k} type="button" className={`ci-pickres${hw === k ? ' on' : ''}`} disabled={k === hg} onClick={() => setHw(k)} aria-label={`Get one ${RES_NAME[k]}`}><I n={k} /></button>)}</div>
            <div className="tt-yn"><button type="button" className="y" disabled={!canSend || !hg || !hw || hg === hw || res[hg] < rate(v, me, hg)}
              onClick={() => send({ type: 'bank', give: hg, get: hw })}><I n="anchor" />{hg && hw && hg !== hw ? `Trade ${rate(v, me, hg)} for 1` : 'Pick both'}</button></div>
          </>
        ) : (
          <>
            <div className="ci-two">
              <div><small className="ci-lbl">You give</small><Steppers max={res} val={give} set={setGive} label="Give" /></div>
              <div><small className="ci-lbl">You get from {short(w)}</small><Steppers max={v.res[w]} val={get} set={setGet} label="Get" /></div>
            </div>
            <div className="tt-yn"><button type="button" className="y" disabled={!canSend || !total(give) || !total(get) || !has(res, give) || v.offers >= OFFERS}
              onClick={() => send({ type: 'offer', to: w, give, get })}><I n="check" />Send offer</button></div>
            <p className="tt-hint">{!canSend ? (init ? 'Your counter-offer is ready. Send it on your turn, after you roll.' : 'You can trade on your turn, after you roll.') : `${OFFERS - v.offers} offer${OFFERS - v.offers === 1 ? '' : 's'} left this turn`}</p>
          </>
        )}
      </div>
    </div>
  )
}

const CARD_ICON = { paw: 'raccoon', picnic: 'basket', paths: 'path', gossip: 'tea', keep: 'star' }
function CardsPanel({ v, me, nm, off, can, mv, close }) {
  const hand = v.me?.hand || []
  const kinds = Object.keys(CARDS).filter(k => hand.some(c => c.k === k))
  const [two, setTwo] = useState([])
  const [one, setOne] = useState(null)
  return (
    <div className="tt-trade tt-tray ci-cards" role="dialog" aria-label="Cozy cards">
      <div className="tt-in">
        <div className="tt-atop"><h4><I n="cards" className="tt-honey" />Cozy cards</h4><span className="tt-sum">{v.deck} in the pile</span><button type="button" className="tt-x" onClick={close} aria-label="Close cards"><Icon name="close" size={18} /></button></div>
        {!kinds.length && <p className="tt-empty">No cozy cards yet. Buy one from the Build menu: a wool, a berry and a tea leaf.</p>}
        <div className="ci-hand">
          {kinds.map(k => {
            const n = hand.filter(c => c.k === k).length, ready = hand.some(c => c.k === k && c.at < v.turns)
            const why = k === 'keep' ? 'Counts when you win' : !can ? 'On your turn' : v.played ? 'One card a turn' : !ready ? 'Ready next turn' : null
            const extra = k === 'picnic' ? two.length === 2 : k === 'gossip' ? !!one : true
            return (
              <div key={k} className={`ci-card k-${k}`}>
                <span className="ci-cic"><I n={CARD_ICON[k]} /></span>
                <b>{CARDS[k].name}{n > 1 ? ` ×${n}` : ''}</b>
                <p>{CARDS[k].text}</p>
                {k === 'picnic' && !why && <div className="ci-hrow">{RES.map(r => <button key={r} type="button" className={`ci-pickres${two.includes(r) ? ' on' : ''}`} onClick={() => setTwo(t => (t.length >= 2 ? [r] : [...t, r]))} aria-label={`Take ${RES_NAME[r]}`}><I n={r} />{two.filter(x => x === r).length > 1 ? '×2' : ''}</button>)}</div>}
                {k === 'gossip' && !why && <div className="ci-hrow">{RES.map(r => <button key={r} type="button" className={`ci-pickres${one === r ? ' on' : ''}`} onClick={() => setOne(r)} aria-label={`Ask for ${RES_NAME[r]}`}><I n={r} /></button>)}</div>}
                {k !== 'keep' && <button type="button" className="ci-go" disabled={off || !!why || !extra}
                  onClick={() => mv(k === 'picnic' ? { type: 'play', card: k, res: two } : k === 'gossip' ? { type: 'play', card: k, res: one } : { type: 'play', card: k })}>Play</button>}
                {why && <small className="tt-why">{why}</small>}
              </div>
            )
          })}
        </div>
        <div className="ci-bonus">
          <span><I n="path" /><b>{BONUS.path.name}</b> {v.bonus.path ? (v.bonus.path === me ? 'You' : nm(v.bonus.path)) : 'nobody yet'} · your longest path {v.long[me] || 0}/{BONUS.path.min}</span>
          <span><I n="raccoon" /><b>{BONUS.help.name}</b> {v.bonus.help ? (v.bonus.help === me ? 'You' : nm(v.bonus.help)) : 'nobody yet'} · paws played {v.helped[me] || 0}/{BONUS.help.min}</span>
        </div>
      </div>
    </div>
  )
}
