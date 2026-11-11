import { scatter } from '../../lib/themes'
import { anim } from '../parts'

// Campfire: a crackling fire on crossed logs, a warm flickering glow, embers drifting up into a starry sky, a little tent.
const stars = scatter(46, 71)
const embers = scatter(16, 29)

export default function Campfire() {
  return <>
    {stars.map((p, i) => <i key={i} className={`cmp-star${i % 5 ? '' : ' a tb-tw'}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 50}%`, opacity: .25 + p.r * .5, ...(i % 5 ? null : anim(2.5 + p.t * 3, p.r * 5)) }} />)}
    <svg className="cmp-trees" viewBox="0 0 1200 200" preserveAspectRatio="none">
      <path d="M0 200V60L30 20 60 70 90 10 130 80 160 40 200 110 240 70 280 140 320 200zM880 200L930 120 970 150 1010 60 1050 110 1090 30 1130 80 1170 20 1200 50V200z" fill="#130f20" />
    </svg>
    <div className="cmp-glow a" style={anim(3.2)} />
    <svg className="cmp-ground" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path d="M0 40C300 10 900 10 1200 40V120H0z" fill="#1d1420" />
    </svg>
    <svg className="cmp-tent" viewBox="0 0 120 90">
      <path d="M8 86L58 8 112 86z" fill="#5a3a5e" />
      <path d="M58 8L112 86H84z" fill="#45294a" />
      <path d="M58 30L44 86H72z" fill="#1d1420" />
      <path d="M58 8l-4-6M58 8l5-6" stroke="#2a1d2e" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
    <div className="cmp-fire">
      {embers.map((p, i) => <i key={i} className="cmp-ember a" style={{ '--x': `${(p.x - .5) * 140}px`, '--y': `${-180 - p.r * 220}px`, width: 2 + p.t * 3, height: 2 + p.t * 3, ...anim(3 + p.r * 3.5, p.t * 7) }} />)}
      <svg className="cmp-flames" viewBox="0 0 120 130">
        <path className="cmp-flame f1 a" style={anim(1.3)} d="M60 128C24 128 14 96 30 70C38 56 36 40 44 26C50 48 60 50 62 30C66 12 78 4 80 0C78 24 96 40 100 68C106 102 92 128 60 128z" fill="#ff6b3d" />
        <path className="cmp-flame f2 a" style={anim(.9, .3)} d="M60 128C36 128 28 104 40 84C46 74 46 62 52 52C56 66 64 66 64 52C66 42 72 36 76 30C76 50 90 64 90 86C90 112 80 128 60 128z" fill="#ffa53d" />
        <path className="cmp-flame f3 a" style={anim(.7, .5)} d="M60 128C46 128 42 114 48 102C52 94 54 86 58 78C60 88 66 90 68 84C72 92 76 102 74 112C72 122 68 128 60 128z" fill="#ffe27a" />
      </svg>
      <svg className="cmp-logs" viewBox="0 0 140 40">
        <rect x="6" y="14" width="128" height="16" rx="8" fill="#7a4a32" transform="rotate(-12 70 22)" />
        <rect x="6" y="14" width="128" height="16" rx="8" fill="#8f5a3c" transform="rotate(12 70 22)" />
        <circle cx="12" cy="34" r="7" fill="#c9905e" /><circle cx="12" cy="34" r="3.5" fill="#a8704a" />
        <circle cx="128" cy="34" r="7" fill="#c9905e" /><circle cx="128" cy="34" r="3.5" fill="#a8704a" />
      </svg>
      <div className="cmp-stones">{[0, 1, 2, 3, 4].map(i => <i key={i} />)}</div>
    </div>
  </>
}
