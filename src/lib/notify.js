// Pure notification logic: levels, who gets pinged, desktop-notification rules and composer autocomplete (notify.test.js).
import { mentionsMe } from './cues.js'

export const LEVELS = [['all', 'All messages'], ['mentions', 'Only @mentions'], ['none', 'Nothing']]
export const levelLabel = l => LEVELS.find(x => x[0] === l)?.[1] || ''
export const BIG = 15 // servers with more members default to Only @mentions; @everyone in a bigger room asks first

export const defaultLevel = (c, sizes) => !c?.server_id ? 'all' : (sizes?.[c.server_id] || 0) > BIG ? 'mentions' : 'all'

// Room → category → server → default. Post discussions follow their gallery. skipOwn: what the room would inherit.
export function effectiveLevel(settings, c, sizes, parentOf = () => null, skipOwn = false) {
  if (!c) return 'all'
  const room = (c.kind === 'post' && parentOf(c.parent_channel_id)) || c
  for (const id of [skipOwn ? null : room.id, room.category_id, c.server_id]) {
    const l = id && settings?.[id]?.level
    if (l) return l
  }
  return defaultLevel(c, sizes)
}

// A message_pings kind still counts after the server's suppress switches (mirrors public.mention_counts()).
export const pingCounts = (kind, srv) => !!kind &&
  !((kind === 'everyone' || kind === 'here') && srv?.suppress_everyone) && !(kind === 'role' && srv?.suppress_roles)

// Desktop notification for a new message? `here` = it's in the room you're looking at.
export function shouldNotify({ level, pinged, mine, dnd, muted, blocked, here, ageMs }) {
  if (mine || dnd || muted || blocked || here || level === 'none' || !(ageMs < 120000)) return false
  return level === 'all' || !!pinged
}

// Role @handle: lower case, runs of anything else become _, trimmed. Mirrors public.role_handle().
export const roleHandle = name => (name || '').toLowerCase().replace(/[^a-z0-9_.]+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 32)

// '@everyone' | '@here' | null: the big ping in a message, same word boundary as @username mentions.
export const bigPing = text => mentionsMe(text, 'everyone') ? 'everyone' : mentionsMe(text, 'here') ? 'here' : null

// What's being typed at the caret: '@name' or '~room' after a space/start. { kind, q, start } or null.
export function acTrigger(before) {
  const m = before.match(/(^|[\s(])([@~])([^\s@~]{0,32})$/)
  return m ? { kind: m[2], q: m[3].toLowerCase(), start: before.length - m[3].length - 1 } : null
}

const rank = (s, q) => { const i = s.toLowerCase().indexOf(q); return i < 0 ? Infinity : i }

// @ suggestions: @everyone/@here and roles only when you may ping them, then people. Best match first, 8 max.
export function mentionItems(q, { people = [], roles = [], canPing = false }) {
  const out = []
  if (canPing) {
    for (const [k, sub] of [['everyone', 'Everyone in this room'], ['here', 'Everyone online here']])
      if (k.startsWith(q)) out.push({ key: k, insert: '@' + k, label: '@' + k, sub, kind: 'big' })
    for (const r of roles) {
      const h = roleHandle(r.name)
      if (h.length >= 2 && (rank(h, q) < Infinity || rank(r.name, q) < Infinity)) out.push({ key: r.id, insert: '@' + h, label: '@' + h, sub: r.name, color: r.color, kind: 'role', r: rank(h, q) })
    }
  }
  const ps = people.map(p => ({ key: p.id, insert: '@' + p.username, label: p.display_name || p.username, sub: '@' + p.username, kind: 'user', id: p.id,
    r: Math.min(rank(p.username, q), rank(p.display_name || '', q)) })).filter(p => p.r < Infinity)
  return [...out.filter(x => x.kind === 'big'), ...[...out.filter(x => x.kind === 'role'), ...ps].sort((a, b) => a.r - b.r)].slice(0, 8)
}

// ~ suggestions: text rooms whose name contains q (spaces ignored), best match first.
export function roomItems(q, rooms = []) {
  const flat = s => s.toLowerCase().replace(/\s+/g, '')
  return rooms.filter(c => c.kind === 'text').map(c => ({ c, r: rank(flat(c.name), q) })).filter(x => x.r < Infinity)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name)).slice(0, 8).map(x => x.c)
}

// Room links are stored as <~name:id> (the name is a fallback for previews and deleted rooms).
export const roomToken = c => `<~${c.name.replace(/[<>\n]/g, '').slice(0, 64)}:${c.id}>`
// Rooms picked from the popup show as ~name in the box; on send they become tokens (one pass, longest names first).
export function encodeRooms(text, picked = []) {
  if (!picked.length) return text
  const list = [...picked].sort((a, b) => b.name.length - a.name.length)
  const rx = new RegExp('~(' + list.map(c => c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  return text.replace(rx, (_, n) => roomToken(list.find(c => c.name === n)))
}
