// Which links in a message get preview cards (tested in linkpreview.test.js).
import { tokenize } from './markdown.js'
import { mediaLinks } from './chat.js'

// Same cache key the link-preview edge function uses: parsed href without the #fragment.
export function normUrl(s) {
  try { const u = new URL(s); u.hash = ''; return u.href } catch { return null }
}

// Up to 3 non-media http(s) links, skipping code and spoilers (tokenize keeps code as plain text).
export function previewLinks(text) {
  const walk = ts => ts.flatMap(t => t.t === 'url' ? [t.v] : t.c && t.t !== 'spoiler' ? walk(t.c) : [])
  const media = new Set(mediaLinks(text).map(m => m.url))
  const out = []
  for (const raw of walk(tokenize(text || ''))) {
    const u = !media.has(raw) && normUrl(raw)
    if (u && !out.includes(u)) out.push(u)
  }
  return out.slice(0, 3)
}
