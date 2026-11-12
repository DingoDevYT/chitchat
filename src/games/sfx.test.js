// Table sounds: bots play whole games and every cue each game should make turns up; playSfx runs on a stub AudioContext.
import test from 'node:test'
import assert from 'node:assert/strict'
import { GAMES } from './registry.js'
import { rng } from './rng.js'
import { SFX, playSfx, sfxFor } from './sfx.js'

const WANT = {
  property: ['dice', 'coins', 'gavel', 'win'],
  poker: ['chips', 'deal', 'flip', 'win'],
  snack: ['card', 'deal', 'win'],
  highcard: ['flip', 'win'],
}

for (const [id, want] of Object.entries(WANT)) {
  test(`${id}: whole games make the expected table sounds`, () => {
    const R = GAMES[id], heard = new Set()
    for (const seed of [1, 2]) {
      const players = ['bot:0', 'bot:1', 'bot:2', 'bot:3'], rand = rng(seed + 1)
      let s = R.setup(players, seed), k = 0
      while (!R.over(s) && k++ < 20000) {
        const who = R.turn(s)
        const before = R.view(s, 'watcher')
        s = R.move(s, who, (R.bot && R.bot(R.view(s, who), who, 'normal', rand)) ?? R.timeout(s))
        for (const c of sfxFor(id, before, R.view(s, 'watcher'))) heard.add(c)
      }
    }
    for (const c of want) assert.ok(heard.has(c), `${id} played ${c}`)
  })
}

test('nothing plays on the first view or with no change', () => {
  const v = GAMES.property.view(GAMES.property.setup(['a', 'b'], 1), 'a')
  assert.deepEqual(sfxFor('property', null, v), [])
  assert.deepEqual(sfxFor('property', v, { ...v }), [])
})

test('playSfx schedules every cue on a stub context', () => {
  const node = () => ({ connect: n => n, start() {}, stop() {}, gain: param(), frequency: param(), Q: param() })
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 })
  let made = 0
  const ctx = {
    currentTime: 0, sampleRate: 8000, destination: {},
    createOscillator: () => (made++, node()), createGain: node, createBiquadFilter: node, createBufferSource: () => (made++, node()),
    createBuffer: (_, n, sampleRate) => ({ sampleRate, getChannelData: () => new Float32Array(n) }),
  }
  playSfx(ctx, Object.keys(SFX), 0.5)
  assert.ok(made > Object.keys(SFX).length)
})
