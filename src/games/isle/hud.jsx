// Chitter Cove's HUD, in the Teacup Town "Tea Tray" style (it reuses that HUD's tt-* trays, plank, signs and dock):
// whose turn + timer on the plank, everyone's points and baskets on hanging signs, your basket above a round-button dock
// (Roll / Build / Trade / Cards / End turn), the build menu, trade builder, offer, put-back and steal pickers, a move log
// in the bottom-right corner, and resource chips flying from tiles to baskets. Taps on the island go through pick.js.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../icons/Icon'
import { BONUS, CARDS, COST, KINDS, OFFERS, RES, RES_NAME, bankLeft, basketLimit, has, left, legal, missing, raccoonSpots, rate, score, total, turn, victims } from './rules.js'
import { bagText, flights, gained, resColor, ticks } from './moments.js'
import { screen, setPick } from './pick.js'
import { SYMBOLS } from './icons.js'
import '../property/hud.css'
import './hud.css'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
  const [help, setHelp] = useState(false) // the "?" how-to-play card
  const root = useRef(null), signs = useRef({}), chips = useRef({})
  const toggle = p => setPanel(panel === p ? null : p)

  useEffect(() => { setSteal(null); if (!myTurn || !(ph === 'main' || v.free > 0)) setBuilding(null) }, [ph, v.turn, v.free, myTurn])
  useEffect(() => { if (ph !== 'main') setPanel(p => (p === 'build' ? null : p)) }, [ph])

  // What the island waits for you to tap right now.
  const tap = useMemo(() => {
    if (!mine) return null
    if (ph === 'place') { const kind = v.place.at == null ? 'cottage' : 'path'; return { kind, spots: legal(v, me, kind) } }
    if (ph === 'raccoon') { const spots = raccoonSpots(v, me); return steal == null ? { kind: 'raccoon', spots, who: Object.fromEntries(spots.map(t => [t, victims(v, me, t).length])) } : null }
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
      <button type="button" className={`ci-help-btn${help ? ' on' : ''}`} onClick={() => setHelp(h => !h)} aria-expanded={help} aria-label="How to play" title="How to play">?</button>
      {help && <Help v={v} me={me} mine={mine} close={() => setHelp(false)} />}

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
      {ph === 'discard' && mine && <Discard key={v.discard[me]} n={v.discard[me]} res={v.res[me]} limit={basketLimit(v)} off={off} send={give => mv({ type: 'discard', give })} />}
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
              <span>{tap.spots.length ? PLACE_HINT[tap.kind] : 'Nowhere to put that right now'}{v.free > 0 && tap.kind === 'path' ? ` · ${v.free} free` : ''}{tap.kind === 'raccoon' && v.opts?.friendly ? ' (it leaves anyone under 3 points alone)' : ''}</span>
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

function Discard({ n, res, off, send, limit }) {
  const [give, setGive] = useState({})
  const sum = total(give)
  return (
    <div className="tt-trade tt-tray ci-discard" role="dialog" aria-label="Put some back">
      <div className="tt-in">
        <h4><I n="raccoon" />The raccoon is about! Put back {n}</h4>
        <p className="tt-hint">More than {limit} in your basket: half goes back to the bank. Tap + on what to give up.</p>
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
            <div className="ci-hrow"><small>Get</small>{RES.map(k => <button key={k} type="button" className={`ci-pickres${hw === k ? ' on' : ''}`} disabled={k === hg || bankLeft(v, k) <= 0} onClick={() => setHw(k)} aria-label={`Get one ${RES_NAME[k]} (bank has ${bankLeft(v, k)})`} title={`Bank has ${bankLeft(v, k)}`}><I n={k} /><span>{bankLeft(v, k)} left</span></button>)}</div>
            <div className="tt-yn"><button type="button" className="y" disabled={!canSend || !hg || !hw || hg === hw || res[hg] < rate(v, me, hg) || bankLeft(v, hw) <= 0}
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
                {k === 'picnic' && !why && <div className="ci-hrow">{RES.map(r => <button key={r} type="button" className={`ci-pickres${two.includes(r) ? ' on' : ''}`} disabled={bankLeft(v, r) <= (two.length >= 2 ? 0 : two.filter(x => x === r).length)} onClick={() => setTwo(t => (t.length >= 2 ? [r] : [...t, r]))} aria-label={`Take ${RES_NAME[r]}`}><I n={r} />{two.filter(x => x === r).length > 1 ? '×2' : ''}</button>)}</div>}
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

// The "?" card: what to do right now, then the whole game on one card (tiles, costs, the 7, trading, points).
const KIND_ICON = { woods: 'twig', meadow: 'wool', clay: 'clay', berry: 'berry', tea: 'tea', pond: 'leaf' }
function Help({ v, me, mine, close }) {
  useEffect(() => { const k = e => e.key === 'Escape' && close(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [close])
  const ph = v.phase
  const now = !mine ? "Watch the island: when it's your turn, the moves you can make light up on the dock."
    : ph === 'place' ? 'Pick a corner touching good numbers (6 and 8 come up most) and a mix of tiles. Then lay a path from it.'
      : ph === 'roll' ? 'Roll the dice. You can play a Helping Paw first if the raccoon is on your tile.'
        : ph === 'main' ? 'Build, trade or play a cozy card, then end your turn. Grey buttons say why when you hover them.'
          : ph === 'discard' ? 'Pick which resources go back to the bank.'
            : ph === 'raccoon' ? 'Tap a tile for the raccoon. It blocks that tile and takes one resource from a neighbour there.'
              : ph === 'trade' ? 'Someone sent a trade: Deal, No thanks or Counter.' : ''
  return (
    <div className="tt-trade tt-tray ci-helpp" role="dialog" aria-label="How to play">
      <div className="tt-in">
        <div className="tt-atop"><h4><I n="leaf" className="tt-sage" />How to play</h4><button type="button" className="tt-x" onClick={close} aria-label="Close how to play"><Icon name="close" size={18} /></button></div>
        {now && <p className="ci-now"><b>Right now:</b> {now}</p>}
        <h5>Goal</h5>
        <p>First to <b>{v.target} points</b>. Cottage 1 · Lodge 2 · {BONUS.path.name} (longest path, 5+) 2 · {BONUS.help.name} (most Helping Paws, 3+) 2 · each Keepsake card 1.</p>
        <h5>Tiles</h5>
        <div className="ci-key">{Object.entries(KINDS).map(([k, d]) => <span key={k}><i style={{ background: d.color }}><I n={KIND_ICON[k]} /></i>{d.name}{d.res ? <> → {RES_NAME[d.res]}</> : ' (nothing)'}</span>)}</div>
        <p>Each roll, every tile with that number gives its resource to each home on its corners (a lodge gets two). The bank holds 19 of each: if it can't pay everyone, nobody gets that one.</p>
        <h5>Building</h5>
        <div className="ci-costs">{[['path', 'Path'], ['cottage', 'Cottage'], ['lodge', 'Lodge'], ['card', 'Cozy card']].map(([k, l]) => <span key={k}><b>{l}</b><Bag b={COST[k]} /></span>)}</div>
        <p>Cottages need a free corner on both sides and go at the end of your paths. A lodge replaces one of your cottages.</p>
        <h5>A 7</h5>
        <p>Anyone holding more than {basketLimit(v)} puts back half. Then the roller moves the raccoon{v.opts?.friendly ? ' (not next to anyone under 3 points)' : ''} and takes one resource from someone next to it.</p>
        <h5>Trading</h5>
        <p>After rolling, offer any swap to a friend, or trade 4 of a kind with the harbour for 1. A dock by your home makes it 3 for 1 (3:1 signs) or 2 for 1 of its resource.</p>
      </div>
    </div>
  )
}
