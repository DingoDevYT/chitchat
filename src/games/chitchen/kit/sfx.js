// Midnight Chitchen sounds, synthesised with Web Audio (no files). Quiet by default; muting is remembered in
// localStorage ('chitchen:sfx'). Browsers only start audio after a tap or key press: call unlockSfx() from one
// (or just play(): the first call from a gesture unlocks it).
//
//   import { play, startLoop, setMuted, isMuted } from './kit/sfx.js'
//   play('kill')                          // one-shot
//   const stop = startLoop('sabotage')    // a loop; call stop() to end it
//
// Cues: step, taskBeep, taskDone, kill, report, meeting, vote, eject, sting, vent, win, lose; loop: sabotage.
// The synth functions are pure (ctx, destination, start time, peak gain), so tests can run them on a stub context.

const KEY = 'chitchen:sfx'
const store = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} }

let ctx = null, master = null, prefs = null
const P = () => (prefs ||= { muted: false, volume: 0.5, ...store() })

export function isMuted() { return !!P().muted }
export function setMuted(m) { P().muted = !!m; save(P()); if (master) master.gain.value = m ? 0 : P().volume }
export function getVolume() { return P().volume }
export function setVolume(v) { P().volume = Math.max(0, Math.min(1, +v || 0)); save(P()); if (master && !P().muted) master.gain.value = P().volume }

function audio() {
  if (ctx) return ctx
  // no context before the first tap or key press (browsers refuse to start one and log a warning)
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = isMuted() ? 0 : P().volume
  master.connect(ctx.destination)
  return ctx
}
export function unlockSfx() { const c = audio(); if (c?.state === 'suspended') c.resume?.() }

// ---- building blocks ------------------------------------------------------------------------------------------------
const env = (g, t, a, dur, peak) => {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
}
function tone(c, out, t, f, dur, peak, type = 'sine', f2 = f, a = 0.005) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  env(g, t, a, dur, peak)
  o.connect(g); g.connect(out)
  o.start(t); o.stop(t + dur + 0.03)
  return o
}
const bufs = new WeakMap()
function noiseBuf(c) {
  let b = bufs.get(c)
  if (!b) {
    b = c.createBuffer(1, Math.ceil(c.sampleRate * 1.5), c.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    bufs.set(c, b)
  }
  return b
}
// filtered noise; f2 sweeps the filter
function noise(c, out, t, dur, freq, peak, type = 'bandpass', q = 1.2, f2 = freq, a = 0.004) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  s.buffer = noiseBuf(c)
  f.type = type; f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (f2 !== freq) f.frequency.exponentialRampToValueAtTime(f2, t + dur)
  env(g, t, a, dur, peak)
  s.connect(f); f.connect(g); g.connect(out)
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03)
}
const bell = (c, out, t, f0, peak, dur = 1.6) => [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]].forEach(([k, a]) => tone(c, out, t, f0 * k, dur / Math.sqrt(k), peak * a, 'sine', f0 * k, 0.002))

// ---- the cues: (ctx, destination, start time, peak) -----------------------------------------------------------------
export const CUES = {
  step: (c, o, t, p) => { const r = 0.85 + Math.random() * 0.3; noise(c, o, t, 0.07, 420 * r, p * 0.7, 'lowpass', 0.8); tone(c, o, t, 140 * r, 0.05, p * 0.35, 'sine', 70) },
  taskBeep: (c, o, t, p) => { tone(c, o, t, 880, 0.06, p * 0.5, 'square'); tone(c, o, t + 0.08, 1175, 0.07, p * 0.5, 'square') },
  taskDone: (c, o, t, p) => { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(c, o, t + i * 0.07, f, i === 3 ? 0.45 : 0.12, p * 0.7, 'triangle')); noise(c, o, t + 0.28, 0.3, 6000, p * 0.25, 'highpass', 0.7) },
  kill: (c, o, t, p) => { // the TV smashes: thump, glass, fizzing crackle and a dying zap
    tone(c, o, t, 150, 0.25, p * 1.2, 'sine', 38)
    noise(c, o, t, 0.12, 900, p * 1.1, 'lowpass', 0.7)
    noise(c, o, t + 0.01, 0.35, 5200, p * 0.9, 'highpass', 0.8)
    for (let i = 0; i < 9; i++) noise(c, o, t + 0.06 + i * 0.04 + Math.random() * 0.03, 0.025, 2500 + Math.random() * 4000, p * 0.6 * (1 - i / 10), 'bandpass', 3)
    tone(c, o, t + 0.04, 1400, 0.5, p * 0.28, 'sawtooth', 60)
  },
  report: (c, o, t, p) => { // body found: a two-tone kitchen-timer alarm
    noise(c, o, t, 0.08, 1200, p * 0.6)
    for (let i = 0; i < 6; i++) tone(c, o, t + i * 0.16, i % 2 ? 660 : 880, 0.14, p * 0.55, 'square', i % 2 ? 660 : 880, 0.01)
  },
  meeting: (c, o, t, p) => { bell(c, o, t, 523, p); bell(c, o, t + 0.45, 523, p * 0.8); bell(c, o, t + 0.9, 659, p * 0.9, 2.2) },
  vote: (c, o, t, p) => { noise(c, o, t, 0.025, 3200, p * 0.8, 'bandpass', 2); tone(c, o, t, 1500, 0.04, p * 0.35, 'triangle', 1100) },
  eject: (c, o, t, p) => { noise(c, o, t, 1.3, 260, p * 1.1, 'bandpass', 2.5, 3200, 0.35); noise(c, o, t + 0.9, 0.8, 3000, p * 0.5, 'bandpass', 2, 180, 0.1) },
  sting: (c, o, t, p) => { // the verdict text: a low hit, then an unresolved chord
    tone(c, o, t, 110, 0.6, p * 0.9, 'sine', 55)
    ;[220, 261.6, 311.1].forEach(f => tone(c, o, t + 0.05, f, 1.4, p * 0.3, 'triangle', f, 0.02))
    tone(c, o, t + 0.5, 415.3, 1.2, p * 0.22, 'triangle', 415.3, 0.05)
  },
  vent: (c, o, t, p) => { tone(c, o, t, 180, 0.12, p * 0.9, 'sine', 900); noise(c, o, t, 0.15, 1500, p * 0.5); tone(c, o, t + 0.05, 2300, 0.18, p * 0.18, 'triangle'); tone(c, o, t + 0.05, 3170, 0.14, p * 0.12, 'triangle') },
  win: (c, o, t, p) => { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, o, t + i * 0.1, f, i === 4 ? 0.9 : 0.16, p * 0.7, 'triangle')); [523.25, 659.25, 783.99].forEach(f => tone(c, o, t + 0.5, f, 1, p * 0.25, 'sine', f, 0.02)) },
  lose: (c, o, t, p) => { [392, 349.2, 311.1, 233.1].forEach((f, i) => tone(c, o, t + i * 0.22, f, i === 3 ? 1.1 : 0.24, p * 0.6, 'triangle', i === 3 ? f * 0.94 : f)) },
}
// relative loudness per cue (footsteps whisper, the alarm and bell carry)
const LEVEL = { step: 0.35, taskBeep: 0.6, taskDone: 0.8, kill: 1, report: 0.9, meeting: 1, vote: 0.7, eject: 0.8, sting: 0.8, vent: 0.8, win: 0.9, lose: 0.9 }
const BASE = 0.08 // peak gain at volume 1; well under voice chat

export function play(name, { delay = 0, gain = 1 } = {}) {
  if (isMuted() || !CUES[name]) return
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') c.resume?.()
  try { CUES[name](c, master, c.currentTime + 0.01 + delay, BASE * (LEVEL[name] ?? 1) * gain) } catch {}
}

// ---- loops ----------------------------------------------------------------------------------------------------------
// (ctx, destination, peak) → stop(). Sabotage: a pulsing two-tone oven alarm.
export const LOOPS = {
  sabotage: (c, out, p) => {
    const t = c.currentTime
    const osc = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), amp = c.createGain(), pulse = c.createOscillator(), pulseDepth = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain()
    osc.type = 'square'; osc.frequency.value = 455
    lfo.type = 'square'; lfo.frequency.value = 1.1; depth.gain.value = 65
    lfo.connect(depth); depth.connect(osc.frequency)
    pulse.type = 'sine'; pulse.frequency.value = 2.2; pulseDepth.gain.value = p * 0.45
    amp.gain.value = p * 0.55
    pulse.connect(pulseDepth); pulseDepth.connect(amp.gain)
    lp.type = 'lowpass'; lp.frequency.value = 1800
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.3)
    osc.connect(lp); lp.connect(amp); amp.connect(g); g.connect(out)
    for (const o of [osc, lfo, pulse]) o.start(t)
    return () => {
      const e = c.currentTime
      g.gain.cancelScheduledValues(e); g.gain.setValueAtTime(g.gain.value || 1, e); g.gain.exponentialRampToValueAtTime(0.0001, e + 0.25)
      for (const o of [osc, lfo, pulse]) o.stop(e + 0.3)
    }
  },
}
export function startLoop(name) {
  const c = audio()
  if (!c || !LOOPS[name]) return () => {}
  if (c.state === 'suspended') c.resume?.()
  let stop
  try { stop = LOOPS[name](c, master, BASE * 0.8) } catch { return () => {} }
  let done = false
  return () => { if (!done) { done = true; try { stop() } catch {} } }
}
