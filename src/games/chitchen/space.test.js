import test from 'node:test'
import assert from 'node:assert/strict'
import { step, overlap, hear, makeTrack, shouldSend, canSeeAt, BEHIND_MS } from './space.js'

test('walking: free in a room, slides along walls, goes through doors, can walk out when a door jams shut on you', () => {
  let p = [6, 6]
  for (let i = 0; i < 20; i++) p = step(p, 1, 0, 0.05)
  assert.ok(p[0] > 8.5 && p[1] === 6)
  // straight down from the pantry at x=3 hits the y=11 wall and stops short of it
  p = [3, 9]
  for (let i = 0; i < 40; i++) p = step(p, 0, 1, 0.05)
  assert.ok(p[1] < 11 - 0.3, `stopped at ${p[1]}`)
  // …but through the door at x 5–7 it carries on into the shop
  p = [6, 9]
  for (let i = 0; i < 40; i++) p = step(p, 0, 1, 0.05)
  assert.ok(p[1] > 12, `went through to ${p[1]}`)
  // diagonal into a wall slides along it
  p = [3, 10]
  const q = step(p, 1, 1, 0.1)
  assert.ok(q[0] > 3 && q[1] < 11 - 0.3)
  // a jammed pantry door: blocked from outside, but someone standing in the doorway can step out
  assert.ok(overlap(6, 11, true) > 0)
  const out = step([6, 11], 0, 1, 0.1, true)
  assert.ok(out[1] > 11)
  // the map edge
  p = [0.5, 0.5]
  for (let i = 0; i < 10; i++) p = step(p, -1, -1, 0.1)
  assert.ok(p[0] >= 0.35 && p[1] >= 0.35)
})

test('proximity voice: distance fades, walls muffle, flour storm halves range, nappers hear only nappers', () => {
  const v = { phase: 'play', status: { a: 'awake', b: 'awake', c: 'nap', d: 'nap', e: 'home' }, mischief: null }
  const pos = { a: [5, 5], b: [6, 5], c: [6, 6], d: [7, 6], e: [5, 6] }
  assert.equal(hear(v, 'a', 'b', pos).gain, 1)
  assert.equal(hear(v, 'a', 'c', pos).gain, 0, 'awake people never hear nappers')
  assert.equal(hear(v, 'c', 'a', pos).gain, 0, 'nappers hear only nappers')
  assert.equal(hear(v, 'c', 'd', pos).gain, 1)
  assert.equal(hear(v, 'a', 'e', pos).gain, 0, 'nobody in the game hears someone gone home')
  assert.equal(hear(v, 'e', 'a', pos).gain, 1, 'people gone home hear everything')
  assert.equal(hear(v, 'a', 'stranger', pos).gain, 0, 'the crowd is hushed during the shift')
  assert.equal(hear({ ...v, phase: 'talk' }, 'a', 'stranger', pos).gain, 1)
  const far = { ...pos, b: [11, 5] } // 6 away, same room
  const g = hear(v, 'a', 'b', far).gain
  assert.ok(g > 0 && g < 1)
  assert.equal(hear({ ...v, mischief: { kind: 'flour' } }, 'a', 'b', far).gain, 0, 'flour storm: half the range')
  assert.ok(hear({ ...v, mischief: { kind: 'flour' } }, 'a', 'b', pos).lp <= 800, 'and muffled')
  const walled = { ...pos, b: [5, 13] } // pantry → shop through the wall
  const w = hear(v, 'a', 'b', walled)
  assert.ok(w.gain < hear(v, 'a', 'b', { ...pos, b: [6.5, 12.5] }).gain || w.gain === 0)
  const near = hear(v, 'a', 'b', { ...pos, a: [10, 9], b: [10, 12] }) // 3 apart through the wall
  assert.ok(near.gain > 0 && near.gain < 0.5 && near.lp < 2000)
  // the Tea Break: everyone at the table hears everyone, nobody hears the nappers upstairs
  assert.equal(hear({ ...v, phase: 'talk' }, 'a', 'b', { a: [0, 0], b: [30, 20] }).gain, 1)
  assert.equal(hear({ ...v, phase: 'vote' }, 'a', 'c', pos).gain, 0)
  // someone watching (not playing) hears the game unchanged
  assert.equal(hear(v, 'watcher', 'a', pos).gain, 1)
})

test('sight: lamplight radius, walls block, candles out shrinks it', () => {
  assert.ok(canSeeAt([5, 5], [10, 5], false, false))
  assert.ok(!canSeeAt([5, 5], [10, 5], true, false))
  assert.ok(!canSeeAt([3, 9], [3, 13], false, false))
})

test('walking together: interpolation runs ~120 ms behind, the send throttle is ~10 Hz plus a heartbeat', () => {
  const tr = makeTrack()
  tr.push({ t: 1000, x: 0, y: 0, f: 0 })
  tr.push({ t: 1100, x: 1, y: 0, f: 0 })
  tr.push({ t: 1100, x: 9, y: 9, f: 0 }) // out of order / duplicate times are dropped
  const mid = tr.at(1050 + BEHIND_MS)
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9 && mid.moving)
  assert.equal(tr.at(5000).x, 1)
  assert.equal(tr.at(5000).moving, false)
  assert.equal(shouldSend(null, { x: 0, y: 0, f: 0 }, 0), true)
  const prev = { x: 0, y: 0, f: 0, t: 0 }
  assert.equal(shouldSend(prev, { x: 0.5, y: 0, f: 0 }, 50), false)
  assert.equal(shouldSend(prev, { x: 0.5, y: 0, f: 0 }, 100), true)
  assert.equal(shouldSend(prev, { x: 0, y: 0, f: 0 }, 500), false)
  assert.equal(shouldSend(prev, { x: 0, y: 0, f: 0 }, 1000), true)
})
