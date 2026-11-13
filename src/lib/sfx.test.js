import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SFX, SFX_IDS, MAX_SYNTH_SECS, planOk, planLength, renderPlan, tryFire, acceptFire, SFX_GAP_MS, SFX_RECV_GAP_MS, MAX_PLAYING,
  readFire, clipType, clipFileError, clipDurError, clipName, nameFromFile, MAX_CLIP_BYTES, sfxGain, DEFAULT_SFX_VOL, SFX_DUCK,
  SFX_MASTER, sfxMode,
} from './sfx.js'
import { duckStep } from './music.js'

// Stub AudioContext: records what would be scheduled, never makes a sound (no real context exists in node).
function stubCtx() {
  const log = { osc: [], started: [], stopped: [], filters: [], peaks: [], buffers: 0, connects: 0 }
  const param = (name) => ({
    setValueAtTime(v) { this.v = v; if (name === 'freq') log.osc.at(-1)?.f.push(v) },
    exponentialRampToValueAtTime(v) { if (name === 'gain') log.peaks.push(v); if (name === 'freq') log.osc.at(-1)?.f.push(v) },
  })
  const node = extra => ({ connect: n => { log.connects++; return n }, disconnect() {}, ...extra })
  return {
    log, currentTime: 10, sampleRate: 8000,
    createGain: () => node({ gain: param('gain') }),
    createOscillator: () => { const o = node({ type: '', frequency: param('freq'), start: t => log.started.push(t), stop: t => log.stopped.push(t) }); log.osc.push({ f: [] }); return o },
    createBufferSource: () => node({ buffer: null, start: t => log.started.push(t), stop: t => log.stopped.push(t) }),
    createBiquadFilter: () => { const f = node({ type: '', frequency: param('filter'), Q: param('q') }); log.filters.push(f); return f },
    createBuffer: (ch, len) => { log.buffers++; const d = new Float32Array(len); return { getChannelData: () => d } },
  }
}

test('built-in clips: 12 to 16, unique ids, every recipe short, quiet and audible', () => {
  assert.ok(SFX.length >= 12 && SFX.length <= 16)
  assert.equal(new Set(SFX_IDS).size, SFX.length)
  for (const s of SFX) {
    assert.match(s.id, /^[a-z]{2,16}$/)
    assert.ok(s.label && s.label.length <= 24, s.id)
    assert.ok(planOk(s.plan), `${s.id} recipe out of range`)
    assert.ok(planLength(s.plan) > 0.05 && planLength(s.plan) <= MAX_SYNTH_SECS, s.id)
  }
})

test('built-in clips: recipes are fixed (seeded), so everyone hears the same clip', async () => {
  const again = (await import('./sfx.js?again')).SFX
  assert.deepEqual(again.map(s => s.plan), SFX.map(s => s.plan))
})

test('planOk rejects loud, long or inaudible voices', () => {
  const v = { kind: 'osc', wave: 'sine', f: [440, 440], t: 0, d: 0.5, peak: 0.3, a: 0.01 }
  assert.equal(planOk([v]), true)
  assert.equal(planOk([]), false)
  assert.equal(planOk([{ ...v, peak: 0.9 }]), false)
  assert.equal(planOk([{ ...v, t: 2.8 }]), false)
  assert.equal(planOk([{ ...v, f: [5, 440] }]), false)
  assert.equal(planOk([{ ...v, a: 0.6 }]), false)
})

test('renderPlan schedules every voice on a stub context, starting and stopping inside the clip', () => {
  for (const s of SFX) {
    const ctx = stubCtx()
    const len = renderPlan(ctx, s.plan, {}, 10)
    assert.equal(len, planLength(s.plan))
    assert.ok(ctx.log.started.length >= s.plan.length, s.id)
    assert.ok(ctx.log.started.every(t => t >= 10 && t <= 10 + MAX_SYNTH_SECS))
    assert.ok(ctx.log.stopped.every(t => t <= 10 + MAX_SYNTH_SECS + 0.05))
    assert.ok(ctx.log.peaks.every(p => p > 0 && p <= 0.6), 'every envelope is quiet')
  }
  // noise shares one buffer per context
  const ctx = stubCtx()
  renderPlan(ctx, SFX.find(s => s.id === 'applause').plan, {})
  renderPlan(ctx, SFX.find(s => s.id === 'drumroll').plan, {})
  assert.equal(ctx.log.buffers, 1)
  // a pitch sweep ramps the frequency; vibrato adds an LFO oscillator
  const boing = stubCtx()
  renderPlan(boing, SFX.find(s => s.id === 'boing').plan, {}, 0)
  assert.equal(boing.log.osc.length, 2)
  assert.deepEqual(boing.log.osc[0].f, [160, 330])
})

test('your rate limit: one clip per 2 s', () => {
  let r = tryFire(null, 1000)
  assert.deepEqual(r, { ok: true, wait: 0, last: 1000 })
  r = tryFire(r.last, 1500)
  assert.equal(r.ok, false); assert.equal(r.wait, 1500); assert.equal(r.last, 1000)
  r = tryFire(1000, 1000 + SFX_GAP_MS)
  assert.equal(r.ok, true); assert.equal(r.last, 1000 + SFX_GAP_MS)
})

test('what you hear: spam from one person is dropped, and at most 4 clips overlap', () => {
  const seen = new Map()
  assert.equal(acceptFire(seen, 'a', 0), true)
  assert.equal(acceptFire(seen, 'a', SFX_RECV_GAP_MS - 1), false)
  assert.equal(acceptFire(seen, 'b', 10), true, 'someone else is fine')
  assert.equal(acceptFire(seen, 'a', SFX_RECV_GAP_MS), true)
  assert.equal(acceptFire(seen, 'c', 20, MAX_PLAYING), false)
  assert.equal(seen.has('c'), false, 'a dropped clip does not start their cooldown')
})

test('the server and the app agree on the built-in clips and the limits', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/044_soundboard.sql', import.meta.url), 'utf8')
  const list = /builtins text\[\] := array\[([^\]]+)\]/.exec(sql)[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1))
  assert.deepEqual(list, SFX_IDS)
  assert.match(sql, /size between 1 and 300000/)
  assert.ok(sql.includes(String(MAX_CLIP_BYTES)))
  assert.match(sql, /interval '1800 milliseconds'/)
  assert.match(sql, /'\^sfx:\[0-9a-f-\]\{36\}\$'/)
})

test('readFire trusts nothing it receives', () => {
  const by = '11111111-2222-3333-4444-555555555555', id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  assert.deepEqual(readFire({ by, clip: 'rimshot' }), { by, id: 'rimshot', name: 'Rimshot', builtin: true })
  const path = `${by}/${id}/honk.mp3`
  assert.deepEqual(readFire({ by, clip: id, name: '  Big   honk ', path }), { by, id, name: 'Big honk', path })
  assert.equal(readFire({ by, clip: id, name: 'x', path: 'https://evil.example/a.mp3' }), null)
  assert.equal(readFire({ by, clip: id, name: 'x', path: `${by}/${id}/../x` }), null)
  assert.equal(readFire({ by: 'nope', clip: 'rimshot' }), null)
  assert.equal(readFire({ by, clip: 'airraid' }), null)
  assert.equal(readFire(null), null)
})

test('clip uploads: audio only, up to 300 KB and 5 s, tidy names', () => {
  assert.equal(clipType({ type: 'audio/mpeg', name: 'a.mp3' }), 'audio/mpeg')
  assert.equal(clipType({ type: '', name: 'a.M4A' }), 'audio/mp4')
  assert.equal(clipType({ type: 'video/mp4', name: 'a.mp4' }), null)
  assert.equal(clipType({ type: 'image/png', name: 'a.png' }), null)
  assert.equal(clipFileError({ type: 'audio/wav', name: 'a.wav', size: 1000 }), null)
  assert.match(clipFileError({ type: 'text/plain', name: 'a.txt', size: 10 }), /isn't audio/)
  assert.match(clipFileError({ type: 'audio/wav', name: 'a.wav', size: MAX_CLIP_BYTES + 1 }), /300 KB/)
  assert.match(clipFileError({ type: 'audio/wav', name: 'a.wav', size: 0 }), /empty/)
  assert.equal(clipDurError(4.9), null)
  assert.equal(clipDurError(5.04), null, 'a hair over 5 s from the decoder is fine')
  assert.match(clipDurError(5.5), /5 seconds/)
  assert.match(clipDurError(Infinity), /how long/)
  assert.match(clipDurError(NaN), /how long/)
  assert.equal(clipName('  hello\u0007   world  '), 'hello world')
  assert.equal(clipName('x'.repeat(40)).length, 24)
  assert.equal(nameFromFile('Big_Honk-final (2).mp3'), 'Big Honk final 2')
  assert.equal(nameFromFile('.mp3'), 'My clip')
})

test('volume: default 30%, mute and deafen silence it, ducks under voices like the radio', () => {
  assert.equal(DEFAULT_SFX_VOL, 0.3)
  assert.equal(sfxGain({}), DEFAULT_SFX_VOL * SFX_MASTER)
  assert.equal(sfxGain({ vol: 1, muted: true }), 0)
  assert.equal(sfxGain({ vol: 1, deafened: true }), 0)
  assert.equal(sfxGain({ vol: 2 }), SFX_MASTER, 'clamped')
  assert.equal(sfxGain({ vol: 1, amount: 1 }), SFX_DUCK * SFX_MASTER)
  assert.equal(sfxGain({ vol: 1, amount: 1, duck: false }), SFX_MASTER)
  assert.ok(Math.abs(sfxGain({ vol: 1, amount: 0.5 }) - (0.5 * SFX_DUCK + 0.5) * SFX_MASTER) < 1e-9)
  // the radio's envelope drives it: talking pulls it down over the attack, it comes back after the hold and release
  let env = { amount: 0, lastLoud: -Infinity }
  env = duckStep(env, { loud: true, now: 0, dt: 200 })
  assert.equal(sfxGain({ vol: 1, amount: env.amount }), SFX_DUCK * SFX_MASTER)
  env = duckStep(env, { loud: false, now: 2000, dt: 2000 })
  assert.equal(sfxGain({ vol: 1, amount: env.amount }), SFX_MASTER)
})

test('sfxMode: hidden until known, off only for mods', () => {
  assert.equal(sfxMode(undefined, true), 'none')
  assert.equal(sfxMode(null, true), 'none')
  assert.equal(sfxMode({ disabled: false }, false), 'on')
  assert.equal(sfxMode({ disabled: true }, false), 'none')
  assert.equal(sfxMode({ disabled: true }, true), 'off')
})
