// Voice message helpers (tested in voicenote.test.js).
export const MAX_SEC = 300
export const SPEEDS = [1, 1.5, 2]
export const nextSpeed = s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]
export const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Peak bars (4..100) from decoded samples; the loudest bar is 100 so quiet recordings still show a shape.
export function peaks(samples, n = 48) {
  const size = Math.max(1, Math.floor(samples.length / n)), out = []
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let j = i * size, end = Math.min(samples.length, j + size); j < end; j++) m = Math.max(m, Math.abs(samples[j]))
    out.push(m)
  }
  const top = Math.max(...out) || 1
  return out.map(v => Math.max(4, Math.round((v / top) * 100)))
}

// Stored waveforms come from the sender's browser: keep at most 64 numbers clamped to 4..100.
export const cleanWave = w => Array.isArray(w) && w.length ? w.slice(0, 64).map(v => Math.min(100, Math.max(4, Math.round(+v) || 4))) : null
