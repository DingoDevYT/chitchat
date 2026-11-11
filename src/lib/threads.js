// "just now", "3m ago", "2h ago", "4d ago", then a date.
export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

// Active (unarchived) threads under a channel, most recently active first.
export const activeThreads = (channels, parentId) => channels
  .filter(c => c.kind === 'thread' && c.parent_channel_id === parentId && !c.archived)
  .sort((a, b) => new Date(b.last_reply_at || b.created_at) - new Date(a.last_reply_at || a.created_at))

export const replies = n => `${n} ${n === 1 ? 'reply' : 'replies'}`
