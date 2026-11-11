import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { toast } from './lib/store'
import { uploadFile } from './lib/upload'
import { moveId } from './lib/reorder'
import { DESC_MAX, MAX_ITEMS, TITLE_MAX, checkFiles, mediaItem } from './lib/gallery'
import Modal from './Modal'
import Icon from './icons/Icon'

const isVideo = t => t?.startsWith('video/')

// Width/height, plus a poster frame for videos (the grid's cover), all read in the browser.
async function measure(file, url) {
  if (!isVideo(file.type)) {
    const bmp = await createImageBitmap(file)
    const out = { w: bmp.width, h: bmp.height }
    bmp.close()
    return out
  }
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  const once = ev => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), 15000)
    v.addEventListener(ev, () => { clearTimeout(t); res() }, { once: true })
    v.addEventListener('error', () => { clearTimeout(t); rej(new Error('decode')) }, { once: true })
  })
  v.src = url
  await once('loadeddata')
  if (!v.videoWidth) throw new Error('no picture')
  v.currentTime = Math.min(1, (v.duration || 0) * 0.1)
  await once('seeked')
  const s = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(v.videoWidth * s)
  c.height = Math.round(v.videoHeight * s)
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.85))
  if (!blob) throw new Error('no poster')
  const poster = new File([blob], file.name.replace(/\.\w+$/, '') + '-poster.webp', { type: blob.type })
  return { w: v.videoWidth, h: v.videoHeight, poster, posterUrl: URL.createObjectURL(poster) }
}

export default function NewPostModal({ gallery, ctx, onClose, onPosted }) {
  const [items, setItems] = useState([]) // { key, file, url, type, w, h, poster, posterUrl, alt, spoiler, loading }
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [progress, setProgress] = useState(null) // 0..1 while posting
  const [drop, setDrop] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  const ctl = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const busy = progress != null

  useEffect(() => () => {
    ctl.current?.abort()
    itemsRef.current.forEach(x => { URL.revokeObjectURL(x.url); if (x.posterUrl) URL.revokeObjectURL(x.posterUrl) })
  }, [])

  function add(list) {
    if (busy) return
    const { ok, errors } = checkFiles([...list], itemsRef.current.length)
    if (errors.length) toast(errors.slice(0, 2).join(' '))
    for (const file of ok) {
      const key = crypto.randomUUID(), url = URL.createObjectURL(file)
      setItems(l => [...l, { key, file, url, type: file.type.split(';')[0], alt: '', spoiler: false, loading: true }])
      measure(file, url)
        .then(m => setItems(l => l.map(x => x.key === key ? { ...x, ...m, loading: false } : x)))
        .catch(() => {
          toast(`Couldn't read ${file.name}.${isVideo(file.type) ? ' MP4 or WebM work best.' : ''}`)
          URL.revokeObjectURL(url)
          setItems(l => l.filter(x => x.key !== key))
        })
    }
  }
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => {
    const onPaste = e => { if (e.clipboardData?.files?.length) { e.preventDefault(); addRef.current(e.clipboardData.files) } }
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  }, [])

  const set = (key, patch) => setItems(l => l.map(x => x.key === key ? { ...x, ...patch } : x))
  const remove = key => setItems(l => {
    const x = l.find(y => y.key === key)
    if (x) { URL.revokeObjectURL(x.url); if (x.posterUrl) URL.revokeObjectURL(x.posterUrl) }
    return l.filter(y => y.key !== key)
  })
  // to = final index
  const move = (key, to) => setItems(l => {
    const keys = l.map(x => x.key), from = keys.indexOf(key)
    return moveId(keys, key, to > from ? to + 1 : to).map(k => l.find(x => x.key === k))
  })

  async function post() {
    if (!items.length) return toast('Add at least one picture or video.')
    if (!title.trim()) return toast('Give your post a title.')
    if (items.some(x => x.loading)) return toast('Still reading your files, one moment.')
    const c = ctl.current = new AbortController()
    const files = items.flatMap(x => x.poster ? [x.file, x.poster] : [x.file])
    const size = files.map(f => f.size || 1), done = size.map(() => 0), all = size.reduce((a, b) => a + b, 0)
    const uploaded = []
    setProgress(0)
    try {
      const up = await Promise.all(files.map((f, k) => uploadFile(f, ctx.userId, {
        signal: c.signal,
        onProgress: (l, t) => { done[k] = (size[k] * l) / t; setProgress(done.reduce((a, b) => a + b, 0) / all) },
      }).then(r => { uploaded.push(r.url); return r })))
      let k = 0
      const media = items.map(x => {
        const f = up[k++], p = x.poster ? up[k++] : null
        // images come back compressed with their stored size; videos keep the size measured here
        return mediaItem({ url: f.url, type: (f.type || x.type).split(';')[0], w: f.w || x.w, h: f.h || x.h, poster: p?.url, alt: x.alt, spoiler: x.spoiler })
      })
      const { data, error } = await supabase.rpc('create_gallery_post', { gallery: gallery.id, title: title.trim(), media, description: desc.trim() || null })
      if (error) throw error
      onPosted(data)
      toast('Posted!')
      onClose()
    } catch (e) {
      // nothing half-posted stays behind in storage
      const paths = uploaded.map(u => u.split('/storage/v1/object/public/media/')[1]).filter(Boolean)
      if (paths.length) supabase.storage.from('media').remove(paths).then()
      setProgress(null)
      if (e.name !== 'AbortError') toast(e.message || 'Posting failed.')
    }
  }

  const picker = (
    <input type="file" accept="image/*,video/*" multiple hidden disabled={busy} onChange={e => { add(e.target.files); e.target.value = '' }} />
  )
  return (
    <Modal title="New post" onClose={onClose} wide>
      <div className="col g-compose"
        onDragOver={e => { if (!dragKey && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrop(true) } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(false) }}
        onDrop={e => { if (dragKey) return; e.preventDefault(); setDrop(false); add(e.dataTransfer.files) }}>
        {items.length === 0
          ? <label className={`g-drop${drop ? ' on' : ''}`}>
            <Icon name="image" size={34} />
            <b>Drop pictures or videos here</b>
            <span className="muted small">or click to pick them. Pasting works too. Up to {MAX_ITEMS}, 25 MB each.</span>
            {picker}
          </label>
          : <div className={`g-picks${drop ? ' on' : ''}`} role="list" aria-label="Pictures and videos, the first one is the cover">
            {items.map((x, idx) => (
              <div key={x.key} role="listitem" className={`g-pick${idx === 0 ? ' cover' : ''}${dragKey === x.key ? ' dragging' : ''}`}
                draggable={!busy} onDragStart={e => { setDragKey(x.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.key) }}
                onDragEnd={() => setDragKey(null)}
                onDragOver={e => { if (dragKey) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                onDrop={e => { if (!dragKey) return; e.preventDefault(); e.stopPropagation(); move(dragKey, idx); setDragKey(null) }}>
                <div className={`g-pick-media${x.spoiler ? ' spoiler' : ''}`}>
                  {x.loading ? <span className="muted small">Reading…</span>
                    : <img src={x.posterUrl || x.url} alt="" draggable="false" />}
                  {idx === 0 && <span className="g-cover-tag">Cover</span>}
                  {isVideo(x.type) && <span className="g-badge"><Icon name="play" size={12} /></span>}
                </div>
                <div className="g-pick-tools">
                  {idx > 0 && <button type="button" className="icon-btn" disabled={busy} onClick={() => move(x.key, idx - 1)}
                    title={idx === 1 ? 'Make this the cover' : 'Move earlier'} aria-label={`Move ${x.file.name} earlier`}><Icon name="chevron-left" size={16} /></button>}
                  <button type="button" className={`icon-btn${x.spoiler ? ' on' : ''}`} disabled={busy} onClick={() => set(x.key, { spoiler: !x.spoiler })}
                    aria-pressed={x.spoiler} title="Mark as spoiler" aria-label={`Mark ${x.file.name} as spoiler`}><Icon name="eye-off" size={16} /></button>
                  <button type="button" className="icon-btn" disabled={busy} onClick={() => remove(x.key)} title="Remove" aria-label={`Remove ${x.file.name}`}><Icon name="close" size={16} /></button>
                </div>
                <input className="g-alt-input" value={x.alt} maxLength={500} disabled={busy} placeholder="Alt text" aria-label={`Alt text for ${x.file.name}`}
                  title="Describe it for people who can't see it" onChange={e => set(x.key, { alt: e.target.value })} />
              </div>
            ))}
            {items.length < MAX_ITEMS && <label className="g-pick g-pick-add" title="Add more"><Icon name="plus" size={22} /><span className="small">Add</span>{picker}</label>}
          </div>}
        {items.length > 1 && <p className="muted small g-hint">Drag to reorder. The first one is the cover in the gallery.</p>}

        <label><span className="srv-label">Title <span className="srv-count">{title.length}/{TITLE_MAX}</span></span>
          <input value={title} maxLength={TITLE_MAX} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Name your piece" required /></label>
        <label><span className="srv-label"><span>Description <span className="muted">(optional, markdown works)</span></span><span className="srv-count">{desc.length}/{DESC_MAX}</span></span>
          <textarea rows={3} value={desc} maxLength={DESC_MAX} disabled={busy} onChange={e => setDesc(e.target.value)} placeholder="The story behind it, tools, a question for everyone…" /></label>

        {busy && <div className="upload-bar">
          <span className="muted small" role="status">Uploading {items.length === 1 ? '1 file' : `${items.length} files`}… {Math.round(progress * 100)}%</span>
          <span className="upload-track" role="progressbar" aria-label="Upload progress" aria-valuenow={Math.round(progress * 100)}><i style={{ width: progress * 100 + '%' }} /></span>
        </div>}

        <div className="re-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={post} disabled={busy || !items.length || !title.trim()}>{busy ? 'Posting…' : 'Post'}</button>
        </div>
      </div>
    </Modal>
  )
}
