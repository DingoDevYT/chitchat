import { ICONS } from './paths'
import { hash, sketch } from '../lib/sketch'
import './icons.css'

// Each icon is sketched once (seeded by its name), so the wobble never changes between renders.
const cache = new Map()
function drawn(name) {
  if (!cache.has(name)) cache.set(name, ICONS[name] && sketch(ICONS[name], hash(name)))
  return cache.get(name)
}

// <Icon name="mic" /> · size in px (default 20) or any CSS length like '1.1em' to follow the text.
// Decorative (aria-hidden) unless a title is given; icon-only buttons keep their own aria-label.
export default function Icon({ name, size = 20, title, className }) {
  const d = drawn(name)
  if (!d) return name ?? null // unknown name: show it as text (e.g. an emoji passed by older code) rather than nothing
  return (
    <svg className={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={typeof size === 'number' && size <= 16 ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round"
      focusable="false" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}
