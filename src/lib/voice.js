// Voice gate math (tested in chat.test.js). This file is also loaded as the AudioWorklet module
// (see makeMic in Voice.jsx), so it must stay self-contained: no imports.

// RMS amplitude (0..1) → 0..100, i.e. dBFS + 100. The meter and the sensitivity threshold use this scale.
export const level = rms => Math.max(0, Math.min(100, 100 + 20 * Math.log10(rms || 1e-9)))

// The gate stays open until the returned time; loud input pushes it `hang` seconds ahead so word endings aren't clipped.
export const gateUntil = (lvl, thr, until, now, hang = 0.3) => lvl >= thr ? now + hang : until

// Background-noise estimate for "Automatic" sensitivity: follows quiet moments quickly, loud ones very slowly.
export const trackFloor = (floor, lvl) => floor + (lvl - floor) * (lvl < floor ? 0.01 : 0.0002)
export const autoThreshold = floor => Math.min(floor + 15, 75)

// Level at which an avatar counts as talking (matches watchLevel's byte RMS > 6).
export const TALK = 73

const KEYS = { Backquote: '`', Space: 'Space', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' }
// KeyboardEvent.code → something a human recognises.
export const keyLabel = code => KEYS[code] || code.replace(/^(Key|Digit)/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$2 $1').replace(/^Numpad/, 'Num ')

// True when a saved device id is no longer plugged in. Without permission ids are blank, so nothing counts as missing.
export const missingDevice = (devices, kind, id) => !!id && devices.some(d => d.kind === kind && d.deviceId) &&
  !devices.some(d => d.kind === kind && d.deviceId === id)

// Runs on the audio thread, so the gate keeps working in a background tab (timers get throttled there).
// Applies input volume, gates below the threshold (or while the push-to-talk key is up) and reports the raw level.
if (typeof registerProcessor === 'function') registerProcessor('gate', class extends AudioWorkletProcessor {
  constructor() {
    super()
    Object.assign(this, { o: { gain: 1, thr: null, ptt: false, held: false }, g: 0, until: 0, floor: 40, peak: 0, n: 0 })
    this.port.onmessage = e => { this.o = e.data }
  }
  process(inputs, [output]) {
    const input = inputs[0], first = input[0], o = this.o
    if (!first) return true
    let sum = 0
    for (const v of first) sum += v * v
    const lvl = level(Math.sqrt(sum / first.length))
    this.floor = trackFloor(this.floor, lvl)
    const thr = o.thr ?? autoThreshold(this.floor)
    this.until = gateUntil(lvl, thr, this.until, currentTime)
    const open = o.ptt ? o.held : currentTime < this.until
    const target = open ? o.gain : 0
    const a = 1 - Math.exp(-1 / ((open ? 0.005 : 0.05) * sampleRate)) // ~5 ms fade in, ~50 ms fade out
    let g = this.g
    for (let i = 0; i < first.length; i++) {
      g += (target - g) * a
      for (let c = 0; c < output.length; c++) output[c][i] = (input[c] || first)[i] * g
    }
    this.g = g
    this.peak = Math.max(this.peak, lvl)
    if (++this.n >= 16) { this.port.postMessage({ lvl: this.peak, thr, open }); this.peak = this.n = 0 }
    return true
  }
})
