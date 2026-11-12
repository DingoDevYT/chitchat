import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { overlayRoot } from './lib/fullscreen'
import { cleanWave, nextSpeed } from './lib/voicenote'
import { PlayIcon, PauseIcon, EyeOffIcon } from './icons'
import { FavStar } from './GifPicker'
import Icon from './icons/Icon'
import './styles/typing.css'

const fmtSize = b => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
// Supabase serves a forced download with ?download=; the download attribute alone is ignored cross-origin.
const dlUrl = a => a.url.includes('/storage/v1/object/public/') ? `${a.url}?download=${encodeURIComponent(a.name)}` : a.url

// Only one audio/video plays at a time across the chat.
let current = null
function claim(el) {
  if (current && current !== el) current.pause()
  current = el
}

function useMedia() {
  const ref = useRef(null)
  const [s, setS] = useState({ t: 0, d: 0, buf: 0, paused: true, muted: false, vol: 0.5 })
  const sync = () => {
    const el = ref.current
    if (!el) return
    const b = el.buffered
    setS({ t: el.currentTime, d: isFinite(el.duration) ? el.duration : 0, buf: b.length ? b.end(b.length - 1) : 0, paused: el.paused, muted: el.muted, vol: el.volume })
  }
  const events = {
    onPlay: e => { claim(e.currentTarget); sync() },
    onPause: sync, onTimeUpdate: sync, onDurationChange: sync, onProgress: sync, onVolumeChange: sync, onSeeked: sync, onEnded: sync,
  }
  const toggle = () => { const el = ref.current; el.paused ? el.play().catch(() => {}) : el.pause() }
  const seek = v => { ref.current.currentTime = v; sync() }
  return { ref, s, events, toggle, seek }
}

function Seek({ s, seek, label }) {
  const pct = v => (s.d ? (v / s.d) * 100 : 0) + '%'
  return (
    <input type="range" className="m-seek" min={0} max={s.d || 0} step="any" value={s.t} aria-label={label}
      aria-valuetext={`${fmtTime(s.t)} of ${fmtTime(s.d)}`} style={{ '--p': pct(s.t), '--b': pct(s.buf) }}
      onChange={e => seek(+e.target.value)} />
  )
}

export function Video({ a }) {
  const box = useRef(null)
  const { ref, s, events, toggle, seek } = useMedia()
  const [ar, setAr] = useState(16 / 9)
  const fullscreen = () => document.fullscreenElement ? document.exitFullscreen()
    : box.current.requestFullscreen ? box.current.requestFullscreen() : ref.current.webkitEnterFullscreen?.()
  const setVol = v => { ref.current.volume = v; ref.current.muted = v === 0 }
  return (
    <div ref={box} className={`m-vid${s.paused ? '' : ' playing'}${a.uploading ? ' uploading' : ''}`} style={{ '--ar': ar }}
      tabIndex={0} aria-label={`Video ${a.name}`}
      onKeyDown={e => { if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); toggle() } }}>
      {/* #t=0.1 makes browsers paint the first frame as a poster */}
      <video ref={ref} src={a.url + '#t=0.1'} preload="metadata" playsInline onClick={toggle} {...events}
        onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth) setAr(v.videoWidth / v.videoHeight); events.onDurationChange() }} />
      {/* this button unmounts on play, so hand focus to the player to keep Space working */}
      {s.paused && <button className="m-big-play" onClick={() => { toggle(); box.current.focus() }} aria-label="Play"><Icon name="play" size={28} /></button>}
      <div className="m-bar">
        <button onClick={toggle} aria-label={s.paused ? 'Play' : 'Pause'}><Icon name={s.paused ? 'play' : 'pause'} size={16} /></button>
        <Seek s={s} seek={seek} label="Seek" />
        <span className="m-time">{fmtTime(s.t)} / {fmtTime(s.d)}</span>
        <button onClick={() => setVol(s.muted || !s.vol ? 1 : 0)} aria-label={s.muted ? 'Unmute' : 'Mute'}><Icon name={s.muted || !s.vol ? 'volume-mute' : 'volume'} size={16} /></button>
        <input type="range" className="m-vol m-seek" min={0} max={1} step={0.05} value={s.muted ? 0 : s.vol} aria-label="Volume"
          style={{ '--p': (s.muted ? 0 : s.vol) * 100 + '%', '--b': '0%' }} onChange={e => setVol(+e.target.value)} />
        <button onClick={fullscreen} aria-label="Fullscreen"><Icon name="fullscreen" size={16} /></button>
      </div>
    </div>
  )
}

// Fake but stable waveform: bar heights from a hash of the URL.
function waveform(url, n = 40) {
  let h = 2166136261
  for (const c of url) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return Array.from({ length: n }, () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return 25 + ((h >>> 0) % 76) })
}

function Audio({ a }) {
  const { ref, s, events, toggle, seek } = useMedia()
  const bars = useMemo(() => waveform(a.url), [a.url])
  const p = s.d ? s.t / s.d : 0
  return (
    <div className={`m-audio${a.uploading ? ' uploading' : ''}`}>
      {/* starts at half volume so a loud clip doesn't blast anyone */}
      <audio ref={ref} src={a.url} preload="metadata" {...events}
        onLoadedMetadata={e => { if (!e.currentTarget.dataset.v) { e.currentTarget.volume = 0.5; e.currentTarget.dataset.v = 1 } events.onDurationChange() }} />
      <button className="m-play" onClick={toggle} aria-label={s.paused ? 'Play' : 'Pause'}><Icon name={s.paused ? 'play' : 'pause'} /></button>
      <div className="m-audio-main">
        <div className="m-audio-top">
          <b title={a.name}>{a.name}</b>
          <a className="icon-btn" href={dlUrl(a)} download={a.name} target="_blank" rel="noopener noreferrer" aria-label={`Download ${a.name}`}><Icon name="download" size={18} /></a>
        </div>
        <div className="m-wave">
          {bars.map((h, i) => <i key={i} className={i / bars.length < p ? 'on' : ''} style={{ height: h + '%' }} />)}
          <Seek s={s} seek={seek} label={`Seek ${a.name}`} />
        </div>
        <div className="m-audio-bottom">
          <span className="muted small">{fmtTime(s.t)} / {fmtTime(s.d)}</span>
          <button className="m-mute" onClick={() => { const el = ref.current; el.muted = !el.muted && el.volume > 0; if (!el.muted && !el.volume) el.volume = 0.5 }}
            aria-label={s.muted || !s.vol ? 'Unmute' : 'Mute'}><Icon name={s.muted || !s.vol ? 'volume-mute' : s.vol < 0.5 ? 'volume-low' : 'volume'} size={16} /></button>
          <input type="range" className="m-vol m-seek" min={0} max={1} step={0.05} value={s.muted ? 0 : s.vol} aria-label={`Volume for ${a.name}`}
            aria-valuetext={`${Math.round((s.muted ? 0 : s.vol) * 100)}%`} style={{ '--p': (s.muted ? 0 : s.vol) * 100 + '%', '--b': '0%' }}
            onChange={e => { const el = ref.current; el.volume = +e.target.value; el.muted = +e.target.value === 0 }} />
        </div>
      </div>
    </div>
  )
}

// Voice message bubble: real waveform and duration from the sender (attachment JSON), 1x/1.5x/2x, starts at half volume.
function VoiceNote({ a }) {
  const { ref, s, events, toggle, seek } = useMedia()
  const [rate, setRate] = useState(1)
  const bars = useMemo(() => cleanWave(a.waveform) || waveform(a.url, 48), [a.waveform, a.url])
  const dur = +a.duration > 0 ? +a.duration : s.d
  const p = dur ? Math.min(1, s.t / dur) : 0
  useEffect(() => { ref.current.volume = 0.5 }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const speed = () => { const r = nextSpeed(rate); ref.current.playbackRate = r; setRate(r) }
  return (
    <div className={`voice-note${a.uploading ? ' uploading' : ''}${s.paused ? '' : ' playing'}`}>
      <audio ref={ref} src={a.url} preload="none" {...events} onRateChange={e => setRate(e.currentTarget.playbackRate)} />
      <button className="vn-play" onClick={toggle} aria-label={s.paused ? 'Play voice message' : 'Pause voice message'}>{s.paused ? <PlayIcon /> : <PauseIcon />}</button>
      <div className="m-wave vn-wave">
        {bars.map((h, i) => <i key={i} className={i / bars.length < p ? 'on' : ''} style={{ height: h + '%' }} />)}
        <Seek s={{ ...s, d: dur }} seek={seek} label="Seek voice message" />
      </div>
      <span className="vn-time">{fmtTime(s.paused && !s.t ? dur : s.t)}</span>
      <button className="vn-speed" onClick={speed} aria-label={`Playback speed ${rate}x`} title="Playback speed">{rate}x</button>
    </div>
  )
}

const ICONS = [[/pdf/, 'file-text'], [/zip|rar|7z|tar|gz/, 'file-zip'], [/text|json|xml|javascript|csv|md$/, 'file-text'], [/sheet|excel/, 'file-chart'], [/presentation|powerpoint/, 'file-slides'], [/word|document/, 'file-text']]
function FileCard({ a }) {
  const icon = ICONS.find(([rx]) => rx.test(`${a.type} ${a.name}`.toLowerCase()))?.[1] || 'file'
  return (
    <a className={`m-file${a.uploading ? ' uploading' : ''}`} href={dlUrl(a)} target="_blank" rel="noopener noreferrer" download={a.name}>
      <span className="m-file-icon"><Icon name={icon} size={24} /></span>
      <span className="m-file-text"><b title={a.name}>{a.name}</b><span className="muted small">{a.size ? fmtSize(a.size) : a.uploading ? 'uploading…' : 'file'}</span></span>
      <span className="m-file-dl" aria-hidden><Icon name="download" size={18} /></span>
    </a>
  )
}

export function Lightbox({ items, i, setI, onClose }) {
  const ref = useRef(null)
  const it = items[i], many = items.length > 1
  const go = d => setI((i + d + items.length) % items.length)
  useEffect(() => {
    const prev = document.activeElement
    ref.current.focus()
    return () => prev?.focus?.()
  }, [])
  const stop = e => e.stopPropagation()
  return createPortal(
    <div ref={ref} className="lightbox" role="dialog" aria-modal="true" aria-label={it.name} tabIndex={-1} onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        else if (many && e.key === 'ArrowLeft') go(-1)
        else if (many && e.key === 'ArrowRight') go(1)
      }}>
      <img key={it.url} src={it.url} alt={it.alt || it.name} title={it.alt} />
      {many && <button className="lb-nav prev" onClick={e => { stop(e); go(-1) }} aria-label="Previous image"><Icon name="chevron-left" size={28} /></button>}
      {many && <button className="lb-nav next" onClick={e => { stop(e); go(1) }} aria-label="Next image"><Icon name="chevron-right" size={28} /></button>}
      <div className="lb-bar" onClick={stop}>
        <span className="lb-name">{it.name}{many && <span className="muted"> · {i + 1}/{items.length}</span>}</span>
        <a className="btn ghost small" href={it.url} target="_blank" rel="noopener noreferrer">Open original</a>
        <a className="btn ghost small" href={dlUrl(it)} download={it.name} target="_blank" rel="noopener noreferrer">Download</a>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
    </div>,
    overlayRoot(),
  )
}

// Dead link embeds just disappear. The ref check catches errors that fire before React commits the <img>.
const hide = img => { img.parentElement.style.display = 'none' }

function Gallery({ imgs }) {
  const [open, setOpen] = useState(null)
  const [shown, setShown] = useState({}) // spoiler images clicked open
  const n = imgs.length
  const one = n === 1 && imgs[0]
  // Size a single image from its stored dimensions so nothing jumps when it loads.
  const style = one?.w ? { width: Math.min(400, one.w, (350 * one.w) / one.h), aspectRatio: `${one.w} / ${one.h}` } : undefined
  return (
    <>
      <div className={`m-gallery n${Math.min(n, 5)}`}>
        {imgs.map((a, i) => {
          const hidden = a.spoiler && !shown[i]
          return (
            <button key={i} className={`m-img${a.uploading ? ' uploading' : ''}${one && !a.w ? ' natural' : ''}${hidden ? ' spoiler-img' : ''}`} style={one ? style : undefined}
              onClick={() => hidden ? setShown(s => ({ ...s, [i]: true })) : setOpen(i)} aria-label={hidden ? 'Show spoiler image' : `Open ${a.alt || a.name}`} title={hidden ? undefined : a.alt}>
              <img src={a.url} alt={hidden ? '' : a.alt || a.name} loading="lazy"
                onError={a.link ? e => hide(e.currentTarget) : undefined} ref={a.link ? el => el?.complete && !el.naturalWidth && hide(el) : undefined} />
              {hidden && <span className="spoiler-tag"><EyeOffIcon size={15} /> Spoiler</span>}
            </button>
          )
        })}
        {one && (one.gif || one.type === 'image/gif') && !one.uploading && !one.spoiler && <FavStar gif={one} />}
      </div>
      {open != null && <Lightbox items={imgs} i={open} setI={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

export default function Attachments({ list }) {
  if (!list.length) return null
  const imgs = list.filter(a => a.type?.startsWith('image/'))
  return (
    <div className="atts">
      {imgs.length > 0 && <Gallery imgs={imgs} />}
      {list.map((a, i) => a.type?.startsWith('image/') ? null
        : a.type?.startsWith('video/') ? <Video key={i} a={a} />
        : a.type?.startsWith('audio/') ? (a.voice ? <VoiceNote key={i} a={a} /> : <Audio key={i} a={a} />)
        : <FileCard key={i} a={a} />)}
    </div>
  )
}
