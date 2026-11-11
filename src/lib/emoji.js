// Emoji picker data: emojibase compact list, fetched once on first open.
// Pinned to 15.3.x (Emoji 15.1), the same Unicode version Noto v2.047 covers, so every emoji has an image.
const DATA = 'https://cdn.jsdelivr.net/npm/emojibase-data@15.3.2/en/compact.json'
export const GROUPS = [ // emojibase group ids; 2 (skin components) and ungrouped regional indicators are left out
  [0, 'Smileys', '😀'], [1, 'People', '👋'], [3, 'Nature', '🌿'], [4, 'Food', '🍕'], [6, 'Activities', '⚽'],
  [5, 'Travel', '✈️'], [7, 'Objects', '💡'], [8, 'Symbols', '💖'], [9, 'Flags', '🏁'],
]

let cache
export function loadEmoji() {
  cache ??= fetch(DATA).then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
    .then(list => list.filter(e => GROUPS.some(g => g[0] === e.group)))
    .catch(err => { cache = null; throw err }) // let the next open retry
  return cache
}

// Same form as typed/pasted emoji, so picker reactions match QUICK_EMOJI ones: FE0F only where Unicode needs it.
export const normalize = s => s.replace(/(\p{Emoji_Presentation})️/gu, '$1')

// tone 0 = default, 1–5 = light…dark. Multi-person emoji pick the variant where everyone has that tone.
export function withSkin(e, tone) {
  const mod = (0x1f3fa + tone).toString(16).toUpperCase()
  const s = tone && e.skins?.find(s => s.hexcode.split('-').filter(h => /^1F3F[B-F]$/.test(h)).every(h => h === mod))
  return normalize((s || e).unicode)
}

export function searchEmoji(list, q) {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return list.filter(e => words.every(w => e.label.toLowerCase().includes(w) || e.tags?.some(t => t.startsWith(w))))
}
