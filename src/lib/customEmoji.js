// Custom server emoji helpers. Stored in content as <:name:id> (animated <a:name:id>).
export const NAME_RX = /^[a-z0-9_]{2,32}$/
export const MAX_EMOJI = 100
export const MAX_BYTES = 512 * 1024
const ONE_RX = /^<(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})>$/i

export const toToken = e => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
export function parseCustom(s) {
  const m = ONE_RX.exec(s)
  return m && { animated: !!m[1], name: m[2].toLowerCase(), id: m[3].toLowerCase() }
}

// "Party Parrot (1).gif" -> "party_parrot_1", made unique against names already taken.
export function emojiName(fileName, taken = new Set()) {
  let base = fileName.replace(/\.\w+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  if (base.length < 2) base = 'emoji'
  let name = base, i = 2
  while (taken.has(name)) { const s = '_' + i++; name = base.slice(0, 32 - s.length) + s }
  return name
}

// The composer shows :name:; on send known names become tokens. byName: Map name -> emoji row.
export function encodeEmoji(text, byName) {
  return text.replace(/(?<![<\w]|<a):([a-z0-9_]{2,32}):(?![0-9a-f-]{36}>)/gi, (all, n) => {
    const e = byName.get(n.toLowerCase())
    return e ? toToken(e) : all
  })
}

// ":par" right before the caret opens the autocomplete; returns "par" or null.
export const acQuery = before => /(?:^|\s):([a-z0-9_]{2,32})$/i.exec(before)?.[1].toLowerCase() ?? null

// Browser only: resize to fit 128px. GIFs are kept as-is to keep the animation (no encoder without a dep).
export async function prepEmoji(file) {
  if (!['image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error(`${file.name}: use PNG, WebP or GIF`)
  let out = file
  if (file.type !== 'image/gif') {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 128 / Math.max(bmp.width, bmp.height))
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)))
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
    out = new File([blob], file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type })
  }
  if (out.size > MAX_BYTES) throw new Error(`${file.name}: over 512 KB`)
  return { file: out, animated: file.type === 'image/gif' }
}
