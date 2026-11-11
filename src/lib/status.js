export const STATUSES = [
  ['online', 'Online', 'Around and happy to chat'],
  ['idle', 'Idle', 'Away from the keyboard for a bit'],
  ['dnd', 'Do Not Disturb', 'Mutes typing sounds and message pop-ups'],
  ['invisible', 'Invisible', "You'll look offline, but can still chat"],
]
export const IDLE_AFTER = 10 * 60 * 1000

// Status shown to others for a presence meta (undefined = not tracked = offline).
export function statusOf(meta) {
  if (!meta || meta.status === 'invisible') return 'offline'
  return meta.status || 'online'
}

// Auto-idle only ever downgrades a plain Online.
export function effectiveStatus(chosen, idle) {
  return (chosen || 'online') === 'online' && idle ? 'idle' : chosen || 'online'
}

export function activeCustom(cs, now = Date.now()) {
  if (!cs || !(cs.text || cs.emoji)) return null
  return !cs.expires_at || Date.parse(cs.expires_at) > now ? cs : null
}

export const CLEAR_AFTER = [['30m', '30 minutes'], ['1h', '1 hour'], ['4h', '4 hours'], ['today', 'Today'], ['never', "Don't clear"]]
export function expiryFor(choice, now = new Date()) {
  const mins = { '30m': 30, '1h': 60, '4h': 240 }[choice]
  if (mins) return new Date(now.getTime() + mins * 60000).toISOString()
  if (choice === 'today') { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.toISOString() }
  return null
}
