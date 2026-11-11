import { lazy, Suspense, useState } from 'react'
import { THEMES } from '../lib/themes'
import ThemeBackdrop from './ThemeBackdrop'

// Dev-only side-by-side at #/themes: the live scene ("Now") next to its redo in src/themes/v2/<Name>.jsx ("New").
// Start state from the hash, e.g. #/themes?t=night&v=stadium&look=day&k=subtle
const redo = import.meta.glob('./v2/*.jsx')
const SCENES = THEMES.filter(t => t.colors)
const v2 = {}
const v2Of = id => { const f = redo[`./v2/${id[0].toUpperCase()}${id.slice(1)}.jsx`]; return f && (v2[id] ||= lazy(f)) }
const q = new URLSearchParams(location.hash.split('?')[1])

const css = `
.lab { height: 100vh; display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
.lab-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.lab-bar div { display: flex; gap: 4px; flex-wrap: wrap; }
.lab-bar button { padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line, #8884); background: none; color: inherit; cursor: pointer; }
.lab-bar button.on { background: var(--accent); color: var(--bg); border-color: transparent; }
.lab-pair { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .lab-pair { grid-template-columns: 1fr; } }
.lab-panel { margin: 0; display: flex; flex-direction: column; gap: 6px; min-height: 280px; }
.lab-panel figcaption { font-weight: 700; }
.lab-stage { flex: 1; position: relative; isolation: isolate; overflow: hidden; border-radius: 14px; background: var(--bg); }
.lab-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); }
.lab-text { position: absolute; left: 24px; right: 24px; top: 120px; display: grid; gap: 10px; font-size: 15px; }
.lab-text b { color: var(--accent); margin-right: 8px; }
/* shared paper grain for the redos (from the gouache attempt); moves into ThemeBackdrop when they go live */
.tb-v2 .tb-grain { position: absolute; inset: 0; opacity: .075; pointer-events: none;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='2.4 0 0 0 -.7 2.4 0 0 0 -.72 2.4 0 0 0 -.76 0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='n' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.009' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='1.6 0 0 0 -.3 1.6 0 0 0 -.32 1.6 0 0 0 -.36 0 0 0 0 .6'/%3E%3C/filter%3E%3Crect width='600' height='600' filter='url(%23n)'/%3E%3C/svg%3E"); }
`
const LINES = [['pip', 'hey! is the new theme on?'], ['mochi', 'ok this is genuinely so cozy'],
  ['pip', 'Can everyone still read this alright? Long messages need to stay easy on the eyes, even with things moving behind them.'],
  ['mochi', 'what are we playing tonight?'], ['pip', 'something slow. maybe the fishing one']]

function Choice({ value, set, options }) {
  return <div>{options.map(([v, label]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => set(v)}>{label}</button>)}</div>
}

function Panel({ label, t, variant, level, Scene }) {
  return (
    <figure className="lab-panel">
      <figcaption>{label}</figcaption>
      <div className="lab-stage">
        {Scene === undefined ? <ThemeBackdrop theme={t.id} variant={variant} intensity={level} />
          : Scene ? (
            // same container ThemeBackdrop draws, minus the tb-<id> class so old scene CSS can't leak into the redo
            <div className={`theme-backdrop tb-v2 tb-${variant} tb-${level} ${t.dark ? 'tb-dark' : 'tb-light'}`} aria-hidden="true"
              style={{ '--c1': t.colors[0], '--c2': t.colors[1], '--c3': t.colors[2] }}>
              <Suspense fallback={null}><div className="tb-scene"><Scene variant={variant} /></div></Suspense>
              <div className="tb-scrim" />
              <div className="tb-grain" />
            </div>)
          : <p className="lab-empty">Not redone yet</p>}
        {variant === 'room' && <div className="lab-text">{LINES.map(([n, s], i) => <div key={i}><b>{n}</b>{s}</div>)}</div>}
      </div>
    </figure>
  )
}

export default function ThemeLab() {
  const [id, setId] = useState(q.get('t') || 'night')
  const [variant, setVariant] = useState(q.get('v') || 'stadium')
  const [look, setLook] = useState(q.get('look') || document.documentElement.dataset.theme || 'night')
  const [level, setLevel] = useState(q.get('k') || 'full')
  document.documentElement.dataset.theme = look
  const t = SCENES.find(s => s.id === id) || SCENES[0]
  return (
    <div className="lab">
      <style>{css}</style>
      <div className="lab-bar">
        <Choice value={t.id} set={setId} options={SCENES.map(s => [s.id, `${s.name}${v2Of(s.id) ? ' •' : ''}`])} />
        <Choice value={variant} set={setVariant} options={[['stadium', 'Stadium'], ['room', 'Room']]} />
        <Choice value={look} set={setLook} options={[['night', 'Night look'], ['day', 'Day look']]} />
        <Choice value={level} set={setLevel} options={[['full', 'Full'], ['subtle', 'Subtle']]} />
      </div>
      <div className="lab-pair">
        <Panel label="Now" t={t} variant={variant} level={level} />
        <Panel label="New" t={t} variant={variant} level={level} Scene={v2Of(t.id) || null} />
      </div>
    </div>
  )
}
