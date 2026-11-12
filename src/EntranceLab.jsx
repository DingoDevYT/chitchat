import { useEffect, useRef, useState } from 'react'
import { primeProfiles } from './lib/store'
import { ENTRANCES, FX_MS } from './lib/entrances'
import Avatar, { Name } from './Avatar'
import { Entrance, EntrancePicker, seatFx } from './Entrances'

// Dev-only review sheet at #/entrances: every entrance/exit on a little stage, replayable, plus the settings picker.
// #/entrances?strip=anvil  freezes 8 copies at successive moments (in on top, out below) for a frame strip.
// #/entrances?crowd=anvil  a small crowd with one person mid-landing.  #/entrances?picker  just the picker.
const COLORS = ['#ff9f6b', '#7cc4b0', '#e58fb4', '#8fb3e8', '#f2c14e', '#a98bd6', '#9bd17a', '#e8857a']
const NAMES = ['Juniper', 'Doodle', 'Saffron', 'Pip', 'Marlow', 'Fennel', 'Bramble', 'Clover']
primeProfiles([
  ...ENTRANCES.map((e, i) => ({ id: `lab-${e.id}`, username: NAMES[i].toLowerCase(), display_name: NAMES[i], color: COLORS[i], entrance_anim: e.id, exit_anim: e.id })),
  { id: 'lab-me', username: 'you', display_name: 'You', color: '#ffd166', entrance_anim: 'ufo', exit_anim: 'anvil' },
])
const IN_T = [120, 280, 400, 470, 560, 700, 880, 1300]
const OUT_T = [80, 220, 380, 520, 640, 780, 960, 1300]

function Cell({ id, fx, kind, freeze, size = 84 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (freeze == null) return
    const r = requestAnimationFrame(() => ref.current?.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = freeze }))
    return () => cancelAnimationFrame(r)
  }, [freeze, fx?.key])
  return (
    <div className="lab-cell ent-preview" ref={ref}>
      <span className="ent-ground" />
      <div className={`stage-seat lab-seat${seatFx(fx)}`}>
        <Entrance id={id} fx={fx} kind={kind}><Avatar id={id} size={size} full mode="still" /></Entrance>
        <Name id={id} />
      </div>
      {freeze != null && <span className="lab-t">{freeze} ms</span>}
    </div>
  )
}

function Strip({ kind }) {
  const e = ENTRANCES.find(x => x.id === kind) || ENTRANCES[0]
  return (
    <div className="lab-strip">
      <h2>{e.name}</h2>
      {[['in', IN_T, e.in], ['out', OUT_T, e.out]].map(([ph, ts, blurb]) => (
        <div key={ph}>
          <p className="muted">{ph === 'in' ? 'Entrance' : 'Exit'}: {blurb}</p>
          <div className="lab-row">{ts.map(t => <Cell key={t} id={`lab-${e.id}`} fx={{ phase: ph, key: 1 }} kind={e.id} freeze={t} size={72} />)}</div>
        </div>
      ))}
    </div>
  )
}

function Crowd({ kind }) {
  const ids = ENTRANCES.slice(0, 6).map(e => `lab-${e.id}`)
  const ref = useRef(null)
  useEffect(() => {
    const r = requestAnimationFrame(() => ref.current?.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 540 }))
    return () => cancelAnimationFrame(r)
  }, [])
  return (
    <div className="lab-crowd stadium" ref={ref}>
      <div className="lab-screen"><h1>Hangout</h1><p>Nobody's live</p></div>
      <div className="lab-crowd-row">
        {ids.map((id, i) => {
          const fx = i === 3 ? { phase: 'in', key: 1 } : null
          return <div key={id} className={`stage-seat${seatFx(fx)}`}><Entrance id={id} fx={fx} kind={fx ? kind : undefined}><Avatar id={id} size={96} full mode="still" /></Entrance><Name id={id} /></div>
        })}
      </div>
    </div>
  )
}

export default function EntranceLab() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '')
  const [play, setPlay] = useState({})
  const go = (id, phase) => {
    setPlay(p => ({ ...p, [id]: { phase, key: Date.now() } }))
    setTimeout(() => setPlay(p => ({ ...p, [id]: null })), phase === 'in' ? FX_MS.in : FX_MS.out + 500)
  }
  const all = phase => ENTRANCES.forEach(e => go(e.id, phase))
  if (q.has('strip')) return <Lab><Strip kind={q.get('strip')} /></Lab>
  if (q.has('crowd')) return <Lab><Crowd kind={q.get('crowd') || 'anvil'} /></Lab>
  if (q.has('picker')) return <Lab><div className="lab-picker modal"><EntrancePicker me={{ id: 'lab-me' }} /></div></Lab>
  return (
    <Lab>
      <h1>Entrances and exits</h1>
      <div className="row"><button className="btn primary" onClick={() => all('in')}>Play all in</button><button className="btn ghost" onClick={() => all('out')}>Play all out</button></div>
      <div className="lab-grid">
        {ENTRANCES.map(e => (
          <div key={e.id} className="lab-card">
            <b>{e.name}</b>
            <Cell id={`lab-${e.id}`} fx={play[e.id]} kind={e.id} />
            <div className="row"><button className="btn ghost small" onClick={() => go(e.id, 'in')}>In</button><button className="btn ghost small" onClick={() => go(e.id, 'out')}>Out</button></div>
          </div>
        ))}
      </div>
      <h2>Settings picker</h2>
      <div className="lab-picker modal"><EntrancePicker me={{ id: 'lab-me' }} /></div>
    </Lab>
  )
}

function Lab({ children }) {
  return (
    <div className="ent-lab">
      <style>{`
        .ent-lab { padding: 16px; min-height: 100vh; box-sizing: border-box; overflow-x: hidden; }
        .ent-lab h1, .ent-lab h2 { margin: 0 0 8px; }
        .lab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin: 12px 0 24px; }
        .lab-card { display: flex; flex-direction: column; gap: 6px; align-items: center; }
        .lab-cell { flex: 0 0 auto; width: 100%; min-height: 230px; overflow: visible; }
        .lab-row { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-bottom: 10px; }
        .lab-row .lab-cell { min-height: 300px; padding-top: 120px; overflow: hidden; }
        .lab-seat { margin: 0; animation: none; z-index: 1; }
        .lab-seat .name { font-size: 12px; }
        .lab-t { position: absolute; top: 6px; left: 8px; font-size: 11px; color: var(--muted); z-index: 5; }
        .lab-picker { position: static; transform: none; max-width: 760px; padding: 16px; border-radius: var(--r-lg); background: var(--bg-1, var(--bg)); box-shadow: var(--shadow); }
        .lab-crowd { position: relative; height: 520px; border-radius: var(--r-lg); overflow: hidden; padding: 16px; display: flex; flex-direction: column;
          background: radial-gradient(ellipse at 50% 0, #2c4a5a, #0f1d26 70%); }
        .lab-screen { flex: 1; border-radius: 18px; background: #0b1218; display: grid; place-content: center; text-align: center; color: #f7efdc; margin-bottom: 60px; }
        .lab-screen p { color: #a9bfc0; margin: 0; }
        .lab-crowd-row { position: absolute; left: 16px; right: 16px; bottom: 10px; display: flex; justify-content: center; gap: 0; }
        .lab-crowd-row .stage-seat { margin: 0 -6px; }
      `}</style>
      {children}
    </div>
  )
}
