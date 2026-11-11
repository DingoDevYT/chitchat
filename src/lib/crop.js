// Crop math shared by the cropper, canvas export and CSS framing of animated avatars.
// crop = { x, y, zoom, rot, ar }: image centre offset from the frame centre in frame widths,
// zoom >= 1 (1 = image just covers the frame), rot in 90° steps, ar = image width / height.

export const MAX_BYTES = 8 * 1024 * 1024
export const MAX_ZOOM = 5
export const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif' // for <input accept>

export function checkImage(file) {
  if (!IMAGE_TYPES.split(',').includes(file?.type)) return 'Pick a PNG, JPG, WebP or GIF image.'
  if (file.size > MAX_BYTES) return `That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 8 MB.`
  return null
}

// Animated WebP: RIFF....WEBP + VP8X chunk with the animation flag (0x02) set.
export function isAnimatedWebp(b) {
  const s = (i, n) => String.fromCharCode(...b.slice(i, i + n))
  return b.length >= 21 && s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP' && s(12, 4) === 'VP8X' && (b[20] & 2) !== 0
}

const num = (v, d) => (Number.isFinite(+v) ? +v : d)

// Displayed (rotated) image size in frame widths.
function shown(c) {
  const [w, h] = c.rot % 180 ? [1, c.ar] : [c.ar, 1]
  const k = c.zoom / Math.min(w, h)
  return [w * k, h * k]
}

// Sanitises (crop data comes from other users' rows) and keeps the image covering the frame.
export function clampCrop(crop) {
  const c = { ar: Math.max(0.01, num(crop?.ar, 1)), zoom: Math.min(MAX_ZOOM, Math.max(1, num(crop?.zoom, 1))) }
  c.rot = ((Math.round(num(crop?.rot, 0) / 90) * 90) % 360 + 360) % 360
  const [dw, dh] = shown(c)
  const mx = (dw - 1) / 2, my = (dh - 1) / 2
  c.x = Math.min(mx, Math.max(-mx, num(crop?.x, 0)))
  c.y = Math.min(my, Math.max(-my, num(crop?.y, 0)))
  return c
}

export function zoomCrop(crop, zoom) {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom)), k = z / crop.zoom
  return clampCrop({ ...crop, zoom: z, x: crop.x * k, y: crop.y * k })
}

// The <img> box (before rotation about its centre) as % of the frame.
export function cropBox(crop) {
  const c = clampCrop(crop)
  const [dw, dh] = shown(c)
  const [ew, eh] = c.rot % 180 ? [dh, dw] : [dw, dh]
  return { w: ew * 100, h: eh * 100, left: (0.5 + c.x - ew / 2) * 100, top: (0.5 + c.y - eh / 2) * 100, rot: c.rot }
}
