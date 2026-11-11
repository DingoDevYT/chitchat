// Quiet synthesised UI blips (same no-audio-files idea as animalese). Pure: takes the AudioContext, so tests can stub it.
export const UI_TONES = {
  open: [587.33, 880], // D5 → A5, soft rise
  close: [880, 587.33],
  send: [659.25, 987.77], // E5 → B5 "pop"
  toggle: [783.99],
  got: [523.25, 659.25, 783.99, 1046.5], // C major arpeggio for "You got…"
}
export const UI_GAP = 0.09 // seconds: sounds closer together than this are dropped, never stacked

let lastAt = -Infinity
// Plays one cue; returns false when it was throttled or silent.
export function playUi(ctx, kind, volume = 0.5) {
  const notes = UI_TONES[kind]
  if (!ctx || !notes || !(volume > 0)) return false
  const t0 = ctx.currentTime
  if (t0 - lastAt < UI_GAP) return false
  lastAt = t0
  const peak = 0.05 * Math.min(1, volume) // well under the animalese blips
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * (kind === 'got' ? 0.07 : 0.045)
    o.type = kind === 'got' ? 'triangle' : 'sine'
    o.frequency.setValueAtTime(f, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.14)
  })
  return true
}
