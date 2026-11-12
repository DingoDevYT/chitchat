// Pillow Chit Fight in the browser: recording a battle cry, previewing the filter rack, baking it into a small WAV
// with an OfflineAudioContext, and the `battle-cries` storage bucket (<game id>/<owner>/<round>.<ext>, see
// supabase/migrations/040_pillow_cries.sql). Clips are fetched once and cached; your own clip (and every clip in the
// GameLab) is played from memory. Anything that fails falls back to the champion's canned squeak.
import { supabase } from '../../lib/supabase'
import { prefs } from '../../lib/store'
import { bakedSeconds, buildChain, decimate, encodeWav, normalize, soundSpan, squeak } from './filters.js'
import { CRY_MAX, CRY_MIN } from './rules.js'

export const BUCKET = 'battle-cries'
export const REC_MS = 5000
const RATE = 16000

let ctx = null
export function audio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
export const audioLocked = () => !ctx || ctx.state !== 'running'
const volume = () => Math.min(1.5, prefs.get().outVol ?? 1)

const micAudio = () => {
  const p = prefs.get()
  return { deviceId: p.micId || undefined, echoCancellation: p.ec, noiseSuppression: p.ns, autoGainControl: p.agc }
}

// Starts recording from your voice mic. Resolves to { stop(): Promise<AudioBuffer>, cancel() } and stops itself after
// maxMs. Rejects with err.name 'NotAllowedError' (or 'NoMic') when there's no microphone to use.
export async function record({ maxMs = REC_MS, onLevel, onAuto } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Object.assign(new Error('No microphone here.'), { name: 'NoMic' })
  const stream = await navigator.mediaDevices.getUserMedia({ audio: micAudio() })
  const a = audio()
  const src = a.createMediaStreamSource(stream), an = a.createAnalyser()
  an.fftSize = 512; src.connect(an)
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t))
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise(res => { rec.onstop = res })
  rec.start(100)
  const data = new Uint8Array(an.fftSize)
  let raf = 0, done = false
  const loop = () => { an.getByteTimeDomainData(data); let m = 0; for (const x of data) m = Math.max(m, Math.abs(x - 128)); onLevel?.(Math.min(1, m / 60)); raf = requestAnimationFrame(loop) }
  loop()
  const end = () => { if (done) return; done = true; clearTimeout(timer); cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); onLevel?.(0) }
  const timer = setTimeout(() => { end(); onAuto?.() }, maxMs)
  const finish = async () => {
    end()
    await stopped
    stream.getTracks().forEach(t => t.stop()); src.disconnect()
    const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' })
    return a.decodeAudioData(await blob.arrayBuffer())
  }
  return { stop: finish, cancel() { end(); stream.getTracks().forEach(t => t.stop()); src.disconnect() } }
}

// Plays a recording through the rack, live. Returns a stop function.
export function preview(buffer, ids, onEnd) {
  const a = audio(), src = a.createBufferSource(), g = a.createGain()
  src.buffer = buffer; g.gain.value = volume()
  const ch = buildChain(a, src, ids)
  ch.out.connect(g); g.connect(a.destination)
  const t = a.currentTime + 0.03
  src.start(t); ch.start(t)
  const secs = bakedSeconds(buffer.duration, ids)
  const tm = setTimeout(() => stop(), secs * 1000 + 100)
  function stop() { clearTimeout(tm); try { src.stop() } catch { /* already */ } ch.stop(); setTimeout(() => g.disconnect(), 30); onEnd?.() }
  return stop
}

// The rack baked offline into a trimmed, normalised 16 kHz WAV: { blob, ms, ext } or null if it came out silent.
export async function bake(buffer, ids) {
  const secs = bakedSeconds(buffer.duration, ids, CRY_MAX / 1000)
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext
  let rate = RATE, off
  try { off = new Off(1, Math.ceil(secs * rate), rate) } catch { rate = 48000; off = new Off(1, Math.ceil(secs * rate), rate) }
  const src = off.createBufferSource()
  src.buffer = buffer
  const ch = buildChain(off, src, ids)
  ch.out.connect(off.destination)
  src.start(0); ch.start(0)
  const out = await off.startRendering()
  let x = out.getChannelData(0), r = rate
  if (rate > RATE) { const f = Math.floor(rate / RATE); x = decimate(x, f); r = rate / f }
  const span = soundSpan(x, r)
  if (!span) return null
  x = normalize(x.subarray(span[0], Math.min(span[1], span[0] + Math.floor((r * CRY_MAX) / 1000))))
  const fade = Math.min(x.length, Math.round(r * 0.04))
  for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade
  const ms = Math.max(CRY_MIN, Math.round((x.length / r) * 1000))
  return { blob: new Blob([encodeWav(x, r)], { type: 'audio/wav' }), ms, ext: 'wav' }
}

// ── the bucket ──
export const cryPath = (gameId, owner, cry) => `${gameId}/${owner}/${cry.r}.${cry.ext}`
const mem = new Map() // path → Blob (your own uploads, and the lab)
const decoded = new Map() // path → Promise<AudioBuffer | null>

export async function upload(gameId, owner, round, baked) {
  const path = cryPath(gameId, owner, { r: round, ext: baked.ext })
  mem.set(path, baked.blob); decoded.delete(path)
  if (gameId === 'lab') return true
  const { error } = await supabase.storage.from(BUCKET).upload(path, baked.blob, { upsert: true, contentType: baked.blob.type || 'audio/wav', cacheControl: '60' })
  if (error) console.warn('battle cry upload failed', error.message)
  return !error
}

export function loadCry(gameId, champ) {
  const cry = champ?.cry
  if (!cry?.ext || !champ.owner) return Promise.resolve(null)
  const path = cryPath(gameId, champ.owner, cry)
  if (!decoded.has(path)) decoded.set(path, (async () => {
    try {
      let blob = mem.get(path)
      if (!blob && gameId !== 'lab') { const { data, error } = await supabase.storage.from(BUCKET).download(path); if (error) throw error; blob = data }
      if (!blob) return null
      return await audio().decodeAudioData(await blob.arrayBuffer())
    } catch (e) { console.warn('battle cry missing', path, e?.message); decoded.delete(path); return null }
  })())
  return decoded.get(path)
}

// Plays a champion's battle cry (or its squeak), calling onAmp(0..1) every frame for the squash and stretch.
// Returns a stop function.
export function playCry(gameId, champ, onAmp) {
  const a = audio(), g = a.createGain(), an = a.createAnalyser()
  g.gain.value = volume(); an.fftSize = 512
  g.connect(an); an.connect(a.destination)
  let src = null, raf = 0, dead = false
  const data = new Uint8Array(an.fftSize)
  const loop = () => { an.getByteTimeDomainData(data); let m = 0; for (const x of data) m = Math.max(m, Math.abs(x - 128)); onAmp?.(Math.min(1, m / 50)); raf = requestAnimationFrame(loop) }
  loadCry(gameId, champ).then(buf => {
    if (dead) return
    if (buf) { src = a.createBufferSource(); src.buffer = buf; src.connect(g); src.start() }
    else squeak(a, g, champ?.cry?.synth ?? 0, a.currentTime + 0.02)
    loop()
  })
  return () => { dead = true; cancelAnimationFrame(raf); try { src?.stop() } catch { /* done */ } setTimeout(() => g.disconnect(), 60); onAmp?.(0) }
}
