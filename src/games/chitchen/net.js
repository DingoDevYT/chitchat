// Walking together: each client owns its own position and broadcasts it ~10 times a second on a Supabase Realtime
// broadcast channel for the game (only when it moved, plus a 1 s heartbeat). Others are drawn ~120 ms in the past,
// interpolated between their last samples. Positions never go to the referee except on moves that need them.
// Roles never go into a broadcast. Emote stamps ride the same channel.
import { supabase } from '../../lib/supabase'
import { makeTrack, shouldSend } from './space.js'
export { makeTrack, shouldSend }

// The live channel. gameId 'lab' (the dev lab) has no network: everything stays local.
export function createNet(gameId, me, { onEmote } = {}) {
  const tracks = new Map()
  let prev = null, ch = null
  if (gameId && gameId !== 'lab') {
    // Not freshChannel: that adds a random suffix, and broadcast needs everyone on the same topic.
    ch = supabase.channel(`chitchen:${gameId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'p' }, ({ payload: m }) => {
        if (!m || typeof m.i !== 'string' || m.i === me || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return
        if (!tracks.has(m.i)) tracks.set(m.i, makeTrack())
        tracks.get(m.i).push({ t: performance.now(), x: m.x, y: m.y, f: +m.f || 0 })
      })
      .on('broadcast', { event: 'e' }, ({ payload: m }) => { if (m && typeof m.i === 'string' && typeof m.e === 'string') onEmote?.(m.i, m.e.slice(0, 16)) })
      .subscribe()
  }
  return {
    send(x, y, f) {
      const now = performance.now(), cur = { x: +x.toFixed(2), y: +y.toFixed(2), f: Math.round(f * 10) / 10, t: now }
      if (!shouldSend(prev, cur, now)) return
      prev = cur
      ch?.send({ type: 'broadcast', event: 'p', payload: { i: me, x: cur.x, y: cur.y, f: cur.f } })
    },
    emote(e) { onEmote?.(me, e); ch?.send({ type: 'broadcast', event: 'e', payload: { i: me, e } }) },
    at: (pid, t = performance.now()) => tracks.get(pid)?.at(t) ?? null,
    stop() { if (ch) supabase.removeChannel(ch); ch = null },
  }
}
