import { prefs } from './store'

// Synthesised "Animalese": one short formant-filtered blip per letter. No audio files needed.
let ctx
let lastAt = 0

export function unlockAudio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
}

export function letterPitch(ch, pitch = 1) {
  const lower = ch.toLowerCase()
  const code = lower.codePointAt(0)
  const vowel = 'aeiouy'.includes(lower)
  return { f0: 180 * pitch * (1 + (code % 7) / 14) * (vowel ? 1.2 : 1), vowel, code }
}

export function blip(ch, voice = {}, { force = false } = {}) {
  const { volume, animalese } = prefs.get()
  if (!ch || !ctx || (!animalese && !force) || volume <= 0) return
  if (!/[\p{L}\p{N}]/u.test(ch)) return // spaces and punctuation are natural pauses
  const now = ctx.currentTime
  if (now - lastAt < 0.035) return // shortcut: one global voice so simultaneous talkers don't stack into noise
  lastAt = now

  const { f0, vowel, code } = letterPitch(ch, voice.pitch ?? 1)
  const dur = 0.07 / (voice.speed ?? 1)
  const osc = ctx.createOscillator()
  const filt = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  osc.type = voice.wave || 'square'
  osc.frequency.setValueAtTime(f0, now)
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, now + dur)
  filt.type = 'bandpass'
  filt.frequency.value = vowel ? 900 + (code % 5) * 150 : 1800 + (code % 5) * 200
  filt.Q.value = 2
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.6), now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(filt).connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

// Plays a phrase once, for the voice preview in settings.
export function sayPreview(text, voice) {
  unlockAudio()
  const step = 30 / (voice.speed ?? 1)
  ;[...text].forEach((ch, i) => setTimeout(() => blip(ch, voice, { force: true }), i * step))
}
