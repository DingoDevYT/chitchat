// Chit Radio, the pure parts: link parsing/validation, synced position maths, vote-to-skip, ducking, chat commands.
// The database (041_stadium_music.sql, music_do) re-checks everything that matters; these keep the UI honest and quick.

export const MAX_QUEUE = 50, MAX_PER_USER = 10
export const MAX_UPLOAD = 20 * 1024 * 1024 // the media bucket takes 25 MB; songs get a little headroom under it
export const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = /^(www\.|m\.|music\.)?youtube(-nocookie)?\.com$/
const SC_PATH = /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)?$/

// A pasted link → { kind: 'yt', src: videoId } | { kind: 'sc', src: page url } | { kind: 'audio', src: url } | { error }.
export function parseTrackUrl(text) {
  const raw = (text || '').trim().replace(/^<(.+)>$/, '$1') // Discord-style <link>
  if (!raw) return { error: 'Paste a YouTube, SoundCloud or audio file link.' }
  let u
  try { u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return { error: "That doesn't look like a link." } }
  if (u.protocol === 'http:') u.protocol = 'https:' // an http page would be blocked as mixed content anyway
  if (u.protocol !== 'https:') return { error: "That doesn't look like a link." }
  const host = u.hostname.toLowerCase()
  let id = null
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (YT_HOSTS.test(host)) {
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/]+)/)
    id = m ? m[2] : u.pathname === '/watch' ? u.searchParams.get('v') : null
    if (!id) return { error: 'That YouTube link has no video in it.' }
  }
  if (id !== null) return YT_ID.test(id) ? { kind: 'yt', src: id } : { error: 'That YouTube link looks broken.' }
  if (/^(www\.|m\.)?soundcloud\.com$/.test(host)) {
    const path = u.pathname.replace(/\/+$/, '')
    if (!SC_PATH.test(path) || /^\/(discover|search|you|charts|upload|stream)\b/.test(path)) return { error: 'Paste a link to one SoundCloud track.' }
    return { kind: 'sc', src: `https://soundcloud.com${path}` }
  }
  if (host === 'on.soundcloud.com') return { error: 'Open that SoundCloud short link first and paste the full track link.' }
  if (AUDIO_EXT.test(u.pathname) || isMediaUrl(u.href)) {
    const src = u.href
    return src.length <= 500 && !/[\s"'<>\\]/.test(src) ? { kind: 'audio', src } : { error: 'That link is too long.' }
  }
  return { error: "That link isn't a song I can play. Try YouTube, SoundCloud, or a link ending in .mp3." }
}

export const isMediaUrl = u => /^https:\/\/nilludyavkfqwastghmw\.supabase\.co\/storage\/v1\/object\/public\/media\//.test(u)

// Same rule as public.music_track_ok.
export function validTrack(t) {
  if (!t || typeof t !== 'object') return false
  const src = typeof t.src === 'string' ? t.src : ''
  const okSrc = t.kind === 'yt' ? YT_ID.test(src)
    : t.kind === 'sc' ? /^https:\/\/(www\.|m\.)?soundcloud\.com\//.test(src) && SC_PATH.test(src.replace(/^https:\/\/[^/]+/, ''))
    : t.kind === 'audio' ? /^https:\/\/[^\s"'<>\\]+$/.test(src) : false
  const title = typeof t.title === 'string' ? t.title.trim() : ''
  const okArt = t.art == null || (typeof t.art === 'string' && t.art.length <= 500 && /^https:\/\/(i\.ytimg\.com|[a-z0-9-]+\.sndcdn\.com)\/[^\s"'<>\\]+$/.test(t.art))
  const okDur = t.dur == null || (typeof t.dur === 'number' && t.dur >= 1 && t.dur <= 43200)
  return okSrc && src.length <= 500 && title.length >= 1 && title.length <= 200 && okArt && okDur
}

// "my_song-final.mp3" → "my song-final"
export const titleFromFile = name => (name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled song'
// A SoundCloud page URL → "Artist · track name" from its slug, for when oEmbed is unreachable.
export function titleFromSc(src) {
  const [user, track] = src.replace(/^https:\/\/[^/]+\//, '').split('/')
  const nice = s => decodeURIComponent(s || '').replace(/[-_]+/g, ' ').trim()
  return `${nice(user)} · ${nice(track)}`.slice(0, 200)
}
export const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const sourceUrl = t => t.kind === 'yt' ? `https://www.youtube.com/watch?v=${t.src}` : t.src

// ── time ──
// Server clock offset from one round trip: the server read its clock about halfway between our send (t0) and receive (t1).
export const clockOffset = (t0, t1, serverMs) => serverMs - (t0 + t1) / 2

// Where the shared track is right now, in seconds (null when nothing is on). paused_at freezes it.
export function position(state, serverNow) {
  if (!state?.track || typeof state.started_at !== 'number') return null
  const at = typeof state.paused_at === 'number' ? state.paused_at : serverNow
  const s = Math.max(0, (at - state.started_at) / 1000)
  return state.track.dur ? Math.min(s, state.track.dur) : s
}
export const isPaused = state => typeof state?.paused_at === 'number'
// Past the end (with a little grace so a slow player isn't cut off): time to ask the server for the next song.
export const isOver = (state, serverNow) => !!state?.track?.dur && !isPaused(state) && (serverNow - state.started_at) / 1000 >= state.track.dur + 0.5

// How to fix a player that has drifted from where it should be.
//   > `seekOver` s off: jump. A smaller gap on a player that can change speed: nudge the rate (up to 5%) so it glides back.
//   Within `ok` s: leave it alone (rate back to 1). Returns { seek } | { rate }.
export function correction(actual, target, { canRate = false, seekOver = 1, ok = 0.12 } = {}) {
  const d = actual - target
  if (!Number.isFinite(d) || Math.abs(d) > seekOver) return { seek: target }
  if (!canRate || Math.abs(d) <= ok) return { rate: 1 }
  return { rate: Math.round((1 - Math.max(-0.05, Math.min(0.05, d * 0.1))) * 1000) / 1000 }
}

export function fmtTime(s) {
  if (s == null || !Number.isFinite(s)) return '--:--'
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// ── vote to skip ──
// A strict majority of the people in the stadium.
export const votesNeeded = listeners => Math.floor(Math.max(1, listeners) / 2) + 1
// Whoever queued the song and mods skip at once; everyone else votes.
export const canSkipNow = (track, uid, isMod) => !!track && (isMod || track.by === uid)
export function skipStatus(state, uid, listeners, isMod) {
  const skips = (state?.skips || []).filter(id => typeof id === 'string')
  const need = votesNeeded(Math.max(listeners, skips.length))
  return { votes: skips.length, need, voted: skips.includes(uid), instant: canSkipNow(state?.track, uid, isMod) }
}
// Would one more vote from `uid` skip it? (Same maths as music_do.)
export function voteSkips(skips, uid, listeners) {
  const s = new Set(skips || []); s.add(uid)
  return s.size * 2 > Math.max(1, listeners, s.size)
}

// ── what you hear ──
// Music volume for this moment: your slider, muted/deafened, and ducked while anyone is talking.
export const DUCK = 0.3
export function musicGain({ vol = 0.6, muted = false, deafened = false, duck = true, talking = false }) {
  if (muted || deafened) return 0
  return Math.max(0, Math.min(1, vol)) * (duck && talking ? DUCK : 1)
}
// Anyone talking, from voice.js loudness (0..1 per person).
export const anyoneTalking = (levels, threshold = 0.04) => { for (const v of levels.values()) if (v > threshold) return true; return false }
// Glide towards a target gain so ducking fades instead of clicking (one step per tick).
export const glide = (cur, target, k = 0.35) => Math.abs(target - cur) < 0.01 ? target : cur + (target - cur) * k

// ── stadium chat commands ──
// "/play <link>", "/skip", "/queue" (also "/np"). Anything else → null, so the message goes out as usual.
export function parseMusicCommand(text) {
  const m = (text || '').trim().match(/^\/(play|p|skip|s|queue|q|np|nowplaying)(?:\s+([\s\S]*))?$/i)
  if (!m) return null
  const cmd = { p: 'play', s: 'skip', q: 'queue', np: 'queue', nowplaying: 'queue' }[m[1].toLowerCase()] || m[1].toLowerCase()
  const arg = (m[2] || '').trim()
  if (cmd === 'play') return arg ? { cmd, arg } : { cmd, error: '/play needs a link: /play https://youtu.be/…' }
  return arg ? null : { cmd } // "/skip to the good part" is just a message
}
