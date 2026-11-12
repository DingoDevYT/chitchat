// Art for Three Lanterns, Last Lantern Standing and Pond Skippers: inline SVG pieces centred on (0, 0), like art.jsx.

// A round paper lantern hanging from its cord. lit: glowing; out: dark and smoky; n: a number painted on it.
export function Lantern({ lit = true, out = false, n, tint = '#f2a65a', label }) {
  const body = out ? '#5d5470' : tint
  return (
    <g>
      {lit && !out && <circle r="58" fill="url(#ml-glow)" />}
      <path d="M0 -70 V-44" stroke="#4a3328" strokeWidth="2.5" />
      <rect x="-14" y="-46" width="28" height="9" rx="3" fill="#6b3e24" />
      <path d="M-14 -37 Q-40 -30 -40 0 Q-40 30 -14 37 H14 Q40 30 40 0 Q40 -30 14 -37 Z" fill={body} stroke={out ? '#3a3350' : '#8a5232'} strokeWidth="2.5" />
      <path d="M-22 -33 Q-30 0 -22 33 M0 -37 V37 M22 -33 Q30 0 22 33" stroke={out ? '#463e5c' : '#00000026'} strokeWidth="2" fill="none" />
      {lit && !out && <ellipse rx="16" ry="22" fill="#fff3b0" opacity=".55" />}
      <rect x="-12" y="37" width="24" height="8" rx="3" fill="#6b3e24" />
      <path d="M-6 45 v10 M0 45 v13 M6 45 v10" stroke={out ? '#5d5470' : '#e7787f'} strokeWidth="2" strokeLinecap="round" />
      {n != null && <text y="9" textAnchor="middle" fontSize="28" fontWeight="700" fill={out ? '#b8b0cc' : '#5a3412'} fontFamily="Fredoka, Nunito, sans-serif">{n}</text>}
      {out && <path d="M-4 -52 q-6 -8 0 -14 q6 -6 0 -12" stroke="#b8b0cc" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".7" />}
      {label && <text y="76" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff3dc" fontFamily="Nunito, sans-serif">{label}</text>}
    </g>
  )
}

export function Stone({ tint = '#c9c2d6' }) {
  return (
    <g>
      <ellipse rx="13" ry="9" fill={tint} stroke="#5f5a80" strokeWidth="2" />
      <ellipse cx="-4" cy="-3" rx="4" ry="2" fill="#fff" opacity=".45" />
    </g>
  )
}

export function Pad({ r = 46 }) {
  return (
    <g>
      <path d={`M0 0 L${r} -6 A${r} ${r * 0.8} 0 1 1 ${r} 6 Z`} fill="#6fae6a" stroke="#3f7a45" strokeWidth="3" />
      <path d={`M0 0 L${-r * 0.6} ${-r * 0.3} M0 0 L${-r * 0.5} ${r * 0.4} M0 0 L${r * 0.2} ${r * 0.6}`} stroke="#3f7a45" strokeWidth="2" opacity=".6" />
    </g>
  )
}

export function Rock({ r = 34 }) {
  return (
    <g>
      <path d={`M${-r} 4 Q${-r} ${-r * 0.7} ${-r * 0.2} ${-r * 0.8} Q${r * 0.6} ${-r * 0.9} ${r} ${-r * 0.1} Q${r * 1.05} ${r * 0.6} ${r * 0.2} ${r * 0.7} Q${-r * 0.8} ${r * 0.8} ${-r} 4 Z`} fill="#7a7290" stroke="#463e5c" strokeWidth="3" />
      <path d={`M${-r * 0.4} ${-r * 0.4} q${r * 0.3} -${r * 0.2} ${r * 0.6} 0`} stroke="#b8b0cc" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

export function StarMini() {
  return <path d="M0 -10 L2.9 -3.9 L9.5 -3.1 L4.6 1.5 L5.9 8.1 L0 4.8 L-5.9 8.1 L-4.6 1.5 L-9.5 -3.1 L-2.9 -3.9 Z" fill="#ffd54f" stroke="#e2a12e" strokeWidth="1.4" strokeLinejoin="round" />
}

export const LanternDefs = () => (
  <defs>
    <radialGradient id="ml-glow"><stop offset="0" stopColor="#fff3b0" stopOpacity=".7" /><stop offset=".5" stopColor="#ffc45a" stopOpacity=".25" /><stop offset="1" stopColor="#ffc45a" stopOpacity="0" /></radialGradient>
  </defs>
)

export const initials = s => (s || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
export const TINTS = ['#f2a65a', '#8f8fe0', '#7cc4a4', '#e7787f', '#f2c14e', '#9ccbe0', '#c49ad8', '#b9784a']
