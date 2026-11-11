import { supabase } from './supabase'
import { online } from './store'

// One global presence channel: who's online, and which voice channel they're in.
// shortcut: every client hears every join/leave; fine for a few hundred users, shard per server beyond that.
let ch = null
let meta = { voice: null }

export function startPresence(meId) {
  ch = supabase.channel('online', { config: { private: true, presence: { key: meId } } })
  ch.on('presence', { event: 'sync' }, () => {
    const map = {}
    for (const [id, metas] of Object.entries(ch.presenceState())) map[id] = metas.find(m => m.voice) || metas[0]
    online.set(map)
  }).subscribe(status => { if (status === 'SUBSCRIBED') ch.track(meta) })
  return () => { supabase.removeChannel(ch); ch = null; online.set({}) }
}

export function trackVoice(channelId) {
  meta = { voice: channelId }
  ch?.track(meta)
}
