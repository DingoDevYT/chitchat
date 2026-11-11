import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase'
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

// supabase-js storage uploads can't report progress, so this is the same REST call over XHR.
// onProgress(loaded, total) while sending; aborting `signal` rejects with an AbortError.
async function put(path, blob, { onProgress, signal } = {}) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/media/${path}`)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', SUPABASE_KEY)
    xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream')
    xhr.setRequestHeader('cache-control', 'max-age=31536000')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded, e.total)
    xhr.onload = () => {
      if (xhr.status < 300) return resolve()
      let msg = `Upload failed (${xhr.status}).`
      try { msg = JSON.parse(xhr.responseText).message || msg } catch {}
      reject(new Error(msg))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

export async function uploadFile(file, userId, opts) {
  const { blob, w, h } = await compress(file)
  let name = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'
  if (blob.type === 'image/webp' && file.type !== 'image/webp') name = name.replace(/\.\w+$/, '') + '.webp'
  const path = `${userId}/${crypto.randomUUID()}/${name}`
  await put(path, blob, opts)
  const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
  return { url, name, type: blob.type, size: blob.size, w, h }
}
