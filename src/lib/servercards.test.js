import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PALETTE, cardAccent, nameAccent, motdParts, serverChips, railCompact } from './servercards.js'
import { BANNER_FA, clampCrop, cropBox } from './crop.js'

test('default accent is a stable palette pick from the name', () => {
  assert.equal(nameAccent('pip\'s place'), nameAccent('pip\'s place'))
  assert.ok(PALETTE.includes(nameAccent('anything')))
  assert.ok(PALETTE.includes(nameAccent('')))
  assert.equal(cardAccent({ name: 'x', accent: '#123abc' }), '#123abc')
  assert.equal(cardAccent({ name: 'x', accent: 'red; background:url(x)' }), nameAccent('x')) // only hex is trusted
})

test('motdParts keeps custom emoji tokens whole', () => {
  const id = '0123abcd-0000-4000-8000-0123456789ab'
  assert.deepEqual(motdParts(`hi <:wave:${id}> all 🎉`), ['hi ', `<:wave:${id}>`, ' all 🎉'])
  assert.deepEqual(motdParts(null), [])
})

test('chips count online members and the busiest stadium', () => {
  const presence = {
    a: { status: 'online', voice: 'v1' }, b: { status: 'idle', voice: 'v2' }, c: { status: 'invisible', voice: 'v2' },
    d: { status: 'dnd' }, z: { status: 'online', voice: 'other-server' },
  }
  const r = serverChips(['a', 'b', 'c', 'd', 'e'], presence, [{ id: 'v1', name: 'Hangout' }, { id: 'v2', name: 'Games' }])
  assert.equal(r.online, 3) // invisible c and absent e are offline
  assert.equal(r.stadium, '🏟️ 2 in Games')
  assert.deepEqual(serverChips(['e'], {}, [{ id: 'v1', name: 'Hangout' }]), { online: 0, stadium: null })
})

test('compact rail: explicit choice wins, else follows the window width', () => {
  assert.equal(railCompact(undefined, true), true)
  assert.equal(railCompact(undefined, false), false)
  assert.equal(railCompact(false, true), false)
  assert.equal(railCompact(true, false), true)
})

test('banner crop: a 2.5:1 frame covers by width for a square image', () => {
  const c = clampCrop({ ar: 1, fa: BANNER_FA, y: 9 })
  assert.equal(c.fa, 2.5)
  assert.equal(c.x, 0)
  assert.equal(c.y, 0.3) // image is 1 frame width tall, frame is 0.4: pans 0.3 up or down
  assert.deepEqual(cropBox({ ...c, y: 0 }), { w: 100, h: 250, left: 0, top: -75, rot: 0 })
  assert.deepEqual(cropBox(c), { w: 100, h: 250, left: 0, top: 0, rot: 0 }) // panned fully down: top edge shows
})

test('banner crop: an exactly 2.5:1 image fills the frame at zoom 1', () => {
  assert.deepEqual(cropBox({ ar: 2.5, fa: 2.5, x: 1, y: 1 }), { w: 100, h: 100, left: 0, top: 0, rot: 0 })
})
