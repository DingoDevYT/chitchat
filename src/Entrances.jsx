import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { primeProfiles, profiles, toast, useProfile } from './lib/store'
import { ENTRANCES, FX_MS, SETTLE_MS, animOf, nextEnd, stepArrivals } from './lib/entrances'
import Avatar from './Avatar'
import Icon from './icons/Icon'
import './styles/entrances.css'

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Seat order plus who's mid-entrance/exit, for a list of present ids (stadium crowd, DM call).
// Leavers stay in the order for FX_MS.out so their exit can play in their seat.
// scope: the channel; switching channels starts over (no animations for the people already there).
export function useArrivals(present, scope) {
  const key = present.join(',')
  const born = useRef({ scope, at: Date.now() })
  const [st, setSt] = useState(() => ({ order: present, fx: {} }))
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const now = Date.now()
    if (born.current.scope !== scope) born.current = { scope, at: now }
    setSt(s => stepArrivals(s, key ? key.split(',') : [], now, now - born.current.at > SETTLE_MS))
  }, [key, tick, scope])
  useEffect(() => {
    const wait = nextEnd(st.fx, Date.now())
    if (wait == null) return
    const t = setTimeout(() => setTick(n => n + 1), wait + 30)
    return () => clearTimeout(t)
  }, [st])
  return st
}

// Seat classes for an entrance/exit in progress (pauses the seat's own rise, fades its name in or out).
export const seatFx = fx => (fx ? ` fx-on fx-${fx.phase}` : '')

// Wraps an avatar. fx: { phase, key } while it plays. kind: force an animation (the settings preview), else the person's pick.
export function Entrance({ id, fx, kind: forced, children }) {
  const p = useProfile(id)
  const kind = fx ? (forced !== undefined ? forced : animOf(p, fx.phase)) : null
  const cls = fx ? (kind ? ` fx-${kind}-${fx.phase}` : fx.phase === 'out' ? ' fx-plain-out' : ' fx-plain-in') : ''
  return (
    <span className="ent-spot" style={{ '--ring': p?.color || '#ffd166' }}>
      <span className={`ent-av${cls}`} data-ph={fx?.phase}>{children}</span>
      {kind && <Fx key={`${kind}${fx.phase}${fx.key}`} kind={kind} phase={fx.phase} />}
    </span>
  )
}

// ── effect parts ──
// Particles fly out by their --dx/--dy (in % of their own box) after --d seconds.
const DIRT = [[-300, -120, 0], [-200, -220, .03], [-110, -170, .06], [120, -200, .02], [220, -140, .05], [320, -90, 0], [-380, -40, .04], [390, -30, .07]]
const CLODS = [[-640, -420, 0], [-460, -600, .04], [480, -560, .02], [660, -400, .06], [-820, -260, .08]]
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30)
const STARS = [[12, 20, 0], [78, 12, .12], [86, 58, .25], [8, 64, .18], [48, -8, .32], [30, 86, .08]]
const DROPS = Array.from({ length: 8 }, (_, i) => i * 45 + 20)

const Cracks = () => (
  <svg className="fx-cracks" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">
    <path d="M100 8 L82 14 L70 11 L52 20 L38 17 L18 27" />
    <path d="M100 8 L118 15 L131 12 L148 22 L164 19 L184 29" />
    <path d="M100 8 L96 20 L103 27 L99 38" />
    <path d="M70 11 L66 24" /><path d="M131 12 L137 26" />
  </svg>
)
const Saucer = () => (
  <svg className="fx-ufo-ship" viewBox="0 0 100 52" aria-hidden="true">
    <ellipse cx="50" cy="20" rx="18" ry="15" fill="#bfeaff" opacity=".85" />
    <ellipse cx="44" cy="14" rx="6" ry="4" fill="#fff" opacity=".7" />
    <ellipse cx="50" cy="31" rx="46" ry="12" fill="#8d98b3" />
    <ellipse cx="50" cy="28" rx="46" ry="8" fill="#b7c0d6" />
    <ellipse cx="50" cy="38" rx="20" ry="5" fill="#5d6680" />
    {[14, 32, 50, 68, 86].map((x, i) => <circle key={x} className="fx-ufo-light" cx={x} cy={i % 2 ? 31 : 30} r="3.2" style={{ '--d': `${i * .12}s` }} />)}
  </svg>
)
const Plane = () => (
  <svg className="fx-plane-ship" viewBox="0 0 100 60" aria-hidden="true">
    <path d="M2 30 L98 4 L40 38 Z" fill="#fffaf0" />
    <path d="M40 38 L98 4 L52 56 Z" fill="#e9e1cf" />
    <path d="M40 38 L46 50 L52 56" fill="none" stroke="#c9bfa8" strokeWidth="2" />
  </svg>
)
const Mound = () => (
  <svg className="fx-mound" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 40 Q14 18 30 20 Q40 4 60 6 Q80 4 90 20 Q106 18 120 40 Z" fill="#8a5a3c" />
    <path d="M18 40 Q30 26 44 28 Q56 16 72 22 Q88 24 100 40 Z" fill="#6e4630" />
    <circle cx="40" cy="16" r="3" fill="#a97a55" /><circle cx="78" cy="14" r="2.5" fill="#a97a55" /><circle cx="60" cy="24" r="2" fill="#5a3824" />
  </svg>
)
const Pie = () => (
  <svg className="fx-pie-dish" viewBox="0 0 120 48" aria-hidden="true">
    <path d="M6 22 L16 46 L104 46 L114 22 Z" fill="#b9bccb" />
    <path d="M10 24 L18 42 L102 42 L110 24 Z" fill="#d9a05b" />
    <ellipse cx="60" cy="22" rx="56" ry="10" fill="#e8b46e" />
    <ellipse cx="60" cy="21" rx="46" ry="7" fill="#d6455d" />
    {[24, 42, 60, 78, 96].map(x => <ellipse key={x} cx={x} cy="20" rx="8" ry="4.5" fill="#fff4e0" />)}
  </svg>
)
const Splat = () => (
  <svg className="fx-splat" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 8 Q62 22 76 14 Q74 32 92 38 Q78 50 90 66 Q70 64 66 84 Q54 72 44 90 Q38 70 18 76 Q26 58 8 48 Q26 40 18 22 Q36 28 50 8 Z" fill="#fff6e6" />
    <circle cx="40" cy="44" r="6" fill="#d6455d" /><circle cx="60" cy="56" r="4" fill="#d6455d" />
    <path d="M34 80 Q36 92 32 98" stroke="#fff6e6" strokeWidth="6" strokeLinecap="round" fill="none" className="fx-drip" />
  </svg>
)
const Star = ({ x, y, d }) => (
  <svg className="fx-star" viewBox="0 0 20 20" style={{ left: `${x}%`, top: `${y}%`, '--d': `${d}s` }} aria-hidden="true">
    <path d="M10 0 Q11.5 8.5 20 10 Q11.5 11.5 10 20 Q8.5 11.5 0 10 Q8.5 8.5 10 0 Z" />
  </svg>
)
const bits = (cls, list) => list.map(([dx, dy, d], i) => <i key={i} className={cls} style={{ '--dx': `${dx}%`, '--dy': `${dy}%`, '--d': `${d}s` }} />)
const burst = (cls, delay) => RAYS.map((a, i) => <i key={a} className={cls} style={{ '--a': `${a}deg`, '--d': `${delay + (i % 3) * .02}s` }} />)

const PARTS = {
  anvil: phase => <>
    <i className="fx-shadow" />
    <Cracks />
    {bits('fx-puff', DIRT)}
    {bits('fx-clod', CLODS.slice(0, phase === 'in' ? 5 : 3))}
  </>,
  ufo: () => <><i className="fx-beam" /><Saucer /></>,
  firework: phase => <>
    <i className="fx-trail" />
    {phase === 'out' && bits('fx-fizz', DIRT.slice(0, 5).map(([x, y, d]) => [x / 3, y / 2, d * 4]))}
    <i className="fx-flash" />
    {burst('fx-spark', phase === 'in' ? .42 : .82)}
  </>,
  plane: () => <><i className="fx-wind" /><i className="fx-wind two" /><Plane /></>,
  molehill: () => <><Mound />{bits('fx-clod', CLODS)}</>,
  bubble: () => <><i className="fx-orb" />{DROPS.map(a => <i key={a} className="fx-drop" style={{ '--a': `${a}deg` }} />)}</>,
  teleport: () => <><i className="fx-column" />{STARS.map(([x, y, d], i) => <Star key={i} x={x} y={y} d={d} />)}</>,
  pie: phase => phase === 'in'
    ? <><Pie />{bits('fx-cream', DIRT)}</>
    : <><i className="fx-pie-fly" /><Splat />{bits('fx-cream', DIRT.slice(0, 6))}</>,
}
// When the stage shakes (ms after start), for the heavy ones.
const RUMBLE = { anvil: { in: [440, 1], out: [330, .5] } }

function Fx({ kind, phase }) {
  const ref = useRef(null)
  useEffect(() => {
    const r = RUMBLE[kind]?.[phase]
    if (!r || reduced()) return
    const t = setTimeout(() => {
      const stage = ref.current?.closest('.stadium, .call-stage, .ent-preview')
      const k = r[1] * 7
      stage?.animate?.([{ transform: 'none' }, { transform: `translate(${-k}px, ${k * .6}px)` }, { transform: `translate(${k * .8}px, ${-k * .4}px)` },
        { transform: `translate(${-k * .5}px, ${k * .3}px)` }, { transform: `translate(${k * .3}px, 0)` }, { transform: 'none' }], { duration: 420, easing: 'ease-out' })
    }, r[0])
    return () => clearTimeout(t)
  }, [kind, phase])
  return <span ref={ref} className={`fx fx-${kind} ${phase}`} aria-hidden="true">{PARTS[kind]?.(phase)}</span>
}

// ── settings: pick your entrance and exit, with a live preview on your own avatar ──
const GLYPHS = {
  none: <path d="M6 14 h12 M12 6 v12" />,
  anvil: <path d="M4 7 h13 q3 0 4 -2 v4 q-3 2 -6 2 l-1 3 h3 v3 H7 v-3 h3 l-1 -3 Q5 11 4 7 Z" />,
  ufo: <><ellipse cx="12" cy="9" rx="9" ry="3" /><path d="M8 8 q4 -6 8 0 M8 12 L5 21 M16 12 L19 21" /></>,
  firework: <path d="M12 3 v5 M12 16 v5 M3 12 h5 M16 12 h5 M5.6 5.6 l3.5 3.5 M14.9 14.9 l3.5 3.5 M18.4 5.6 l-3.5 3.5 M9.1 14.9 l-3.5 3.5" />,
  plane: <path d="M3 12 L21 4 L14 20 L11 13 Z M11 13 L21 4" />,
  molehill: <><path d="M2 20 Q6 11 12 11 Q18 11 22 20 Z" /><circle cx="12" cy="7" r="3" /></>,
  bubble: <><circle cx="12" cy="12" r="8" /><path d="M8 9 q1.5 -2 4 -2.4" /></>,
  teleport: <path d="M12 2 q1 7 8 8 q-7 1 -8 8 q-1 -7 -8 -8 q7 -1 8 -8 Z M19 17 l1 3 M5 4 l1 2" />,
  pie: <><path d="M3 12 h18 l-2 7 H5 Z" /><path d="M4 12 q2 -4 4 -1 q2 -4 4 -1 q2 -4 4 -1 q2 -4 4 0" /></>,
}
export const Glyph = ({ id }) => <svg className="ent-glyph" viewBox="0 0 24 24" aria-hidden="true">{GLYPHS[id] || GLYPHS.none}</svg>

export function EntrancePicker({ me }) {
  const p = useProfile(me.id) || me
  const [slot, setSlot] = useState('in')
  const [play, setPlay] = useState(null) // { kind, phase, key }
  const timers = useRef([])
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])
  const later = (ms, f) => timers.current.push(setTimeout(f, ms))

  // in, or out then back; 'both' plays your entrance then your exit.
  function preview(kind, phase) {
    clear()
    const k = Date.now()
    if (phase === 'both') {
      setPlay({ kind: kind.in, phase: 'in', key: k })
      later(FX_MS.in + 500, () => setPlay({ kind: kind.out, phase: 'out', key: k + 1 }))
      later(FX_MS.in + 500 + FX_MS.out + 400, () => setPlay(null))
      return
    }
    setPlay({ kind, phase, key: k })
    later((phase === 'in' ? FX_MS.in : FX_MS.out + 400), () => setPlay(null))
  }

  async function choose(id) {
    const col = slot === 'in' ? 'entrance_anim' : 'exit_anim'
    preview(id, slot)
    if ((p[col] ?? null) === id) return
    const prev = profiles.get()[me.id]
    primeProfiles([{ ...prev, [col]: id }])
    const { data, error } = await supabase.from('profiles').update({ [col]: id }).eq('id', me.id).select().single()
    if (error) { primeProfiles([prev]); return toast(`Couldn't save that animation yet (${error.message}).`) }
    primeProfiles([data])
  }

  const cur = { in: p.entrance_anim ?? null, out: p.exit_anim ?? null }
  const known = id => ENTRANCES.some(e => e.id === id) ? id : null
  return (
    <div className="ent-picker">
      <div className="ent-head">
        <div>Entrance &amp; exit
          <span className="muted small">Plays on your seat for everyone when you join or leave a stadium or call. Saves straight away.</span>
        </div>
        <div className="tabs small">{[['in', 'Entrance'], ['out', 'Exit']].map(([k, l]) =>
          <button key={k} className={slot === k ? 'on' : ''} onClick={() => setSlot(k)}>{l}</button>)}</div>
      </div>
      <div className="ent-row">
        <div className="ent-preview">
          <span className="ent-ground" />
          <div className="ent-seat">
            <Entrance id={me.id} fx={play && { phase: play.phase, key: play.key }} kind={play ? play.kind : undefined}>
              <Avatar id={me.id} size={84} full mode="still" />
            </Entrance>
          </div>
          <button className="btn ghost small ent-both" onClick={() => preview({ in: known(cur.in), out: known(cur.out) }, 'both')}>
            <Icon name="play" size={14} /> Preview mine</button>
        </div>
        <div className="ent-grid" role="radiogroup" aria-label={slot === 'in' ? 'Entrance animation' : 'Exit animation'}>
          {[{ id: null, name: 'Simple', in: 'A soft hop in', out: 'A quiet fade' }, ...ENTRANCES].map(e => {
            const on = (known(cur[slot]) ?? null) === e.id
            return (
              <button key={e.id || 'none'} role="radio" aria-checked={on} className={`ent-card${on ? ' on' : ''}`} onClick={() => choose(e.id)}
                title={`${e.name}: ${slot === 'in' ? e.in : e.out}`}>
                <Glyph id={e.id || 'none'} />
                <b>{e.name}</b>
                <span className="muted small">{slot === 'in' ? e.in : e.out}</span>
                <span className="ent-tags">{cur.in === e.id && <i>in</i>}{cur.out === e.id && <i>out</i>}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
