import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, freshChannel } from './lib/supabase'
import { createStore, online, prefs, setPref, toast, voiceLevels } from './lib/store'
import {
  AUDIO_EXT, LOOP_LABEL, MAX_QUEUE, MAX_UPLOAD, RADIO_OFF, anyoneTalking, duckStep, fmtTime, glide, isOver, isPaused, loopOf,
  mergeOffset, musicGain, nextLoop, parseMusicCommand, parseTrackUrl, pickOffset, position, radioGone, radioMode, rowFrom,
  skipStatus, sourceUrl, syncMem, syncStep, titleFromFile, titleFromSc, ytThumb, canSkipNow,
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
//   radioPlay  { blocked }: the browser wants a tap before it plays sound (the card shows "Tap to listen")
//   radioSlot  { el, video, round }: the card's art spot; the player's frame floats over it while it's on screen
const radioPlay = createStore({ blocked: false })
const radioSlot = createStore({ el: null, video: false, round: false })

// Server clock: the quickest of a few round trips, refreshed every 10 minutes (and kept unless the new one is about as
// precise, so the target never jumps by a slow trip's error). serverNow() is "now" on the database's clock.
let clock = null, clockAt = 0, clockBusy = null, clockDone
const clockReady = new Promise(r => { clockDone = r })
function syncClock() {
  if (radioApi.mock) return clockDone()
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
  })().catch(() => {}).finally(() => { clockBusy = null; clockDone() })
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
async function oembed(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) })
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
  return act(cid, 'add', { track: await trackFor(p) })
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
// { canRate, time() s, seek(s), play() → Promise, pause(), playing(), buffering(), vol(0..1), rate(r), dur() s | NaN, destroy() }
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

function audioEngine(src, ev) {
  const el = new Audio()
  let waiting = false
  el.preload = 'auto'
  el.src = src
  el.onended = ev.onEnd
  el.onerror = () => ev.onError("Couldn't load that song.")
  el.onloadedmetadata = ev.onReady
  el.onwaiting = () => { waiting = true }
  el.onplaying = () => { waiting = false }
  el.onseeking = () => { waiting = true }
  el.onseeked = () => { waiting = false }
  return {
    canRate: true, el,
    time: () => el.currentTime, seek: s => { el.currentTime = s }, play: () => el.play(), pause: () => el.pause(),
    playing: () => !el.paused, buffering: () => waiting || el.readyState < 3,
    vol: v => { el.volume = v }, rate: r => { if (el.playbackRate !== r) el.playbackRate = r },
    dur: () => el.duration, destroy() { el.pause(); el.removeAttribute('src'); el.load() },
  }
}

async function ytEngine(id, host, start, ev) {
  await loadYT()
  const div = document.createElement('div')
  host.appendChild(div)
  let ready = false, state = -1, lastVol = -1, muted = null
  const p = new window.YT.Player(div, {
    videoId: id, width: '100%', height: '100%',
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0, start: Math.floor(start) },
    events: {
      onReady: () => { ready = true; ev.onReady() },
      onStateChange: e => { state = e.data; if (e.data === 0) ev.onEnd() },
      onError: e => ev.onError(e.data === 101 || e.data === 150 ? "That video can't be played outside YouTube." : "Couldn't play that video."),
      onAutoplayBlocked: () => ev.onBlocked(),
    },
  })
  return {
    canRate: false,
    time: () => ready ? p.getCurrentTime() : 0, seek: s => ready && p.seekTo(s, true),
    play: () => { ready && p.playVideo(); return Promise.resolve() }, pause: () => ready && p.pauseVideo(),
    playing: () => state === 1, buffering: () => state === 3,
    vol: v => {
      if (!ready) return
      const n = Math.round(v * 100)
      if (n !== lastVol) { lastVol = n; p.setVolume(n) }
      if ((n === 0) !== muted) { muted = n === 0; muted ? p.mute() : p.unMute() }
    },
    rate: () => {}, dur: () => ready ? p.getDuration() : NaN,
    destroy() { try { p.destroy() } catch {} host.replaceChildren() },
  }
}

async function scEngine(url, host, ev) {
  await loadSC()
  const f = document.createElement('iframe')
  f.allow = 'autoplay'
  f.title = 'SoundCloud player'
  f.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&buying=false&sharing=false&download=false&show_comments=false&visual=true&single_active=false`
  host.appendChild(f)
  const w = window.SC.Widget(f), E = window.SC.Widget.Events
  // PLAY_PROGRESS comes in bursts (and slower in a background tab), so time() runs on from the last report instead of
  // reading a stale number that would look like drift.
  let pos = 0, posAt = Date.now(), playing = false, dur = NaN, lastVol = -1
  const now = () => playing ? pos + (Date.now() - posAt) / 1000 : pos
  w.bind(E.READY, () => { w.getDuration(d => { dur = d / 1000 }); ev.onReady() })
  w.bind(E.PLAY_PROGRESS, e => { pos = e.currentPosition / 1000; posAt = Date.now() })
  w.bind(E.PLAY, () => { posAt = Date.now(); playing = true })
  w.bind(E.PAUSE, () => { pos = now(); playing = false })
  w.bind(E.FINISH, () => { playing = false; ev.onEnd() })
  w.bind(E.ERROR, () => ev.onError("Couldn't play that SoundCloud track."))
  return {
    canRate: false,
    time: now, seek: s => { pos = s; posAt = Date.now(); w.seekTo(s * 1000) }, play: () => { w.play(); return Promise.resolve() }, pause: () => w.pause(),
    playing: () => playing,
    vol: v => { const n = Math.round(v * 100); if (n !== lastVol) { lastVol = n; w.setVolume(n) } }, rate: () => {}, dur: () => dur,
    destroy() { try { w.unbind(E.PLAY_PROGRESS) } catch {} host.replaceChildren() },
  }
}

// RadioLab: a silent stand-in that just keeps time.
function fakeEngine(ev) {
  let t = 0, at = null
  setTimeout(ev.onReady, 0)
  return {
    canRate: false, time: () => at ? t + (Date.now() - at) / 1000 : t, seek: s => { t = s; if (at) at = Date.now() },
    play: () => { if (!at) at = Date.now(); return Promise.resolve() }, pause: () => { if (at) { t += (Date.now() - at) / 1000; at = null } },
    playing: () => !!at, vol: () => {}, rate: () => {}, dur: () => NaN, destroy() {},
  }
}

// Plays the current track in step with everyone else while you're in the stadium's call, whatever page you look at.
// YouTube and SoundCloud draw into RadioPlayer's floating host. One player per play of a track (key = track id; a looped
// or re-queued song gets a fresh id), kept in refs: refetches, ticks and volume changes never rebuild or reload it.
const onBlocked = b => { if (radioPlay.get().blocked !== b) radioPlay.set({ blocked: b }) }
const blockedRef = { get current() { return radioPlay.get().blocked } }
function Player({ cid, state, deafened, host }) {
  const stRef = useRef(state)
  stRef.current = state
  const deafRef = useRef(deafened)
  deafRef.current = deafened
  useEffect(() => {
    const t = state.track
    let eng = null, dead = false, ready = false, triedAt = 0, endAsked = 0, durSent = false, aligned = false
    let steadySince = 0, mem = syncMem(), gain = -1, duck = { amount: 0, lastLoud: -Infinity }, volAt = Date.now()
    const ev = {
      onReady: () => { ready = true },
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
    // Start once the server clock is known (or 1.5 s at most), so the first position isn't off by our clock's skew.
    Promise.race([clockReady, new Promise(r => setTimeout(r, 1500))]).then(() => {
      if (dead || !host.current) return
      const start = position(stRef.current, serverNow()) || 0
      const make = radioApi.mock ? Promise.resolve(fakeEngine(ev))
        : t.kind === 'yt' ? ytEngine(t.src, host.current, start, ev)
        : t.kind === 'sc' ? scEngine(t.src, host.current, ev)
        : Promise.resolve(audioEngine(t.src, ev))
      make.then(e => { if (dead) e.destroy(); else eng = e }, () => ev.onError("Couldn't load the player (is something blocking YouTube or SoundCloud?)."))
    })

    const tryPlay = () => {
      triedAt = Date.now()
      eng.play().then(() => onBlocked(false), err => { if (err?.name === 'NotAllowedError') onBlocked(true) })
    }
    const seekTo = s => { eng.seek(s); steadySince = 0 }
    // Sync: once a second, see where the song should be. Gentle by design (see syncStep in lib/music.js).
    const sync = setInterval(() => {
      if (!eng || !ready) return
      const now = Date.now(), st = stRef.current, sNow = serverNow(), target = position(st, sNow)
      if (target == null) return
      if (!durSent && !st.track.dur && eng.dur() > 1 && Number.isFinite(eng.dur())) { durSent = true; act(cid, 'dur', { id: t.id, dur: Math.round(eng.dur() * 10) / 10 }) }
      if (isOver(st, sNow)) return askEnd()
      if (isPaused(st)) { triedAt = 0; steadySince = 0; if (eng.playing()) eng.pause(); return }
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
      triedAt = 0 // playing: if it stalls later it gets a fresh try before we ask for a tap
      if (eng.buffering?.()) { steadySince = 0; return }
      if (!aligned) { // autoplay got going on its own: line up once, right away
        aligned = true
        if (!(Math.abs(eng.time() - target) <= 1.5)) { seekTo(target); mem = { ...mem, lastSeekAt: now }; return }
      }
      if (!steadySince) steadySince = now
      const r = syncStep(mem, { actual: eng.time(), target, now, steadyFor: now - steadySince, canRate: eng.canRate })
      mem = r.mem
      if (r.seek != null) seekTo(r.seek)
      if (r.rate != null) eng.rate(r.rate)
    }, 1000)
    // Volume: your slider, mute, deafen, and ducking while anyone talks. The duck envelope holds through pauses between
    // words and eases in and out; 10 updates a second at most, and only when the level actually moves.
    const vol = setInterval(() => {
      if (!eng || !ready) return
      const now = Date.now(), p = prefs.get()
      duck = duckStep(duck, { loud: anyoneTalking(voiceLevels), now, dt: now - volAt })
      volAt = now
      const target = musicGain({ vol: p.musicVol ?? 0.6, muted: !!p.musicMuted, deafened: deafRef.current, duck: p.musicDuck ?? true, amount: duck.amount })
      const next = glide(Math.max(0, gain), target, 0.5)
      if (Math.abs(next - gain) >= 0.004) { gain = next; eng.vol(gain) }
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
    return () => { dead = true; clearInterval(sync); clearInterval(vol); removeEventListener('radio-tap', onTap); eng?.destroy(); onBlocked(false) }
  }, [state.track.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Artwork. While you listen to YouTube / SoundCloud, the real player (owned by RadioPlayer, so it never reloads when
// you come and go) floats over this spot.
function ArtSlot({ track, plays, onOpen, label, video, round }) {
  const el = useRef(null)
  const live = plays && track.kind !== 'audio' && !radioApi.mock
  useLayoutEffect(() => {
    if (!live) return
    const me = el.current
    radioSlot.set({ el: me, video: !!video, round: !!round })
    return () => { if (radioSlot.get().el === me) radioSlot.set({ el: null, video: false, round: false }) }
  }, [live, video, round])
  return (
    <span className="radio-art" ref={el}>
      <Art track={track} />
      {onOpen && <button className="radio-disc" onClick={onOpen} title={label} aria-label="Show Chit Radio" />}
    </span>
  )
}

// The listening half of Chit Radio, mounted with the voice connection (Voice.jsx) for as long as you're in a stadium's
// call: watches the row, keeps the player going, and owns the floating frame YouTube / SoundCloud draw into. The frame
// sits over the card's art while the stadium is on screen and waits off-screen (still full size: YouTube holds back
// players under 200×200 or display:none) while you're elsewhere.
export function RadioPlayer({ cid, deafened }) {
  useRadioRow(cid)
  const row = radio.use(s => s[cid])
  const slot = radioSlot.use(s => s)
  const drawerOpen = radioUi.use(s => s.open === cid) // the drawer covers the card: the frame steps aside, the art shows
  const host = useRef(null), float = useRef(null)
  const track = radioMode(row, false) === 'on' ? row.state?.track : null
  useEffect(() => {
    const f = float.current
    if (!f) return
    const off = () => { f.className = 'radio-float off'; f.removeAttribute('style') }
    if (!slot.el || drawerOpen) return off()
    let raf = 0, last = ''
    const place = () => {
      const r = slot.el.isConnected ? slot.el.getBoundingClientRect() : null
      const on = r && r.width > 0 && r.height > 0
      const key = on ? `${r.left}|${r.top}|${r.width}|${r.height}` : 'off'
      if (key !== last) {
        last = key
        if (!on) off()
        else {
          f.className = `radio-float${slot.video ? ' video' : ''}`
          f.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--k:${r.height / 200};border-radius:${slot.round ? '50%' : slot.video ? '14px' : '12px'}`
        }
      }
      raf = requestAnimationFrame(place)
    }
    place()
    return () => { cancelAnimationFrame(raf); off() }
  }, [slot, drawerOpen])
  useEffect(() => () => onBlocked(false), [])
  return <>
    {createPortal(<div className="radio-float off" ref={float}><div className="radio-host" ref={host} /></div>, document.body)}
    {track && <Player key={track.id} cid={cid} state={row.state} deafened={deafened} host={host} />}
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
  const [video, setVideo] = useState(false)
  useTick(!!track && !min && !isPaused(st))
  const mod = isMod()
  const mode = radioMode(row, mod)
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
  const cls = `radio-card${min ? ' min' : ''}${min && track && !isPaused(st) ? ' spinning' : ''}${!min && video && track?.kind !== 'audio' ? ' video' : ''}`

  return (
    <section className={cls} aria-label="Chit Radio">
      <div className="radio-top">
        <ArtSlot track={track} plays={plays} onOpen={min ? () => setPref('radioMin', false) : null} label={track ? `Chit Radio: ${track.title}` : 'Chit Radio'}
          video={!min && video} round={min} />
        {!min && <>
          <div className="radio-meta">
            <span className="radio-eyebrow">
              <span className={`radio-eq${track && !isPaused(st) ? ' on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
              Chit Radio{track && isPaused(st) ? ' · paused' : ''}
            </span>
            {track ? <>
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
          {track && track.kind !== 'audio' && plays && (
            <button className={`icon-btn${video ? ' on' : ''}`} onClick={() => setVideo(v => !v)} title={video ? 'Smaller player' : 'Bigger player'}
              aria-label={video ? 'Smaller player' : 'Bigger player'} aria-pressed={video}><Icon name="fullscreen" size={17} /></button>
          )}
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
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState(null) // upload progress 0..1
  const file = useRef(null)
  const anchor = useRef(null), drawer = useRef(null)
  const [dock, setDock] = useState(null)
  const vol = prefs.use(s => s.musicVol ?? 0.6), muted = prefs.use(s => !!s.musicMuted), duck = prefs.use(s => s.musicDuck ?? true)
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
          {track ? <QueueRow t={track} now /> : <p className="muted small">Nothing yet. Paste a link and it starts right away.</p>}
          {(track || mod || loop !== 'off') && <LoopButton cid={cid} loop={loop} can={canSkipNow(track, me, mod) || mod} wide />}
          <h4>Up next <span className="muted">{row.queue.length}/{MAX_QUEUE}</span></h4>
          {row.queue.length === 0 && <p className="muted small">The queue is empty.</p>}
          <ol>
            {row.queue.map((t, i) => (
              <li key={t.id}><QueueRow t={t} n={i + 1} onRemove={(mod || t.by === me) ? () => act(cid, 'remove', { id: t.id }) : null} /></li>
            ))}
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
