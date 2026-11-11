import { Plane, anim } from '../parts'

// Snowfall: three depths of drifting flakes over soft snowy hills, frosted pines and a cabin with chimney smoke.
const flake = (size, blur) => (p, st, k) => <i key={k} style={{ ...st, width: size(p), height: size(p), opacity: .6 + p.t * .4, ...(blur && { filter: 'blur(1px)' }) }} />

export default function Snow() {
  return <>
    <div className="snw-sway a tb-swayx" style={anim(9)}>
      <Plane n={50} seed={2} dir="down" d="38s" className="snw-flakes far" item={flake(p => 2 + p.r * 2)} />
    </div>
    <svg className="snw-hills" viewBox="0 0 1200 240" preserveAspectRatio="none">
      <path d="M0 110C200 40 380 60 560 100S900 50 1200 80V240H0z" fill="#e6effa" />
      <path d="M0 170C240 110 460 130 700 160S1040 120 1200 140V240H0z" fill="#f6faff" />
    </svg>
    <svg className="snw-cabin" viewBox="0 0 100 90">
      <rect x="64" y="14" width="10" height="22" fill="#9a6b5a" />
      <rect x="18" y="44" width="62" height="40" rx="3" fill="#b9806a" />
      <path d="M8 48L49 16 90 48z" fill="#ffffff" stroke="#d7e3f2" strokeWidth="2" strokeLinejoin="round" />
      <rect x="28" y="54" width="16" height="14" rx="2" fill="#ffd27a" />
      <path d="M36 54v14M28 61h16" stroke="#b9806a" strokeWidth="2" />
      <rect x="54" y="58" width="14" height="26" rx="2" fill="#8a5a4a" />
    </svg>
    <div className="snw-smoke">{[0, 1, 2].map(i => <i key={i} className="a" style={anim(6, i * 2)} />)}</div>
    {[[4, 1], [11, .7], [82, .8], [90, 1.15]].map(([x, s], i) =>
      <svg key={i} className="snw-pine" viewBox="0 0 50 80" style={{ left: `${x}%`, width: 50 * s }}>
        <path d="M25 0L41 30H33L46 54H34L44 74H6L16 54H4L17 30H9z" fill="#4f8a7a" />
        <path d="M25 0L33 15 28 13 25 17 21 13 17 15zM12 36L33 30 38 37 30 35 24 39 18 35zM8 58L40 54 44 60 34 58 26 62 18 58z" fill="#fff" />
        <rect x="21" y="74" width="8" height="6" fill="#7a5a4a" />
      </svg>)}
    <div className="snw-sway a tb-swayx" style={anim(7, 3)}>
      <Plane n={34} seed={6} dir="down" d="22s" className="snw-flakes mid" item={flake(p => 4 + p.r * 3)} />
    </div>
    <div className="snw-sway a tb-swayx" style={anim(11, 5)}>
      <Plane n={14} seed={9} dir="down" d="13s" className="snw-flakes near" item={flake(p => 8 + p.r * 5, true)} />
    </div>
  </>
}
