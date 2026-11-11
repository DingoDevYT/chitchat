import { supabase } from './supabase'
import { online, profiles, myStatus } from './store'
import { effectiveStatus, IDLE_AFTER } from './status'

// One global presence channel: who's online, their status, and which voice channel they're in.
// shortcut: every client hears every join/leave; fine for a few hundred users, shard per server beyond that.
let ch = null
let ready = false, subscribed = false
let meta = { voice: null, live: false, cam: null, status: 'online', cs: null }

// Realtime closes the channel for good on too many tracks ("Client presence rate limit exceeded": 6 in 8 s did it),
// so unchanged metas are skipped and bursts (leave + rejoin, cam/live/mute toggles) collapse to one send per GAP.
// shortcut: the server's exact per-client window isn't documented; 2 s spacing stayed clear of it in testing.
const GAP = 2500
let sent = null, last = 0, pending = null

// Invisible users aren't tracked at all, except in a stadium (voice needs presence); statusOf() shows them offline.
function push() {
  if (!ch || !ready || !subscribed) return
  const hide = meta.status === 'invisible' && !meta.voice
  const key = hide ? 'untrack' : JSON.stringify(meta)
  clearTimeout(pending)
  if (key === sent) return
  const wait = last + GAP - Date.now()
  if (wait > 0) { pending = setTimeout(push, wait); return }
  sent = key; last = Date.now()
  if (hide) ch.untrack()
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

  // If Realtime closes the channel (rate limit, network blip, server restart), rejoin with backoff
  // instead of silently vanishing from everyone's online list and stadium seats.
  let stopped = false, retry = null, backoff = 2000
  const connect = () => {
    const c = supabase.channel('online', { config: { private: true, presence: { key: meId } } })
    ch = c
    c.on('presence', { event: 'sync' }, () => {
      const map = {}
      for (const [id, metas] of Object.entries(c.presenceState()))
        // Several tabs: the one in voice, else an active one (metas without status are pre-status tabs).
        map[id] = metas.find(m => m.voice) || metas.find(m => m.status && m.status !== 'idle') || metas.find(m => m.status) || metas[0]
      online.set(map)
    }).subscribe(status => {
      if (stopped || ch !== c || c.dead) return
      // (Re)joined: the server holds no meta for us, so the next push must send even if unchanged.
      if (status === 'SUBSCRIBED') { subscribed = true; sent = null; backoff = 2000; push() }
      else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        subscribed = false
        c.dead = true // removeChannel fires CLOSED again; don't let that schedule a second retry
        supabase.removeChannel(c)
        clearTimeout(retry)
        retry = setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 30000)
      }
    })
  }
  connect()
  return () => {
    stopped = true
    clearTimeout(retry)
    clearInterval(timer)
    evs.forEach(e => removeEventListener(e, active))
    unsub()
    if (ch) supabase.removeChannel(ch)
    clearTimeout(pending)
    ch = null; ready = subscribed = false
    online.set({}); myStatus.set('online')
  }
}

// Merges a patch, e.g. { cam: streamId }, so the screen and camera can update independently.
export function trackVoice(patch) {
  meta = { ...meta, ...patch }
  push()
}
