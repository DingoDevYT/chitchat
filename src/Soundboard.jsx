import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, freshChannel } from './lib/supabase'
import { createStore, prefs, setPref, toast, voiceLevels } from './lib/store'
import { anyoneTalking, duckStep, radioGone, volIcon, volFromPct } from './lib/music'
import {
  SFX, SFX_GAP_MS, DEFAULT_SFX_VOL, MAX_CLIP_SECS, acceptFire, clipDurError, clipFileError, clipName, clipType, nameFromFile,
  readFire, renderPlan, sfxById, sfxGain, sfxMode, tryFire,
} from './lib/sfx'
import { uploadFile } from './lib/upload'
import { app } from './menus'
import { ask, askText } from './Dialog'
import { openMenu } from './ContextMenu'
import Icon from './icons/Icon'
import { Name } from './Avatar'
import './styles/soundboard.css'

// Stadium soundboard: short clips anyone in a stadium call fires for everyone in it. Built-ins are synthesised
// (lib/sfx.js); custom clips are small files in the media bucket, per server. A fire goes through sfx_do (044), which
// checks the off switch and the rate limit and broadcasts on 'sfx:<stadium id>'; everyone joined to that call plays
// it into the call's own mix (so output device, output volume and deafen apply), at their soundboard volume.

export const sfxRow = createStore({}) // channel id -> { disabled } | null (table missing / no access)
export const sfxClips = createStore({}) // server id -> [{ id, name, path, dur, created_by }]
const sfxToasts = createStore([]) // [{ key, by, name }] "pip: rimshot" on the stage
const isMod = () => !!(app.ctx?.can?.('manage_messages') || app.ctx?.can?.('manage_channels'))
const meId = () => app.ctx?.userId
const publicUrl = path => supabase.storage.from('media').getPublicUrl(path).data.publicUrl

let toastKey = 0
function showFired(by, name) {
  const key = ++toastKey
  sfxToasts.set(t => [...t, { key, by, name }].slice(-3))
  setTimeout(() => sfxToasts.set(t => t.filter(x => x.key !== key)), 2600)
}

// ── shared rows, counted like Chit Radio's (the button and the board both watch) ──
function useCounted(map, key, start) {
  useEffect(() => {
    if (!key) return
    let w = map.get(key)
    if (!w) { w = { n: 0, stop: start(key) }; map.set(key, w) }
    w.n++
    return () => { if (--w.n === 0) { w.stop(); map.delete(key) } }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}
const rowWatchers = new Map(), clipWatchers = new Map()
function watchRow(cid) {
  let alive = true
  const fetch = () => supabase.from('stadium_sfx').select('*').eq('channel_id', cid).maybeSingle().then(({ data, error }) => {
    if (!alive) return
    if (error) { if (radioGone(error)) sfxRow.set(s => ({ ...s, [cid]: null })); return }
    sfxRow.set(s => ({ ...s, [cid]: { disabled: !!data?.disabled } }))
  }, () => {})
  fetch()
  const ch = freshChannel('sfx-row:' + cid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stadium_sfx', filter: `channel_id=eq.${cid}` }, fetch)
    .subscribe()
  return () => { alive = false; supabase.removeChannel(ch) }
}
export const loadClips = sid => supabase.from('sfx_clips').select('id,name,path,dur,created_by').eq('server_id', sid).order('created_at')
  .then(({ data, error }) => { if (!error || radioGone(error)) sfxClips.set(s => ({ ...s, [sid]: data || [] })) }, () => {})
function watchClips(sid) {
  loadClips(sid)
  const ch = freshChannel('sfx-clips:' + sid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sfx_clips', filter: `server_id=eq.${sid}` }, () => loadClips(sid))
    .subscribe()
  return () => supabase.removeChannel(ch)
}
const useSfxRow = cid => useCounted(rowWatchers, cid, watchRow)
const useSfxClips = sid => useCounted(clipWatchers, sid, watchClips)

// ── the engine: one per stadium call, attached by VoiceConnection to the call's AudioContext and output mix ──
let engine = null
export function attachSfx({ ctx, dest, cid, me, deafened = () => false }) {
  const bus = ctx.createGain()
  bus.connect(dest)
  let duck = { amount: 0, lastLoud: -Infinity }, at = Date.now(), playing = 0, alive = true
  const level = () => {
    const p = prefs.get()
    return sfxGain({ vol: p.sfxVol ?? DEFAULT_SFX_VOL, muted: !!p.sfxMuted, deafened: deafened(), duck: p.sfxDuck ?? true, amount: duck.amount })
  }
  bus.gain.value = level()
  const tick = setInterval(() => {
    const now = Date.now()
    duck = duckStep(duck, { loud: anyoneTalking(voiceLevels), now, dt: now - at })
    at = now
    bus.gain.setTargetAtTime(level(), ctx.currentTime, 0.05)
  }, 100)
  const buffers = new Map() // path -> Promise<AudioBuffer>
  const buffer = path => {
    if (!buffers.has(path)) {
      buffers.set(path, fetch(publicUrl(path)).then(r => { if (!r.ok) throw new Error('gone'); return r.arrayBuffer() })
        .then(b => ctx.decodeAudioData(b)).catch(e => { buffers.delete(path); throw e }))
    }
    return buffers.get(path)
  }
  const hold = secs => { playing++; setTimeout(() => { playing-- }, secs * 1000 + 100) }
  async function play(clip) {
    if (!alive) return
    if (clip.builtin) {
      const b = sfxById(clip.id)
      if (b) hold(renderPlan(ctx, b.plan, bus))
      return
    }
    try {
      const buf = await buffer(clip.path)
      if (!alive) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(bus)
      src.start()
      src.stop(ctx.currentTime + MAX_CLIP_SECS) // never longer than a clip may be, whatever the file says
      hold(Math.min(buf.duration, MAX_CLIP_SECS))
    } catch {}
  }
  const seen = new Map()
  const ch = supabase.channel(`sfx:${cid}`, { config: { private: true } })
    .on('broadcast', { event: 'sfx' }, ({ payload }) => {
      const f = readFire(payload)
      if (!f || f.by === me) return // yours already played the moment you tapped it
      if (!acceptFire(seen, f.by, Date.now(), playing)) return
      showFired(f.by, f.name)
      play(f)
    })
    .subscribe()
  const self = { cid, play, preview: play }
  engine = self
  return () => {
    alive = false
    clearInterval(tick)
    supabase.removeChannel(ch)
    bus.disconnect()
    if (engine === self) engine = null
    sfxToasts.set([])
  }
}

// ── firing ──
let lastFire = null
const cooling = createStore(0) // when your next clip is allowed (ms epoch)
export async function fireSfx(cid, clip) {
  const r = tryFire(lastFire, Date.now())
  if (!r.ok) return false // the board shows the cooldown; no toast for an eager double tap
  lastFire = r.last
  cooling.set(r.last + SFX_GAP_MS)
  if (engine?.cid === cid) engine.play(clip)
  showFired(meId(), clip.name)
  const { error } = await supabase.rpc('sfx_do', { cid, act: 'fire', arg: { clip: clip.id } })
  if (error) { toast(error.message); return false }
  return true
}
const builtinClip = s => ({ id: s.id, name: s.label, builtin: true })
const customClip = c => ({ id: c.id, name: c.name, path: c.path })

async function act(cid, action, arg = {}) {
  const { data, error } = await supabase.rpc('sfx_do', { cid, act: action, arg })
  if (error) { toast(error.message); return null }
  if (data?.row) sfxRow.set(s => ({ ...s, [cid]: { disabled: !!data.row.disabled } }))
  return data
}
async function turnOff(cid) {
  if (!await ask({ text: 'Turn the soundboard off in this stadium? Nobody can fire clips until a mod turns it back on.', confirm: 'Turn off', danger: true })) return
  act(cid, 'disable')
}

const durationOf = file => new Promise(res => {
  const a = new Audio(), url = URL.createObjectURL(file)
  let done = false
  const end = d => { if (done) return; done = true; URL.revokeObjectURL(url); a.removeAttribute('src'); res(d) }
  a.preload = 'metadata'
  a.muted = true
  a.onloadedmetadata = () => end(a.duration)
  a.onerror = () => end(NaN)
  setTimeout(() => end(NaN), 4000)
  a.src = url
})
async function addClip(cid, sid, file, setBusy) {
  const bad = clipFileError(file)
  if (bad) return toast(bad)
  const dur = await durationOf(file)
  const badDur = clipDurError(dur)
  if (badDur) return toast(badDur)
  const raw = await askText({ text: 'Name this clip', value: nameFromFile(file.name), placeholder: 'e.g. Big honk', confirm: 'Add clip', required: true })
  const name = clipName(raw)
  if (!name) return
  setBusy(true)
  try {
    const typed = new File([file], file.name, { type: clipType(file) })
    const { url } = await uploadFile(typed, meId())
    const path = decodeURIComponent(url.split('/object/public/media/')[1] || '')
    const r = await act(cid, 'add', { name, path, dur: Math.round(dur * 100) / 100 })
    if (r?.clip) { loadClips(sid); toast(`Added "${name}" to the soundboard.`) }
    else supabase.storage.from('media').remove([path]).catch(() => {}) // refused: don't leave the file behind
  } catch (e) { toast(e.message || 'Upload failed.') }
  setBusy(false)
}
async function deleteClip(cid, sid, c) {
  if (!await ask({ text: `Delete "${c.name}" from this server's soundboard?`, confirm: 'Delete', danger: true })) return
  const r = await act(cid, 'delete', { id: c.id })
  if (!r) return
  if (r.path && r.by === meId()) supabase.storage.from('media').remove([r.path]).catch(() => {})
  loadClips(sid)
}

// A soundboard: a rounded box of four pads. Drawn here: the icon set has nothing like it.
export function SfxIcon({ size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6.5 3.5H17.5C19.2 3.5 20.5 4.8 20.5 6.5V17.5C20.5 19.2 19.2 20.5 17.5 20.5H6.5C4.8 20.5 3.5 19.2 3.5 17.5V6.5C3.5 4.8 4.8 3.5 6.5 3.5Z" />
      <circle cx="9" cy="9" r="1.8" /><circle cx="15" cy="9" r="1.8" /><circle cx="9" cy="15" r="1.8" /><circle cx="15" cy="15" r="1.8" />
    </svg>
  )
}

// The button in the stadium's call controls; opens the board above it. Hidden when the soundboard isn't available,
// or turned off and you're not a mod.
export function SfxButton({ channel }) {
  const cid = channel.id, sid = channel.server_id
  useSfxRow(cid)
  const row = sfxRow.use(s => s[cid])
  const mode = sfxMode(row, isMod())
  const [at, setAt] = useState(null)
  const btn = useRef(null)
  useEffect(() => { if (mode === 'none') setAt(null) }, [mode])
  if (mode === 'none') return null
  const click = () => {
    if (at) return setAt(null)
    const r = btn.current.getBoundingClientRect()
    const half = Math.min(170, (innerWidth - 32) / 2)
    const left = Math.max(16 + half, Math.min(innerWidth - 16 - half, r.left + r.width / 2))
    // above the button, never past the top of the window (it scrolls inside); below it when there's more room there
    setAt(r.top > innerHeight - r.bottom
      ? { left, bottom: innerHeight - r.top + 10, maxHeight: Math.min(560, r.top - 26) }
      : { left, top: r.bottom + 10, maxHeight: Math.min(560, innerHeight - r.bottom - 26) })
  }
  return (
    <>
      <button ref={btn} className={`icon-btn sfx-btn${at ? ' open' : ''}${mode === 'off' ? ' off' : ''}`} onClick={click}
        aria-expanded={!!at} aria-haspopup="dialog" title={mode === 'off' ? 'Soundboard (off here)' : 'Soundboard'} aria-label="Soundboard">
        <SfxIcon />
      </button>
      {at && <SfxBoard cid={cid} sid={sid} mode={mode} at={at} btn={btn} onClose={() => setAt(null)} />}
    </>
  )
}

function SfxBoard({ cid, sid, mode, at, btn, onClose }) {
  useSfxClips(sid)
  const clips = sfxClips.use(s => s[sid])
  const vol = prefs.use(s => s.sfxVol ?? DEFAULT_SFX_VOL), muted = prefs.use(s => !!s.sfxMuted), duck = prefs.use(s => s.sfxDuck ?? true)
  const coolUntil = cooling.use()
  const [, tick] = useState(0)
  const [busy, setBusy] = useState(false)
  const panel = useRef(null), file = useRef(null)
  const mod = isMod(), me = meId()
  const cool = coolUntil > Date.now()
  useEffect(() => { // re-render when the cooldown ends
    if (!cool) return
    const t = setTimeout(() => tick(n => n + 1), coolUntil - Date.now() + 20)
    return () => clearTimeout(t)
  }, [coolUntil, cool])
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !document.querySelector('.dialog-backdrop, .ctx-menu')) { e.stopPropagation(); onClose(); btn.current?.focus() } }
    const down = e => {
      if (panel.current?.contains(e.target) || btn.current?.contains(e.target) || e.target.closest?.('.dialog-backdrop, .ctx-menu')) return
      onClose()
    }
    addEventListener('keydown', esc, true)
    document.addEventListener('pointerdown', down, true)
    addEventListener('resize', onClose)
    return () => { removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', down, true); removeEventListener('resize', onClose) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { panel.current?.querySelector('button')?.focus({ preventScroll: true }) }, [])

  const pct = Math.round(vol * 100)
  const setVol = v => { setPref('sfxVol', volFromPct(v)); if (prefs.get().sfxMuted) setPref('sfxMuted', false) }
  const menu = (clip, own) => e => openMenu(e, () => [
    { label: 'Preview just for me', icon: 'play', onClick: () => engine?.preview(clip) },
    own && { separator: true },
    own && { label: 'Delete clip', icon: 'trash', danger: true, onClick: () => deleteClip(cid, sid, own) },
  ])
  const pad = (clip, key, hue, own) => (
    <button key={key} className="sfx-pad" style={{ '--hue': hue }} disabled={cool} onClick={() => fireSfx(cid, clip)}
      onContextMenu={menu(clip, own)} title={`${clip.name} (right-click to preview just for you)`}>
      <span>{clip.name}</span>
    </button>
  )
  const hueOf = id => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)

  return createPortal(
    <div className="sfx-board pop" role="dialog" aria-label="Soundboard" ref={panel} style={at} onContextMenu={e => e.preventDefault()}>
      <header>
        <b><SfxIcon size={18} /> Soundboard</b>
        <button className="icon-btn" onClick={onClose} aria-label="Close soundboard" title="Close (Esc)"><Icon name="close" size={18} /></button>
      </header>
      {mode === 'off' ? (
        <div className="sfx-off">
          <p className="small muted">The soundboard is off in this stadium. Only mods see this.</p>
          <button className="btn primary small" onClick={() => act(cid, 'enable')}><SfxIcon size={15} /> Turn it on</button>
        </div>
      ) : <>
        <div className={`sfx-grid${cool ? ' cooling' : ''}`}>
          {SFX.map(s => pad(builtinClip(s), s.id, s.hue))}
        </div>
        <h4>This server</h4>
        <div className={`sfx-grid${cool ? ' cooling' : ''}`}>
          {(clips || []).map(c => pad(customClip(c), c.id, hueOf(c.id), (mod || c.created_by === me) ? c : null))}
          <button className="sfx-pad add" onClick={() => file.current.click()} disabled={busy} title="Add a clip (up to 5 seconds, 300 KB)">
            <Icon name={busy ? 'clock' : 'plus'} size={16} /><span>{busy ? 'Adding…' : 'Add clip'}</span>
          </button>
          <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.webm,.flac" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addClip(cid, sid, f, setBusy) }} />
        </div>
        <footer>
          <div className="sfx-vol">
            <button className={`icon-btn${muted ? ' on' : ''}`} onClick={() => setPref('sfxMuted', !muted)} aria-pressed={muted}
              aria-label={muted ? 'Unmute soundboard' : 'Mute soundboard'} title={muted ? 'Unmute soundboard' : 'Mute soundboard (just for you)'}>
              <Icon name={volIcon(vol, muted)} size={18} /></button>
            <input type="range" min="0" max="100" value={pct} aria-label="Soundboard volume" aria-valuetext={muted ? `${pct}%, muted` : `${pct}%`}
              onChange={e => setVol(e.target.value)} />
            <span className="small">{muted ? 'Muted' : `${pct}%`}</span>
          </div>
          <label className="sfx-duck"><input type="checkbox" checked={duck} onChange={e => setPref('sfxDuck', e.target.checked)} /> Quieter while people talk</label>
          <p className="small muted">Everyone in the call hears a clip. Right-click (or long-press) one to hear it just yourself.</p>
          {mod && <button className="btn ghost small" onClick={() => turnOff(cid)}><Icon name="block" size={15} /> Turn off soundboard in this stadium</button>}
        </footer>
      </>}
    </div>, document.body)
}

// "pip: rimshot", floating at the top of the stage for a couple of seconds.
export function SfxToasts() {
  const list = sfxToasts.use()
  if (!list.length) return null
  return (
    <div className="sfx-toasts" aria-live="polite">
      {list.map(t => <span key={t.key} className="sfx-toast"><Name id={t.by} />: {t.name}</span>)}
    </div>
  )
}
