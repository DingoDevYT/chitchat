// Teacup Town's own HUD ("Tea Tray & Postcards"): a wooden plank with whose turn and a steeping-tea timer, players' coins
// as hanging price signs, a ticker of recent moves, a round-button tray dock, postcard deeds, the auction and trade panels,
// the card-draw moment and coin moments. GameScreen renders this instead of its shared top bar / toast / dock.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../../icons/Icon'
import { ask } from '../../Dialog'
import { BAIL, BOARD, DECKS, GROUPS, buildWhy, canMortgage, canSell, canUnmortgage, fullGroup, groupOf, houseCost, housesLeft, mortgageValue, turn, unmortgageCost, worth } from './rules.js'
import { drawn, money, spColor, ticks } from './moments.js'
import './hud.css'

const fmt = n => n.toLocaleString()
const name = sp => BOARD[sp].name
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Small filled icons, drawn once as a sprite (the app's Icon set is line art; these match the mockup's chunky look).
const SYMBOLS = {
  coin: '<circle cx="12" cy="12" r="10" fill="#f6c445" stroke="#c98d1f" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#fff3c4" stroke-width="1.8"/><path d="M10 9c1-1.4 4-1.4 4 .5S10 11 10 13c0 2 3 2 4 .6" fill="none" stroke="#c98d1f" stroke-width="1.6" stroke-linecap="round"/>',
  cup: '<path d="M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" fill="currentColor"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 3.5c-1 1 1 2 0 3.5M12 3.5c-1 1 1 2 0 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="3" y="20" width="16" height="1.8" rx=".9" fill="currentColor"/>',
  leaf: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="currentColor"/><path d="M5 19 15 9" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>',
  house: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="10" y="14" width="4" height="7" rx="1" fill="#fff" opacity=".8"/>',
  inn: '<path d="M2 10 12 3l10 7v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="5" y="12" width="3" height="3" rx=".6" fill="#fff" opacity=".8"/><rect x="16" y="12" width="3" height="3" rx=".6" fill="#fff" opacity=".8"/><rect x="10.5" y="14" width="3" height="7" rx="1" fill="#fff" opacity=".8"/>',
  tram: '<rect x="4" y="5" width="16" height="13" rx="4" fill="currentColor"/><rect x="6.5" y="7.5" width="4.5" height="4" rx="1" fill="#fff"/><rect x="13" y="7.5" width="4.5" height="4" rx="1" fill="#fff"/><circle cx="8" cy="20" r="1.8" fill="currentColor"/><circle cx="16" cy="20" r="1.8" fill="currentColor"/><path d="M9 5 12 1.5 15 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  lantern: '<path d="M9 3h6M12 3v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="5" width="12" height="15" rx="5" fill="currentColor"/><ellipse cx="12" cy="12.5" rx="2.5" ry="3.5" fill="#fff3b0"/><rect x="8" y="20" width="8" height="2" rx="1" fill="currentColor"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><g fill="#fff"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="16" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="8" cy="16" r="1.7"/></g>',
  bag: '<path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" fill="currentColor"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 13.5 11 15.5 15 11.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  gavel: '<rect x="7" y="3" width="10" height="6" rx="2" transform="rotate(-35 12 6)" fill="currentColor"/><path d="M12.5 9.5 19 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="3" y="19" width="10" height="2.5" rx="1.2" fill="currentColor"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z" fill="currentColor"/>',
  cards: '<rect x="3" y="6" width="11" height="15" rx="2.5" fill="currentColor" opacity=".55" transform="rotate(-10 8 13)"/><rect x="9" y="4" width="11" height="15" rx="2.5" fill="currentColor"/><rect x="9" y="4" width="11" height="4" rx="2" fill="#fff" opacity=".5"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="M12 2l2.6 6.6L21 9.3l-5 4.5 1.5 7L12 17.3 6.5 20.8 8 13.8 3 9.3l6.4-.7z" fill="currentColor"/>',
  flag: '<path d="M5 3v19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h12l-3 4 3 4H6z" fill="currentColor"/>',
  tax: '<rect x="4" y="3" width="16" height="18" rx="3" fill="currentColor"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  check: '<path d="M5 12.5 10 17 19 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  cookie: '<path d="M2 15C2 8 7 4 12 4s10 4 10 11c0 1.5-1 2.5-2.5 2.5h-15C3 17.5 2 16.5 2 15z" fill="#e9b45a"/><path d="M11.5 17c1.5-3 1.5-8-.8-12" stroke="#c98a2e" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M5 13c2-1 3.5 0 5.5 2.5M15 7c2.5 1 4.5 3.5 4.5 7" stroke="#f6d38d" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
}
const Sprite = () => <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: Object.entries(SYMBOLS).map(([k, d]) => `<symbol id="tt-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('') }} />
const I = ({ n, className = '' }) => <svg className={`tt-i ${className}`} aria-hidden="true" focusable="false"><use href={`#tt-${n}`} /></svg>
const Coin = () => <I n="coin" className="tt-coin" />

const tradable = (v, pid) => BOARD.map((_, i) => i).filter(i => v.owner[i] === pid && !(BOARD[i].k === 'prop' && groupOf(BOARD[i].g).some(j => v.cottages[j])))

export function Hud({ v, me, nm, act, busy, pending, people, turnPid, deadline, version, canPlay, tools }) {
  const short = pid => (pid === me ? 'You' : nm(pid).replace(/^Chitbot \((\w+)\)$/, '$1'))
  const [panel, setPanel] = useState(null) // 'streets' | 'trade'
  const [draft, setDraft] = useState(null) // a counter-offer waiting in the trade builder
  const root = useRef(null), signs = useRef({})
  const mv = move => act('move', { move })
  const t = turn({ pub: v })
  const mine = canPlay && t === me
  const off = busy || !!pending
  const debt = mine && v.cash[me] < 0 && ['roll', 'buy', 'end'].includes(v.phase) // must raise it before rolling or ending

  // What changed since the last view: ticker lines, coin moment, drawn card. Everyone watching sees them.
  const prev = useRef(v)
  const [log, setLog] = useState([])
  const [cash, setCash] = useState(null)
  const [card, setCard] = useState(null)
  const seq = useRef(0)
  useEffect(() => {
    const p = prev.current
    prev.current = v
    if (!p || p === v || JSON.stringify(p) === JSON.stringify(v)) return
    const id = ++seq.current
    const lines = ticks(p, v, short).map((x, k) => ({ ...x, id: `${id}-${k}` }))
    if (lines.length) setLog(l => [...l, ...lines].slice(-3))
    const c = drawn(p, v)
    if (c) setCard({ ...c, id, who: short(c.pid) })
    const m = money(p, v, nm)
    if (m) setCash({ ...m, id, receipt: c ? null : m.receipt }) // the card itself says what it did
  }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!card) return; const k = setTimeout(() => setCard(null), reduced() ? 3000 : 4600); return () => clearTimeout(k) }, [card])
  useEffect(() => { if (!cash) return; const k = setTimeout(() => setCash(null), 2800); return () => clearTimeout(k) }, [cash])
  useEffect(() => { if (v.phase === 'buy' || v.phase === 'auction') setPanel(p => (p === 'trade' ? null : p)) }, [v.phase])

  const ph = v.phase, here = BOARD[v.pos[me]]
  const napping = mine && ph === 'roll' && v.napping[me]
  const held = Object.values(v.held).includes(me)
  const canOffer = mine && (ph === 'roll' || ph === 'end') && v.offers < 3
  const toggle = p => setPanel(panel === p ? null : p)
  const plank = v.winner ? `${short(v.winner)} ${v.winner === me ? 'win' : 'wins'}!`
    : ph === 'auction' ? (t === me ? 'Your bid' : `${short(t)} bidding`)
      : ph === 'trade' ? (t === me ? 'Your call' : `${short(t)} deciding`)
        : t === me ? 'Your turn' : `${short(t)}'s turn`

  return (
    <div className={`tt${panel === 'streets' ? ' tt-album-open' : ''}`} ref={root}>
      <Sprite />
      <div className="tt-gtitle"><I n="cup" />Chatterton</div>
      <div className="tt-plank">
        <div className="tt-who"><b>{plank}</b><small>Round {v.round}{v.maxRounds ? `/${v.maxRounds}` : ''}</small></div>
        {deadline && !v.winner && <Steep deadline={deadline} version={version} />}
      </div>
      <div className="tt-tools">{tools}</div>

      <div className="tt-signs" style={{ '--n': people.length }}>
        {people.map(p => {
          const d = cash?.d[p.pid]
          return (
            <div key={p.pid} ref={el => { signs.current[p.pid] = el }} style={{ '--c': p.color }}
              className={`tt-sign${p.pid === turnPid ? ' now' : ''}${d < 0 ? ' pay' : ''}${v.broke[p.pid] ? ' broke' : ''}`}>
              <span className="tt-av">{short(p.pid)[0]}</span>
              <div>
                <b><span className="tt-long">{p.pid === me ? 'You' : nm(p.pid)}</span><span className="tt-short">{short(p.pid)}</span></b>
                <span className={`tt-amt${d < 0 ? ' neg' : d > 0 ? ' pos' : ''}${v.cash[p.pid] < 0 ? ' owe' : ''}`}>
                  {v.broke[p.pid] ? 'Out of coins' : <><Coin />{fmt(v.cash[p.pid])}</>}
                  {v.napping[p.pid] && <I n="moon" className="tt-nap" />}
                </span>
              </div>
              {d ? <span key={cash.id} className={`tt-bub ${d < 0 ? 'neg' : 'pos'}`} aria-hidden="true">{d > 0 ? '+' : '-'}{fmt(Math.abs(d))}</span> : null}
            </div>
          )
        })}
      </div>

      {cash && <Coins key={'coins' + cash.id} d={cash.d} signs={signs} root={root} />}
      {cash?.receipt && (
        <div key={'receipt' + cash.id} className="tt-receipt tt-tray" aria-hidden="true">
          <div className="tt-in"><span className="tt-sw" style={{ background: cash.receipt.c }}><I n={cash.receipt.icon} /></span><div><b>{cash.receipt.title}</b><p>{cash.receipt.sub}</p></div></div>
        </div>
      )}

      <div className="tt-ticker" aria-hidden="true">
        {log.map((x, k) => (
          <div key={x.id} className={`tt-tk${k === log.length - 1 ? ' new' : ''}`} style={{ '--c': x.c, '--age': log.length - 1 - k }}>
            <span className="tt-em"><I n={x.icon} /></span>{x.text}{x.amt ? <b className={x.amt < 0 ? 'neg' : 'pos'}>{x.amt > 0 ? '+' : ''}{fmt(x.amt)}</b> : null}
          </div>
        ))}
      </div>

      {ph === 'auction' && <Auction v={v} me={me} nm={nm} mine={mine} off={off} mv={mv} people={people} />}
      {ph === 'trade' && canPlay && v.offer.to === me && (
        <Offer v={v} short={short} off={off} mv={mv} counter={() => {
          const o = v.offer
          mv({ type: 'decline' })
          setDraft({ to: o.from, give: o.get, get: o.give, cash: -o.cash, at: Date.now() })
          setPanel('trade')
        }} />
      )}
      {panel === 'streets' && <Album v={v} me={me} mv={mv} off={off || !(mine && ['roll', 'buy', 'end'].includes(ph))} close={() => setPanel(null)} />}
      {panel === 'trade' && canPlay && (
        <TradeBuilder key={draft?.at || 'new'} v={v} me={me} nm={nm} short={short} init={draft} canSend={canOffer && !off}
          close={() => { setPanel(null); setDraft(null) }} send={m => { setPanel(null); setDraft(null); mv(m) }} />
      )}

      {canPlay && (
        <div className="tt-dock" role="toolbar" aria-label="Your moves">
          {debt && <div className="tt-owe" role="status">You owe <b>{fmt(-v.cash[me])}</b>. Sell, mortgage or trade to pay it before your turn ends.</div>}
          {debt && <Bb icon="flag" label="Bankrupt" on off={off} onClick={async () => { if (await ask({ text: 'Declare bankruptcy? Everything you own goes to whoever you owe, and you are out of the game.', confirm: 'Go bankrupt', danger: true })) mv({ type: 'bankrupt' }) }} aria="Declare bankruptcy" />}
          <Bb icon="dice" label={v.napping[me] && ph === 'roll' ? 'Roll doubles' : 'Roll'} on={mine && ph === 'roll' && !debt} off={off} pri onClick={() => mv({ type: 'roll' })} kbd="R" />
          {napping && <Bb icon="moon" label={`Wake · ${BAIL}`} on={v.cash[me] >= BAIL} off={off} onClick={() => mv({ type: 'bail' })} aria={`Pay ${BAIL} to wake up`} />}
          {napping && held && <Bb icon="star" label="Blanket" on off={off} onClick={() => mv({ type: 'blanket' })} aria="Use your blanket card to wake up" />}
          <Bb icon="bag" label={mine && ph === 'buy' ? `Buy · ${fmt(here.price)}` : 'Buy'} on={mine && ph === 'buy' && v.cash[me] >= here.price} off={off} pri onClick={() => mv({ type: 'buy' })}
            aria={mine && ph === 'buy' ? `Buy ${here.name} for ${fmt(here.price)}` : 'Buy'} />
          {mine && ph === 'buy'
            ? v.opts?.noAuction
              ? <Bb icon="moon" label="Leave it" on off={off} onClick={() => mv({ type: 'pass' })} aria={`Don't buy ${here.name}`} />
              : <Bb icon="gavel" label="Auction" on off={off} onClick={() => mv({ type: 'pass' })} aria={`Put ${here.name} up for auction`} />
            : <Bb icon="moon" label={v.again && mine && ph === 'end' ? 'Roll again' : 'End turn'} on={mine && ph === 'end' && !debt} off={off} pri onClick={() => mv({ type: 'end' })} kbd="E" />}
          <Bb icon="cards" label={<><span className="tt-long">My streets</span><span className="tt-short">Streets</span></>} aria="My streets" on go={panel === 'streets'} pressed={panel === 'streets'} onClick={() => toggle('streets')} />
          <Bb icon="swap" label="Trade" on={canOffer || panel === 'trade'} go={panel === 'trade'} pressed={panel === 'trade'} onClick={() => { setDraft(null); toggle('trade') }} />
        </div>
      )}

      {card && <DrawnCard key={'card' + card.id} card={card} />}
    </div>
  )
}

// A dock button: a round bubble with a label. `on` = applicable now (else greyed), the main action hops.
function Bb({ icon, label, on, off, pri, go, pressed, onClick, kbd, aria }) {
  return (
    <button type="button" className={`tt-bb${pri && on && !off ? ' pri' : ''}${go ? ' go' : ''}`} disabled={!on || off} onClick={onClick}
      aria-pressed={pressed} aria-keyshortcuts={kbd} aria-label={aria}>
      <span className="tt-ci"><I n={icon} /></span>{label}
    </button>
  )
}

// The steeping-tea timer: a striped bar that drains, with m:ss (red near zero).
function Steep({ deadline, version }) {
  const end = Date.parse(deadline)
  const [start, setStart] = useState(Date.now)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { setStart(Date.now()); setNow(Date.now()) }, [deadline, version])
  useEffect(() => { const k = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(k) }, [])
  const left = Math.max(0, end - now), total = Math.max(1000, end - start), s = Math.ceil(left / 1000)
  return (
    <div className={`tt-steep${s <= 10 ? ' low' : ''}`} aria-hidden="true">
      <span style={{ width: `calc(${Math.min(1, left / total) * 100}% - 6px)` }} />
      <b><I n="leaf" />{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</b>
    </div>
  )
}

// Coins arc from each payer's sign to each payee's (or to / from the bank in the middle of the table).
function Coins({ d, signs, root }) {
  const [paths, setPaths] = useState([])
  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect()
    if (!r || reduced()) return
    const at = pid => {
      const b = signs.current[pid]?.getBoundingClientRect()
      return b ? [b.left + b.width / 2 - r.left, b.bottom - r.top] : null
    }
    const bank = [r.width / 2, r.height * 0.55]
    const from = Object.keys(d).filter(p => d[p] < 0).map(at).filter(Boolean)
    const to = Object.keys(d).filter(p => d[p] > 0).map(at).filter(Boolean)
    const pairs = from.length && to.length ? from.flatMap(a => to.map(b => [a, b])) : from.length ? from.map(a => [a, bank]) : to.map(b => [bank, b])
    setPaths(pairs.slice(0, 6).map(([[x1, y1], [x2, y2]]) => {
      const dip = Math.min(220, Math.abs(x2 - x1) * 0.35 + 40)
      return `M${x1.toFixed(0)} ${y1.toFixed(0)} C ${x1.toFixed(0)} ${(y1 + dip).toFixed(0)}, ${x2.toFixed(0)} ${(y2 + dip).toFixed(0)}, ${x2.toFixed(0)} ${y2.toFixed(0)}`
    }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!paths.length) return null
  return (
    <div className="tt-coins" aria-hidden="true">
      <svg>{paths.map((p, i) => <path key={i} d={p} />)}</svg>
      {paths.flatMap((p, i) => [0, 1, 2, 3, 4].map(k => <span key={`${i}-${k}`} className="tt-fly" style={{ offsetPath: `path('${p}')`, animationDelay: `${k * 0.1}s` }}><Coin /></span>))}
    </div>
  )
}

// The card lifts off its deck along an arc, flips over, holds so it can be read, then tucks away again.
function DrawnCard({ card }) {
  const cookie = card.deck === 'cookie'
  return (
    <div className={`tt-draw ${cookie ? 'cookie' : 'party'}`} aria-hidden="true">
      <div className="tt-dim" />
      <div className="tt-tp"><div className="tt-flip">
        <div className="tt-bk">{cookie ? <I n="cookie" /> : <I n="cup" />}</div>
        <div className="tt-face">
          <span className="tt-k">{DECKS[card.deck].name}</span>
          {cookie
            ? <div className="tt-cookie"><I n="cookie" className="l" /><I n="cookie" className="r" />{[0, 1, 2, 3].map(i => <i key={i} className="tt-crumb" style={{ '--i': i }} />)}</div>
            : <div className="tt-cupart">{[0, 1, 2].map(i => <i key={i} className="tt-steam" style={{ left: 42 + i * 16, animationDelay: `${i * 0.5}s` }} />)}<I n="cup" /></div>}
          <p>{card.text}</p>
          <span className="tt-who-drew">{card.who === 'You' ? 'You drew this' : `${card.who} drew this`}</span>
          {card.fx && <span className={`tt-fx${card.fx.startsWith('-') ? ' neg' : ''}`}><Coin />{card.fx}</span>}
        </div>
      </div>
      {!cookie && ['#e0707a', '#f7c45a', '#a9c79a', '#9ccbe0', '#f7c45a', '#e0707a'].map((c, i) => <i key={i} className="tt-conf" style={{ background: c, '--x': `${[-220, 230, -250, 240, -120, 140][i]}px`, '--y': `${[-160, -150, 60, 90, -240, -250][i]}px` }} />)}
      </div>
    </div>
  )
}

// A small postcard header for panels: the street's colour band and name.
const Mini = ({ sp }) => (
  <div className="tt-deedwrap tt-mini"><div className="tt-deed" style={{ '--g': spColor(sp) }}>
    <div className="tt-dh"><b className="tt-dn">{name(sp)}</b></div>
    <div className="tt-dp"><span>Price</span><b>{fmt(BOARD[sp].price)}</b></div>
  </div></div>
)

function Auction({ v, me, nm, mine, off, mv, people }) {
  const a = v.auction, cash = v.cash[me]
  const live = people.filter(p => !v.broke[p.pid])
  const bid = k => mv({ type: 'bid', amount: a.bid + k })
  return (
    <div className="tt-auc tt-tray" role="region" aria-label={`Auction for ${name(a.sp)}`}>
      <div className="tt-in">
        <span className="tt-ribbon">{a.high ? 'Going, going...' : 'Up for auction'}</span>
        <h3>{name(a.sp)}</h3>
        <div className="tt-pc2">
          <Mini sp={a.sp} />
          <div className="tt-bidbox"><small>Top bid</small><big><Coin />{a.high ? fmt(a.bid) : '0'}</big><div className="tt-by">{a.high ? (a.high === me ? 'You' : nm(a.high)) : 'No bids yet'}</div></div>
        </div>
        <div className="tt-chips">
          {[1, 10, 50].map(k => (
            <button key={k} type="button" className={`tt-ch${k === 10 ? ' big' : ''}`} disabled={!mine || off || a.bid + k > cash} onClick={() => bid(k)} aria-label={`Bid ${fmt(a.bid + k)}`}>+{k}</button>
          ))}
          <button type="button" className="tt-ch pass" disabled={!mine || off} onClick={() => mv({ type: 'fold' })} aria-label="Pass: drop out of the auction">Pass</button>
        </div>
        <div className="tt-tickdots" role="img" aria-label={`${a.in.length} of ${live.length} still bidding`}>
          {live.map(p => <i key={p.pid} className={a.in.includes(p.pid) ? '' : 'off'} style={{ '--c': p.color }} />)}
        </div>
      </div>
    </div>
  )
}

const Items = ({ v, sps, coins }) => (
  <>
    {sps.map(sp => <div key={sp} className="tt-st" style={{ '--g': spColor(sp) }}>{name(sp)}{v.mortgaged[sp] ? <em> napping</em> : null}</div>)}
    {coins > 0 && <div className="tt-st" style={{ '--g': '#f7c45a' }}><Coin />{fmt(coins)}</div>}
    {!sps.length && !(coins > 0) && <div className="tt-st none">Nothing</div>}
  </>
)

function Offer({ v, short, off, mv, counter }) {
  const o = v.offer
  return (
    <div className="tt-offer tt-tray" role="region" aria-label="Trade offer">
      <div className="tt-in">
        <h4><I n="swap" className="tt-sage" />{short(o.from)} sent you a trade</h4>
        <div className="tt-env">
          <div className="tt-side"><small>You give</small><Items v={v} sps={o.get} coins={-o.cash} /></div>
          <div className="tt-side"><small>You get</small><Items v={v} sps={o.give} coins={o.cash} /></div>
        </div>
        <div className="tt-yn">
          <button type="button" className="y" disabled={off} onClick={() => mv({ type: 'accept' })}><I n="check" />Deal</button>
          <button type="button" className="n" disabled={off} onClick={() => mv({ type: 'decline' })}>No thanks</button>
          <button type="button" className="c" disabled={off} onClick={counter} title="Turn this down and start your own offer back">Counter</button>
        </div>
      </div>
    </div>
  )
}

function TradeBuilder({ v, me, nm, short, init, canSend, close, send }) {
  const others = v.players.filter(p => p !== me && !v.broke[p])
  const [to, setTo] = useState(init?.to && others.includes(init.to) ? init.to : others[0])
  const [give, setGive] = useState(init?.give || [])
  const [get, setGet] = useState(init?.get || [])
  const [cash, setCash] = useState(init?.cash || 0)
  const mineT = tradable(v, me), theirs = tradable(v, to)
  const g = give.filter(sp => mineT.includes(sp)), gt = get.filter(sp => theirs.includes(sp)) // drop anything that changed hands since
  const flip = (arr, set, sp) => set(arr.includes(sp) ? arr.filter(x => x !== sp) : [...arr, sp])
  const side = (sps, arr, set) => sps.length ? sps.map(sp => (
    <button key={sp} type="button" className={`tt-st pick${arr.includes(sp) ? ' on' : ''}`} style={{ '--g': spColor(sp) }} aria-pressed={arr.includes(sp)} onClick={() => flip(arr, set, sp)}>
      {arr.includes(sp) && <I n="check" />}{name(sp)}{v.mortgaged[sp] ? <em> napping</em> : null}
    </button>
  )) : <div className="tt-st none">No streets to trade</div>
  const bad = (!g.length && !gt.length) || cash > v.cash[me] || -cash > v.cash[to]
  return (
    <div className="tt-trade tt-tray" role="dialog" aria-label="Make a trade">
      <div className="tt-in">
        <div className="tt-atop"><h4><I n="swap" className="tt-sage" />Make a trade</h4>
          <button type="button" className="tt-x" onClick={close} aria-label="Close trade"><Icon name="close" size={18} /></button></div>
        <div className="tt-with" role="radiogroup" aria-label="Trade with">
          {others.map(p => <button key={p} type="button" role="radio" aria-checked={to === p} className={to === p ? 'on' : ''} onClick={() => { setTo(p); setGet([]) }}>{nm(p)}</button>)}
        </div>
        <div className="tt-env">
          <div className="tt-side"><small>You give</small>{side(mineT, g, setGive)}</div>
          <div className="tt-side"><small>You get from {short(to)}</small>{side(theirs, gt, setGet)}</div>
        </div>
        <div className="tt-cash">
          <Coin />
          <button type="button" onClick={() => setCash(c => c - 10)} aria-label="10 fewer coins">-</button>
          <input type="number" step="10" value={cash} onChange={e => setCash(Math.trunc(+e.target.value || 0))} aria-label="Coins: positive you pay them, negative they pay you" />
          <button type="button" onClick={() => setCash(c => c + 10)} aria-label="10 more coins">+</button>
          <span>{cash > 0 ? 'you pay them' : cash < 0 ? 'they pay you' : 'no coins'}</span>
        </div>
        <div className="tt-yn">
          <button type="button" className="y" disabled={!canSend || bad} onClick={() => send({ type: 'offer', to, give: g, get: gt, cash })}><I n="check" />Send offer</button>
        </div>
        {!canSend && <p className="tt-hint">{init ? 'Your counter-offer is ready. Send it on your turn.' : 'You can send offers on your turn, before you roll or after you land.'}</p>}
      </div>
    </div>
  )
}

const ROWS = (v, sp) => {
  const b = BOARD[sp], o = v.owner[sp]
  if (b.k === 'rail') {
    const n = BOARD.filter((x, i) => x.k === 'rail' && v.owner[i] === o).length
    return [['1 trolley owned', 25], ['2 trolleys', 50], ['3 trolleys', 100], ['All 4', 200]].map(([l, r], i) => [l, r, n === i + 1])
  }
  if (b.k === 'util') {
    const n = BOARD.filter((x, i) => x.k === 'util' && v.owner[i] === o).length
    return [['One works', '4 × roll', n === 1], ['Both works', '10 × roll', n === 2]]
  }
  const c = v.cottages[sp] || 0, f = fullGroup(v, b.g, o)
  const cot = n => <span className="tt-ic">{Array.from({ length: n }, (_, i) => <I key={i} n="house" />)}</span>
  return [['Rent', b.rent[0], !f && !c], ['Full set', b.rent[0] * 2, f && !c], ...[1, 2, 3, 4].map(n => [cot(n), b.rent[n], c === n]), [<><span className="tt-ic"><I n="inn" /></span>&nbsp;Inn</>, b.rent[5], c === 5]]
}

// One deed as a perforated postage-stamp postcard. Mortgaged: the teal back with a "Napping" stamp.
function Deed({ v, me, sp, mv, off }) {
  const b = BOARD[sp], c = v.cottages[sp] || 0
  if (v.mortgaged[sp]) return (
    <div className="tt-deedwrap mort"><div className="tt-deed mort">
      <div className="tt-back">
        <div className="tt-stamp">Napping<small>mortgaged</small></div>
        <div className="tt-bn">{b.name}</div>
        <div className="tt-bs">No rent while napping</div>
        <button type="button" disabled={off || !canUnmortgage(v, me, sp)} onClick={() => mv({ type: 'unmortgage', space: sp })} aria-label={`Wake up ${b.name}: pay off the mortgage for ${unmortgageCost(sp)}`}>Wake up · {unmortgageCost(sp)}</button>
      </div>
    </div></div>
  )
  const acts = []
  if (b.k === 'prop' && fullGroup(v, b.g, me)) {
    const why = buildWhy(v, me, sp) // say why the button is grey instead of leaving people guessing
    if (c < 5) acts.push(<button key="b" type="button" className="g" disabled={off || !!why} title={why || undefined} onClick={() => mv({ type: 'build', space: sp })} aria-label={`Build ${c === 4 ? 'an inn' : 'a cottage'} on ${b.name} for ${houseCost(sp)}${why ? `. ${why}` : ''}`}>{c === 4 ? 'Inn' : 'Build +1'} · {houseCost(sp)}</button>)
    if (why && c < 5) acts.push(<small key="why" className="tt-why">{why}</small>)
    if (c > 0) acts.push(<button key="s" type="button" disabled={off || !canSell(v, me, sp)} onClick={() => mv({ type: 'sell', space: sp })} aria-label={`Sell a building on ${b.name} for ${houseCost(sp) / 2}`}>Sell +{houseCost(sp) / 2}</button>)
  }
  if (!c && (b.k !== 'prop' || !groupOf(b.g).some(i => v.cottages[i]))) acts.push(<button key="m" type="button" disabled={off || !canMortgage(v, me, sp)} onClick={() => mv({ type: 'mortgage', space: sp })} aria-label={`Mortgage ${b.name} for ${mortgageValue(sp)}`}>Mortgage +{mortgageValue(sp)}</button>)
  return (
    <div className="tt-deedwrap"><div className="tt-deed" style={{ '--g': spColor(sp) }}>
      {c > 0 && <span className="tt-badge">{c === 5 ? <I n="inn" /> : Array.from({ length: c }, (_, i) => <I key={i} n="house" />)}</span>}
      <div className="tt-dh">
        {b.k === 'rail' && <I n="tram" className="tt-bigic" />}{b.k === 'util' && <I n="lantern" className="tt-bigic" />}
        <span className="tt-dk">{b.k === 'prop' ? `${GROUPS[b.g].name} street` : b.k === 'rail' ? 'Trolley stop' : 'Works'}</span>
        <b className="tt-dn">{b.name}</b>
      </div>
      <div className="tt-dp"><span>Price</span><b>{fmt(b.price)}</b></div>
      <ul className="tt-rl">{ROWS(v, sp).map(([l, r, cur], i) => <li key={i} className={cur ? 'cur' : ''}>{l}<i /><b>{typeof r === 'number' ? fmt(r) : r}</b></li>)}</ul>
      <div className="tt-df">
        {b.k === 'prop' ? <><span>Cottage <b>{houseCost(sp)}</b> each</span><span>Inn <b>{houseCost(sp)}</b> + 4 cottages</span></>
          : <span>{b.k === 'rail' ? 'Fare paid by whoever lands here' : 'Roll the dice, pay the owner'}</span>}
        <span>Mortgage <b>{mortgageValue(sp)}</b></span>
      </div>
      {acts.length > 0 && <div className="tt-da">{acts}</div>}
    </div></div>
  )
}

// My streets: postcards grouped and fanned by colour set, like an album on a tray.
function Album({ v, me, mv, off, close }) {
  const owned = BOARD.map((_, i) => i).filter(i => v.owner[i] === me)
  const sets = [
    ...GROUPS.map((g, gi) => ({ key: g.name, label: g.name, c: g.color, all: groupOf(gi) })),
    { key: 'rail', label: 'Trolleys', c: '#8a7a68', all: BOARD.map((b, i) => (b.k === 'rail' ? i : -1)).filter(i => i >= 0) },
    { key: 'util', label: 'Works', c: '#e2a64a', all: BOARD.map((b, i) => (b.k === 'util' ? i : -1)).filter(i => i >= 0) },
  ].map(s => ({ ...s, mine: s.all.filter(i => owned.includes(i)) })).filter(s => s.mine.length)
  const shelf = useRef(null)
  const jump = k => shelf.current?.querySelector(`[data-set="${k}"]`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', inline: 'start', block: 'nearest' })
  useEffect(() => { const k = e => e.key === 'Escape' && close(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [close])
  return (
    <div className="tt-album tt-tray" role="dialog" aria-label="My streets">
      <div className="tt-in">
        <div className="tt-atop">
          <h3><I n="cards" className="tt-honey" />My streets</h3>
          <span className="tt-sum">{owned.length} deed{owned.length === 1 ? '' : 's'}<span className="tt-long"> · worth {fmt(worth(v, me) - v.cash[me])}</span></span>
          <span className="tt-sum tt-long">Cottages left in bank: {housesLeft(v)}</span>
          <button type="button" className="tt-x" onClick={close} aria-label="Close my streets"><Icon name="close" size={18} /></button>
        </div>
        {sets.length > 1 && (
          <div className="tt-setchips">
            {sets.map(s => <button key={s.key} type="button" style={{ '--g': s.c }} className={s.mine.length === s.all.length ? 'full' : ''} onClick={() => jump(s.key)}>{s.label}{s.mine.length === s.all.length ? ' · full set' : ''}</button>)}
          </div>
        )}
        {!owned.length ? <p className="tt-empty">You don't own any streets yet. Land on one and buy it, or win it at auction.</p> : (
          <div className="tt-shelf" ref={shelf} role="list">
            {sets.map(s => (
              <div key={s.key} className="tt-set" data-set={s.key} role="listitem" style={{ '--g': s.c }}>
                <div className="tt-lbl"><i />{s.label} {s.mine.length === s.all.length ? <em>Full set</em> : `${s.mine.length}/${s.all.length}`}</div>
                <div className="tt-cards">{s.mine.map(sp => <Deed key={sp} v={v} me={me} sp={sp} mv={mv} off={off} />)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
