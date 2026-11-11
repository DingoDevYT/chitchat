// Pure helpers for chat cues: mentions, the "New messages" divider, DM card previews, last seen (tested in cues.test.js).
import { tokenize } from './markdown.js'

// "@name" as a whole mention: not inside an email/another mention, not a longer name (@pipx, @pip.other).
// Mirrors public.mention_counts() in supabase/migrations/023_chat_cues.sql.
export const mentionRx = username =>
  new RegExp(`(^|[^a-z0-9_@])@${username.replace(/\./g, '\\.')}([^a-z0-9_.]|\\.([^a-z0-9_]|$)|$)`, 'i')
export const mentionsMe = (content, username) => !!username && !!content && mentionRx(username).test(content)

// Id of the first message after lastRead from someone else, once the boundary is loaded (else null).
// lastRead null = no divider. Optimistic rows (string ids) are skipped.
export function firstUnreadId(msgs, lastRead, meId, hasMore) {
  if (lastRead == null || !msgs?.length) return null
  const real = msgs.filter(m => typeof m.id === 'number')
  if (hasMore && !(real[0]?.id <= lastRead)) return null
  return real.find(m => m.id > lastRead && m.author_id !== meId)?.id ?? null
}

// Newest page (rows, ascending) merged into what's loaded: older history is kept when it overlaps the page
// (no gap), unsent rows (string ids: pending, queued, failed) and anything newer always are.
export function mergeRecent(cur, rows) {
  const first = rows[0]?.id ?? Infinity, last = rows.at(-1)?.id ?? 0
  const real = (cur || []).filter(m => typeof m.id === 'number')
  const older = real.some(m => m.id >= first && m.id <= last) ? real.filter(m => m.id < first) : []
  return [...older, ...rows, ...(cur || []).filter(m => typeof m.id !== 'number' || m.id > last)]
}

// One-line plain-text preview: markdown and custom emoji stripped, attachments as "📎 image" etc.
export function previewText(m, max = 80) {
  if (!m) return ''
  const flat = ts => ts.map(t => t.t === 'cemoji' ? `:${t.name}:` : t.t === 'mention' ? '@' + t.v : t.t === 'spoiler' ? '▒▒▒' : t.c ? flat(t.c) : t.v).join('')
  const text = flat(tokenize(m.content || '')).replace(/\s+/g, ' ').trim()
  if (text) return text.length > max ? text.slice(0, max - 1) + '…' : text
  const a = m.attachments?.[0]
  if (!a) return ''
  const kind = a.gif ? 'GIF' : a.type?.split('/')[0]
  const label = { image: 'image', video: 'video', audio: 'audio' }[kind] || (kind === 'GIF' ? 'GIF' : 'file')
  const more = m.attachments.length > 1 ? ` +${m.attachments.length - 1}` : ''
  return `📎 ${label}${more}`
}

// "last seen 2h ago"-style text, or '' when unknown.
export function lastSeenText(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!iso || Number.isNaN(t)) return ''
  const s = Math.max(0, (now - t) / 1000)
  if (s < 90) return 'last seen just now'
  if (s < 3600) return `last seen ${Math.round(s / 60)}m ago`
  if (s < 86400) return `last seen ${Math.round(s / 3600)}h ago`
  const d = Math.round(s / 86400)
  if (d === 1) return 'last seen yesterday'
  if (d < 30) return `last seen ${d}d ago`
  return `last seen ${new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: d > 330 ? 'numeric' : undefined })}`
}

export const SEEN_EVERY = 5 * 60 * 1000
// Write last_seen_at? Never while invisible; otherwise at most every SEEN_EVERY (force: on pagehide).
export const shouldMarkSeen = (status, lastWrite, now = Date.now(), force = false) =>
  status !== 'invisible' && (force || now - (lastWrite || 0) >= SEEN_EVERY)
