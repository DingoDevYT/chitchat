// Pure helpers for stadium UX cues (badges, peer connection state, join/leave chimes, "in a stadium" tags).

// RTCPeerConnection -> 'connecting' | 'connected' | 'failed', or null once closed.
// connectionState first; iceConnectionState for browsers without it. 'disconnected' often recovers, so it reads as connecting.
export function peerStatus(conn, ice) {
  const s = conn || ice
  if (s === 'closed') return null
  if (s === 'connected' || s === 'completed') return 'connected'
  if (s === 'failed') return 'failed'
  return 'connecting'
}

// Who joined/left between two member-id lists (yourself excluded). prev null = first snapshot, nothing to report.
export function diffMembers(prev, next, meId) {
  if (!prev) return { joined: [], left: [] }
  return {
    joined: next.filter(id => id !== meId && !prev.includes(id)),
    left: prev.filter(id => id !== meId && !next.includes(id)),
  }
}

// Tag under a name for someone in a stadium. Not visible to you -> generic text and nothing to open.
export function stadiumLabel(voiceId, channels = []) {
  if (!voiceId) return null
  const c = channels.find(x => x.id === voiceId)
  return c ? { text: `🏟️ in ${c.name}`, serverId: c.server_id || null, channelId: c.id } : { text: '🏟️ in a stadium' }
}

// Two soft notes: rising for a join, falling for a leave.
export const CHIME = { join: [523.25, 783.99], leave: [783.99, 523.25] } // C5 G5

// Plays a chime on an AudioContext into `dest` (the call's output mix, so output volume/device/deafen apply).
export function playChime(ctx, dest, kind, peak = 0.06) {
  const t0 = ctx.currentTime
  CHIME[kind].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.11
    o.type = 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + 0.24)
  })
}
