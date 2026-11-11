import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkImage, isAnimatedWebp, clampCrop, zoomCrop, cropBox } from './crop.js'

test('checkImage validates type and size', () => {
  assert.equal(checkImage({ type: 'image/gif', size: 1000 }), null)
  assert.match(checkImage({ type: 'image/svg+xml', size: 10 }), /PNG/)
  assert.match(checkImage({ type: 'image/png', size: 9 * 1048576 }), /8 MB/)
})

test('isAnimatedWebp reads the VP8X animation flag', () => {
  const head = flags => new Uint8Array([...'RIFF\0\0\0\0WEBPVP8X'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0, flags]))
  assert.equal(isAnimatedWebp(head(2)), true)
  assert.equal(isAnimatedWebp(head(0)), false)
  assert.equal(isAnimatedWebp(new Uint8Array([1, 2, 3])), false)
})

test('square image at zoom 1 fills the frame exactly and cannot pan', () => {
  assert.deepEqual(cropBox({ x: 0.3, y: -0.2, zoom: 1, ar: 1 }), { w: 100, h: 100, left: 0, top: 0, rot: 0 })
})

test('wide image covers the frame by height and pans only horizontally', () => {
  const c = clampCrop({ x: 9, y: 9, zoom: 1, ar: 2 })
  assert.equal(c.x, 0.5)
  assert.equal(c.y, 0)
  assert.deepEqual(cropBox(c), { w: 200, h: 100, left: 0, top: 0, rot: 0 }) // panned fully right: left edge shows
  assert.deepEqual(cropBox({ ...c, x: 0 }), { w: 200, h: 100, left: -50, top: 0, rot: 0 })
})

test('rotating 90 swaps the covering axis', () => {
  const c = clampCrop({ x: 9, y: 9, zoom: 1, ar: 2, rot: 450 })
  assert.equal(c.rot, 90)
  assert.equal(c.x, 0)
  assert.equal(c.y, 0.5)
  // element stays 200x100 before rotation, centred at (50%, 100%)
  assert.deepEqual(cropBox(c), { w: 200, h: 100, left: -50, top: 50, rot: 90 })
})

test('zoom clamps and keeps the same point centred', () => {
  const c = zoomCrop(clampCrop({ x: 0.2, y: 0, zoom: 2, ar: 1 }), 4)
  assert.equal(c.zoom, 4)
  assert.equal(c.x, 0.4)
  assert.equal(zoomCrop(c, 99).zoom, 5)
  assert.equal(zoomCrop(c, 0.1).x, 0)
})

test('garbage crop data is sanitised', () => {
  assert.deepEqual(clampCrop({ x: 'a', zoom: null, ar: -3 }), { ar: 0.01, zoom: 1, rot: 0, x: 0, y: 0 })
})
