import { useEffect, useState } from 'react'
import { prefs } from './lib/store'
import { useMemberColor } from './Roles'
import { cropBox } from './lib/crop'
import './styles/avatar-crop.css'
import { talking, online, useProfile } from './lib/store'
import { statusOf, activeCustom } from './lib/status'
import { Emoji } from './Markdown'
import './styles/statuses.css'

const STATUS_LABEL = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' }
export const useStatus = id => online.use(s => statusOf(s[id]))

// Live custom status: from presence while they're online, else their saved profile. Re-renders at expiry.
export function useCustomStatus(id) {
  const live = online.use(s => s[id] && (s[id].cs || null))
  const p = useProfile(id)
  const cs = live !== undefined ? live : p?.custom_status
  const [, bump] = useState(0)
  const exp = cs?.expires_at ? Date.parse(cs.expires_at) : 0
  useEffect(() => {
    if (!exp) return
    const t = setTimeout(() => bump(n => n + 1), Math.min(Math.max(exp - Date.now(), 0) + 50, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [exp])
  return activeCustom(cs)
}

export function CustomStatus({ id, className = '' }) {
  const cs = useCustomStatus(id)
  if (!cs) return null
  return <span className={`custom-status muted small ${className}`} title={cs.text || undefined}>
    {cs.emoji && <Emoji e={cs.emoji} />}{cs.text && <span>{cs.text}</span>}
  </span>
}

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

// First frame of an animated image as a small PNG data URL (falls back to the original if CORS blocks it).
const stills = new Map()
function still(src) {
  if (!stills.has(src)) stills.set(src, new Promise(res => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => {
      try {
        const k = Math.min(1, 256 / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement('canvas')
        c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k)
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height)
        res(c.toDataURL())
      } catch { res(src) }
    }
    i.onerror = () => res(src)
    i.src = src
  }))
  return stills.get(src)
}
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Avatar-like image: applies stored crop framing (animated uploads) and freezes animation per prefs until hovered.
export function CropImg({ src, crop }) {
  const animated = !!crop || /\.gif$/i.test(src)
  const mode = prefs.use(s => s.animateAvatars)
  const [hover, setHover] = useState(false)
  const freeze = animated && (mode === 'hover' || reducedMotion) && !hover
  const [frame, setFrame] = useState(null)
  useEffect(() => {
    if (!freeze) return
    let on = true
    still(src).then(u => on && setFrame({ src, u }))
    return () => { on = false }
  }, [freeze, src])
  const shown = freeze ? frame?.src === src && frame.u : src
  const hov = animated ? { onPointerEnter: () => setHover(true), onPointerLeave: () => setHover(false) } : null
  if (!crop) return shown ? <img src={shown} alt="" draggable="false" {...hov} /> : <span className="cimg" {...hov} />
  const b = cropBox(crop)
  return (
    <span className="cimg" {...hov}>
      {shown && <img className="framed" src={shown} alt="" draggable="false"
        style={{ width: b.w + '%', height: b.h + '%', left: b.left + '%', top: b.top + '%', transform: `rotate(${b.rot}deg)` }} />}
    </span>
  )
}

// PNGtuber avatar: idle image, swaps to the talking image (or bounces) while the user speaks.
// Children (a webcam <video>) replace the face, in a ring of the user's colour.
export default function Avatar({ id, size = 40, status = false, children }) {
  const p = useProfile(id)
  const talk = talking.use(s => (s[id] || 0) > 0 || !!s['v:' + id])
  const st = useStatus(id)
  return (
    <span className={`avatar${talk ? ' talking' : ''}${children ? ' cam' : ''}`} style={{ width: size, height: size, '--ring': p?.color }}>
      {children || (p?.avatar_idle
        ? (talk && p.avatar_talk ? <CropImg src={p.avatar_talk} crop={p.avatar_talk_crop} /> : <CropImg src={p.avatar_idle} crop={p.avatar_crop} />)
        : <Critter size={size} color={p?.color} talk={talk} />)}
      {status && <i className={`dot st-${st}${st === 'online' ? ' on' : ''}`} role="img" aria-label={STATUS_LABEL[st]} title={STATUS_LABEL[st]} />}
    </span>
  )
}

// serverId: colour by the member's highest coloured role there, else the profile colour.
export function Name({ id, serverId }) {
  const p = useProfile(id)
  const roleColor = useMemberColor(serverId, id)
  return <span className="name" style={{ color: roleColor || p?.color }}>{p?.display_name || p?.username || '…'}</span>
}
