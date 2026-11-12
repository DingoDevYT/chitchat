// Pure message-list helpers (tested in chat.test.js).
import { tokenize } from './markdown.js'

const GROUP_GAP = 5 * 60 * 1000

// messages.content has CHECK (char_length(content) <= 4000); char_length counts code points, not UTF-16 units.
export const MAX_LEN = 4000
export const overLimit = text => Math.max(0, [...text.trim()].length - MAX_LEN)

export function startsGroup(prev, m) {
  return !prev || prev.author_id !== m.author_id || !!m.reply_to ||
    new Date(m.created_at) - new Date(prev.created_at) > GROUP_GAP
}

// Adds a confirmed row. Replaces our own optimistic copy if there is one; ignores duplicates.
export function mergeIncoming(list, row, { live = true } = {}) {
  if (!list) return list
  if (list.some(m => m.id === row.id)) return list
  const i = list.findIndex(m => m.pending && m.author_id === row.author_id && m.content === row.content)
  if (i >= 0) {
    const copy = [...list]
    copy[i] = { ...row, reactions: list[i].reactions, key: list[i].key }
    return copy
  }
  return [...list, { ...row, reactions: row.reactions || [], key: row.id, _live: live }]
}

// Our own insert came back: swap in the real row for its optimistic one (by id, so it also lands after a send that already
// timed out to "Couldn't send"). Realtime got there first: just drop the optimistic row. Optimistic row deleted: it did send.
export function settleSent(list, tmpId, row) {
  if (!list) return list
  if (list.some(m => m.id === row.id)) return list.filter(m => m.id !== tmpId)
  if (!list.some(m => m.id === tmpId)) return [...list, { ...row, reactions: row.reactions || [], key: row.id }]
  return list.map(m => m.id === tmpId ? { ...row, reactions: m.reactions, key: m.key } : m)
}

export function applyReaction(list, { message_id, user_id, emoji }, on) {
  if (!list) return list
  return list.map(m => {
    if (m.id !== message_id) return m
    const has = m.reactions.some(r => r.user_id === user_id && r.emoji === emoji)
    if (on === has) return m
    return {
      ...m,
      reactions: on ? [...m.reactions, { user_id, emoji }]
        : m.reactions.filter(r => !(r.user_id === user_id && r.emoji === emoji)),
    }
  })
}

// [{emoji, count, mine}] in first-used order.
export function summarizeReactions(reactions, me) {
  const map = new Map()
  for (const r of reactions) {
    const e = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, users: [] }
    e.count++
    e.users.push(r.user_id)
    if (r.user_id === me) e.mine = true
    map.set(r.emoji, e)
  }
  return [...map.values()]
}

const MEDIA_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
}

// Direct media links in message text → attachment-shaped embeds. Skips code and spoilers.
export function mediaLinks(text) {
  const walk = ts => ts.flatMap(t => t.t === 'url' ? [t.v] : t.c && t.t !== 'spoiler' ? walk(t.c) : [])
  const seen = new Set()
  return walk(tokenize(text || '')).flatMap(url => {
    try {
      const path = new URL(url).pathname
      const type = MEDIA_EXT[path.match(/\.(\w+)$/)?.[1].toLowerCase()]
      if (!type || seen.has(url)) return []
      seen.add(url)
      return [{ url, type, name: decodeURIComponent(path.split('/').pop()), link: true }]
    } catch { return [] }
  })
}
