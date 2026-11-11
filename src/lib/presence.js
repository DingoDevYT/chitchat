import { supabase } from './supabase'
import { online } from './store'

// One global presence channel: who's online, and which voice channel they're in.
// shortcut: every client hears every join/leave; fine for a few hundred users, shard per server beyond that.
let ch = null
let meta = { voice: null, live: false, cam: null }

export function startPresence(meId) {
  ch = supabase.channel('online', { config: { private: true, presence: { key: meId } } })
  ch.on('presence', { event: 'sync' }, () => {
    const map = {}
    for (const [id, metas] of Object.entries(ch.presenceState())) map[id] = metas.find(m => m.voice) || metas[0]
    online.set(map)
  }).subscribe(status => { if (status === 'SUBSCRIBED') ch.track(meta) })
  return () => { supabase.removeChannel(ch); ch = null; online.set({}) }
}

// Merges a patch, e.g. { cam: streamId }, so the screen and camera can update independently.
export function trackVoice(patch) {
  meta = { ...meta, ...patch }
  ch?.track(meta)
}
