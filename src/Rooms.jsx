import { useEffect, useState } from 'react'
import { CropImg } from './Avatar'
import { Emoji } from './Markdown'
import { DEFAULT_FONT, fmtLeft, fmtSlow, fontHref, fontOf, iconKind, inkFor, isMediaUrl, roomAccent, shrinkOf } from './lib/rooms'
import './styles/rooms.css'
import Icon from './icons/Icon'

// One <link> per font, injected the first time something shows it (Nunito comes with index.html).
const fontsIn = new Set([DEFAULT_FONT])
export function ensureFont(name) {
  const f = fontOf(name)
  if (!f || fontsIn.has(f.name)) return
  fontsIn.add(f.name)
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = fontHref(f)
  document.head.appendChild(l)
}
export const fontFamily = name => `'${name}', 'Nunito', system-ui, sans-serif`

// CSS variables for a room's accent (falls back to the server accent, then the app accent in CSS).
export function roomVars(c, server) {
  const a = roomAccent(c, server)
  return a ? { '--room-accent': a, '--room-ink': inkFor(a) } : undefined
}

// Room icon: emoji, custom server emoji or uploaded image; default stadium doodle for stadiums, a soft dot for rooms.
export function RoomIcon({ c, className = '' }) {
  const k = iconKind(c.icon)
  return (
    <span className={`ch-icon room-icon ${className}`} aria-hidden="true">
      {k === 'image' ? <img src={c.icon} alt="" draggable="false" loading="lazy" />
        : k ? <Emoji e={c.icon} />
          : c.kind === 'voice' ? <Icon name="stadium" size={18} /> : c.kind ? <i className="room-dot" /> : null}
    </span>
  )
}

// A room's name in its font (sidebar and header only; messages keep the app font).
export function RoomName({ c, as: Tag = 'span', className = '' }) {
  const f = fontOf(c.font)
  useEffect(() => { if (f) ensureFont(f.name) }, [f])
  const custom = f && f.name !== DEFAULT_FONT
  return <Tag className={`${className} room-font${f?.small ? ' font-small' : ''}`} style={custom ? { fontFamily: fontFamily(f.name) } : undefined}>{c.name}</Tag>
}

// Banner art kept at 4:1 and covering whatever box it sits in (the parent is a size container).
function Art({ url, crop }) {
  return isMediaUrl(url) ? <span className="room-art"><CropImg src={url} crop={crop} /></span> : null
}

// Faint strip of the banner (or accent) behind a sidebar row / category header.
export function RoomTint({ c }) {
  if (!isMediaUrl(c.banner_url) && !c.accent) return null
  return <span className="room-tint" aria-hidden="true"><Art url={c.banner_url} crop={c.banner_crop} /></span>
}

// Icon, name and topic over the banner, for a .chat-head.room-head (the art is absolutely positioned behind).
export function RoomTitle({ c }) {
  return <>
    <span className={`room-head-bg${isMediaUrl(c.banner_url) ? ' has-banner' : ''}`} aria-hidden="true">
      <Art url={c.banner_url} crop={c.banner_crop} /><i className="room-head-fade" />
    </span>
    <RoomIcon c={c} className="room-head-icon" />
    <span className="room-head-text">
      <RoomName as="h2" c={c} />
      {c.topic && <span className="room-topic" title={c.topic}>{c.topic}</span>}
    </span>
  </>
}

// Shrinks the header banner to a slim bar as you scroll up (sets --shrink 0..1 on the header, no re-renders).
export function useBannerShrink(scrollRef, headRef, on) {
  useEffect(() => {
    const el = scrollRef.current, h = headRef.current
    if (!on || !el || !h) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // scroll range minus header height stays the same while the header resizes, so a short chat can't flicker
        const room = el.scrollHeight - el.clientHeight - h.offsetHeight
        let s = room > 100 ? shrinkOf(el.scrollTop) : 0
        if (reduce) s = s > 0.3 ? 1 : 0
        h.style.setProperty('--shrink', s.toFixed(3))
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => { el.removeEventListener('scroll', update); cancelAnimationFrame(raf) }
  }, [scrollRef, headRef, on])
}

// Stable layer behind the scroller: the room background image (dimmed/blurred), plus anything else layered there (themes).
export function RoomBackdrop({ c, children }) {
  const bg = isMediaUrl(c.background_url)
  return (
    <div className="chat-backdrop" aria-hidden="true">
      {children}
      {bg && <div className="room-bg" style={{ '--dim': (c.background_dim ?? 70) / 100 }}>
        <span className="room-bg-img" style={{ backgroundImage: `url("${c.background_url}")` }} />
      </div>}
    </div>
  )
}

// Seconds until `until` (ms timestamp), ticking while it counts down.
export function useSlowLeft(until) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!until) return
    const tick = () => { const n = Date.now(); setNow(n); if (n >= until) clearInterval(t) }
    const t = setInterval(tick, 250)
    tick()
    return () => clearInterval(t)
  }, [until])
  return until ? Math.max(0, (until - now) / 1000) : 0
}

export function SlowBadge({ sec, left, exempt }) {
  return (
    <span className={`slow-badge${left > 0 ? ' waiting' : ''}`} role="status"
      title={exempt ? "Slowmode is on, but you're exempt" : `Slowmode: one message every ${fmtSlow(sec)}`}>
      <Icon name="snail" size={15} /> Slowmode: {fmtSlow(sec)}{exempt ? ' · exempt' : left > 0 && <b> · {fmtLeft(left)}</b>}
    </span>
  )
}
