// Chatterflies ghosts over Supabase Realtime: each flyer broadcasts { y, d, v (vehicle), f (flip), a (alive) } about
// 12 times a second on the private 'fly:<stadium id>' topic (supabase/migrations/037_flyer_ghosts.sql). Ghosts are
// drawn ~100 ms behind, interpolated between the last two samples. Players never collide, so lag only makes a
// ghost a little late. (Voice-mesh data channels would save Realtime quota later; see the concept notes.)
import { supabase } from '../../lib/supabase'

export const SEND_EVERY = 5 // ticks (60 Hz / 5 = 12 Hz)
const DELAY = 100

export function ghostLink(channelId, me) {
  const buf = new Map() // pid -> [older, newer] samples with local receive time
  if (!channelId) return { send() {}, sample: () => null, close() {} }
  // Only send once joined: before that supabase-js falls back to REST broadcasts, which fail on a cold start.
  // Earlier updates are dropped, not queued (a newer position follows in 80 ms anyway).
  let ok = true, live = false
  const ch = supabase.channel(`fly:${channelId}`, { config: { private: true, broadcast: { self: false } } })
  ch.on('broadcast', { event: 'p' }, ({ payload: m }) => {
    if (!m || typeof m.id !== 'string' || m.id === me) return
    const s = { t: performance.now(), y: +m.y || 0, d: +m.d || 0, v: m.v || null, f: m.f === -1 ? -1 : 1, a: !!m.a }
    const b = buf.get(m.id) || []
    buf.set(m.id, [b[1] || s, s])
  }).subscribe(status => { live = status === 'SUBSCRIBED' && ok })
  return {
    send(st) { if (ok && live) ch.send({ type: 'broadcast', event: 'p', payload: { id: me, y: Math.round(st.y), d: Math.round(st.d), v: st.veh, f: st.flip, a: st.alive } }) },
    // Interpolated sample for pid at now - DELAY (extrapolates distance a little if packets are late).
    sample(pid, now = performance.now()) {
      const b = buf.get(pid)
      if (!b) return null
      const [p, q] = b, t = now - DELAY, span = q.t - p.t
      if (now - q.t > 4000) return null // gone quiet
      const f = span > 0 ? Math.max(0, Math.min(1.5, (t - p.t) / span)) : 1
      return { y: p.y + (q.y - p.y) * Math.min(1, f), d: p.d + (q.d - p.d) * f, veh: q.v, flip: q.f, alive: q.a }
    },
    close() { ok = live = false; supabase.removeChannel(ch) },
  }
}
