import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeChitpal, decodeChitpal, sniffType, imageSize, toBase64, fromBase64, chitpalFilename,
  ChitpalError, MAX_FILE_BYTES, MAX_IMAGE_BYTES, CHITPAL_VERSION,
} from './chitpal.js'

const bytes = arr => new Uint8Array(arr)
const str = s => [...s].map(c => c.charCodeAt(0))
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = n => [n & 255, (n >> 8) & 255]
const le24 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255]

const png = (w = 64, h = 48) => bytes([0x89, ...str('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...str('IHDR'), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 1, 2, 3, 4])
const gif = (w = 32, h = 32) => bytes([...str('GIF89a'), ...le16(w), ...le16(h), 0, 0, 0, 0x3b])
const jpeg = (w = 100, h = 80) => bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...str('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
const webpX = (w = 300, h = 200) => bytes([...str('RIFF'), 0, 0, 0, 0, ...str('WEBPVP8X'), 10, 0, 0, 0, 2, 0, 0, 0, ...le24(w - 1), ...le24(h - 1), 0, 0])
const webpL = (w = 50, h = 40) => {
  const v = (w - 1) | ((h - 1) << 14)
  return bytes([...str('RIFF'), 0, 0, 0, 0, ...str('WEBPVP8L'), 10, 0, 0, 0, 0x2f, v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255, 0, 0, 0, 0, 0, 0])
}
const svg = bytes(str('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))

const entry = (b, type) => ({ type, data: toBase64(b), crop: null })
const doc = (over = {}) => ({ format: 'chitpal', version: 1, name: 'Sleepy fox', creator: 'lando', images: { idle: entry(png(), 'image/png') }, ...over })
const decodeErr = (d, re) => assert.throws(() => decodeChitpal(typeof d === 'string' ? d : JSON.stringify(d)), e => e instanceof ChitpalError && re.test(e.message))

test('sniffType recognises the four allowed formats and nothing else', () => {
  assert.equal(sniffType(png()), 'image/png')
  assert.equal(sniffType(gif()), 'image/gif')
  assert.equal(sniffType(jpeg()), 'image/jpeg')
  assert.equal(sniffType(webpX()), 'image/webp')
  assert.equal(sniffType(svg), null)
  assert.equal(sniffType(bytes(str('<html><body>hi'))), null)
  assert.equal(sniffType(bytes([])), null)
})

test('imageSize reads pixel sizes from headers', () => {
  assert.deepEqual(imageSize(png(64, 48)), { w: 64, h: 48 })
  assert.deepEqual(imageSize(gif(320, 240)), { w: 320, h: 240 })
  assert.deepEqual(imageSize(jpeg(100, 80)), { w: 100, h: 80 })
  assert.deepEqual(imageSize(webpX(300, 200)), { w: 300, h: 200 })
  assert.deepEqual(imageSize(webpL(50, 40)), { w: 50, h: 40 })
  assert.equal(imageSize(png().subarray(0, 12)), null)
})

test('base64 round-trips binary, including large buffers', () => {
  const big = new Uint8Array(200000).map((_, i) => (i * 31) & 255)
  assert.deepEqual(fromBase64(toBase64(big)), big)
  assert.throws(() => fromBase64('not base64!'), ChitpalError)
  assert.throws(() => fromBase64('abc'), ChitpalError)
})

test('encode then decode keeps name, creator, slots, bytes and crops', () => {
  const crop = { x: 0.1, y: 0, zoom: 2, rot: 0, ar: 1.5 }
  const text = encodeChitpal({
    name: 'Sleepy fox', creator: 'lando', exportedAt: new Date('2026-11-12T10:00:00Z'),
    images: { idle: { bytes: png(), type: 'image/png' }, talk: { bytes: gif(), type: 'image/gif', crop }, muted: { bytes: jpeg(), type: 'image/jpeg' } },
  })
  const raw = JSON.parse(text)
  assert.equal(raw.format, 'chitpal')
  assert.equal(raw.version, CHITPAL_VERSION)
  const out = decodeChitpal(text)
  assert.equal(out.name, 'Sleepy fox')
  assert.equal(out.creator, 'lando')
  assert.equal(out.exported_at, '2026-11-12T10:00:00.000Z')
  assert.deepEqual(Object.keys(out.images), ['idle', 'talk', 'muted'])
  assert.deepEqual(out.images.idle.bytes, png())
  assert.equal(out.images.talk.type, 'image/gif')
  assert.equal(out.images.talk.crop.zoom, 2)
  assert.equal(out.images.idle.crop, null)
  assert.deepEqual([out.images.muted.w, out.images.muted.h], [100, 80])
  // decoding bytes (what File.arrayBuffer gives) works too
  assert.equal(decodeChitpal(new TextEncoder().encode(text)).name, 'Sleepy fox')
})

test('encode needs an idle image and uses the real image type', () => {
  assert.throws(() => encodeChitpal({ name: 'x', images: { talk: { bytes: png(), type: 'image/png' } } }), ChitpalError)
  const raw = JSON.parse(encodeChitpal({ name: 'x', images: { idle: { bytes: gif(), type: 'image/png' } } }))
  assert.equal(raw.images.idle.type, 'image/gif')
})

test('decode rejects things that are not avatar files', () => {
  decodeErr('', /empty/)
  decodeErr('{nope', /isn't a Chitchat avatar/)
  decodeErr('[]', /isn't a Chitchat avatar/)
  decodeErr({ ...doc(), format: 'other' }, /isn't a Chitchat avatar/)
  decodeErr({ ...doc(), version: undefined }, /no version/)
  decodeErr({ ...doc(), version: 99 }, /newer Chitchat/)
  decodeErr({ ...doc(), name: '   ' }, /no name/)
  decodeErr({ ...doc(), images: [] }, /no images/)
  decodeErr({ ...doc(), images: { talk: entry(png(), 'image/png') } }, /no idle image/)
  decodeErr({ ...doc(), images: { idle: entry(png(), 'image/png'), hat: entry(png(), 'image/png') } }, /doesn't know/)
})

test('decode rejects SVG, scripts and mislabelled or broken images', () => {
  decodeErr(doc({ images: { idle: entry(svg, 'image/svg+xml') } }), /PNG, JPG, GIF or WebP/)
  decodeErr(doc({ images: { idle: entry(svg, 'image/png') } }), /isn't a real image/)
  decodeErr(doc({ images: { idle: entry(bytes(str('<script>x</script>')), 'image/gif') } }), /isn't a real image/)
  decodeErr(doc({ images: { idle: entry(gif(), 'image/png') } }), /really image\/gif/)
  decodeErr(doc({ images: { idle: { type: 'image/png', data: '!!!' } } }), /damaged/)
  decodeErr(doc({ images: { idle: { type: 'image/png' } } }), /too big|damaged/)
  decodeErr(doc({ images: { idle: entry(png().subarray(0, 16), 'image/png') } }), /no size/)
})

test('decode enforces size and dimension limits', () => {
  decodeErr(doc({ images: { idle: entry(png(4096, 100), 'image/png') } }), /limit is 2048/)
  decodeErr(doc({ images: { idle: entry(png(2, 2), 'image/png') } }), /tiny/)
  const huge = new Uint8Array(MAX_IMAGE_BYTES + 10); huge.set(png())
  decodeErr(doc({ images: { idle: entry(huge, 'image/png') } }), /5 MB/)
  assert.throws(() => decodeChitpal('x'.repeat(MAX_FILE_BYTES + 1)), /up to 24 MB/)
})

test('decode cleans names, creators and crops', () => {
  const out = decodeChitpal(JSON.stringify(doc({
    name: '  Fox‮\u0007 ' + 'x'.repeat(60), creator: 7, exported_at: 'yesterday',
    images: { idle: { ...entry(gif(), 'image/gif'), crop: { zoom: 999, x: 'a', rot: 45 } } },
  })))
  assert.equal(out.name.length, 40)
  assert.ok(out.name.startsWith('Fox x'))
  assert.equal(out.creator, null)
  assert.equal(out.exported_at, null)
  assert.equal(out.images.idle.crop.zoom, 5)
  assert.equal(out.images.idle.crop.rot % 90, 0)
})

test('chitpalFilename makes safe names', () => {
  assert.equal(chitpalFilename('Sleepy Fox!'), 'sleepy-fox.chitpal')
  assert.equal(chitpalFilename('../../etc'), 'etc.chitpal')
  assert.equal(chitpalFilename(''), 'avatar.chitpal')
})
