// Chore mini-games: short, cozy, one thumb or a mouse. Four mechanics so far, each dressed for a couple of spots:
// trace (Ice the buns, Snip the herbs), rhythm (Knead the dough, Wind the cuckoo clock), pour (Feed Gerald,
// Sift the flour) and sort (Sort the jam jars, Box the buns). onDone() when finished; the referee also wants at
// least MIN_CHORE ms between start and finish, which every game here takes anyway.
import { useEffect, useMemo, useRef, useState } from 'react'

export const CHORE_GAME = {
  ice: ['trace', 'Trace the swirl before the icing runs out'], herbs: ['trace', 'Follow the vine with the snips'],
  knead: ['rhythm', 'Tap when the ring hugs the dough'], clock: ['rhythm', 'Turn the crank when the ring lines up'],
  gerald: ['pour', 'Hold to pour flour. Let go in the happy zone'], sift: ['pour', 'Hold to sift. Stop in the happy zone'],
  jam: ['sort', 'Tap a jar, then the shelf of its colour'], box: ['sort', 'Tap a bun, then the box of its colour'],
}

export function Chore({ spot, onDone, onClose }) {
  const [kind, hint] = CHORE_GAME[spot.kind] || CHORE_GAME.ice
  const [won, setWon] = useState(false)
  const done = () => { if (won) return; setWon(true); setTimeout(onDone, 600) }
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  const Game = { trace: Trace, rhythm: Rhythm, pour: Pour, sort: Sort }[kind]
  return (
    <div className="cc-chore" role="dialog" aria-label={spot.name}>
      <div className="cc-chore-title">{spot.name}</div>
      <p className="cc-chore-hint">{hint}</p>
      <div className={`cc-chore-play${won ? ' won' : ''}`}><Game onDone={done} variant={spot.kind} /></div>
      {won ? <div className="cc-chore-yay">Lovely! ✓</div> : <button className="cc-btn ghost" onClick={onClose}>Step away (Esc)</button>}
    </div>
  )
}

// ---- trace: follow a spiral; the icing bag drains while you press -------------------------------------------
function Trace({ onDone, variant }) {
  const pts = useMemo(() => Array.from({ length: 48 }, (_, i) => { const a = i * 0.32, r = 18 + i * 1.75; return [120 + r * Math.cos(a), 120 + r * Math.sin(a)] }), [])
  const [hit, setHit] = useState(() => new Set())
  const [left, setLeft] = useState(100)
  const down = useRef(false), svg = useRef()
  const herb = variant === 'herbs'
  const at = e => { const r = svg.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 240, ((e.clientY - r.top) / r.height) * 240] }
  const move = e => {
    if (!down.current || left <= 0) return
    const [x, y] = at(e)
    setLeft(l => Math.max(0, l - 0.35))
    setHit(h => { let n = null; pts.forEach((p, i) => { if (!h.has(i) && Math.hypot(p[0] - x, p[1] - y) < 16) (n ||= new Set(h)).add(i) }); return n || h })
  }
  useEffect(() => { if (hit.size >= pts.length * 0.85) onDone() }, [hit]) // eslint-disable-line react-hooks/exhaustive-deps
  const refill = () => { setLeft(100); setHit(new Set()) }
  return (
    <div className="cc-trace">
      <svg ref={svg} viewBox="0 0 240 240" onPointerDown={e => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e) }} onPointerMove={move} onPointerUp={() => { down.current = false }} style={{ touchAction: 'none' }}>
        <circle cx="120" cy="120" r="108" fill={herb ? '#cfe6b8' : '#e8a24f'} />
        {!herb && <circle cx="120" cy="120" r="96" fill="#f0b766" />}
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={hit.has(i) ? 7 : 3} fill={hit.has(i) ? (herb ? '#5f9a58' : '#fbd3e0') : '#7a4e32'} opacity={hit.has(i) ? 1 : 0.55} />)}
      </svg>
      <div className="cc-meter"><span>{herb ? 'Snips' : 'Icing'}</span><i><b style={{ width: left + '%' }} /></i></div>
      {left <= 0 && <button className="cc-btn" onClick={refill}>{herb ? 'Sharpen and try again' : 'Refill the bag'}</button>}
    </div>
  )
}

// ---- rhythm: a ring shrinks onto the dough; tap when it hugs it ------------------------------------------------
function Rhythm({ onDone, variant }) {
  const [good, setGood] = useState(0)
  const [flash, setFlash] = useState(null)
  const t0 = useRef(performance.now()), [, tick] = useState(0)
  useEffect(() => { let r; const f = () => { tick(x => x + 1); r = requestAnimationFrame(f) }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r) }, [])
  const period = 1300
  const k = ((performance.now() - t0.current) % period) / period // 0..1
  const ring = 1.9 - k * 1.2 // ring scale shrinks 1.9 → 0.7; the dough is 1
  const tap = () => {
    const ok = Math.abs(ring - 1) < 0.16
    setFlash(ok ? 'good' : 'miss'); setTimeout(() => setFlash(null), 250)
    if (ok) { t0.current = performance.now(); setGood(g => { if (g + 1 >= 5) onDone(); return g + 1 }) }
  }
  const clock = variant === 'clock'
  return (
    <div className="cc-rhythm">
      <button className={`cc-dough${flash ? ' ' + flash : ''}`} onPointerDown={tap} aria-label="Tap">
        <span className="cc-ring" style={{ transform: `scale(${ring})` }} />
        <span className={clock ? 'cc-crank' : 'cc-blob'} style={clock ? { transform: `rotate(${good * 72}deg)` } : { transform: `scale(${1 + Math.sin(k * Math.PI * 2) * 0.04}, ${1 - Math.sin(k * Math.PI * 2) * 0.04})` }} />
      </button>
      <div className="cc-dots">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < good ? 'on' : ''} />)}</div>
    </div>
  )
}

// ---- pour: hold to fill, let go inside the happy zone; too much and it overflows ----------------------------------
function Pour({ onDone, variant }) {
  const [level, setLevel] = useState(0)
  const [msg, setMsg] = useState('')
  const held = useRef(false), lv = useRef(0)
  useEffect(() => {
    const t = setInterval(() => {
      if (!held.current) return
      lv.current = Math.min(110, lv.current + 1.6); setLevel(lv.current)
      if (lv.current >= 100) { held.current = false; setMsg(variant === 'gerald' ? 'Gerald burps. Too much! Try again.' : 'Whoops, a flour cloud! Try again.'); setTimeout(() => { lv.current = 0; setLevel(0); setMsg('') }, 900) }
    }, 30)
    return () => clearInterval(t)
  }, [variant])
  const up = () => {
    if (!held.current) return
    held.current = false
    if (lv.current >= 60 && lv.current <= 80) { setMsg('Just right!'); onDone() } else if (lv.current < 60) setMsg('A bit more…')
    else { setMsg('Too much! Try again.'); setTimeout(() => { lv.current = 0; setLevel(0); setMsg('') }, 700) }
  }
  return (
    <div className="cc-pour">
      <div className="cc-jar"><div className="cc-zone" /><div className="cc-fill" style={{ height: Math.min(100, level) + '%' }} />{variant === 'gerald' && <span className="cc-gerald">{level > 60 && level <= 80 ? '◕‿◕' : level > 80 ? '◉_◉' : '•ᴗ•'}</span>}</div>
      <button className="cc-btn big" onPointerDown={e => { held.current = true; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none' }}>Hold to pour</button>
      <div className="cc-msg">{msg}</div>
    </div>
  )
}

// ---- sort: tap a jar, then the matching shelf ----------------------------------------------------------------
const JAM = ['#d94f5c', '#f28a3c', '#8b4fb0']
function Sort({ onDone, variant }) {
  const [items, setItems] = useState(() => [0, 1, 2, 0, 1, 2].sort(() => Math.random() - 0.5).map((c, i) => ({ id: i, c, at: null })))
  const [pick, setPick] = useState(null)
  const [wrong, setWrong] = useState(null)
  const put = shelf => {
    if (pick == null) return
    const it = items.find(x => x.id === pick)
    if (it.c !== shelf) { setWrong(shelf); setTimeout(() => setWrong(null), 300); return }
    const next = items.map(x => x.id === pick ? { ...x, at: shelf } : x)
    setItems(next); setPick(null)
    if (next.every(x => x.at != null)) onDone()
  }
  const buns = variant === 'box'
  return (
    <div className="cc-sort">
      <div className="cc-shelves">{JAM.map((c, s) => (
        <button key={s} className={`cc-shelf${wrong === s ? ' wrong' : ''}`} style={{ '--c': c }} onClick={() => put(s)} aria-label={`Shelf ${s + 1}`}>
          {items.filter(x => x.at === s).map(x => <i key={x.id} className={buns ? 'bun' : 'jar'} style={{ '--c': JAM[x.c] }} />)}
        </button>
      ))}</div>
      <div className="cc-tray">{items.filter(x => x.at == null).map(x => (
        <button key={x.id} className={`${buns ? 'bun' : 'jar'}${pick === x.id ? ' on' : ''}`} style={{ '--c': JAM[x.c] }} onClick={() => setPick(x.id)} aria-label="Pick" />
      ))}</div>
    </div>
  )
}
