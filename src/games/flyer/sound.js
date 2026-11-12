// Chatterflies sound: every effect and the music bed are synthesised with Web Audio (no audio files). One engine per
// page, created on the first tap or key (browsers only start audio from a gesture). Quiet by default, because players
// are in voice: a master volume and mute (saved in localStorage), and the whole mix ducks while anyone talks.
//
// Graph: sfx bus ─┐
//        music bus ─(duck)─┴─ master (volume, mute) ─ compressor ─ speakers
// The engine takes a context factory, so the tests run every cue on a stub.

const KEY = 'flyer-audio'
const clamp01 = x => Math.max(0, Math.min(1, +x || 0))
export const DEFAULT_VOL = 0.35

// ── volume / mute, shared by every control on the page ──
function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return { vol: p?.vol == null ? DEFAULT_VOL : clamp01(p.vol), mute: !!p?.mute } } catch { return { vol: DEFAULT_VOL, mute: false } }
}
let prefs = load()
const subs = new Set()
export const audioPrefs = {
  get: () => prefs,
  set(patch) {
    prefs = { ...prefs, ...patch, vol: clamp01(patch.vol ?? prefs.vol) }
    try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
    subs.forEach(f => f(prefs))
  },
  sub(f) { subs.add(f); return () => subs.delete(f) },
}

// Pentatonic steps for the sprinkle streak (C major pentatonic from C6), so a long run of pickups climbs a tune.
const PENTA = [0, 2, 4, 7, 9]
export const streakHz = i => 1046.5 * 2 ** ((PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12)

export function makeAudio(makeCtx = () => new (window.AudioContext || window.webkitAudioContext)()) {
  let c = null, master, comp, sfxBus, musicBus, duckS, duckM, noiseBuf, thrust, skid, seq = null, duckNow = 0, offPrefs = null
  const E = { ctx: () => c }

  function build() {
    c = makeCtx()
    comp = c.createDynamicsCompressor ? c.createDynamicsCompressor() : c.createGain()
    master = c.createGain(); sfxBus = c.createGain(); musicBus = c.createGain(); duckS = c.createGain(); duckM = c.createGain()
    sfxBus.connect(duckS).connect(master)
    musicBus.connect(duckM).connect(master)
    master.connect(comp).connect(c.destination)
    musicBus.gain.value = 0.55
    applyPrefs(prefs)
    offPrefs = audioPrefs.sub(applyPrefs)
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 1.5), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    thrust = loop('bandpass', 700, 0.8)
    skid = loop('bandpass', 1500, 2)
  }
  function applyPrefs(p) {
    if (!c) return
    // Perceptual curve; full volume is still modest so it sits under voice.
    const v = p.mute ? 0 : 0.5 * p.vol * p.vol + 0.15 * p.vol
    master.gain.setTargetAtTime(v, c.currentTime, 0.03)
  }

  // ── building blocks ──
  const env = (g, t, a, dur, peak) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }
  function tone(t, f, dur, peak, { type = 'sine', f2 = f, a = 0.006, bus = sfxBus, lp = 0 } = {}) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
    env(g, t, a, dur, peak)
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl).connect(g) } else o.connect(g)
    g.connect(bus)
    o.start(t); o.stop(t + dur + 0.03)
    return o
  }
  function burst(t, dur, freq, peak, { type = 'bandpass', Q = 1, f2 = freq, a = 0.004, bus = sfxBus } = {}) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = noiseBuf
    f.type = type; f.Q.value = Q
    f.frequency.setValueAtTime(freq, t)
    if (f2 !== freq) f.frequency.exponentialRampToValueAtTime(f2, t + dur)
    env(g, t, a, dur, peak)
    s.connect(f).connect(g).connect(bus)
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03)
  }
  // A held noise (thrust, skid): always running at zero gain, faded in and out.
  function loop(type, freq, Q) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = noiseBuf; s.loop = true
    f.type = type; f.frequency.value = freq; f.Q.value = Q
    g.gain.value = 0
    s.connect(f).connect(g).connect(sfxBus)
    s.start()
    return { set(gain, hz, tc = 0.04) { const t = c.currentTime; g.gain.setTargetAtTime(gain, t, tc); if (hz) f.frequency.setTargetAtTime(hz, t, tc * 2) } }
  }

  // ── the effects. Each takes (time, opts). ──
  const FX = {
    // a sprinkle: a bright two-note glint; opts.i is the streak position (pitch climbs the pentatonic)
    sprinkle(t, { i = 0 } = {}) { const f = streakHz(Math.min(i, 14)); tone(t, f, 0.09, 0.16, { type: 'triangle' }); tone(t + 0.035, f * 1.5, 0.12, 0.09, { type: 'sine' }) },
    // the gift parcel tears open: paper swish, then a little rising arpeggio
    parcel(t) { burst(t, 0.12, 3000, 0.5, { f2: 1200, Q: 0.8 }); [659.25, 830.6, 987.8, 1318.5].forEach((f, i) => tone(t + 0.06 + i * 0.055, f, 0.18, 0.14, { type: 'triangle' })) },
    // climbing into a vehicle: a springy boing upward and a seat-thump
    mount(t) { tone(t, 180, 0.28, 0.32, { type: 'sine', f2: 520 }); tone(t, 90, 0.12, 0.35, { type: 'sine', f2: 50 }); burst(t + 0.05, 0.1, 1800, 0.25) },
    // a vehicle gets hit and pops: a cork pop, a fizz and a sad slide down
    pop(t) { burst(t, 0.05, 2200, 0.9, { Q: 0.6 }); tone(t, 900, 0.32, 0.22, { type: 'square', f2: 160, lp: 1800 }); burst(t + 0.04, 0.45, 5000, 0.25, { type: 'highpass', f2: 2500 }) },
    // the vehicle just runs out (no hit): a soft puff
    unmount(t) { burst(t, 0.2, 900, 0.35, { f2: 400 }); tone(t, 420, 0.18, 0.12, { f2: 260 }) },
    // the Second Brew shield breaks: a glassy chime
    shield(t) { [1567.98, 2093, 2637].forEach((f, i) => tone(t + i * 0.03, f, 0.35, 0.12, { type: 'sine' })); burst(t, 0.15, 6000, 0.3, { type: 'highpass' }) },
    // crane warning: a soft tracking blip, and a sharper one once it locks
    beep(t) { tone(t, 1320, 0.07, 0.11, { type: 'square', lp: 3000 }) },
    lock(t) { tone(t, 1760, 0.05, 0.13, { type: 'square', lp: 4000 }) },
    crane(t) { burst(t, 0.45, 600, 0.35, { f2: 2400, Q: 1.5, a: 0.08 }) }, // paper whoosh past
    // steam vent charging (opts.dur seconds): a hiss that swells, then the blast
    charge(t, { dur = 1.5 } = {}) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
      s.buffer = noiseBuf; s.loop = true
      f.type = 'highpass'; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur)
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
      s.connect(f).connect(g).connect(sfxBus); s.start(t); s.stop(t + dur + 0.1)
    },
    blast(t) { burst(t, 1.0, 1400, 0.55, { type: 'lowpass', f2: 500, Q: 0.5, a: 0.01 }); burst(t, 0.6, 4000, 0.2, { type: 'highpass' }) },
    // you bonk: a hollow knock, a cartoon slide down and a little thump
    bonk(t) {
      tone(t, 520, 0.09, 0.4, { type: 'square', f2: 260, lp: 2200 }); tone(t, 140, 0.25, 0.5, { type: 'sine', f2: 55 })
      burst(t, 0.06, 1200, 0.6, { Q: 0.8 }); tone(t + 0.1, 700, 0.55, 0.12, { type: 'triangle', f2: 180 })
    },
    bounce(t, { k = 1 } = {}) { tone(t, 110, 0.14, 0.35 * k, { f2: 50 }); burst(t, 0.07, 500, 0.35 * k) },
    // the Kettle Whistle: a rising, wobbling kettle cry
    whistle(t) {
      const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain()
      o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(2300, t + 0.25)
      lfo.frequency.value = 11; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency)
      env(g, t, 0.04, 1.2, 0.12)
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 1.25); lfo.start(t); lfo.stop(t + 1.25)
      burst(t, 1.1, 3500, 0.12, { type: 'bandpass', Q: 2 })
    },
    // touching down on the floor: opts.k 0..1 is how hard
    land(t, { k = 1 } = {}) { tone(t, 120, 0.12, 0.3 * k, { f2: 60 }); burst(t, 0.09, 700, 0.3 * k, { f2: 300 }) },
    // a distance milestone (every 500 m): a cheerful two-tone ding
    milestone(t) { tone(t, 1046.5, 0.16, 0.14, { type: 'triangle' }); tone(t + 0.1, 1568, 0.3, 0.14, { type: 'triangle' }) },
    // countdown ticks and the "Boil!" go
    tick(t) { tone(t, 880, 0.12, 0.13, { type: 'triangle' }) },
    go(t) { tone(t, 1318.5, 0.35, 0.15, { type: 'triangle' }); tone(t, 659.25, 0.35, 0.1, { type: 'triangle' }) },
    // the podium: a bright brassy fanfare (opts.won adds a final flourish)
    fanfare(t, { won = false } = {}) {
      const n = [[523.25, 0, 0.14], [659.25, 0.14, 0.14], [783.99, 0.28, 0.14], [1046.5, 0.42, 0.5], [783.99, 0.7, 0.12], [1046.5, 0.84, 0.7]]
      for (const [f, d, l] of n) { tone(t + d, f, l, 0.14, { type: 'sawtooth', lp: 2600, a: 0.015 }); tone(t + d, f / 2, l, 0.08, { type: 'triangle' }) }
      if (won) [1318.5, 1568, 2093].forEach((f, i) => tone(t + 1.0 + i * 0.07, f, 0.5, 0.08, { type: 'sine' }))
    },
  }

  // ── the music bed: a tiny lookahead sequencer. Cozy, bouncy, 112 bpm, I–vi–IV–V in F with a hummed tune. ──
  const BPM = 112, STEP = 60 / BPM / 2 // eighth notes
  const ROOTS = [87.31, 73.42, 58.27, 65.41] // F2, D2, Bb1, C2 (one bar each)
  const CHORDS = [[349.23, 440, 523.25], [293.66, 349.23, 440], [233.08, 293.66, 349.23], [261.63, 329.63, 392]]
  // Tune in scale degrees over 4 bars × 8 steps (null = rest), two variations alternating.
  const SCALE = [349.23, 392, 440, 523.25, 587.33, 698.46, 783.99, 880]
  const TUNES = [
    [2, null, 3, 4, null, 3, 2, null, 0, null, 2, 3, null, 2, 0, null, 3, null, 4, 5, null, 4, 3, null, 1, null, 3, 4, null, 3, null, null],
    [4, null, 5, 6, null, 5, 4, null, 2, null, 4, null, 3, 2, null, null, 0, null, 2, 3, 4, null, 3, 2, 1, null, 2, null, 4, null, null, null],
  ]
  function startMusic() {
    if (seq || !c) return
    let i = 0, at = c.currentTime + 0.1
    const tick = () => {
      if (c.state !== 'running') { at = c.currentTime + 0.1; return }
      while (at < c.currentTime + 0.25) {
        const s = i % 32, bar = Math.floor(s / 8), b = s % 8, loop = Math.floor(i / 32)
        // bass on the beats, a walk-up note before the next bar
        if (b % 2 === 0) tone(at, b === 6 ? ROOTS[bar] * 1.5 : ROOTS[bar], STEP * 1.6, 0.22, { type: 'triangle', bus: musicBus, a: 0.01 })
        // off-beat plucked chords (the "oom-pah")
        if (b % 2 === 1) for (const f of CHORDS[bar]) tone(at, f, STEP * 0.9, 0.045, { type: 'square', lp: 1400, bus: musicBus, a: 0.004 })
        // shaker on every eighth, a bit louder off the beat
        burst(at, 0.04, 7000, b % 2 ? 0.07 : 0.035, { type: 'highpass', bus: musicBus })
        // the tune comes in after the first loop
        const n = loop > 0 ? TUNES[loop % 2][s] : null
        if (n != null) tone(at, SCALE[n] * 2, STEP * 1.8, 0.06, { type: 'sine', bus: musicBus, a: 0.02 })
        at += STEP; i++
      }
    }
    tick()
    seq = setInterval(tick, 60)
  }
  function stopMusic() { if (seq) { clearInterval(seq); seq = null } }

  return {
    E,
    // Call from a gesture: creates/resumes the context.
    unlock() {
      try {
        if (!c) build()
        if (c.state === 'suspended') c.resume?.()
      } catch { c = null }
    },
    ready: () => !!c && c.state === 'running',
    play(name, opts) { if (!c || c.state !== 'running' || !FX[name]) return; try { FX[name](c.currentTime + 0.005, opts) } catch { /* a node type missing on an old engine */ } },
    // Held sounds. level 0..1.
    thrust(on, hard = 1) { if (c) thrust.set(on ? 0.2 * hard : 0, on ? 650 + 350 * hard : 380, on ? 0.025 : 0.07) },
    skid(level) { if (c) skid.set(0.25 * level, 900 + 900 * level, 0.03) },
    music(on) { if (!c) return; on ? startMusic() : stopMusic() },
    // Someone is talking (0..1): quick to duck, slow to come back.
    duck(level) {
      if (!c) return
      const l = clamp01(level), t = c.currentTime, tc = l > duckNow ? 0.06 : 0.5
      duckNow = l
      duckS.gain.setTargetAtTime(1 - 0.4 * l, t, tc)
      duckM.gain.setTargetAtTime(1 - 0.8 * l, t, tc)
    },
    pause() { stopMusic(); if (c) { thrust.set(0); skid.set(0) } },
    suspend() { if (c?.state === 'running') c.suspend?.() },
    resume() { if (c?.state === 'suspended') c.resume?.() },
    close() { stopMusic(); offPrefs?.(); try { c?.close?.() } catch { /* fine */ } c = null },
    FX: Object.keys(FX),
  }
}

// The page's one engine (the line-up, the run and the podium share it).
let shared = null
export const flyerAudio = () => (shared ||= makeAudio())
