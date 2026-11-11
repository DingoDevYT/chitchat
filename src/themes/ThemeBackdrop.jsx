import { lazy, Suspense } from 'react'
import { prefs } from '../lib/store'
import { categories } from '../lib/categories'
import { isScene, normIntensity, resolveTheme, themeMeta } from '../lib/themes'
import '../styles/themes.css'

// Each scene is its own chunk, fetched the first time something shows it.
const loaders = {
  beach: () => import('./scenes/Beach'),
  night: () => import('./v2/Night'),
  rain: () => import('./v2/Rain'),
  forest: () => import('./v2/Forest'),
  snow: () => import('./scenes/Snow'),
  sakura: () => import('./scenes/Sakura'),
  sea: () => import('./v2/Sea'),
  synthwave: () => import('./v2/Synthwave'),
  campfire: () => import('./v2/Campfire'),
}
// painted redos (src/themes/v2) sit on a shared paper grain
const PAINTED = new Set(['rain', 'sea', 'synthwave', 'night', 'forest', 'campfire'])
const scenes = {}
const sceneOf = id => scenes[id] ||= lazy(loaders[id])

// Pause every theme animation while the tab is hidden (themes.css: body.tb-hidden).
if (typeof document !== 'undefined') {
  const sync = () => document.body.classList.toggle('tb-hidden', document.hidden)
  document.addEventListener('visibilitychange', sync)
  sync()
}

// Theme registry entry: { id, name, emoji, colors, component } (component is lazy; null for none/gradient).
export const themeEntry = id => ({ ...themeMeta(id), component: isScene(id) ? sceneOf(id) : null })

// Layered animated scene behind a room's messages or a stadium. Purely decorative: aria-hidden, no pointer events.
// variant: 'room' (subtle, scrimmed for text) | 'stadium' (more dramatic) | 'thumb' (picker preview).
export default function ThemeBackdrop({ theme, variant = 'room', intensity }) {
  const pref = prefs.use(s => s.animatedThemes)
  const level = normIntensity(intensity || pref)
  if (!theme || theme === 'none') return null
  const meta = themeMeta(theme)
  const Scene = level !== 'off' && isScene(theme) ? sceneOf(theme) : null
  const c = meta.colors
  return (
    <div className={`theme-backdrop tb-${theme} tb-${variant} tb-${level}${meta.dark ? ' tb-dark' : ' tb-light'}`} aria-hidden="true"
      style={c ? { '--c1': c[0], '--c2': c[1], '--c3': c[2] } : undefined}>
      {Scene && <Suspense fallback={null}><div className="tb-scene"><Scene variant={variant} /></div></Suspense>}
      {Scene && PAINTED.has(theme) && <div className="tb-grain" />}{/* under the scrim: over it, it greys the cream Day look */}
      <div className="tb-scrim" />
    </div>
  )
}

// Live mini preview for pickers: the stadium scene drawn at 4x and scaled down, so proportions match the real thing.
export function ThemeThumb({ theme }) {
  return <span className="theme-thumb"><span className="theme-thumb-in"><ThemeBackdrop theme={theme} variant="thumb" /></span></span>
}

// The effective theme of a room/stadium, from rows Shell and the sidebar already keep live (no extra subscriptions).
// A room's own background image (rooms editor) replaces an animated theme: the photo is the more deliberate choice,
// and an animated scene on top of a photo hurts readability.
export function useRoomTheme(channel, server) {
  const category = categories.use(s => channel?.category_id ? s[channel.server_id]?.find(c => c.id === channel.category_id) : undefined)
  if (!channel || (channel.kind === 'text' && channel.background_url)) return 'none'
  return resolveTheme({ channel, category, server }).id
}
