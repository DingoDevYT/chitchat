// Stadium soundboard (Soundboard.jsx): short clips anyone in a stadium call fires for everyone in it.
// Pure parts only: the built-in clips as synth recipes (Web Audio, no sound files, nothing copyrighted), the scheduler
// that turns a recipe into nodes on whatever context it is handed (tests pass a stub), rate limits, upload checks and
// the volume / ducking mapping. 044_soundboard.sql mirrors SFX_IDS, the 2 s gap and the upload limits.

// ── built-in clips ──
// A recipe is a list of voices, times in seconds from the clip's start:
//   { kind: 'osc', wave, f: [from, to] Hz, t, d, peak, a (attack), vib?: [rate Hz, depth Hz], lp?: Hz }
//   { kind: 'noise', t, d, peak, a, bp?: [from, to, Q], lp?: Hz, hp?: Hz }
// Every voice fades in over `a` and out exponentially by t + d.
const osc = (wave, f0, f1, t, d, peak, extra = {}) => ({ kind: 'osc', wave, f: [f0, f1], t, d, peak, a: 0.01, ...extra })
const noise = (t, d, peak, extra = {}) => ({ kind: 'noise', t, d, peak, a: 0.005, ...extra })

// Tiny seeded random, so the clap and roll patterns are the same every time (and testable).
function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

function crickets() {
  const v = []
  for (let g = 0; g < 3; g++) for (let i = 0; i < 4; i++)
    v.push(osc('sine', 4400, 4300, g * 0.55 + i * 0.045, 0.03, 0.12, { a: 0.004 }))
  return v
}
function applause() {
  const r = rng(7), v = [noise(0, 2.4, 0.14, { a: 0.35, bp: [1800, 1800, 0.6] })]
  for (let i = 0; i < 36; i++) v.push(noise(r() * 2.1, 0.04, 0.12 + r() * 0.12, { bp: [1200 + r() * 1800, 1200 + r() * 1800, 1.4] }))
  return v
}
function drumroll() {
  const v = []
  for (let i = 0; i < 30; i++) v.push(noise(i * 0.05, 0.06, 0.08 + i * 0.006, { bp: [380, 380, 1.1] }))
  v.push(osc('sine', 110, 60, 1.55, 0.6, 0.5), noise(1.55, 0.9, 0.22, { hp: 5000 }))
  return v
}
function cheer() {
  const r = rng(11), v = [noise(0, 2, 0.16, { a: 0.3, bp: [1100, 1400, 0.8] })]
  for (let i = 0; i < 5; i++) {
    const f = 330 + r() * 220
    v.push(osc('triangle', f, f * 1.6, 0.15 + r() * 0.5, 0.9 + r() * 0.5, 0.06, { a: 0.08, vib: [5 + r() * 2, 9], lp: 2200 }))
  }
  return v
}

export const SFX = [
  { id: 'honk', label: 'Honk', hue: 8, plan: [
    osc('sawtooth', 350, 362, 0, 0.32, 0.22, { lp: 2600 }), osc('sawtooth', 525, 540, 0, 0.32, 0.12, { lp: 2600 }),
    osc('sawtooth', 350, 366, 0.42, 0.75, 0.22, { lp: 2600 }), osc('sawtooth', 525, 545, 0.42, 0.75, 0.12, { lp: 2600 }),
  ] },
  { id: 'rimshot', label: 'Rimshot', hue: 32, plan: [
    osc('sine', 190, 95, 0, 0.16, 0.5), osc('sine', 150, 75, 0.2, 0.18, 0.5), noise(0.42, 0.7, 0.26, { hp: 6000 }),
  ] },
  { id: 'crickets', label: 'Crickets', hue: 95, plan: crickets() },
  { id: 'applause', label: 'Applause', hue: 48, plan: applause() },
  { id: 'wahwah', label: 'Wah wah', hue: 215, plan: [
    osc('sawtooth', 233, 231, 0, 0.42, 0.18, { a: 0.04, lp: 1300 }), osc('sawtooth', 220, 218, 0.45, 0.42, 0.18, { a: 0.04, lp: 1300 }),
    osc('sawtooth', 208, 206, 0.9, 0.42, 0.18, { a: 0.04, lp: 1300 }), osc('sawtooth', 196, 190, 1.35, 1.1, 0.18, { a: 0.04, lp: 1200, vib: [5, 6] }),
  ] },
  { id: 'boing', label: 'Boing', hue: 300, plan: [osc('sine', 160, 330, 0, 0.75, 0.4, { vib: [14, 55] })] },
  { id: 'drumroll', label: 'Drumroll', hue: 20, plan: drumroll() },
  { id: 'ding', label: 'Ding', hue: 180, plan: [osc('sine', 1318, 1318, 0, 1.5, 0.3, { a: 0.003 }), osc('sine', 2637, 2637, 0, 0.8, 0.08, { a: 0.003 })] },
  { id: 'whoosh', label: 'Whoosh', hue: 200, plan: [noise(0, 0.6, 0.4, { a: 0.3, bp: [300, 3200, 1.2] })] },
  { id: 'kazoo', label: 'Kazoo', hue: 330, plan: [
    osc('sawtooth', 392, 392, 0, 0.18, 0.14, { a: 0.02, lp: 1800, vib: [6, 8] }), osc('sawtooth', 440, 440, 0.22, 0.18, 0.14, { a: 0.02, lp: 1800, vib: [6, 8] }),
    osc('sawtooth', 523, 523, 0.44, 0.55, 0.14, { a: 0.02, lp: 1800, vib: [6, 10] }),
  ] },
  { id: 'cheer', label: 'Cheer', hue: 140, plan: cheer() },
  { id: 'gasp', label: 'Gasp', hue: 260, plan: [noise(0, 0.45, 0.35, { a: 0.22, bp: [900, 2400, 1.6] })] },
  { id: 'bonk', label: 'Bonk', hue: 40, plan: [
    osc('sine', 320, 80, 0, 0.14, 0.55, { a: 0.002 }), osc('triangle', 900, 200, 0, 0.06, 0.2, { a: 0.002 }), noise(0, 0.05, 0.2, { lp: 1400 }),
  ] },
  { id: 'tada', label: 'Ta-da', hue: 55, plan: [
    osc('sawtooth', 523, 523, 0, 0.13, 0.12, { lp: 2600 }),
    osc('sawtooth', 523, 523, 0.18, 0.95, 0.1, { lp: 2600, vib: [5, 3] }), osc('sawtooth', 659, 659, 0.18, 0.95, 0.08, { lp: 2600, vib: [5, 3] }),
    osc('sawtooth', 784, 784, 0.18, 0.95, 0.08, { lp: 2600, vib: [5, 3] }),
  ] },
]
export const SFX_IDS = SFX.map(s => s.id)
export const sfxById = id => SFX.find(s => s.id === id) || null
export const MAX_SYNTH_SECS = 3

// Clip length: when its last voice has faded.
export const planLength = plan => plan.reduce((m, v) => Math.max(m, v.t + v.d), 0)
// A recipe stays short, quiet and in the audible range.
export function planOk(plan) {
  if (!Array.isArray(plan) || !plan.length) return false
  return plan.every(v => v.t >= 0 && v.d > 0 && v.t + v.d <= MAX_SYNTH_SECS && v.peak > 0 && v.peak <= 0.6 && v.a > 0 && v.a < v.d &&
    (v.kind === 'osc' ? v.f.every(f => f >= 20 && f <= 12000) : v.kind === 'noise') &&
    (!v.bp || (v.bp[0] >= 20 && v.bp[1] <= 12000 && v.bp[2] > 0)) && (!v.vib || (v.vib[0] > 0 && v.vib[1] > 0)))
}

// One noise buffer per context, reused by every noise voice.
const noiseBufs = new WeakMap()
function noiseBuf(ctx) {
  let b = noiseBufs.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * MAX_SYNTH_SECS), ctx.sampleRate)
    const d = b.getChannelData(0), r = rng(3)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
    noiseBufs.set(ctx, b)
  }
  return b
}

// Schedules a recipe into `dest` starting at `at`. Returns the clip's length in seconds.
export function renderPlan(ctx, plan, dest, at = ctx.currentTime) {
  for (const v of plan) {
    const t = at + v.t, end = t + v.d
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v.peak, t + v.a)
    g.gain.exponentialRampToValueAtTime(0.0001, end)
    let src, out = g
    if (v.kind === 'osc') {
      src = ctx.createOscillator()
      src.type = v.wave
      src.frequency.setValueAtTime(v.f[0], t)
      if (v.f[1] !== v.f[0]) src.frequency.exponentialRampToValueAtTime(v.f[1], end)
      if (v.vib) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain()
        lfo.frequency.setValueAtTime(v.vib[0], t)
        depth.gain.setValueAtTime(v.vib[1], t)
        lfo.connect(depth).connect(src.frequency)
        lfo.start(t); lfo.stop(end + 0.02)
      }
    } else {
      src = ctx.createBufferSource()
      src.buffer = noiseBuf(ctx)
    }
    let head = src
    const filt = (type, f0, f1 = f0, q) => {
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.setValueAtTime(f0, t)
      if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, end)
      if (q != null) f.Q.setValueAtTime(q, t)
      head.connect(f); head = f
    }
    if (v.bp) filt('bandpass', v.bp[0], v.bp[1], v.bp[2])
    if (v.hp) filt('highpass', v.hp)
    if (v.lp) filt('lowpass', v.lp)
    head.connect(out).connect(dest)
    src.start(t)
    src.stop(end + 0.02)
  }
  return planLength(plan)
}

// ── rate limits ──
// Yours: one clip per 2 s (the server allows 1.8 s, so clock jitter never makes it refuse one the client allowed).
export const SFX_GAP_MS = 2000
export function tryFire(last, now, gap = SFX_GAP_MS) {
  const wait = last == null ? 0 : Math.max(0, last + gap - now)
  return { ok: wait === 0, wait, last: wait === 0 ? now : last }
}
// Everyone else's, as heard: a clip from someone who fired under 1.5 s ago is dropped, and at most 4 play at once.
export const SFX_RECV_GAP_MS = 1500
export const MAX_PLAYING = 4
export function acceptFire(seen, by, now, playing = 0) {
  if (playing >= MAX_PLAYING) return false
  const prev = seen.get(by)
  if (prev != null && now - prev < SFX_RECV_GAP_MS) return false
  seen.set(by, now)
  return true
}

// ── what arrives on the sfx:<stadium> topic (sent by sfx_do, but checked anyway) ──
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const CLIP_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]{1,80}$/
// → { by, id, name, builtin } | { by, id, name, path } | null
export function readFire(p) {
  if (!p || typeof p !== 'object' || !UUID.test(p.by || '')) return null
  const b = sfxById(p.clip)
  if (b) return { by: p.by, id: b.id, name: b.label, builtin: true }
  if (UUID.test(p.clip || '') && CLIP_PATH.test(p.path || '') && typeof p.name === 'string')
    return { by: p.by, id: p.clip, name: clipName(p.name) || 'clip', path: p.path }
  return null
}

// ── custom clips ──
export const MAX_CLIP_BYTES = 300_000
export const MAX_CLIP_SECS = 5
export const NAME_MAX = 24
export const MAX_SERVER_CLIPS = 60
const EXT_TYPE = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' }
// The audio type to upload it as (Windows often leaves .m4a/.opus untyped), or null if it isn't audio.
export function clipType({ type, name }) {
  if (/^audio\//.test(type || '')) return type
  return EXT_TYPE[(/\.(\w+)$/.exec(name || '')?.[1] || '').toLowerCase()] || null
}
export function clipFileError(file) {
  if (!file || !clipType(file)) return "That file isn't audio. Try an mp3, ogg, wav or m4a."
  if (!(file.size > 0)) return 'That file is empty.'
  if (file.size > MAX_CLIP_BYTES) return 'Clips can be up to 300 KB.'
  return null
}
export function clipDurError(dur) {
  if (!Number.isFinite(dur) || dur <= 0) return "Couldn't tell how long that clip is. Try an mp3 or wav."
  if (dur > MAX_CLIP_SECS + 0.05) return 'Clips can be up to 5 seconds.'
  return null
}
// A tidy name: no control characters, single spaces, at most 24 characters.
export const clipName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim()
// "Big_Honk-final (2).mp3" → "Big Honk final 2"
export const nameFromFile = file => clipName(String(file || '').replace(/\.\w+$/, '').replace(/[_\-()[\]]+/g, ' ')) || 'My clip'

// ── volume ──
// Your soundboard volume and mute, separate from voices and music; ducked while people talk (lib/music duckStep drives
// `amount`). Deafen silences it too (the call's own mix is already at zero then).
export const DEFAULT_SFX_VOL = 0.3
export const SFX_DUCK = 0.4
export const SFX_MASTER = 0.8
export function sfxGain({ vol = DEFAULT_SFX_VOL, muted = false, deafened = false, duck = true, amount = 0 }) {
  if (muted || deafened) return 0
  const a = duck ? Math.max(0, Math.min(1, amount)) : 0
  return Math.max(0, Math.min(1, vol)) * (a * SFX_DUCK + (1 - a)) * SFX_MASTER
}

// What a stadium shows: 'none' (no soundboard here yet, or off and you're not a mod) · 'off' (mods get a way to turn
// it back on) · 'on'. row: undefined while loading, null when the table isn't there, else { disabled }.
export const sfxMode = (row, isMod) => !row ? 'none' : row.disabled ? (isMod ? 'off' : 'none') : 'on'
export const SFX_OFF = 'The soundboard is turned off in this stadium.'
