// Local channel/server/DM mutes: prefs.mutes = { [id]: true (until unmuted) | expiry timestamp in ms }.
export const MUTE_FOR = [['For 15 minutes', 15], ['For 1 hour', 60], ['For 8 hours', 480], ['Until I turn it back on', null]]

export const muteValue = (minutes, now = Date.now()) => minutes ? now + minutes * 60000 : true
export const isMuted = (mutes, id, now = Date.now()) => !!id && (mutes?.[id] === true || mutes?.[id] > now)
// A channel is quiet if it, or its server, is muted.
export const channelMuted = (mutes, c, now = Date.now()) => !!c && (isMuted(mutes, c.id, now) || isMuted(mutes, c.server_id, now))
// Soonest timed mute still ahead, so the UI can re-check when it runs out.
export function nextExpiry(mutes, now = Date.now()) {
  const t = Object.values(mutes || {}).filter(v => typeof v === 'number' && v > now)
  return t.length ? Math.min(...t) : null
}
