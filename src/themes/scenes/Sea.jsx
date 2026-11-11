import { scatter } from '../../lib/themes'
import { Plane, WaveStrip, anim } from '../parts'

// Under the sea: a shimmering surface, swaying light rays, bubbles rising, little fish swimming by, kelp and a sandy floor.
const rays = scatter(5, 51)
const kelp = scatter(9, 19)
const FISH = [
  { top: '30%', d: 34, dl: 4, c: '#ffb35c', fin: '#ff8a3d', s: 1, back: false },
  { top: '48%', d: 46, dl: 26, c: '#7fe0d0', fin: '#43bfae', s: .8, back: true },
  { top: '62%', d: 28, dl: 14, c: '#ff8fb1', fin: '#f0648f', s: .9, back: false },
  { top: '40%', d: 58, dl: 40, c: '#ffe27a', fin: '#f5c443', s: .6, back: true },
]

export default function Sea() {
  return <>
    <WaveStrip className="sea-surface a tb-left" style={anim(30)} n={12} amp={6} h={24} fill="#7fd6ee33" stroke="#c9f3ff88" sw={2} />
    {rays.map((p, i) => <i key={i} className="sea-ray a" style={{ left: `${6 + i * 20 + p.x * 8}%`, width: 50 + p.r * 70, ...anim(7 + p.t * 5, p.r * 8) }} />)}
    <svg className="sea-floor" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path d="M0 50C160 30 320 60 520 46S900 24 1200 44V120H0z" fill="#d9c08e" />
      <path d="M0 76C200 64 420 84 640 74S1000 62 1200 72V120H0z" fill="#c7aa76" />
    </svg>
    <div className="sea-kelp">
      {kelp.map((p, i) => (
        <svg key={i} className="sea-weed a" viewBox="0 0 30 120" style={{ left: `${p.x * 100}%`, height: 70 + p.r * 90, ...anim(4 + p.t * 3, p.r * 4) }}>
          <path d="M15 120C5 100 25 85 15 65S25 30 15 5" stroke={i % 2 ? '#2f9b6e' : '#3fb67f'} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M15 90q10-6 12-16M15 50q-10-6-11-15" stroke={i % 2 ? '#2f9b6e' : '#3fb67f'} strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      ))}
    </div>
    <svg className="sea-shell" viewBox="0 0 40 30"><path d="M4 26Q20-6 36 26z" fill="#ffc9b0" stroke="#f0a080" strokeWidth="1.5" /><path d="M20 4V26M12 10L16 26M28 10L24 26" stroke="#f0a080" strokeWidth="1.5" /></svg>
    {FISH.map((f, i) => (
      <div key={i} className={`tb-crossing a ${f.back ? 'tb-cross-back' : 'tb-cross'}`} style={{ ...anim(f.d, f.dl), top: f.top }}>
        <div className="a tb-bob" style={anim(2.6, i)}>
          <svg className={`sea-fish${f.back ? ' back' : ''}`} viewBox="0 0 60 36" style={{ width: 56 * f.s }}>
            <path className="sea-tail a" style={anim(.7, i * .2)} d="M14 18L1 6v24z" fill={f.fin} />
            <ellipse cx="32" cy="18" rx="20" ry="13" fill={f.c} />
            <path d="M28 6q6-6 12 1" fill={f.fin} />
            <path d="M26 7q-4 11 0 22" stroke="#ffffff66" strokeWidth="3" fill="none" />
            <circle cx="42" cy="15" r="4" fill="#fff" /><circle cx="43" cy="15" r="2.2" fill="#1b2a3a" />
            <path d="M47 22q2 2 4 0" stroke="#1b2a3a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    ))}
    <div className="sea-sway a tb-swayx" style={anim(5)}>
      <Plane n={22} seed={4} dir="up" d="16s" className="sea-bubbles" item={(p, st, k) => <i key={k} style={{ ...st, width: 5 + p.r * 10, height: 5 + p.r * 10 }} />} />
    </div>
  </>
}
