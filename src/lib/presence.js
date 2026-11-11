import { supabase } from './supabase'
import { online, profiles, myStatus } from './store'
import { effectiveStatus, IDLE_AFTER } from './status'

// One global presence channel: who's online, their status, and which voice channel they're in.
// shortcut: every client hears every join/leave; fine for a few hundred users, shard per server beyond that.
let ch = null
let ready = false, subscribed = false
let meta = { voice: null, live: false, cam: null, status: 'online', cs: null }

// Invisible users aren't tracked at all, except in a stadium (voice needs presence); statusOf() shows them offline.
function push() {
  if (!ch || !ready || !subscribed) return
  if (meta.status === 'invisible' && !meta.voice) ch.untrack()
  else ch.track(meta)
}

export function startPresence(meId) {
  let idle = false, last = Date.now()
  const sync = () => {
    const p = profiles.get()[meId]
    if (!p) return
    const status = effectiveStatus(p.status, idle), cs = p.custom_status || null
    if (myStatus.get() !== status) myStatus.set(status)
    if (ready && status === meta.status && cs === meta.cs) return
    ready = true
    meta = { ...meta, status, cs }
    push()
  }
  // Auto-idle after 10 min without input (a hidden tab gets none); any input brings you back.
  const active = () => { last = Date.now(); if (idle) { idle = false; sync() } }
  const timer = setInterval(() => { if (!idle && Date.now() - last >= IDLE_AFTER) { idle = true; sync() } }, 30000)
  const evs = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
  evs.forEach(e => addEventListener(e, active, { passive: true }))
  const unsub = profiles.subscribe(sync)
  sync()

  ch = supabase.channel('online', { config: { private: true, presence: { key: meId } } })
  ch.on('presence', { event: 'sync' }, () => {
    const map = {}
    for (const [id, metas] of Object.entries(ch.presenceState()))
      // Several tabs: the one in voice, else an active one (metas without status are pre-status tabs).
      map[id] = metas.find(m => m.voice) || metas.find(m => m.status && m.status !== 'idle') || metas.find(m => m.status) || metas[0]
    online.set(map)
  }).subscribe(status => { if (status === 'SUBSCRIBED') { subscribed = true; push() } })
  return () => {
    clearInterval(timer)
    evs.forEach(e => removeEventListener(e, active))
    unsub()
    supabase.removeChannel(ch)
    ch = null; ready = subscribed = false
    online.set({}); myStatus.set('online')
  }
}

// Merges a patch, e.g. { cam: streamId }, so the screen and camera can update independently.
export function trackVoice(patch) {
  meta = { ...meta, ...patch }
  push()
}
