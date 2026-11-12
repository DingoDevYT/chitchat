// Pillow Chit Fight voice filters: the three-slot rack and the Web Audio chain it builds. The same buildChain runs
// on a live AudioContext (preview) and an OfflineAudioContext (the bake), so what you preview is what everyone hears.
// Nothing here touches the DOM or the microphone, so the rack logic and the graph can be unit-tested with a fake
// context (pillow.test.js).
export const RACK = 3
export const FILTERS = [
  { id: 'high', name: 'High pitch', hue: '#f2a7c3' },
  { id: 'low', name: 'Low pitch', hue: '#8a7fcf' },
  { id: 'chipmunk', name: 'Chipmunk', hue: '#f6c76a' },
  { id: 'slowmo', name: 'Slow-mo', hue: '#9fb7d8' },
  { id: 'reverb', name: 'Big hall', hue: '#b5a3e0' },
  { id: 'echo', name: 'Echo', hue: '#8fd1c1' },
  { id: 'wah', name: 'Wah-wah', hue: '#ffad7a' },
  { id: 'robot', name: 'Robot', hue: '#a9b4bf' },
  { id: 'crunchy', name: 'Crunchy', hue: '#d9a066' },
  { id: 'distort', name: 'Distortion', hue: '#e2697b' },
  { id: 'phone', name: 'Telephone', hue: '#7fbfa0' },
  { id: 'alien', name: 'Alien', hue: '#9bd17a' },
  { id: 'underwater', name: 'Underwater', hue: '#6fb3dc' },
]
export const FILTER_IDS = FILTERS.map(f => f.id)
const RATE = { chipmunk: 1.7, slowmo: 0.62 } // these change the playback speed (and so the pitch) of the whole clip
const TAIL = { reverb: 1.8, echo: 1.4 } // seconds of ring-out after the voice stops

// ── the rack (fixed length, null = empty slot) ──
export const emptyRack = () => Array(RACK).fill(null)
const okId = id => FILTER_IDS.includes(id)
// Tap a chip: it fills the next empty slot (nothing happens when the rack is full or it's already in).
export function rackAdd(slots, id) {
  if (!okId(id) || slots.includes(id)) return slots
  const i = slots.indexOf(null)
  if (i < 0) return slots
  const out = slots.slice(); out[i] = id; return out
}
// Drop a chip on a slot: it takes that slot (moving from another slot if it was already racked).
export function rackPut(slots, id, at) {
  if (!okId(id) || at < 0 || at >= RACK) return slots
  const out = slots.slice(), was = out.indexOf(id)
  if (was >= 0) { out[was] = out[at]; out[at] = id; return out }
  out[at] = id
  return out
}
// Drag a racked filter onto another slot: the two swap.
export function rackMove(slots, from, to) {
  if (from === to || from < 0 || to < 0 || from >= RACK || to >= RACK) return slots
  const out = slots.slice();[out[from], out[to]] = [out[to], out[from]]
  return out
}
export function rackClear(slots, i) {
  if (slots[i] == null) return slots
  const out = slots.slice(); out[i] = null; return out
}
export const rackIds = slots => slots.filter(okId)

export const chainRate = ids => ids.reduce((r, id) => r * (RATE[id] || 1), 1)
export const chainTail = ids => Math.max(0, ...ids.map(id => TAIL[id] || 0))
// How long the baked clip runs for a recording of srcSec seconds, capped at maxSec.
export const bakedSeconds = (srcSec, ids, maxSec = 6.5) => Math.min(maxSec, srcSec / chainRate(ids) + chainTail(ids))

// ── curves and impulses (pure) ──
// Soft clipping: k = drive (0 = clean).
export function driveCurve(k, n = 1024) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)) }
  return c
}
// Bitcrush as a staircase: the signal snaps to `steps` levels.
export function crushCurve(steps = 8, n = 1024) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; c[i] = Math.round(x * steps) / steps }
  return c
}
// A stereo reverb impulse: noise with an exponential decay (no files to download).
export function makeImpulse(rate, secs = 2.2, decay = 3, rand = Math.random) {
  const n = Math.max(1, Math.floor(rate * secs)), ch = [new Float32Array(n), new Float32Array(n)]
  for (const c of ch) for (let i = 0; i < n; i++) c[i] = (rand() * 2 - 1) * Math.pow(1 - i / n, decay)
  return ch
}

// ── the chain ──
// A tempo-keeping pitch shifter: two delay taps whose delay sweeps like a sawtooth (rate of change 1 - ratio makes
// the pitch ratio), each faded in and out with sin² windows half a period apart so the jumps are never heard.
function pitchShift(ctx, input, out, semis, sources) {
  const ratio = 2 ** (semis / 12), P = 0.1, D = P * Math.abs(1 - ratio), n = Math.max(2, Math.round(P * ctx.sampleRate))
  const ramp = ctx.createBuffer(1, n, ctx.sampleRate), fade = ctx.createBuffer(1, n, ctx.sampleRate)
  const rd = ramp.getChannelData(0), fd = fade.getChannelData(0)
  for (let i = 0; i < n; i++) { const t = i / n; rd[i] = ratio > 1 ? 1 - t : t; fd[i] = Math.sin(Math.PI * t) ** 2 }
  for (const offset of [0, P / 2]) {
    const dl = ctx.createDelay(1), depth = ctx.createGain(), win = ctx.createGain()
    dl.delayTime.value = 0; depth.gain.value = D; win.gain.value = 0
    const r = ctx.createBufferSource(), f = ctx.createBufferSource()
    r.buffer = ramp; f.buffer = fade; r.loop = f.loop = true
    r.connect(depth); depth.connect(dl.delayTime); f.connect(win.gain)
    input.connect(dl); dl.connect(win); win.connect(out)
    sources.push([r, offset], [f, offset])
  }
}
function lfo(ctx, hz, amount, param, sources, type = 'sine') {
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.type = type; o.frequency.value = hz; g.gain.value = amount
  o.connect(g); g.connect(param)
  sources.push([o, 0])
}
function shaper(ctx, curve) { const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = '4x'; return w }
function biquad(ctx, type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b }
const gain = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g }

// One filter stage: from `input` to a fresh output node. Rate filters (chipmunk, slow-mo) work on the source's
// playback rate instead, so their stage is a plain pass-through.
export function stage(ctx, id, input, sources) {
  const out = gain(ctx, 1)
  switch (id) {
    case 'high': pitchShift(ctx, input, out, 5, sources); break
    case 'low': pitchShift(ctx, input, out, -6, sources); break
    case 'reverb': {
      const cv = ctx.createConvolver(), ir = makeImpulse(ctx.sampleRate, 2.2, 3), buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate)
      buf.getChannelData(0).set(ir[0]); buf.getChannelData(1).set(ir[1]); cv.buffer = buf
      const dry = gain(ctx, 0.75), wet = gain(ctx, 0.55)
      input.connect(dry); dry.connect(out); input.connect(cv); cv.connect(wet); wet.connect(out)
      break
    }
    case 'echo': {
      const dl = ctx.createDelay(1), fb = gain(ctx, 0.45), wet = gain(ctx, 0.6)
      dl.delayTime.value = 0.27
      input.connect(out); input.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out)
      break
    }
    case 'wah': {
      const bp = biquad(ctx, 'bandpass', 900, 4), mk = gain(ctx, 2.2)
      lfo(ctx, 2.6, 650, bp.frequency, sources)
      input.connect(bp); bp.connect(mk); mk.connect(out)
      break
    }
    case 'robot': { // ring modulation plus a short metallic comb
      const ring = gain(ctx, 0), comb = ctx.createDelay(0.1), fb = gain(ctx, 0.5)
      lfo(ctx, 55, 1, ring.gain, sources)
      comb.delayTime.value = 0.008
      input.connect(ring); ring.connect(out); ring.connect(comb); comb.connect(fb); fb.connect(comb); comb.connect(out)
      break
    }
    case 'crunchy': { const lp = biquad(ctx, 'lowpass', 3200), w = shaper(ctx, crushCurve(6)); input.connect(w); w.connect(lp); lp.connect(out); break }
    case 'distort': { const w = shaper(ctx, driveCurve(30)), g = gain(ctx, 0.55); input.connect(w); w.connect(g); g.connect(out); break }
    case 'phone': {
      const hp = biquad(ctx, 'highpass', 500, 0.9), lp = biquad(ctx, 'lowpass', 2800, 0.9), w = shaper(ctx, driveCurve(4))
      input.connect(hp); hp.connect(lp); lp.connect(w); w.connect(out)
      break
    }
    case 'alien': { // vibrato: a few ms of delay, wobbled fast
      const dl = ctx.createDelay(0.05)
      dl.delayTime.value = 0.006
      lfo(ctx, 7, 0.0045, dl.delayTime, sources)
      input.connect(dl); dl.connect(out)
      break
    }
    case 'underwater': {
      const lp = biquad(ctx, 'lowpass', 600, 5), dl = ctx.createDelay(0.05)
      dl.delayTime.value = 0.01
      lfo(ctx, 1.4, 220, lp.frequency, sources); lfo(ctx, 3, 0.003, dl.delayTime, sources)
      input.connect(lp); lp.connect(dl); dl.connect(out)
      break
    }
    default: input.connect(out) // chipmunk, slow-mo: playback rate only
  }
  return out
}

// The whole rack on a buffer source: sets its playback rate, chains the stages in slot order, and returns the last
// node plus start/stop for the LFOs and pitch-shift sweeps (call start with the same `when` as the source).
export function buildChain(ctx, src, ids) {
  const list = ids.filter(okId), sources = []
  if (src.playbackRate) src.playbackRate.value = chainRate(list)
  let node = src
  for (const id of list) node = stage(ctx, id, node, sources)
  const out = gain(ctx, 1)
  node.connect(out)
  return {
    out,
    start(when = 0) { for (const [s, off] of sources) s.start(when, off) },
    stop() { for (const [s] of sources) { try { s.stop() } catch { /* never started */ } } },
  }
}

// ── after the bake ──
// Where the sound is: first and last sample above thr (with a little padding), or null if it's all silence.
export function soundSpan(x, rate, thr = 0.02, padMs = 60) {
  let a = -1, b = -1
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) { if (a < 0) a = i; b = i }
  if (a < 0) return null
  const pad = Math.round((rate * padMs) / 1000)
  return [Math.max(0, a - pad), Math.min(x.length, b + pad + 1)]
}
// Peak-normalise to `peak` (quiet recordings come up, loud ones don't clip).
export function normalize(x, peak = 0.9) {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]))
  if (m < 1e-4) return x
  const k = peak / m, out = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) out[i] = x[i] * k
  return out
}
// Box-filter decimation by an integer factor (for a bake that had to render at a higher rate).
export function decimate(x, f) {
  if (f <= 1) return x
  const out = new Float32Array(Math.floor(x.length / f))
  for (let i = 0; i < out.length; i++) { let s = 0; for (let j = 0; j < f; j++) s += x[i * f + j]; out[i] = s / f }
  return out
}
// 16-bit mono PCM WAV: plays everywhere (Safari included) and a 5 s cry at 16 kHz is about 160 KB.
export function encodeWav(x, rate) {
  const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true) }
  return new Uint8Array(buf)
}

// ── canned Chitbot lines (and the "no voice" squeak) ──
// A short run of blips with pitch slides; pattern k (0–5) picks the tune. Scheduled on any context at `when`.
const TUNES = [
  [[620, 900], [880, 700], [700, 1200]], [[400, 300], [380, 520], [520, 260], [300, 640]], [[900, 1400], [1300, 800]],
  [[300, 260], [320, 420], [460, 380], [600, 900]], [[760, 520], [760, 520], [1100, 1500]], [[500, 800], [800, 500], [500, 900], [1000, 600], [700, 1300]],
]
export function squeak(ctx, dest, k = 0, when = 0, vol = 0.22) {
  const tune = TUNES[((k % TUNES.length) + TUNES.length) % TUNES.length], step = 1.1 / tune.length
  tune.forEach(([f0, f1], i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = when + i * step
    o.type = i % 2 ? 'triangle' : 'square'
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + step * 0.8)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.9)
    o.connect(g); g.connect(dest)
    o.start(t); o.stop(t + step)
  })
  return 0.1 + 1.1 // seconds
}
