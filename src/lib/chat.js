// Pure message-list helpers (tested in chat.test.js).

const GROUP_GAP = 5 * 60 * 1000

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
