import { talking, online, useProfile } from './lib/store'

// Default avatar: a little critter whose mouth flaps when its owner talks.
export function Critter({ size = 40, color = '#f4a261', talk = false }) {
  return (
    <svg className={`critter${talk ? ' talk' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g className="critter-body">
        <circle cx="16" cy="16" r="9" fill={color} />
        <circle cx="48" cy="16" r="9" fill={color} />
        <circle cx="16" cy="16" r="4" fill="#00000022" />
        <circle cx="48" cy="16" r="4" fill="#00000022" />
        <circle cx="32" cy="36" r="24" fill={color} />
        <ellipse cx="18" cy="42" rx="4" ry="2.5" fill="#ff6b8b55" />
        <ellipse cx="46" cy="42" rx="4" ry="2.5" fill="#ff6b8b55" />
        <g className="critter-eyes">
          <ellipse cx="24" cy="33" rx="3" ry="4" fill="#231d2b" />
          <ellipse cx="40" cy="33" rx="3" ry="4" fill="#231d2b" />
        </g>
        {talk
          ? <ellipse className="critter-mouth" cx="32" cy="45" rx="5" ry="4" fill="#231d2b" />
          : <path d="M27 43 Q32 47 37 43" stroke="#231d2b" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      </g>
    </svg>
  )
}

// PNGtuber avatar: idle image, swaps to the talking image (or bounces) while the user speaks.
export default function Avatar({ id, size = 40, status = false }) {
  const p = useProfile(id)
  const talk = talking.use(s => (s[id] || 0) > 0 || !!s['v:' + id])
  const isOnline = online.use(s => !!s[id])
  return (
    <span className={`avatar${talk ? ' talking' : ''}`} style={{ width: size, height: size }}>
      {p?.avatar_idle
        ? <img src={talk && p.avatar_talk ? p.avatar_talk : p.avatar_idle} alt="" width={size} height={size} draggable="false" />
        : <Critter size={size} color={p?.color} talk={talk} />}
      {status && <i className={`dot${isOnline ? ' on' : ''}`} />}
    </span>
  )
}

export function Name({ id }) {
  const p = useProfile(id)
  return <span className="name" style={{ color: p?.color }}>{p?.display_name || p?.username || '…'}</span>
}
