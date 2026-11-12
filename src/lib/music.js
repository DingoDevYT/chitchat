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
// The best of several round trips: the quickest one has the least room for error (±rtt/2). [{ t0, t1, server }] → { offset, rtt } | null
export function pickOffset(samples) {
  let best = null
  for (const s of samples || []) {
    const rtt = s?.t1 - s?.t0
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 5000 || !Number.isFinite(s.server)) continue
    if (!best || rtt < best.rtt) best = { offset: clockOffset(s.t0, s.t1, s.server), rtt }
  }
  return best
}
// A fresh measurement only replaces the one we have when it's about as precise (so one slow round trip never nudges
// everyone's music), or when the clocks really moved apart (the computer slept, NTP stepped the clock).
export function mergeOffset(prev, next) {
  if (!next) return prev
  if (!prev) return next
  return next.rtt <= prev.rtt + 40 || Math.abs(next.offset - prev.offset) > 2000 ? next : prev
}

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

// Keeping a player in step, gently. Every seek makes YouTube/SoundCloud rebuffer (an audible gap, and it lands a bit
// behind again), so a twitchy "seek whenever we're 1 s off" loop chases its own tail and cuts in and out. Instead:
//   · only judge drift once playback has been steady for `settleMs` (never while loading/buffering or right after a seek)
//   · seek only when more than `seekOver` s off on `confirm` checks in a row, and at most once per `minGapMs`
//   · smaller gaps on an <audio> element: nudge its speed (up to 5%) with hysteresis (start past nudgeOn, stop under
//     nudgeOff); YouTube/SoundCloud can't change speed, so they live with a small gap
export const SYNC = { seekOver: 3, settleMs: 3000, minGapMs: 10_000, confirm: 2, nudgeOn: 0.25, nudgeOff: 0.08 }
export const syncMem = () => ({ lastSeekAt: -Infinity, over: 0, nudging: false })
// mem: syncMem() carried between calls. steadyFor: ms the player has been playing (not buffering) without a hitch.
// Returns { mem, seek?: s, rate?: r } (no rate = leave the speed alone).
export function syncStep(mem, { actual, target, now, steadyFor = Infinity, canRate = false }, o = SYNC) {
  if (steadyFor < o.settleMs) return { mem: { ...mem, over: 0 } }
  const d = actual - target
  if (!Number.isFinite(d) || Math.abs(d) > o.seekOver) {
    const over = mem.over + 1
    if (over >= o.confirm && now - mem.lastSeekAt >= o.minGapMs) {
      return { seek: target, ...(canRate ? { rate: 1 } : {}), mem: { lastSeekAt: now, over: 0, nudging: false } }
    }
    return { mem: { ...mem, over } }
  }
  if (!canRate) return { mem: { ...mem, over: 0 } }
  const nudging = mem.nudging ? Math.abs(d) > o.nudgeOff : Math.abs(d) > o.nudgeOn
  const rate = nudging ? Math.round((1 - Math.max(-0.05, Math.min(0.05, d * 0.1))) * 1000) / 1000 : 1
  return { rate, mem: { ...mem, over: 0, nudging } }
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
// amount: how far the duck is in, 0..1 (from duckStep); `talking` is the on/off shorthand.
export const DUCK = 0.3
// The slider starts at 20% for anyone who hasn't moved it, and the whole range is halved on the way out: 100% on the
// slider is half of what the players could do (full-volume YouTube was far louder than voices).
export const DEFAULT_MUSIC_VOL = 0.2
export const MUSIC_MASTER = 0.5
// The level handed to YouTube setVolume / SoundCloud setVolume / audio.volume, after the slider, mute and ducking.
export const outputVolume = gain => Math.max(0, Math.min(1, gain)) * MUSIC_MASTER
export function musicGain({ vol = 0.6, muted = false, deafened = false, duck = true, talking = false, amount = talking ? 1 : 0 }) {
  if (muted || deafened) return 0
  const a = duck ? Math.max(0, Math.min(1, amount)) : 0
  return Math.max(0, Math.min(1, vol)) * (a * DUCK + (1 - a))
}
// Anyone talking, from voice.js loudness (0..1 per person).
export const anyoneTalking = (levels, threshold = 0.04) => { for (const v of levels.values()) if (v > threshold) return true; return false }
// The duck envelope. Voice loudness flickers between syllables and words; following it directly pumps the music up and
// down ("in and out"). So talking holds the duck in for `holdMs` after the last loud blip, it eases in over `attackMs`
// and back out over `releaseMs`. env = { amount 0..1, lastLoud ms }; dt = ms since the last step.
export const DUCK_ENV = { attackMs: 150, releaseMs: 800, holdMs: 700 }
export function duckStep(env, { loud, now, dt }, o = DUCK_ENV) {
  const lastLoud = loud ? now : env?.lastLoud ?? -Infinity
  const on = now - lastLoud < o.holdMs
  const cur = env?.amount ?? 0
  const step = Math.max(0, dt) / (on ? o.attackMs : o.releaseMs)
  return { amount: on ? Math.min(1, cur + step) : Math.max(0, cur - step), lastLoud }
}
// Glide towards a target gain so ducking fades instead of clicking (one step per tick).
export const glide = (cur, target, k = 0.35) => Math.abs(target - cur) < 0.01 ? target : cur + (target - cur) * k

// ── stadium chat commands ──
// "/play <link>", "/skip", "/queue" (also "/np"), "/loop [off|queue|song]". Anything else → null, so the message goes out as usual.
export function parseMusicCommand(text) {
  const m = (text || '').trim().match(/^\/(play|p|skip|s|queue|q|np|nowplaying|loop|repeat)(?:\s+([\s\S]*))?$/i)
  if (!m) return null
  const cmd = { p: 'play', s: 'skip', q: 'queue', np: 'queue', nowplaying: 'queue', repeat: 'loop' }[m[1].toLowerCase()] || m[1].toLowerCase()
  const arg = (m[2] || '').trim()
  if (cmd === 'play') return arg ? { cmd, arg } : { cmd, error: '/play needs a link: /play https://youtu.be/…' }
  if (cmd === 'loop') {
    if (!arg) return { cmd } // no word: cycle to the next mode
    const mode = LOOP_WORDS[arg.toLowerCase()]
    return mode ? { cmd, mode } : null // "/loop me in" is just a message
  }
  return arg ? null : { cmd } // "/skip to the good part" is just a message
}

// ── the row, and the off switch ──
// A stadium_music row as the client keeps it. `disabled` arrives with 042; before that (or with junk) it's simply on.
export const rowFrom = data => ({
  state: data?.state && typeof data.state === 'object' && !Array.isArray(data.state) ? data.state : {},
  queue: Array.isArray(data?.queue) ? data.queue : [],
  disabled: data?.disabled === true,
})
// Only "there is no radio here" (table not created yet, or no access) hides the radio. A blip (network, a realtime
// reconnect) keeps what we had: dropping the row would unmount the player and restart the song.
export const radioGone = error => !!error && (['42P01', 'PGRST205', '42501'].includes(error.code) || /does not exist|schema cache/i.test(error.message || ''))
// What a stadium shows: 'none' (no radio, or turned off and you're not a mod) · 'off' (turned off; mods get a chip
// to turn it back on) · 'on'.
export const radioMode = (row, isMod) => !row ? 'none' : row.disabled ? (isMod ? 'off' : 'none') : 'on'
export const RADIO_OFF = 'The radio is turned off in this stadium.'

// ── loop ──
// state.loop: 'off' | 'queue' (finished songs go to the back of the queue) | 'one' (the song starts over). Missing = off.
export const LOOPS = ['off', 'queue', 'one']
export const loopOf = state => LOOPS.includes(state?.loop) ? state.loop : 'off'
export const nextLoop = mode => LOOPS[(LOOPS.indexOf(LOOPS.includes(mode) ? mode : 'off') + 1) % LOOPS.length]
export const LOOP_LABEL = { off: 'Loop off', queue: 'Looping the queue', one: 'Looping this song' }

// ── fast start ──
// The song that plays after this one (so a hidden player can get it ready): looping one song plays it again; looping
// the queue with nothing queued brings the same song back round; otherwise the head of the queue.
export function nextUp(state, queue) {
  if (!state?.track) return Array.isArray(queue) && queue[0] || null
  const loop = loopOf(state)
  if (loop === 'one') return state.track
  return (Array.isArray(queue) && queue[0]) || (loop === 'queue' ? state.track : null)
}
// Hosts to warm up before the first song: the YouTube API and player, artwork, the video servers, SoundCloud's widget.
export const RADIO_ORIGINS = ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://i.ytimg.com',
  'https://googlevideo.com', 'https://w.soundcloud.com']
// The hidden YouTube player's settings: no controls, captions or related videos; sound only as far as we're concerned.
export const ytPlayerVars = origin => ({ controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, fs: 0, autoplay: 0, ...(origin ? { origin } : {}) })
// Which of the two hidden YouTube players takes a new song. slots: { vid, ok } | null.
//   'reuse': the active player already has this video (a looped song) · 'swap': the standby one has it cued, so it
//   starts at once · 'load': load it on the active player. A paused start always cues on the active player.
export function deckPlan(active, standby, id, paused = false) {
  if (paused) return 'load'
  if (active?.ok && active.vid === id) return 'reuse'
  if (standby?.ok && standby.vid === id) return 'swap'
  return 'load'
}
const LOOP_WORDS = { off: 'off', none: 'off', queue: 'queue', all: 'queue', song: 'one', one: 'one', track: 'one', '1': 'one' }
