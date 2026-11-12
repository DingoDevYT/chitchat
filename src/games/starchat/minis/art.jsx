// Starchat minigame art: small inline SVG pieces (no emoji, no image files). Each draws centred on (0, 0) in its
// own units so it can sit inside any <svg> with a transform, or stand alone through <Ico>.

const STAR = 'M0 -10 L2.9 -3.9 L9.5 -3.1 L4.6 1.5 L5.9 8.1 L0 4.8 L-5.9 8.1 L-4.6 1.5 L-9.5 -3.1 L-2.9 -3.9 Z'

export function Star({ face = true, glow = true }) {
  return (
    <g>
      {glow && <circle r="17" fill="url(#ms-glow)" />}
      <path d={STAR} fill="#ffd54f" stroke="#e2a12e" strokeWidth="1.4" strokeLinejoin="round" />
      {face && <g fill="#5a3412"><circle cx="-2.6" cy="-0.6" r=".95" /><circle cx="2.6" cy="-0.6" r=".95" /><path d="M-1.6 1.6 Q0 3 1.6 1.6" stroke="#5a3412" strokeWidth=".8" fill="none" strokeLinecap="round" /></g>}
    </g>
  )
}

export function Dust() {
  return (
    <g>
      <circle r="10" fill="url(#ms-glow)" opacity=".8" />
      <path d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6 Z" fill="#fff3b0" stroke="#f2c14e" strokeWidth=".8" />
    </g>
  )
}

export function Cloud() {
  return (
    <g>
      <path d="M-11 4 Q-14 4 -14 0 Q-14 -5 -9 -5 Q-8 -10 -2 -10 Q4 -11 6 -6 Q12 -7 13 -1 Q15 4 10 4 Z" fill="#8a86a8" stroke="#5f5a80" strokeWidth="1.2" />
      <path d="M-5 -1.5 q1.6 1.4 3.2 0 M2 -1.5 q1.6 1.4 3.2 0" stroke="#3a3556" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <path d="M8 7 l-1.5 3 M2 7 l-1.5 3 M-4 7 l-1.5 3" stroke="#9cc0e8" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  )
}

// The jam-jar basket, seen from the front: lid ribbon, glass, a scoop of jam.
export function Jar({ tint = '#f2a65a', label }) {
  return (
    <g>
      <ellipse cy="30" rx="44" ry="7" fill="#000" opacity=".22" />
      <path d="M-38 -16 L38 -16 L34 26 Q34 30 30 30 L-30 30 Q-34 30 -34 26 Z" fill="#cfe7f2" fillOpacity=".55" stroke="#8fb8cc" strokeWidth="2.5" />
      <path d="M-34 6 L34 6 L33 26 Q33 29 30 29 L-30 29 Q-33 29 -33 26 Z" fill="#e7787f" opacity=".85" />
      <rect x="-42" y="-24" width="84" height="10" rx="5" fill={tint} stroke="#8a5232" strokeWidth="2" />
      <path d="M-26 -8 L-24 18" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
      {label && <text y="22" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff8ec" fontFamily="Fredoka, Nunito, sans-serif">{label}</text>}
    </g>
  )
}

export function Bun({ steam = 0, hot = false }) {
  return (
    <g>
      <ellipse cy="16" rx="40" ry="9" fill="#fff" stroke="#d9cbb0" strokeWidth="2" />
      <path d="M-30 10 Q-32 -18 0 -20 Q32 -18 30 10 Q0 18 -30 10 Z" fill={hot ? '#f0b26a' : '#efc07c'} stroke="#b9784a" strokeWidth="2.5" />
      <path d="M-14 -10 Q0 -16 14 -10" stroke="#b9784a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g fill="#5a3412"><circle cx="-8" cy="0" r="2" /><circle cx="8" cy="0" r="2" /></g>
      <path d={hot ? 'M-4 6 Q0 3 4 6' : 'M-4 5 Q0 8 4 5'} stroke="#5a3412" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {hot && <g fill="#e7787f" opacity=".6"><circle cx="-15" cy="4" r="3.5" /><circle cx="15" cy="4" r="3.5" /></g>}
      {Array.from({ length: Math.min(3, 1 + Math.floor(steam / 6)) }, (_, i) => (
        <path key={i} className="ms-steam" style={{ animationDelay: `${i * 0.35}s` }} d={`M${-10 + i * 10} -24 q-5 -7 0 -14 q5 -7 0 -14`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7" />
      ))}
    </g>
  )
}

export function Coin({ size = 16 }) {
  return (
    <svg className="ms-ico" width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true">
      <circle r="9" fill="#f7c45a" stroke="#c27f22" strokeWidth="1.6" />
      <circle r="5.5" fill="none" stroke="#e2a12e" strokeWidth="1.2" />
    </svg>
  )
}

// Control hints for the intro card.
export function Mouse({ size = 26 }) {
  return (
    <svg className="ms-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 3v6" />
    </svg>
  )
}
export function Touch({ size = 26 }) {
  return (
    <svg className="ms-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10V8.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.8-2.4L4 15.5a1.5 1.5 0 0 1 2.3-1.9L9 16" />
    </svg>
  )
}
export function Keys({ size = 26 }) {
  return (
    <svg className="ms-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="12" rx="2.5" /><path d="M6 11h1M10 11h1M14 11h1M18 11h1M7 15h10" strokeLinecap="round" />
    </svg>
  )
}

export const Ico = ({ children, size = 24, view = 32 }) => (
  <svg className="ms-ico" width={size} height={size} viewBox={`${-view / 2} ${-view / 2} ${view} ${view}`} aria-hidden="true">{children}</svg>
)

// A soft starry backdrop (deterministic positions so it doesn't shimmer between renders).
export function Sky({ w = 1000, h = 600, n = 40 }) {
  const dots = []
  let a = 7
  for (let i = 0; i < n; i++) {
    a = (a * 1103515245 + 12345) % 2147483648
    const x = a % w
    a = (a * 1103515245 + 12345) % 2147483648
    dots.push(<circle key={i} cx={x} cy={a % Math.floor(h * 0.7)} r={i % 5 ? 1.3 : 2.2} fill="#fff6dc" opacity={i % 3 ? 0.5 : 0.85} />)
  }
  return <g>{dots}</g>
}
