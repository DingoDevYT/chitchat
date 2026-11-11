import { supabase } from './supabase'
import { isAnimatedWebp } from './crop'

// Shrinks big images to webp before upload, keeping the free 1GB storage tier going a long way.
async function compress(file) {
  if (!file.type.startsWith('image/')) return { blob: file }
  try {
    const bmp = await createImageBitmap(file)
    const dims = { w: bmp.width, h: bmp.height }
    if (file.type === 'image/gif' || (file.type === 'image/webp' && isAnimatedWebp(new Uint8Array(await file.slice(0, 32).arrayBuffer()))))
      return { blob: file, ...dims } // keep animation
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })
    return webp.type === 'image/webp' && webp.size < file.size ? { blob: webp, w, h } : { blob: file, ...dims }
  } catch {
    return { blob: file }
  }
}

export async function uploadFile(file, userId) {
  const { blob, w, h } = await compress(file)
  let name = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'
  if (blob.type === 'image/webp' && file.type !== 'image/webp') name = name.replace(/\.\w+$/, '') + '.webp'
  const path = `${userId}/${crypto.randomUUID()}/${name}`
  const { error } = await supabase.storage.from('media')
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream', cacheControl: '31536000' })
  if (error) throw error
  const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
  return { url, name, type: blob.type, size: blob.size, w, h }
}
