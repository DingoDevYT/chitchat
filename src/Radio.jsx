import { useEffect, useRef, useState } from 'react'
import { supabase, freshChannel } from './lib/supabase'
import { createStore, online, prefs, setPref, toast, voiceLevels } from './lib/store'
import {
  AUDIO_EXT, MAX_QUEUE, MAX_UPLOAD, anyoneTalking, clockOffset, correction, fmtTime, glide, isOver, isPaused, musicGain,
  parseMusicCommand, parseTrackUrl, position, skipStatus, sourceUrl, titleFromFile, titleFromSc, ytThumb, canSkipNow,
} from './lib/music'
import { uploadFile } from './lib/upload'
import { app } from './menus'
import Avatar, { Name } from './Avatar'
import Icon from './icons/Icon'
import './styles/radio.css'

// Chit Radio: a synced listen-along per stadium. stadium_music (041) holds { track, started_at, paused_at, skips } and the
// queue; every listener's own browser plays the same song at the same spot. Nothing is re-streamed over the call.

// ── shared bits ──
export const radio = createStore({}) // channel id -> { state, queue } | null (table missing / no access)
export const radioUi = createStore({ open: null }) // which stadium's queue drawer is open
// RadioLab swaps these for a local simulation (no database, silent players).
export const radioApi = { mock: false, act: null }

// Server clock: one round trip, refreshed every 10 minutes. serverNow() is "now" on the database's clock.
let offset = 0, offsetAt = 0
async function syncClock() {
  if (radioApi.mock || Date.now() - offsetAt < 600_000) return
  offsetAt = Date.now()
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('music_now')
  const t1 = Date.now()
  if (!error && typeof data === 'number' && t1 - t0 < 5000) offset = clockOffset(t0, t1, data)
  else offsetAt = 0
}
export const serverNow = () => Date.now() + offset

const pings = new Map() // channel id -> broadcast channel, to nudge other listeners to refetch
const isMod = () => !!(app.ctx?.can?.('manage_messages') || app.ctx?.can?.('manage_channels'))
const meId = () => app.ctx?.userId
const listenersIn = cid => Object.values(online.get()).filter(p => p.voice === cid).length

// Every change goes through music_do, which checks who may do what. Returns true on success.
export async function act(cid, action, arg = {}) {
  if (radioApi.act) return radioApi.act(cid, action, arg)
  const { data, error } = await supabase.rpc('music_do', { cid, act: action, arg })
  if (error) { toast(error.message); return false }
  if (data?.row) radio.set(s => ({ ...s, [cid]: { state: data.row.state || {}, queue: data.row.queue || [] } }))
  pings.get(cid)?.send({ type: 'broadcast', event: 'changed', payload: {} })
  return true
}

// Reads the row and keeps it fresh: database changes, plus a broadcast nudge from whoever changed it (the Members
// pattern: the payload is never trusted, everyone refetches), plus coming back to the tab.
function useRadioRow(cid) {
  useEffect(() => {
    if (radioApi.mock) return
    let alive = true
    syncClock()
    const fetch = () => supabase.from('stadium_music').select('state, queue').eq('channel_id', cid).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      radio.set(s => ({ ...s, [cid]: error ? null : { state: data?.state || {}, queue: data?.queue || [] } }))
    })
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
  }, [cid])
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

// Stadium chat: /play <link>, /skip, /queue. true = handled (don't send it as a message).
export function musicCommand(cid, text) {
  const c = parseMusicCommand(text)
  if (!c || !radio.get()[cid]) return false // no radio here (migration not applied yet): it's just a message
  if (c.error) toast(c.error)
  else if (c.cmd === 'play') addLink(cid, c.arg).then(ok => ok && toast('Added to Chit Radio.'))
  else if (c.cmd === 'skip') skip(cid)
  else radioUi.set({ open: cid })
  return true
}

// ── players: one shape for YouTube, SoundCloud and plain audio ──
// { canRate, time() s, seek(s), play() → Promise, pause(), playing(), vol(0..1), rate(r), dur() s | NaN, destroy() }
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
  el.preload = 'auto'
  el.src = src
  el.onended = ev.onEnd
  el.onerror = () => ev.onError("Couldn't load that song.")
  el.onloadedmetadata = ev.onReady
  return {
    canRate: true, el,
    time: () => el.currentTime, seek: s => { el.currentTime = s }, play: () => el.play(), pause: () => el.pause(),
    playing: () => !el.paused, vol: v => { el.volume = v }, rate: r => { if (el.playbackRate !== r) el.playbackRate = r },
    dur: () => el.duration, destroy() { el.pause(); el.removeAttribute('src'); el.load() },
  }
}

async function ytEngine(id, host, start, ev) {
  await loadYT()
  const div = document.createElement('div')
  host.appendChild(div)
  let ready = false, state = -1
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
    vol: v => { if (!ready) return; p.setVolume(Math.round(v * 100)); v ? p.isMuted() && p.unMute() : p.mute() },
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
  let pos = 0, playing = false, dur = NaN
  w.bind(E.READY, () => { w.getDuration(d => { dur = d / 1000 }); ev.onReady() })
  w.bind(E.PLAY_PROGRESS, e => { pos = e.currentPosition / 1000 })
  w.bind(E.PLAY, () => { playing = true })
  w.bind(E.PAUSE, () => { playing = false })
  w.bind(E.FINISH, () => { playing = false; ev.onEnd() })
  w.bind(E.ERROR, () => ev.onError("Couldn't play that SoundCloud track."))
  return {
    canRate: false,
    time: () => pos, seek: s => { pos = s; w.seekTo(s * 1000) }, play: () => { w.play(); return Promise.resolve() }, pause: () => w.pause(),
    playing: () => playing, vol: v => w.setVolume(Math.round(v * 100)), rate: () => {}, dur: () => dur,
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

// Plays the current track in step with everyone else while you're in the stadium. Lives inside the card's artwork slot
// (YouTube and SoundCloud draw their own player there). Remounted per track (key).
function Player({ cid, state, deafened, host, onBlocked, blockedRef }) {
  const stRef = useRef(state)
  stRef.current = state
  const deafRef = useRef(deafened)
  deafRef.current = deafened
  useEffect(() => {
    const t = state.track
    let eng = null, dead = false, ready = false, seekedAt = 0, triedAt = 0, endAsked = 0, durSent = false, gain = 0
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
    const start = position(state, serverNow()) || 0
    const make = radioApi.mock ? Promise.resolve(fakeEngine(ev))
      : t.kind === 'yt' ? ytEngine(t.src, host.current, start, ev)
      : t.kind === 'sc' ? scEngine(t.src, host.current, ev)
      : Promise.resolve(audioEngine(t.src, ev))
    make.then(e => { if (dead) e.destroy(); else eng = e }, () => ev.onError("Couldn't load the player (is something blocking YouTube or SoundCloud?)."))

    const tryPlay = () => {
      triedAt = Date.now()
      eng.play().then(() => onBlocked(false), err => { if (err?.name === 'NotAllowedError') onBlocked(true) })
    }
    // Sync: once a second, line up with where the song should be.
    const sync = setInterval(() => {
      if (!eng || !ready) return
      const st = stRef.current, now = serverNow(), target = position(st, now)
      if (target == null) return
      if (!durSent && !st.track.dur && eng.dur() > 1 && Number.isFinite(eng.dur())) { durSent = true; act(cid, 'dur', { id: t.id, dur: Math.round(eng.dur() * 10) / 10 }) }
      if (isOver(st, now)) return askEnd()
      if (isPaused(st)) { triedAt = 0; if (eng.playing()) eng.pause(); return }
      if (!eng.playing()) {
        if (blockedRef.current || eng.buffering?.()) return
        if (!triedAt) { if (Math.abs(eng.time() - target) > 1) eng.seek(target); tryPlay() }
        // asked to play a few seconds ago and still not going: the browser wants a tap first
        else if (Date.now() - triedAt > 2500 && !radioApi.mock) onBlocked(true)
        return
      }
      if (Date.now() - seekedAt < 2500) return // let a seek settle before judging drift again
      const c = correction(eng.time(), target, { canRate: eng.canRate })
      if (c.seek != null) { eng.seek(c.seek); seekedAt = Date.now() } else eng.rate(c.rate)
    }, 1000)
    // Volume: your slider, mute, deafen, and ducking while anyone talks; glides so it never clicks.
    const vol = setInterval(() => {
      if (!eng || !ready) return
      const p = prefs.get()
      const target = musicGain({ vol: p.musicVol ?? 0.6, muted: !!p.musicMuted, deafened: deafRef.current, duck: p.musicDuck ?? true, talking: anyoneTalking(voiceLevels) })
      const next = glide(gain, target)
      if (next !== gain) { gain = next; eng.vol(gain) }
    }, 120)
    // Tap to listen: the card fires this inside the tap, so play() still counts as the user's gesture.
    const onTap = () => {
      if (!eng) return
      const target = position(stRef.current, serverNow())
      if (target != null && !isPaused(stRef.current)) { eng.seek(target); seekedAt = Date.now(); tryPlay() }
    }
    addEventListener('radio-tap', onTap)
    return () => { dead = true; clearInterval(sync); clearInterval(vol); removeEventListener('radio-tap', onTap); eng?.destroy(); onBlocked(false) }
  }, [state.track.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Artwork, or (YouTube / SoundCloud while you listen) the real player, drawn into .radio-host by the engine.
function ArtSlot({ track, plays, host }) {
  const live = plays && track.kind !== 'audio' && !radioApi.mock
  return (
    <span className={`radio-art${live ? ' live' : ''}`}>
      {!live && <Art track={track} />}
      <span className="radio-host" ref={host} />
    </span>
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

// The now-playing card on the stage. Everyone who can see the stadium sees it; only people who joined hear it.
export function RadioCard({ channel, meId: me, joined, deafened, listeners, below }) {
  const cid = channel.id
  useRadioRow(cid)
  const row = radio.use(s => s[cid])
  const st = row?.state || {}, track = st.track
  const min = prefs.use(s => !!s.radioMin)
  const muted = prefs.use(s => !!s.musicMuted)
  const [blocked, setBlocked] = useState(false)
  const blockedRef = useRef(false)
  blockedRef.current = blocked
  const host = useRef(null)
  const [video, setVideo] = useState(false)
  useTick(!!track && !min && !isPaused(st))
  if (!row || (!track && !joined)) return null
  const mod = isMod()
  const pos = position(st, serverNow())
  const sk = skipStatus(st, me, listeners, mod)
  const owner = canSkipNow(track, me, mod)
  const plays = joined && !!track
  const tap = () => {
    setBlocked(false)
    dispatchEvent(new Event('radio-tap')) // synchronous, so the player's play() runs inside this tap
  }
  const openQueue = () => radioUi.set({ open: cid })

  if (min) {
    return (
      <div className={`radio-card min${below ? ' below' : ''}${track && !isPaused(st) ? ' spinning' : ''}`}>
        <button className="radio-disc" onClick={() => setPref('radioMin', false)} title={track ? `Chit Radio: ${track.title}` : 'Chit Radio'} aria-label="Show Chit Radio">
          <ArtSlot track={track} plays={plays} host={host} />
        </button>
        {plays && <Player key={track.id} cid={cid} state={st} deafened={deafened} host={host} onBlocked={setBlocked} blockedRef={blockedRef} />}
        {blocked && plays && <button className="btn primary small radio-tap pop" onClick={tap}><Icon name="play" size={14} /> Tap to listen</button>}
      </div>
    )
  }

  return (
    <section className={`radio-card${below ? ' below' : ''}${video && track?.kind !== 'audio' ? ' video' : ''}`} aria-label="Chit Radio">
      <div className="radio-top">
        <ArtSlot track={track} plays={plays} host={host} />
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
        <button className="icon-btn radio-hide" onClick={() => setPref('radioMin', true)} title="Tuck away" aria-label="Tuck Chit Radio away"><Icon name="chevron-up" size={18} /></button>
      </div>
      {track && (
        <div className="radio-progress">
          <span>{fmtTime(pos)}</span>
          <div className="radio-bar" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(track.dur || 0)} aria-valuenow={Math.round(pos || 0)}>
            <i style={{ width: track.dur ? `${Math.min(100, (pos / track.dur) * 100)}%` : '0%' }} className={track.dur ? undefined : 'unknown'} />
          </div>
          <span>{fmtTime(track.dur)}</span>
        </div>
      )}
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
        {track && track.kind !== 'audio' && plays && (
          <button className={`icon-btn${video ? ' on' : ''}`} onClick={() => setVideo(v => !v)} title={video ? 'Smaller player' : 'Bigger player'}
            aria-label={video ? 'Smaller player' : 'Bigger player'} aria-pressed={video}><Icon name="fullscreen" size={17} /></button>
        )}
        {joined && (
          <button className={`icon-btn${muted ? ' on' : ''}`} onClick={() => setPref('musicMuted', !muted)} aria-pressed={muted}
            title={muted ? 'Unmute music' : 'Mute music (just for you)'} aria-label={muted ? 'Unmute music' : 'Mute music'}><Icon name={muted ? 'volume-mute' : 'volume'} size={18} /></button>
        )}
        <button className="btn small ghost radio-q" onClick={openQueue}>
          <Icon name="stack" size={16} /> {track ? `Queue${row.queue.length ? ` · ${row.queue.length}` : ''}` : 'Add a song'}
        </button>
      </div>
      {!joined && track && <p className="radio-note">Join the stadium to listen along.</p>}
      {plays && <Player key={track.id} cid={cid} state={st} deafened={deafened} host={host} onBlocked={setBlocked} blockedRef={blockedRef} />}
      {blocked && plays && <button className="radio-tap-cover" onClick={tap}><span className="btn primary"><Icon name="play" size={16} /> Tap to listen</span></button>}
    </section>
  )
}

// The queue: add by link or upload, see what's next, take out your own songs; volume and ducking live here too.
export function RadioDrawer({ channel, meId: me }) {
  const cid = channel.id
  const open = radioUi.use(s => s.open === cid)
  const row = radio.use(s => s[cid])
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState(null) // upload progress 0..1
  const file = useRef(null)
  const vol = prefs.use(s => s.musicVol ?? 0.6), muted = prefs.use(s => !!s.musicMuted), duck = prefs.use(s => s.musicDuck ?? true)
  useEffect(() => {
    if (!open) return
    const esc = e => { if (e.key === 'Escape') radioUi.set({ open: null }) }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [open])
  if (!open || !row) return null
  const mod = isMod()
  const track = row.state?.track
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
  const full = row.queue.length >= MAX_QUEUE
  return (
    <aside className="radio-drawer pop" aria-label="Chit Radio queue">
      <header>
        <h3><Icon name="music" size={20} /> Chit Radio</h3>
        <button className="icon-btn" onClick={close} aria-label="Close queue"><Icon name="close" /></button>
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
        {mod && (track || row.queue.length > 0) && <button className="btn danger small" onClick={() => act(cid, 'clear')}><Icon name="trash" size={15} /> Stop and clear the radio</button>}
      </footer>
    </aside>
  )
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
