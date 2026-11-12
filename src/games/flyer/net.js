// Chatterflies ghosts over Supabase Realtime: each flyer broadcasts { y, d, v (vehicle), f (flip), a (alive),
// b (rescue bubble [n0, d0, y0] while in one), k (spinning the Second Brew) } about 12 times a second on the private
// 'fly:<stadium id>' topic (supabase/migrations/037_flyer_ghosts.sql). Ghosts are drawn ~100 ms behind, interpolated
// between the last two samples. Players never collide, so lag only makes a ghost a little late.
// Flock rescues: whoever flies through a friend's bubble sends { id, to, t } as event 'r'; the friend's client feeds
// it to its sim as the rescue input, and the referee later checks the rescuer's replay really touched the bubble.
import { supabase } from '../../lib/supabase'

export const SEND_EVERY = 5 // ticks (60 Hz / 5 = 12 Hz)
const DELAY = 100

const bubOf = b => (Array.isArray(b) && b.length === 3 && b.every(Number.isFinite) ? { n0: b[0], d0: b[1], y0: b[2] } : null)

export function ghostLink(channelId, me) {
  const buf = new Map() // pid -> [older, newer] samples with local receive time
  const rescues = []
  if (!channelId) return { send() {}, sample: () => null, close() {}, rescue() {}, rescued: () => null }
  // Only send once joined: before that supabase-js falls back to REST broadcasts, which fail on a cold start.
  // Earlier updates are dropped, not queued (a newer position follows in 80 ms anyway).
  let ok = true, live = false
  const ch = supabase.channel(`fly:${channelId}`, { config: { private: true, broadcast: { self: false } } })
  ch.on('broadcast', { event: 'p' }, ({ payload: m }) => {
    if (!m || typeof m.id !== 'string' || m.id === me) return
    const s = { t: performance.now(), y: +m.y || 0, d: +m.d || 0, v: m.v || null, f: m.f === -1 ? -1 : 1, a: !!m.a, b: bubOf(m.b), k: !!m.k }
    const b = buf.get(m.id) || []
    buf.set(m.id, [b[1] || s, s])
  }).on('broadcast', { event: 'r' }, ({ payload: m }) => {
    if (m && m.to === me && typeof m.id === 'string' && m.id !== me) rescues.push(m.id)
  }).subscribe(status => { live = status === 'SUBSCRIBED' && ok })
  return {
    // The bubble goes out exactly (it's checked against the rescuer's replay), the rest rounded.
    send(st) {
      if (!ok || !live) return
      const b = st.bub ? [st.bub.n0, st.bub.d0, st.bub.y0] : 0
      ch.send({ type: 'broadcast', event: 'p', payload: { id: me, y: Math.round(st.y), d: Math.round(st.d), v: st.veh, f: st.flip, a: st.alive, b, k: !!st.spin } })
    },
    // Interpolated sample for pid at now - DELAY (extrapolates distance a little if packets are late).
    sample(pid, now = performance.now()) {
      const b = buf.get(pid)
      if (!b) return null
      const [p, q] = b, t = now - DELAY, span = q.t - p.t
      if (now - q.t > 4000) return null // gone quiet
      const f = span > 0 ? Math.max(0, Math.min(1.5, (t - p.t) / span)) : 1
      return { y: p.y + (q.y - p.y) * Math.min(1, f), d: p.d + (q.d - p.d) * f, veh: q.v, flip: q.f, alive: q.a, bub: q.b, spin: q.k }
    },
    // Tell a friend you flew through their bubble (at your tick t). Retried a few times if we're not joined yet: it matters.
    rescue(to, t) {
      let n = 0
      const go = () => { if (!ok) return; if (live) ch.send({ type: 'broadcast', event: 'r', payload: { id: me, to, t } }); else if (n++ < 20) setTimeout(go, 100) }
      go()
    },
    // Who popped my bubble, if anyone has since the last call.
    rescued: () => rescues.shift() ?? null,
    close() { ok = live = false; supabase.removeChannel(ch) },
  }
}
