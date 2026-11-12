// Soft table sounds, synthesised like uisound.js (no audio files). Pure: takes the AudioContext, so tests can stub it.
// sfxFor compares the previous and new public view, so everyone watching hears every move, not just the player.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function sfxFor(game, p, v) {
  if (!p || !v) return []
  const out = [], last = v.last, fresh = !!last && !same(last, p.last)
  if (game === 'property') {
    if (v.rolls > p.rolls) out.push('dice')
    if (fresh && last.sold) out.push('gavel')
    if (fresh && (last.type === 'buy' || last.type === 'bail' || last.rent || last.sold?.to)) out.push('coins')
  } else if (game === 'isle') {
    if (v.rolls > p.rolls) out.push('dice')
    if (fresh && (last.type === 'buy' || last.type === 'play')) out.push('card')
    if (fresh && (last.type === 'build' || last.type === 'cottage' || last.type === 'path')) out.push('chips')
    if (fresh && (last.type === 'accept' || last.type === 'bank' || last.took)) out.push('coins')
  } else if (game === 'poker') {
    if (fresh && ['call', 'raise', 'allin'].includes(last.type)) out.push('chips')
    if (v.hand !== p.hand) out.push('deal')
    else if (v.board?.length > p.board?.length || (v.shown && !p.shown)) out.push('flip')
  } else if (game === 'snack') {
    if (v.moves !== p.moves && last?.type === 'play') out.push('card')
    if (v.moves !== p.moves && (last?.type === 'draw' || last?.type === 'catch')) out.push('deal')
  } else if (game === 'highcard') {
    if (fresh && last.type === 'swap') out.push('deal')
    if (v.reveal && !p.reveal) out.push('flip')
  }
  if (v.winner && !p.winner) out.push('win')
  return out
}

const env = (g, t, dur, peak) => {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
}
function tone(c, t, f, dur, peak, type = 'sine', f2 = f) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  env(g, t, dur, peak)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}
let noiseBuf
function noise(c, t, dur, freq, peak) { // a filtered puff of noise: card swish, dice click
  if (noiseBuf?.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.2), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  s.buffer = noiseBuf
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = 1.2
  env(g, t, dur, peak * 2) // the band-pass eats most of the noise's energy
  s.connect(f).connect(g).connect(c.destination)
  s.start(t)
  s.stop(t + dur + 0.02)
}

// Each takes (ctx, start time, peak gain).
export const SFX = {
  dice: (c, t, p) => { for (let i = 0, at = t; i < 7; at += 0.03 + 0.015 * i++) noise(c, at, 0.03, 1600 + Math.random() * 1600, p * (1 - i / 9)) },
  card: (c, t, p) => noise(c, t, 0.08, 2600, p),
  deal: (c, t, p) => [0, 0.08, 0.16].forEach(d => noise(c, t + d, 0.06, 2400, p * 0.4)),
  flip: (c, t, p) => { noise(c, t, 0.04, 3200, p * 0.7); noise(c, t + 0.05, 0.06, 2000, p) },
  chips: (c, t, p) => [0, 0.05, 0.09].forEach((d, i) => tone(c, t + d, 2900 + i * 430, 0.07, p * 0.5)),
  coins: (c, t, p) => [1318.5, 1760, 2637].forEach((f, i) => tone(c, t + i * 0.06, f, 0.18, p * 0.6, 'triangle')),
  gavel: (c, t, p) => { tone(c, t, 220, 0.12, p, 'sine', 110); noise(c, t, 0.03, 900, p * 0.6) },
  win: (c, t, p) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + i * 0.11, f, i === 3 ? 0.5 : 0.16, p, 'triangle')),
}

// Plays a list of cues one after another; same loudness scale as playUi (well under the animalese blips).
export function playSfx(ctx, kinds, volume = 0.5) {
  if (!ctx || !(volume > 0)) return
  kinds.forEach((k, i) => SFX[k](ctx, ctx.currentTime + 0.01 + i * 0.3, 0.05 * Math.min(1, volume)))
}
