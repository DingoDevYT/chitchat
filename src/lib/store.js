import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

// Tiny global store. Selectors must return existing references or primitives.
export function createStore(initial) {
  let state = initial
  const subs = new Set()
  const subscribe = cb => (subs.add(cb), () => subs.delete(cb))
  return {
    get: () => state,
    subscribe,
    set(next) { state = typeof next === 'function' ? next(state) : next; subs.forEach(f => f()) },
    use: (sel = s => s) => useSyncExternalStore(subscribe, () => sel(state)),
  }
}

// ── profiles cache ──
export const profiles = createStore({})
const inflight = new Set()
const seenAt = new Map() // id -> when we last got fresh data
export function primeProfiles(list) {
  profiles.set(s => { const n = { ...s }; for (const p of list) if (p) { n[p.id] = p; seenAt.set(p.id, Date.now()) } return n })
}
// Popovers call this as a fallback in case a realtime update was missed.
export async function refreshProfile(id) {
  if (!id || Date.now() - (seenAt.get(id) || 0) < 60000) return
  seenAt.set(id, Date.now())
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (data) primeProfiles([data])
}
// One realtime channel for every profile edit (avatar, name, colour, bio, voice...). Returns a cleanup.
export function startProfileSync() {
  const ch = supabase.channel('profiles')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      if (profiles.get()[row.id]) primeProfiles([{ ...profiles.get()[row.id], ...row }])
    })
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}
export async function ensureProfiles(ids) {
  const missing = [...new Set(ids)].filter(id => id && !profiles.get()[id] && !inflight.has(id))
  if (!missing.length) return
  missing.forEach(id => inflight.add(id))
  const { data } = await supabase.from('profiles').select('*').in('id', missing)
  missing.forEach(id => inflight.delete(id))
  if (data) primeProfiles(data)
}
export function useProfile(id) {
  const p = profiles.use(s => s[id])
  useEffect(() => { if (id && !p) ensureProfiles([id]) }, [id, p])
  return p
}

// ── who is talking (text typewriter counts, plus 'v:<id>' flags from voice) ──
export const talking = createStore({})
export function setTalking(id, on) {
  talking.set(s => ({ ...s, [id]: Math.max(0, (s[id] || 0) + (on ? 1 : -1)) }))
}
export function setVoiceTalking(id, on) {
  if (!!talking.get()['v:' + id] !== on) talking.set(s => ({ ...s, ['v:' + id]: on }))
}

// ── presence: id -> { voice: channelId|null, live: screenStreamId|false, cam: camStreamId|null } ──
export const online = createStore({})
// ── your effective status (online | idle | dnd | invisible), kept by presence.js ──
export const myStatus = createStore('online')
export const isDND = () => myStatus.get() === 'dnd'

// ── screen shares in the stadium you're in: userId -> MediaStream (yours too, as a local preview) ──
export const streams = createStore({})
// ── webcams in the stadium you're in, same shape ──
export const cams = createStore({})
export function dropStream(id, ms, store = streams) {
  if (store.get()[id] === ms) store.set(s => { const n = { ...s }; delete n[id]; return n })
}

// ── your mic while it is open (call or mic test): { lvl, thr, open } on voice.js's 0..100 scale ──
export const micLevel = createStore(null)
export const pttDown = createStore(false)

// ── local prefs ──
const PREFS_KEY = 'chitchat:prefs'
const defaults = {
  volume: 0.5, animalese: true, muted: {}, showMembers: true,
  animateAvatars: 'always', // 'always' | 'hover' (GIF/animated WebP avatars and server icons)
  // right-click menus: per-person call mute, per-streamer volume/mute, channel/server/DM mutes (id -> true | expiry ms), closed DMs (id -> last_message_id)
  callMuted: {}, streamVol: {}, streamMuted: {}, mutes: {}, closedDMs: {},
  // voice & video ('' device = system default; volumes are 0..2; vadThreshold is on voice.js's 0..100 level scale)
  micId: '', speakerId: '', camId: '', inVol: 1, outVol: 1, peerVol: {},
  vadAuto: true, vadThreshold: 50, ptt: false, pttKey: 'Backquote', ns: true, ec: true, agc: true,
  normalise: true, ttsHear: true, // stadiums: level remote voices; read out others' 🔊 TTS messages
}
function loadPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY)) } } catch { return defaults }
}
export const prefs = createStore(loadPrefs())
export function setPref(k, v) {
  prefs.set(s => {
    const n = { ...s, [k]: v }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)) } catch {}
    return n
  })
}

// ── toasts ──
export const toasts = createStore([])
let toastId = 0
export function toast(text) {
  const id = ++toastId
  toasts.set(t => [...t, { id, text }])
  setTimeout(() => toasts.set(t => t.filter(x => x.id !== id)), 3500)
}

// ── who's typing right now, per source (each open chat, plus 'self') ──
export const typingNow = createStore({})
export function setTypingIn(key, ids) {
  const cur = typingNow.get()[key] || []
  if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return
  typingNow.set(s => ({ ...s, [key]: ids }))
}
