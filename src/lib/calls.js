// Pure helpers for calls in DMs / group DMs (DMCalls.jsx). A DM call is a VoiceConnection on the topic 'call:<dm id>'.

export const RING_MS = 30_000 // ring this long, then it's a missed call
export const ALONE_MS = 180_000 // a call you're alone in ends after this

// Global presence is visible to every signed-in user, so a DM call publishes a per-person key (FNV-1a of DM id + user id)
// instead of the DM id: members can match it, outsiders can't tell which DM it is or pair two people by it.
export function callKey(cid, uid) {
  let h = 0x811c9dc5
  for (const ch of cid + uid) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return 'call:' + (h >>> 0).toString(36)
}

// DM id -> 'id,id' of members in a call there (strings, so store selectors stay cheap to compare).
export function dmCalls(online, channels) {
  const out = {}
  for (const c of channels) {
    if (c.kind !== 'dm') continue
    const ids = (c.channel_members || []).map(m => m.user_id).filter(u => online[u]?.voice === callKey(c.id, u))
    if (ids.length) out[c.id] = ids.join(',')
  }
  return out
}

// Calls that appeared since the last snapshot and should ring you: not one you're in, not only people you blocked.
export function newRings(before, next, meId, blocked = {}) {
  return Object.keys(next).filter(cid => {
    if (before[cid]) return false
    const ids = next[cid].split(',')
    return !ids.includes(meId) && ids.some(id => !blocked[id])
  })
}

// "Call · 12m" style lengths.
export function callLength(secs) {
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}
