// .chitpal: one avatar setup in a single shareable file. Plain UTF-8 JSON, images inline as base64:
//   { "format": "chitpal", "version": 1, "name": "Sleepy fox", "creator": "lando", "exported_at": "2026-11-12T...Z",
//     "images": { "idle": { "type": "image/png", "data": "<base64>", "crop": null }, "talk": {...}, "typing": {...} } }
// Image slots: idle (required), talk, then the expression and blink keys from expressions.js.
// crop is the animated-image framing from crop.js ({x, y, zoom, rot, ar}) or null (static images come pre-cropped).
// Decoding is strict and DOM-free (unit tested in node): size caps, known keys only, real PNG/JPEG/GIF/WebP bytes
// (magic numbers must match the declared type, so SVG/HTML can't ride in), and pixel sizes read from the headers.
// The browser side (avatarSetups.js) then re-encodes still images through a canvas before uploading.
import { EXPRESSIONS, BLINKS } from './expressions.js'
import { clampCrop } from './crop.js'

export const CHITPAL_FORMAT = 'chitpal'
export const CHITPAL_VERSION = 1
export const CHITPAL_EXT = '.chitpal'
export const MAX_FILE_BYTES = 24 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_SIDE = 2048
export const MIN_SIDE = 8
export const SLOTS = ['idle', 'talk', ...EXPRESSIONS.map(e => e[0]), ...BLINKS.map(b => b[0])]
export const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export class ChitpalError extends Error {}
const fail = msg => { throw new ChitpalError(msg) }

// ── base64 (chunked so big images don't blow the call stack) ──
export function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromBase64(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(str) || str.length % 4) fail('An image in this file is damaged.')
  const s = atob(str), out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

// ── image sniffing ──
const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n))
export function sniffType(b) {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'image/gif'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

// Pixel size from the file header, or null if it can't be found.
export function imageSize(b, type = sniffType(b)) {
  const u16be = i => (b[i] << 8) | b[i + 1], u16le = i => b[i] | (b[i + 1] << 8)
  const u32be = i => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
  if (type === 'image/png') return b.length >= 24 && ascii(b, 12, 4) === 'IHDR' ? { w: u32be(16), h: u32be(20) } : null
  if (type === 'image/gif') return b.length >= 10 ? { w: u16le(6), h: u16le(8) } : null
  if (type === 'image/webp') {
    if (b.length < 30) return null
    const chunk = ascii(b, 12, 4)
    if (chunk === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    if (chunk === 'VP8 ') return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff }
    if (chunk === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) }
    return null
  }
  if (type === 'image/jpeg') {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const m = b[i + 1]
      if (m === 0xff) { i++; continue } // fill byte
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue } // no length
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16be(i + 7), h: u16be(i + 5) }
      i += 2 + u16be(i + 2)
    }
  }
  return null
}

const clean = (s, max) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, max) : ''

// Throws ChitpalError if one image entry isn't acceptable; returns { bytes, type, crop, w, h }.
export function checkImageEntry(slot, e) {
  const label = slot === 'idle' ? 'The idle image' : `The ${slot.replace('_', ' ')} image`
  if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`${label} is missing its data.`)
  if (!TYPES.includes(e.type)) fail(`${label} isn't a PNG, JPG, GIF or WebP.`)
  if (typeof e.data !== 'string' || e.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) fail(`${label} is too big (5 MB per image).`)
  const bytes = fromBase64(e.data)
  if (bytes.length > MAX_IMAGE_BYTES) fail(`${label} is too big (5 MB per image).`)
  const real = sniffType(bytes)
  if (!real) fail(`${label} isn't a real image.`)
  if (real !== e.type) fail(`${label} says it is ${e.type} but it's really ${real}.`)
  const size = imageSize(bytes, real)
  if (!size || !size.w || !size.h) fail(`${label} is damaged (no size found).`)
  if (size.w > MAX_SIDE || size.h > MAX_SIDE) fail(`${label} is ${size.w}×${size.h}. The limit is ${MAX_SIDE}×${MAX_SIDE}.`)
  if (size.w < MIN_SIDE || size.h < MIN_SIDE) fail(`${label} is too tiny (${size.w}×${size.h}).`)
  const crop = e.crop && typeof e.crop === 'object' && !Array.isArray(e.crop) ? clampCrop(e.crop) : null
  return { bytes, type: real, crop, w: size.w, h: size.h }
}

// text: the file's contents (string, or bytes). Returns { name, creator, exported_at, images: { slot: entry } }.
export function decodeChitpal(input) {
  const size = typeof input === 'string' ? input.length : input?.length
  if (!size) fail('That file is empty.')
  if (size > MAX_FILE_BYTES) fail(`That file is ${(size / 1048576).toFixed(1)} MB. Avatar files can be up to ${MAX_FILE_BYTES / 1048576} MB.`)
  const text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: false }).decode(input)
  let doc
  try { doc = JSON.parse(text) } catch { fail("That isn't a Chitchat avatar file.") }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.format !== CHITPAL_FORMAT) fail("That isn't a Chitchat avatar file.")
  if (!Number.isInteger(doc.version) || doc.version < 1) fail('This avatar file has no version, so it can\'t be read.')
  if (doc.version > CHITPAL_VERSION) fail('This avatar was made with a newer Chitchat. Refresh the page and try again.')
  const name = clean(doc.name, 40)
  if (!name) fail('This avatar file has no name.')
  const imgs = doc.images
  if (!imgs || typeof imgs !== 'object' || Array.isArray(imgs)) fail('This avatar file has no images.')
  const keys = Object.keys(imgs)
  const unknown = keys.find(k => !SLOTS.includes(k))
  if (unknown) fail(`This avatar file has an image slot Chitchat doesn't know ("${clean(unknown, 20)}").`)
  if (!imgs.idle) fail('This avatar file has no idle image.')
  const images = {}
  for (const k of SLOTS) if (imgs[k] != null) images[k] = checkImageEntry(k, imgs[k])
  const at = typeof doc.exported_at === 'string' && !isNaN(Date.parse(doc.exported_at)) ? new Date(doc.exported_at).toISOString() : null
  return { name, creator: clean(doc.creator, 64) || null, exported_at: at, images }
}

// images: { slot: { bytes: Uint8Array, type, crop } }. Returns the file text.
export function encodeChitpal({ name, creator, images, exportedAt = new Date() }) {
  const out = {}
  for (const k of SLOTS) {
    const e = images?.[k]
    if (!e) continue
    const type = sniffType(e.bytes) || e.type
    out[k] = { type, data: toBase64(e.bytes), crop: e.crop ? clampCrop(e.crop) : null }
  }
  if (!out.idle) fail('An avatar needs an idle image to export.')
  return JSON.stringify({
    format: CHITPAL_FORMAT, version: CHITPAL_VERSION, name: clean(name, 40) || 'Avatar', creator: clean(creator, 64) || null,
    exported_at: exportedAt.toISOString(), images: out,
  })
}

// "Sleepy Fox!" -> "sleepy-fox.chitpal"
export const chitpalFilename = name => (clean(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'avatar') + CHITPAL_EXT
