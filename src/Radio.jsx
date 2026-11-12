import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, freshChannel } from './lib/supabase'
import { createStore, online, prefs, setPref, toast, voiceLevels } from './lib/store'
import {
  AUDIO_EXT, LOOP_LABEL, MAX_QUEUE, MAX_UPLOAD, RADIO_OFF, anyoneTalking, duckStep, fmtTime, glide, isOver, isPaused, loopOf,
  mergeOffset, musicGain, nextLoop, parseMusicCommand, parseTrackUrl, pickOffset, position, radioGone, radioMode, rowFrom,
  skipStatus, sourceUrl, syncMem, syncStep, titleFromFile, titleFromSc, ytThumb, canSkipNow, nextUp, RADIO_ORIGINS, ytPlayerVars, deckPlan, DEFAULT_MUSIC_VOL, outputVolume,
} from './lib/music'
import { uploadFile } from './lib/upload'
import { app } from './menus'
import { ask } from './Dialog'
import Avatar, { Name } from './Avatar'
import Icon from './icons/Icon'
import './styles/radio.css'

// Chit Radio: a synced listen-along per stadium. stadium_music (041, 042) holds { track, started_at, paused_at, skips,
// loop }, the queue and an off switch; every listener's own browser plays the same song at the same spot. Nothing is
// re-streamed over the call.

// ── shared bits ──
export const radio = createStore({}) // channel id -> { state, queue, disabled } | null (table missing / no access)
export const radioUi = createStore({ open: null }) // which stadium's queue drawer is open
// RadioLab swaps these for a local simulation (no database, silent players).
export const radioApi = { mock: false, act: null }
// The persistent player (RadioPlayer, mounted with the voice connection) and the stage card talk through these:
//   radioPlay     { blocked, starting }: the browser wants a tap before it plays sound (the card shows "Tap to
//                 listen") · the song has been handed to the player but isn't sounding yet ("starting…")
//   radioPending  { [cid]: track-ish }: a song being added (title still on its way), shown at once
const radioPlay = createStore({ blocked: false, starting: false })
const radioPending = createStore({})

// Server clock: the quickest of a few round trips, refreshed every 10 minutes (and kept unless the new one is about as
// precise, so the target never jumps by a slow trip's error). serverNow() is "now" on the database's clock. Songs
// don't wait for it: they start on our own clock and the sync loop corrects once it's known.
let clock = null, clockAt = 0, clockBusy = null
function syncClock() {
  if (radioApi.mock) return
  if (clockBusy || Date.now() - clockAt < 600_000) return
  clockBusy = (async () => {
    const samples = []
    for (let i = 0; i < 4; i++) {
      const t0 = Date.now()
      const { data, error } = await supabase.rpc('music_now')
      const t1 = Date.now()
      if (!error && typeof data === 'number') samples.push({ t0, t1, server: data })
    }
    const next = pickOffset(samples)
    if (next) { clock = mergeOffset(clock, next); clockAt = Date.now() }
  })().catch(() => {}).finally(() => { clockBusy = null })
}
export const serverNow = () => Date.now() + (clock?.offset || 0)

const pings = new Map() // channel id -> broadcast channel, to nudge other listeners to refetch
const isMod = () => !!(app.ctx?.can?.('manage_messages') || app.ctx?.can?.('manage_channels'))
const meId = () => app.ctx?.userId
const listenersIn = cid => Object.values(online.get()).filter(p => p.voice === cid).length

// Every change goes through music_do, which checks who may do what. Returns true on success.
export async function act(cid, action, arg = {}) {
  if (radioApi.act) return radioApi.act(cid, action, arg)
  const { data, error } = await supabase.rpc('music_do', { cid, act: action, arg })
  if (error) { toast(error.message); return false }
  if (data?.row) radio.set(s => ({ ...s, [cid]: rowFrom(data.row) }))
  pings.get(cid)?.send({ type: 'broadcast', event: 'changed', payload: {} })
  return true
}

// Reads the row and keeps it fresh: database changes, plus a broadcast nudge from whoever changed it (the Members
// pattern: the payload is never trusted, everyone refetches), plus coming back to the tab. Shared and counted: the
// persistent player (while you're in the call) and the stage card both watch, and supabase-js shares one channel per
// topic, so the second one must not tear down the first one's subscription.
const watchers = new Map() // channel id -> { n, stop }
function useRadioRow(cid) {
  useEffect(() => {
    if (radioApi.mock || !cid) return
    let w = watchers.get(cid)
    if (!w) { w = { n: 0, stop: watchRow(cid) }; watchers.set(cid, w) }
    w.n++
    return () => { if (--w.n === 0) { w.stop(); watchers.delete(cid) } }
  }, [cid])
}
function watchRow(cid) {
  { // (indented block kept so the body reads like the effect it used to be)
    let alive = true
    syncClock()
    // select * so it works with and without 042's `disabled` column
    const fetch = () => supabase.from('stadium_music').select('*').eq('channel_id', cid).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      // a failed refetch keeps the row we have: blanking it would unmount the player and restart the song
      if (error) { if (radioGone(error)) radio.set(s => ({ ...s, [cid]: null })); return }
      radio.set(s => ({ ...s, [cid]: rowFrom(data) }))
    }, () => {})
    fetch()
    const ch = freshChannel('radio:' + cid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stadium_music', filter: `channel_id=eq.${cid}` }, fetch)
      .subscribe()
    const ping = supabase.channel('radio-ping:' + cid).on('broadcast', { event: 'changed' }, fetch).subscribe()
    pings.set(cid, ping)
    const onVis = () => { if (!document.hidden) { fetch(); syncClock() } }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false; supabase.removeChannel(ch); supabase.removeChannel(ping)
      if (pings.get(cid) === ping) pings.delete(cid)
      document.removeEventListener('visibilitychange', onVis)
    }
  }
}

// ── adding songs ──
// The title lookup is the only wait before a song is added, so it gets 2.5 s; after that the song goes in with a stand-in.
async function oembed(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
async function trackFor(p) {
  if (p.kind === 'yt') {
    const o = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl(p))}`)
    return { ...p, title: (o?.title || 'YouTube video').slice(0, 200), art: ytThumb(p.src) }
  }
  if (p.kind === 'sc') {
    const o = await oembed(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(p.src)}`)
    const art = /^https:\/\/[a-z0-9-]+\.sndcdn\.com\//.test(o?.thumbnail_url || '') ? o.thumbnail_url : null
    return { ...p, title: (o?.title || titleFromSc(p.src)).slice(0, 200), art }
  }
  return { ...p, title: titleFromFile(decodeURIComponent(new URL(p.src).pathname.split('/').pop() || '')), art: null }
}
export async function addLink(cid, text) {
  const p = parseTrackUrl(text)
  if (p.error) { toast(p.error); return false }
  warmRadio()
  // shown straight away (art for YouTube is just a URL); the title fills in when the lookup answers
  radioPending.set(s => ({ ...s, [cid]: { ...p, id: 'pending', by: meId(), title: 'Getting the title…', art: p.kind === 'yt' ? ytThumb(p.src) : null } }))
  try { return await act(cid, 'add', { track: await trackFor(p) }) }
  finally { radioPending.set(s => { const { [cid]: _, ...rest } = s; return rest }) }
}
const durationOf = file => new Promise(res => {
  const a = new Audio(), url = URL.createObjectURL(file)
  const done = d => { URL.revokeObjectURL(url); res(Number.isFinite(d) && d >= 1 && d <= 43200 ? Math.round(d * 10) / 10 : null) }
  a.preload = 'metadata'
  a.onloadedmetadata = () => done(a.duration)
  a.onerror = () => done(null)
  setTimeout(() => done(null), 4000)
  a.src = url
})
export async function addUpload(cid, file, onProgress) {
  if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) { toast('That file isn\'t audio. Try an mp3, m4a, ogg or wav.'); return false }
  if (file.size > MAX_UPLOAD) { toast('Songs can be up to 20 MB.'); return false }
  const dur = await durationOf(file)
  try {
    const { url } = await uploadFile(file, meId(), { onProgress })
    return act(cid, 'add', { track: { kind: 'audio', src: url, title: titleFromFile(file.name), art: null, dur } })
  } catch (e) { toast(e.message || 'Upload failed.'); return false }
}
export function skip(cid) {
  const st = radio.get()[cid]?.state
  if (!st?.track) return toast('Nothing is playing.')
  const s = skipStatus(st, meId(), listenersIn(cid), isMod())
  if (!s.instant && s.voted) return toast(`You voted to skip (${s.votes}/${s.need}).`)
  return act(cid, 'skip', { id: st.track.id, listeners: listenersIn(cid) })
}
export async function setLoop(cid, mode) {
  if (await act(cid, 'loop', { mode })) toast(LOOP_LABEL[mode] + '.')
}

// Stadium chat: /play <link>, /skip, /queue, /loop. true = handled (don't send it as a message).
export function musicCommand(cid, text) {
  const c = parseMusicCommand(text)
  const row = radio.get()[cid]
  if (!c || !row) return false // no radio here (migration not applied yet): it's just a message
  if (row.disabled) toast(RADIO_OFF)
  else if (c.error) toast(c.error)
  else if (c.cmd === 'play') addLink(cid, c.arg).then(ok => ok && toast('Added to Chit Radio.'))
  else if (c.cmd === 'skip') skip(cid)
  else if (c.cmd === 'loop') setLoop(cid, c.mode || nextLoop(loopOf(row.state)))
  else radioUi.set({ open: cid })
  return true
}

// ── players: one shape for YouTube, SoundCloud and plain audio ──
// { autoStart, canRate, time() s, seek(s), play() → Promise, pause(), playing(), buffering(), vol(0..1), rate(r), dur() s | NaN, destroy() }
// Sound only, as fast as the official players allow. We can't pull an audio-only stream out of YouTube (that means
// ripping or proxying its video servers, against its terms), so the official IFrame player stays, just never shown:
//   · the API script and connections are warmed when you open or join a stadium, not when a song starts
//   · one deck per call: two hidden YouTube players, one SoundCloud widget and one <audio>, made once and reused
//     (loadVideoById / widget.load / a new src) instead of building a fresh iframe for every song
//   · the standby YouTube player cues the next song, so when the track moves on it just starts
let ytLoad = null, scLoad = null
function script(src, ready) {
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = src; s.async = true
    s.onload = () => ready ? null : res(); s.onerror = () => rej(new Error('blocked'))
    if (ready) ready(res)
    document.head.appendChild(s)
  })
}
const loadYT = () => window.YT?.Player ? Promise.resolve() : (ytLoad ||= script('https://www.youtube.com/iframe_api', res => {
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => { prev?.(); res() }
}).catch(e => { ytLoad = null; throw e }))
const loadSC = () => window.SC?.Widget ? Promise.resolve() : (scLoad ||= script('https://w.soundcloud.com/player/api.js').catch(e => { scLoad = null; throw e }))

// Preconnect to the players' hosts and fetch the YouTube API now, so the first song doesn't pay for it. Once per page.
let warmed = false
export function warmRadio() {
  if (warmed || radioApi.mock || typeof document === 'undefined') return
  warmed = true
  for (const href of RADIO_ORIGINS) {
    const l = document.createElement('link')
    l.rel = 'preconnect'; l.href = href
    document.head.appendChild(l)
  }
  loadYT().catch(() => { warmed = false })
}

const YT_HOST = 'https://www.youtube-nocookie.com'
const ytError = code => code === 101 || code === 150 ? "That video can't be played outside YouTube." : "Couldn't play that video."

// The deck: RadioPlayer owns one for as long as you're in the call. Each player slot has an `owner` (the ev handlers of
// the track using it right now); events only reach the owner, and a track that has moved on can't pause or load the
// slot the next one took over.
function makeDeck(host) {
  const yts = [] // up to two: [active, standby] after the first swap; see deckPlan
  let active = null
  function ytSlot() {
    const div = document.createElement('div')
    host.appendChild(div)
    const s = { p: null, ok: false, vid: null, owner: null, state: -1, loadAt: 0, lastVol: -1, muted: null }
    s.ready = loadYT().then(() => new Promise(res => {
      s.p = new window.YT.Player(div, {
        host: YT_HOST, width: 356, height: 200, playerVars: ytPlayerVars(location.origin),
        events: {
          onReady: () => { s.ok = true; res(s) },
          onStateChange: e => {
            s.state = e.data
            if (e.data === 0 || e.data === 1 || e.data === 2 || e.data === 5) s.loadAt = 0
            if (e.data !== 0 || !s.owner) return
            // an "ended" from the song before (after loadVideoById) is not this song ending
            const now = s.p.getVideoData?.()?.video_id
            if (!now || now === s.vid) s.owner.onEnd()
          },
          onError: e => s.owner?.onError(ytError(e.data)),
          onAutoplayBlocked: () => s.owner?.onBlocked(),
        },
      })
    }))
    yts.push(s)
    return s
  }
  const firstYt = () => active || (active = yts[0] || ytSlot())
  const standbyYt = () => yts.find(s => s !== active) || null
  const ensureStandby = () => standbyYt() || ytSlot()

  async function yt(id, ev, at) {
    await firstYt().ready
    if (!ev.alive()) return null
    const standby = standbyYt() // used only if it's ready already: never wait on it
    const { start, paused } = at()
    const plan = deckPlan(active, standby, id, paused)
    if (plan === 'swap') active = standby
    const s = active
    for (const o of yts) if (o !== s) { o.owner = null; if (o.ok && (o.state === 1 || o.state === 3)) try { o.p.pauseVideo() } catch {} }
    s.owner = ev
    s.loadAt = Date.now()
    if (plan === 'load') {
      s.vid = id; s.state = -1
      if (paused) s.p.cueVideoById({ videoId: id, startSeconds: start })
      else s.p.loadVideoById({ videoId: id, startSeconds: start }) // starts by itself
    } else {
      s.p.seekTo(start, true) // a cued or finished video plays from here
      s.p.playVideo()
    }
    try { s.p.setPlaybackQuality('small') } catch {} // usually ignored nowadays; harmless
    ev.onReady()
    const mine = () => s.owner === ev
    return {
      autoStart: !paused, canRate: false,
      time: () => s.p.getCurrentTime() || 0, seek: t => mine() && s.p.seekTo(t, true),
      play: () => { mine() && s.p.playVideo(); return Promise.resolve() }, pause: () => mine() && s.p.pauseVideo(),
      playing: () => mine() && s.state === 1,
      // just handed a song: loading until it plays, pauses or is cued (5 s at most, then the usual "Tap to listen" logic)
      buffering: () => s.state === 3 || (!!s.loadAt && Date.now() - s.loadAt < 5000),
      vol: v => {
        if (!mine()) return
        const n = Math.round(v * 100)
        if (n !== s.lastVol) { s.lastVol = n; s.p.setVolume(n) }
        if ((n === 0) !== s.muted) { s.muted = n === 0; s.muted ? s.p.mute() : s.p.unMute() }
      },
      rate: () => {}, dur: () => mine() ? s.p.getDuration() : NaN,
      destroy() { if (mine()) { s.owner = null; try { s.p.pauseVideo() } catch {} } },
    }
  }
  // Get the next YouTube song ready on the standby player (it fetches the video's details, not the stream).
  async function cue(id) {
    if (active?.vid === id) return // a looped song: the active player still has it
    const s = await ensureStandby().ready
    if (s === active || s.owner || s.vid === id) return
    s.vid = id
    try { s.p.cueVideoById({ videoId: id }) } catch {}
  }

  let sc = null
  async function scPlay(url, ev, at) {
    await loadSC()
    if (!ev.alive()) return null
    const { start, paused } = at()
    const opts = { auto_play: !paused, buying: false, sharing: false, download: false, show_comments: false, visual: false, single_active: false }
    if (!sc) {
      const f = document.createElement('iframe')
      f.allow = 'autoplay'
      f.title = 'SoundCloud player'
      f.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&${new URLSearchParams(opts)}`
      host.appendChild(f)
      const w = window.SC.Widget(f), E = window.SC.Widget.Events
      // PLAY_PROGRESS comes in bursts (and slower in a background tab), so time() runs on from the last report instead
      // of reading a stale number that would look like drift.
      sc = { w, owner: null, pos: 0, posAt: Date.now(), playing: false, dur: NaN, lastVol: -1, onLoad: null }
      sc.now = () => sc.playing ? sc.pos + (Date.now() - sc.posAt) / 1000 : sc.pos
      w.bind(E.READY, () => sc.onLoad?.())
      w.bind(E.PLAY_PROGRESS, e => { sc.pos = e.currentPosition / 1000; sc.posAt = Date.now() })
      w.bind(E.PLAY, () => { sc.posAt = Date.now(); sc.playing = true })
      w.bind(E.PAUSE, () => { sc.pos = sc.now(); sc.playing = false })
      w.bind(E.FINISH, () => { sc.playing = false; sc.owner?.onEnd() })
      w.bind(E.ERROR, () => sc.owner?.onError("Couldn't play that SoundCloud track."))
    } else {
      sc.w.load(url, { ...opts, callback: () => sc.onLoad?.() })
    }
    sc.owner = ev
    sc.pos = 0; sc.posAt = Date.now(); sc.playing = false; sc.dur = NaN; sc.lastVol = -1
    const s = sc, mine = () => s.owner === ev
    s.onLoad = () => {
      if (!mine()) return
      s.onLoad = null
      s.w.getDuration(d => { if (mine()) s.dur = d / 1000 })
      const t = at().start
      if (t > 1.5) { s.pos = t; s.posAt = Date.now(); s.w.seekTo(t * 1000) }
      ev.onReady()
    }
    return {
      autoStart: !paused, canRate: false,
      time: s.now, seek: t => { if (mine()) { s.pos = t; s.posAt = Date.now(); s.w.seekTo(t * 1000) } },
      play: () => { mine() && s.w.play(); return Promise.resolve() }, pause: () => mine() && s.w.pause(),
      playing: () => mine() && s.playing,
      vol: v => { const n = Math.round(v * 100); if (mine() && n !== s.lastVol) { s.lastVol = n; s.w.setVolume(n) } }, rate: () => {}, dur: () => s.dur,
      destroy() { if (mine()) { s.owner = null; s.onLoad = null; try { s.w.pause() } catch {} } },
    }
  }

  let au = null
  function audio(src, ev, at) {
    if (!au) {
      const el = new Audio()
      el.preload = 'auto'
      au = { el, owner: null, waiting: false }
      el.onended = () => au.owner?.onEnd()
      el.onerror = () => el.getAttribute('src') && au.owner?.onError("Couldn't load that song.")
      el.onloadedmetadata = () => au.owner?.onReady()
      el.onwaiting = el.onseeking = () => { au.waiting = true }
      el.onplaying = el.onseeked = () => { au.waiting = false }
    }
    const a = au, el = a.el, mine = () => a.owner === ev
    a.owner = ev
    el.src = src
    try { el.currentTime = at().start } catch {} // applied as soon as the file's header is in
    return {
      autoStart: false, canRate: true, el,
      time: () => el.currentTime, seek: s => { if (mine()) el.currentTime = s },
      play: () => mine() ? el.play() : Promise.resolve(), pause: () => mine() && el.pause(),
      playing: () => mine() && !el.paused, buffering: () => a.waiting || el.readyState < 3,
      vol: v => { if (mine()) el.volume = v }, rate: r => { if (mine() && el.playbackRate !== r) el.playbackRate = r },
      dur: () => el.duration,
      destroy() { if (mine()) { a.owner = null; el.pause(); el.playbackRate = 1 } },
    }
  }

  return {
    // → Promise<engine>. at() is read when the player is actually ready, so a slow first load starts at the right spot.
    engine: (t, ev, at) => t.kind === 'yt' ? yt(t.src, ev, at) : t.kind === 'sc' ? scPlay(t.src, ev, at) : Promise.resolve(audio(t.src, ev, at)),
    cue: id => cue(id).catch(() => {}),
    warm: () => firstYt().ready.catch(() => {}), // make the first YouTube player now, before anyone presses play
    destroy() {
      for (const s of yts) { s.owner = null; try { s.p?.destroy() } catch {} }
      if (sc) { sc.owner = null; try { sc.w.unbind(window.SC.Widget.Events.PLAY_PROGRESS) } catch {} }
      if (au) { au.owner = null; au.el.pause(); au.el.removeAttribute('src'); au.el.load() }
      host.replaceChildren()
    },
  }
}

// RadioLab: a silent stand-in that just keeps time.
function fakeEngine(ev) {
  let t = 0, at = null
  setTimeout(ev.onReady, 0)
  return {
    autoStart: false, canRate: false, time: () => at ? t + (Date.now() - at) / 1000 : t, seek: s => { t = s; if (at) at = Date.now() },
    play: () => { if (!at) at = Date.now(); return Promise.resolve() }, pause: () => { if (at) { t += (Date.now() - at) / 1000; at = null } },
    playing: () => !!at, vol: () => {}, rate: () => {}, dur: () => NaN, destroy() {},
  }
}

// Plays the current track in step with everyone else while you're in the stadium's call, whatever page you look at.
// One Player per play of a track (key = track id; a looped or re-queued song gets a fresh id), on the call's deck:
// refetches, ticks and volume changes never rebuild or reload anything.
const onBlocked = b => { if (radioPlay.get().blocked !== b) radioPlay.set(s => ({ ...s, blocked: b })) }
const onStarting = b => { if (radioPlay.get().starting !== b) radioPlay.set(s => ({ ...s, starting: b })) }
const blockedRef = { get current() { return radioPlay.get().blocked } }
function Player({ cid, state, deafened, deck }) {
  const stRef = useRef(state)
  stRef.current = state
  const deafRef = useRef(deafened)
  deafRef.current = deafened
  useEffect(() => {
    const t = state.track
    let eng = null, dead = false, ready = false, triedAt = 0, endAsked = 0, durSent = false, aligned = false
    let steadySince = 0, mem = syncMem(), gain = -1, duck = { amount: 0, lastLoud: -Infinity }, volAt = Date.now()
    const ev = {
      alive: () => !dead,
      onReady: () => { ready = true; if (eng) step() },
      onEnd: () => askEnd(),
      onBlocked: () => { if (!dead) onBlocked(true) },
      onError: msg => {
        if (dead) return
        toast(msg + ' Skipping it in a moment.')
        // the server only lets "ended" through after 5 s (and past the song's length when known)
        setTimeout(() => !dead && act(cid, 'ended', { id: t.id }), 5500)
      },
    }
    const askEnd = () => {
      if (dead || Date.now() - endAsked < 5000) return
      endAsked = Date.now()
      // everyone's browser notices at once; a little jitter so the first one wins and the rest find it already moved on
      setTimeout(() => !dead && stRef.current.track?.id === t.id && act(cid, 'ended', { id: t.id }), Math.random() * 900)
    }
    const volTarget = () => {
      const p = prefs.get()
      return musicGain({ vol: p.musicVol ?? DEFAULT_MUSIC_VOL, muted: !!p.musicMuted, deafened: deafRef.current, duck: p.musicDuck ?? true, amount: duck.amount })
    }
    const tryPlay = () => {
      triedAt = Date.now()
      eng.play().then(() => onBlocked(false), err => { if (err?.name === 'NotAllowedError') onBlocked(true) })
    }
    // Start at once, at the spot the song should be at right now (on our clock if the server's isn't known yet); the
    // sync loop corrects afterwards.
    onStarting(!isPaused(state))
    const at = () => ({ start: position(stRef.current, serverNow()) || 0, paused: isPaused(stRef.current) })
    const attach = e => {
      if (!e) return
      if (dead) return e.destroy()
      eng = e
      gain = volTarget(); eng.vol(outputVolume(gain)) // the right loudness from the first note, not a fade up from full
      if (!at().paused && !eng.autoStart) { aligned = true; tryPlay() } // <audio>: play() now, it starts when it can
      if (ready) step()
    }
    if (radioApi.mock) attach(fakeEngine(ev))
    else deck.engine(t, ev, at).then(attach, () => ev.onError("Couldn't load the player (is something blocking YouTube or SoundCloud?)."))

    const seekTo = s => { eng.seek(s); steadySince = 0 }
    // Sync: once a second (and right away when the player is ready), see where the song should be. Gentle by design
    // (see syncStep in lib/music.js): never seek while loading, and only after drift shows up twice.
    function step() {
      if (dead || !eng || !ready) return
      const now = Date.now(), st = stRef.current, sNow = serverNow(), target = position(st, sNow)
      if (target == null) return
      if (!durSent && !st.track.dur && eng.dur() > 1 && Number.isFinite(eng.dur())) { durSent = true; act(cid, 'dur', { id: t.id, dur: Math.round(eng.dur() * 10) / 10 }) }
      if (isOver(st, sNow)) return askEnd()
      if (isPaused(st)) { triedAt = 0; steadySince = 0; onStarting(false); if (eng.playing()) eng.pause(); return }
      if (!eng.playing()) {
        steadySince = 0
        if (blockedRef.current || eng.buffering?.()) return // never seek or poke a player that's still loading
        if (!triedAt) {
          if (!(Math.abs(eng.time() - target) <= 1.5)) seekTo(target)
          aligned = true
          tryPlay()
        }
        // asked to play a few seconds ago and still not going: the browser wants a tap first
        else if (now - triedAt > 4000 && !radioApi.mock) onBlocked(true)
        return
      }
      onStarting(false)
      triedAt = 0 // playing: if it stalls later it gets a fresh try before we ask for a tap
      if (eng.buffering?.()) { steadySince = 0; return }
      if (!aligned) { // autoplay got going on its own: line up once, right away (usually inside what's buffered)
        aligned = true
        if (!(Math.abs(eng.time() - target) <= 1.5)) { seekTo(target); mem = { ...mem, lastSeekAt: now }; return }
      }
      if (!steadySince) steadySince = now
      const r = syncStep(mem, { actual: eng.time(), target, now, steadyFor: now - steadySince, canRate: eng.canRate })
      mem = r.mem
      if (r.seek != null) seekTo(r.seek)
      if (r.rate != null) eng.rate(r.rate)
    }
    const sync = setInterval(step, 1000)
    // Volume: your slider, mute, deafen, and ducking while anyone talks. The duck envelope holds through pauses between
    // words and eases in and out; 10 updates a second at most, and only when the level actually moves.
    const vol = setInterval(() => {
      if (!eng) return
      const now = Date.now()
      duck = duckStep(duck, { loud: anyoneTalking(voiceLevels), now, dt: now - volAt })
      volAt = now
      const next = glide(Math.max(0, gain), volTarget(), 0.5)
      if (Math.abs(next - gain) >= 0.004) { gain = next; eng.vol(outputVolume(gain)) }
    }, 100)
    // Tap to listen: the card fires this inside the tap, so play() still counts as the user's gesture.
    const onTap = () => {
      if (!eng) return
      const target = position(stRef.current, serverNow())
      if (target != null && !isPaused(stRef.current)) {
        if (!(Math.abs(eng.time() - target) <= 1.5)) { seekTo(target); mem = { ...mem, lastSeekAt: Date.now() } }
        aligned = true
        tryPlay()
      }
    }
    addEventListener('radio-tap', onTap)
    return () => { dead = true; clearInterval(sync); clearInterval(vol); removeEventListener('radio-tap', onTap); eng?.destroy(); onBlocked(false); onStarting(false) }
  }, [state.track.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// The listening half of Chit Radio, mounted with the voice connection (Voice.jsx) for as long as you're in a stadium's
// call: watches the row, keeps the player going, and owns the deck's hidden host. The host sits off-screen at full size
// (YouTube holds back players under 200×200 or display:none); nothing of the video is ever shown, the card shows art.
export function RadioPlayer({ cid, deafened }) {
  useRadioRow(cid)
  const row = radio.use(s => s[cid])
  const host = useRef(null)
  const [deck, setDeck] = useState(null)
  const on = radioMode(row, false) === 'on'
  const track = on ? row.state?.track : null
  const next = on ? nextUp(row.state, row.queue) : null
  const busy = on && !!(track || row.queue.length) // the radio is in use here: worth making the YouTube player now
  useLayoutEffect(() => {
    if (radioApi.mock) return
    warmRadio()
    const d = makeDeck(host.current)
    setDeck(d)
    return () => { d.destroy(); setDeck(null) }
  }, [])
  useEffect(() => { if (deck && busy) deck.warm() }, [deck, busy])
  // Cue the next YouTube song on the standby player a few seconds into this one (not competing with its start).
  const nextYt = next?.kind === 'yt' ? next.src : null
  useEffect(() => {
    if (!deck || !nextYt) return
    const t = setTimeout(() => deck.cue(nextYt), 4000)
    return () => clearTimeout(t)
  }, [deck, nextYt, track?.id])
  useEffect(() => () => { onBlocked(false); onStarting(false) }, [])
  return <>
    {createPortal(<div className="radio-host" ref={host} aria-hidden="true" />, document.body)}
    {track && (deck || radioApi.mock) && <Player key={track.id} cid={cid} state={row.state} deafened={deafened} deck={deck} />}
  </>
}

// A line in the sidebar's call panel: what's on, with mute and skip a tap away from any page.
export function RadioMini({ cid }) {
  const row = radio.use(s => s[cid])
  const muted = prefs.use(s => !!s.musicMuted)
  const blocked = radioPlay.use(s => s.blocked)
  const track = radioMode(row, false) === 'on' ? row.state?.track : null
  if (!track) return null
  const st = row.state
  const sk = skipStatus(st, meId(), listenersIn(cid), isMod())
  return (
    <div className="radio-mini">
      <span className={`radio-eq${!isPaused(st) && !muted ? ' on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
      <span className="radio-mini-title" title={`Chit Radio: ${track.title}`}>{track.title}</span>
      {blocked && <button className="icon-btn" onClick={() => { onBlocked(false); dispatchEvent(new Event('radio-tap')) }} title="Tap to listen" aria-label="Start the music"><Icon name="play" size={15} /></button>}
      <button className={`icon-btn${muted ? ' on' : ''}`} onClick={() => setPref('musicMuted', !muted)} aria-pressed={muted}
        title={muted ? 'Unmute music' : 'Mute music (just for you)'} aria-label={muted ? 'Unmute music' : 'Mute music'}><Icon name={muted ? 'volume-mute' : 'volume'} size={15} /></button>
      <button className="icon-btn" onClick={() => skip(cid)} disabled={!sk.instant && sk.voted}
        title={sk.instant ? 'Skip this song' : `Vote to skip (${sk.votes}/${sk.need})`} aria-label="Skip this song"><Icon name="skip" size={15} /></button>
    </div>
  )
}

function useTick(on, ms = 500) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => set(n => n + 1), ms)
    return () => clearInterval(t)
  }, [on, ms])
}

function Art({ track, big }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [track?.art])
  return track?.art && !bad
    ? <img src={track.art} alt="" loading="lazy" onError={() => setBad(true)} className={big ? 'big' : undefined} />
    : <span className="radio-vinyl" aria-hidden="true"><Icon name="music" size={big ? 26 : 18} /></span>
}

// Two arrows chasing each other (a little 1 inside when looping one song). Drawn here: the icon set has no repeat.
function LoopIcon({ one, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 12V10C4 8.3 5.3 7 7 7H19M16 4L19 7L16 10M20 12V14C20 15.7 18.7 17 17 17H5M8 20L5 17L8 14" />
      {one && <path d="M11.2 10.6L12.4 9.8V14.2" strokeWidth="1.8" />}
    </svg>
  )
}
function LoopButton({ cid, loop, can, wide }) {
  const label = LOOP_LABEL[loop]
  return (
    <button className={`${wide ? 'btn small ghost radio-loop-wide' : 'icon-btn'} radio-loop${loop !== 'off' ? ' on' : ''}`} disabled={!can}
      onClick={() => setLoop(cid, nextLoop(loop))} aria-label={can ? `${label}. Change loop` : label}
      title={can ? `${label} (tap for ${LOOP_LABEL[nextLoop(loop)].toLowerCase()})` : `${label}. Whoever queued this song (or a mod) can change it.`}>
      <LoopIcon one={loop === 'one'} size={wide ? 16 : 18} />{wide && ` ${label}`}
    </button>
  )
}

// The now-playing card, at the stage's bottom-left. Everyone who can see the stadium sees it; only people who joined
// hear it. When a mod has turned the radio off, mods get a small chip to turn it back on and everyone else sees nothing.
export function RadioCard({ channel, meId: me, joined, deafened, listeners }) {
  const cid = channel.id
  useRadioRow(cid)
  const row = radio.use(s => s[cid])
  const st = row?.state || {}, track = st.track
  const min = prefs.use(s => !!s.radioMin)
  const muted = prefs.use(s => !!s.musicMuted)
  const blocked = radioPlay.use(s => s.blocked)
  const starting = radioPlay.use(s => s.starting)
  const pending = radioPending.use(s => s[cid])
  useTick(!!track && !min && !isPaused(st))
  const mod = isMod()
  const mode = radioMode(row, mod)
  useEffect(() => { if (mode === 'on') warmRadio() }, [mode]) // looking at the stadium: get YouTube's script in early
  if (mode === 'none') return null
  if (mode === 'off') {
    return (
      <div className="radio-card radio-off">
        <button className="btn small ghost" onClick={() => act(cid, 'enable')} title="Turn Chit Radio back on in this stadium">
          <Icon name="music" size={15} /> Radio off · Turn on
        </button>
      </div>
    )
  }
  if (!track && !joined) return null
  const pos = position(st, serverNow())
  const sk = skipStatus(st, me, listeners, mod)
  const owner = canSkipNow(track, me, mod)
  const loop = loopOf(st)
  const plays = joined && !!track
  const tap = () => {
    onBlocked(false)
    dispatchEvent(new Event('radio-tap')) // synchronous, so the player's play() runs inside this tap
  }
  const openQueue = () => radioUi.set({ open: cid })
  const cls = `radio-card${min ? ' min' : ''}${min && track && !isPaused(st) ? ' spinning' : ''}`
  // "starting…": a song just went in (title on its way), or the player hasn't made a sound yet
  const shown = track || pending
  const isStarting = (!track && !!pending) || (plays && starting && !isPaused(st) && !blocked)

  return (
    <section className={cls} aria-label="Chit Radio">
      <div className="radio-top">
        <span className="radio-art">
          <Art track={shown} />
          {min && <button className="radio-disc" onClick={() => setPref('radioMin', false)} title={track ? `Chit Radio: ${track.title}` : 'Chit Radio'} aria-label="Show Chit Radio" />}
        </span>
        {!min && <>
          <div className="radio-meta">
            <span className="radio-eyebrow">
              <span className={`radio-eq${track && !isPaused(st) ? ' on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
              Chit Radio{track && isPaused(st) ? ' · paused' : isStarting ? ' · starting…' : ''}
            </span>
            {!track && pending ? <span className="radio-title">{pending.title}</span> : track ? <>
              <a className="radio-title" href={sourceUrl(track)} target="_blank" rel="noreferrer noopener" title={track.title}>{track.title}</a>
              <span className="radio-by"><Avatar id={track.by} size={16} /> <Name id={track.by} /></span>
            </> : <span className="radio-title idle">Nothing playing yet</span>}
          </div>
          <button className="icon-btn radio-hide" onClick={() => setPref('radioMin', true)} title="Tuck away" aria-label="Tuck Chit Radio away"><Icon name="chevron-down" size={18} /></button>
        </>}
      </div>
      {!min && track && (
        <div className="radio-progress">
          <span>{fmtTime(pos)}</span>
          <div className="radio-bar" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(track.dur || 0)} aria-valuenow={Math.round(pos || 0)}>
            <i style={{ width: track.dur ? `${Math.min(100, (pos / track.dur) * 100)}%` : '0%' }} className={track.dur ? undefined : 'unknown'} />
          </div>
          <span>{fmtTime(track.dur)}</span>
        </div>
      )}
      {!min && (
        <div className="radio-ctl">
          {track && owner && (
            <button className="icon-btn" onClick={() => act(cid, isPaused(st) ? 'resume' : 'pause', { id: track.id })}
              title={isPaused(st) ? 'Play' : 'Pause'} aria-label={isPaused(st) ? 'Play' : 'Pause'}><Icon name={isPaused(st) ? 'play' : 'pause'} size={18} /></button>
          )}
          {track && (
            <button className={`btn small radio-skip${sk.voted ? ' on' : ''}`} onClick={() => skip(cid)} disabled={!sk.instant && sk.voted}
              title={sk.instant ? 'Skip this song' : `Skips when ${sk.need} of ${Math.max(listeners, 1)} vote`}>
              <Icon name="skip" size={16} /> {sk.instant ? 'Skip' : sk.voted ? `Voted ${sk.votes}/${sk.need}` : `Vote skip${sk.votes ? ` ${sk.votes}/${sk.need}` : ''}`}
            </button>
          )}
          {track && (owner || loop !== 'off') && <LoopButton cid={cid} loop={loop} can={owner} />}
          {joined && (
            <button className={`icon-btn${muted ? ' on' : ''}`} onClick={() => setPref('musicMuted', !muted)} aria-pressed={muted}
              title={muted ? 'Unmute music' : 'Mute music (just for you)'} aria-label={muted ? 'Unmute music' : 'Mute music'}><Icon name={muted ? 'volume-mute' : 'volume'} size={18} /></button>
          )}
          <button className="btn small ghost radio-q" onClick={openQueue} data-radio-open="">
            <Icon name="stack" size={16} /> {track ? `Queue${row.queue.length ? ` · ${row.queue.length}` : ''}` : 'Add a song'}
          </button>
        </div>
      )}
      {!min && !joined && track && <p className="radio-note">Join the stadium to listen along.</p>}
      {blocked && plays && (min
        ? <button className="btn primary small radio-tap pop" onClick={tap}><Icon name="play" size={14} /> Tap to listen</button>
        : <button className="radio-tap-cover" onClick={tap}><span className="btn primary"><Icon name="play" size={16} /> Tap to listen</span></button>)}
    </section>
  )
}

// The queue: add by link or upload, see what's next, take out your own songs; loop, volume and ducking live here too.
// Rendered into the stadium split (beside the stage, not inside it): the stage is its own stacking context, so a drawer
// inside it sat under the Chat button and the phone chat sheet. Esc, or a tap anywhere else in the stadium, closes it.
export function RadioDrawer({ channel, meId: me }) {
  const cid = channel.id
  const open = radioUi.use(s => s.open === cid)
  const row = radio.use(s => s[cid])
  const pending = radioPending.use(s => s[cid])
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState(null) // upload progress 0..1
  const file = useRef(null)
  const anchor = useRef(null), drawer = useRef(null)
  const [dock, setDock] = useState(null)
  const vol = prefs.use(s => s.musicVol ?? DEFAULT_MUSIC_VOL), muted = prefs.use(s => !!s.musicMuted), duck = prefs.use(s => s.musicDuck ?? true)
  const mod = isMod()
  const shown = open && radioMode(row, mod) === 'on'
  useLayoutEffect(() => { if (shown) setDock(anchor.current?.closest('.stadium-split') || null) }, [shown])
  useEffect(() => {
    if (!shown) return
    const close = () => radioUi.set({ open: null })
    const esc = e => { if (e.key === 'Escape') close() }
    const down = e => {
      const area = anchor.current?.closest('.stadium-split') || anchor.current?.closest('.stage')
      // only taps elsewhere in this stadium count (not dialogs, menus or toasts floating over the app)
      if (!area?.contains(e.target) || drawer.current?.contains(e.target) || e.target.closest?.('[data-radio-open]')) return
      close()
    }
    addEventListener('keydown', esc)
    document.addEventListener('pointerdown', down, true)
    return () => { removeEventListener('keydown', esc); document.removeEventListener('pointerdown', down, true) }
  }, [shown])
  const spot = <span ref={anchor} hidden />
  if (!shown) return spot
  const track = row.state?.track
  const loop = loopOf(row.state)
  const close = () => radioUi.set({ open: null })
  const add = async e => {
    e.preventDefault()
    if (!link.trim() || busy) return
    setBusy(true)
    if (await addLink(cid, link)) setLink('')
    setBusy(false)
  }
  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUp(0)
    await addUpload(cid, f, (a, b) => setUp(a / b))
    setUp(null)
  }
  const turnOff = async () => {
    if (!await ask({ text: 'Turn Chit Radio off in this stadium? The music stops, the queue is cleared, and only mods can turn it back on.', confirm: 'Turn off', danger: true })) return
    if (await act(cid, 'disable')) close()
  }
  const full = row.queue.length >= MAX_QUEUE
  const body = (
    <>
      <div className="radio-scrim" aria-hidden="true" />
      <aside className="radio-drawer pop" aria-label="Chit Radio queue" ref={drawer}>
        <header>
          <h3><Icon name="music" size={20} /> Chit Radio</h3>
          <button className="icon-btn" onClick={close} aria-label="Close queue" title="Close (Esc)"><Icon name="close" /></button>
        </header>
        <form className="radio-add" onSubmit={add}>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="Paste a YouTube, SoundCloud or .mp3 link"
            aria-label="Song link" disabled={full} enterKeyHint="send" />
          <button className="btn primary" disabled={busy || full || !link.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
        <div className="radio-upload">
          <button className="btn ghost small" onClick={() => file.current.click()} disabled={up != null || full}>
            <Icon name="paperclip" size={16} /> {up != null ? `Uploading ${Math.round(up * 100)}%` : 'Upload a song'}
          </button>
          <span className="small muted">mp3, m4a, ogg or wav, up to 20 MB</span>
          <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac" hidden onChange={pick} />
        </div>
        <div className="radio-list">
          <h4>Now playing</h4>
          {track ? <QueueRow t={track} now /> : pending ? <QueueRow t={pending} now /> : <p className="muted small">Nothing yet. Paste a link and it starts right away.</p>}
          {(track || mod || loop !== 'off') && <LoopButton cid={cid} loop={loop} can={canSkipNow(track, me, mod) || mod} wide />}
          <h4>Up next <span className="muted">{row.queue.length}/{MAX_QUEUE}</span></h4>
          {row.queue.length === 0 && <p className="muted small">The queue is empty.</p>}
          <ol>
            {row.queue.map((t, i) => (
              <li key={t.id}><QueueRow t={t} n={i + 1} onRemove={(mod || t.by === me) ? () => act(cid, 'remove', { id: t.id }) : null} /></li>
            ))}
            {track && pending && <li><QueueRow t={pending} n={row.queue.length + 1} /></li>}
          </ol>
        </div>
        <footer>
          <div className="radio-vol">
            <button className={`icon-btn${muted ? ' on' : ''}`} onClick={() => setPref('musicMuted', !muted)} aria-pressed={muted}
              aria-label={muted ? 'Unmute music' : 'Mute music'} title={muted ? 'Unmute music' : 'Mute music'}><Icon name={muted ? 'volume-mute' : vol < 0.4 ? 'volume-low' : 'volume'} size={18} /></button>
            <input type="range" min="0" max="100" value={Math.round(vol * 100)} aria-label="Music volume"
              onChange={e => { setPref('musicVol', +e.target.value / 100); if (muted) setPref('musicMuted', false) }} />
            <span className="small">{muted ? 'Muted' : `${Math.round(vol * 100)}%`}</span>
          </div>
          <label className="radio-duck"><input type="checkbox" checked={duck} onChange={e => setPref('musicDuck', e.target.checked)} /> Turn music down while people talk</label>
          <p className="small muted">Music volume is just for you, separate from voices.</p>
          {mod && (
            <div className="radio-mod">
              {(track || row.queue.length > 0) && <button className="btn danger small" onClick={() => act(cid, 'clear')}><Icon name="trash" size={15} /> Stop and clear</button>}
              <button className="btn ghost small" onClick={turnOff}><Icon name="block" size={15} /> Turn off radio in this stadium</button>
            </div>
          )}
        </footer>
      </aside>
    </>
  )
  return <>{spot}{dock ? createPortal(body, dock) : body}</>
}

function QueueRow({ t, n, now, onRemove }) {
  return (
    <div className={`radio-row${now ? ' now' : ''}`}>
      {n != null && <span className="radio-n">{n}</span>}
      <span className="radio-art sm"><Art track={t} /></span>
      <span className="radio-row-meta">
        <a href={sourceUrl(t)} target="_blank" rel="noreferrer noopener" title={t.title}>{t.title}</a>
        <span className="small muted"><Name id={t.by} />{t.dur ? ` · ${fmtTime(t.dur)}` : ''} · {t.kind === 'yt' ? 'YouTube' : t.kind === 'sc' ? 'SoundCloud' : 'Audio'}</span>
      </span>
      {onRemove && <button className="icon-btn" onClick={onRemove} title="Take it out" aria-label={`Remove ${t.title}`}><Icon name="close" size={16} /></button>}
    </div>
  )
}
