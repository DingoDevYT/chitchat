// Animated room/stadium themes: ids, picker metadata and the inheritance rules. Pure, so it's testable.
// Keep THEME_IDS in sync with the CHECK constraint in supabase/migrations/027_themes.sql.

// colors: [top, middle, bottom] of the theme's base gradient (previews, the "Off" setting, the backdrop under the scene).
export const THEMES = [
  { id: 'none', name: 'None', emoji: '⬜', colors: null },
  { id: 'gradient', name: 'Soft gradient', emoji: '🎨', colors: null },
  { id: 'beach', name: 'Beach day', emoji: '🏖️', colors: ['#8fd8f2', '#c9eef7', '#f2d8a2'] },
  { id: 'night', name: 'Starry night', emoji: '🌙', colors: ['#10163a', '#262a62', '#4b3a74'] },
  { id: 'rain', name: 'Rainy window', emoji: '🌧️', colors: ['#252e40', '#36435a', '#4f5a76'] },
  { id: 'forest', name: 'Firefly forest', emoji: '🌲', colors: ['#0f1f22', '#173229', '#2a4a32'] },
  { id: 'snow', name: 'Snowfall', emoji: '❄️', colors: ['#a9c3e2', '#d4e3f3', '#f4f9ff'] },
  { id: 'sakura', name: 'Sakura breeze', emoji: '🌸', colors: ['#ffd3e1', '#ffe9ef', '#fff6ee'] },
  { id: 'sea', name: 'Under the sea', emoji: '🐠', colors: ['#1a7aa0', '#0d5677', '#082f4a'] },
  { id: 'synthwave', name: 'Synthwave', emoji: '🌆', colors: ['#14072b', '#3d1160', '#b8327d'] },
  { id: 'campfire', name: 'Campfire', emoji: '🔥', colors: ['#0e0b18', '#22152a', '#46221c'] },
]
export const THEME_IDS = THEMES.map(t => t.id)
const byId = Object.fromEntries(THEMES.map(t => [t.id, t]))

export const isTheme = id => Object.hasOwn(byId, id ?? '')
export const themeMeta = id => byId[id] || byId.none
// a scene theme draws something animated; 'none' and 'gradient' don't
export const isScene = id => !!byId[id]?.colors

// Effective theme of a room or stadium: its own → its category's → its server's → none. DMs and threads: none.
// Returns { id, from } where from is 'channel' | 'category' | 'server' | null (nothing set anywhere).
// Pass channel = null to ask what a new/inheriting channel would get.
export function resolveTheme({ channel, category, server }) {
  if (channel && (channel.kind === 'dm' || channel.kind === 'thread' || !channel.server_id)) return { id: 'none', from: null }
  for (const [from, row] of [['channel', channel], ['category', category], ['server', server]])
    if (isTheme(row?.theme)) return { id: row.theme, from }
  return { id: 'none', from: null }
}

// Animated themes setting: 'full' | 'subtle' | 'off'
export const INTENSITIES = ['full', 'subtle', 'off']
export const normIntensity = v => INTENSITIES.includes(v) ? v : 'full'

// Deterministic scatter for particles (stars, flakes, bubbles…): same layout on every render and every client.
// Returns n items of { x, y, r, t } with each value in [0, 1).
export function scatter(n, seed = 1) {
  let a = seed >>> 0
  const rnd = () => { // mulberry32
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: rnd(), t: rnd() }))
}
