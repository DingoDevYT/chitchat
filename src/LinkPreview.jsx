import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { toast } from './lib/store'
import { previewLinks } from './lib/linkpreview'
import './styles/blocks-links.css'

const TTL = 7 * 24 * 3600 * 1000
const cache = new Map() // url -> Promise<preview|null>, for this session
const ready = new Map() // url -> preview|null once loaded, so coming back to a room draws cards straight away (no flash, no jump)

// Shared cache table first (cheap, no fetch), then the link-preview edge function for misses.
function getPreview(url) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const { data } = await supabase.from('link_previews').select('data, fetched_at').eq('url', url).maybeSingle()
    if (data && Date.now() - Date.parse(data.fetched_at) < TTL) return data.data
    const { data: fresh, error } = await supabase.functions.invoke('link-preview', { body: { url } })
    return error ? null : fresh
  })().catch(() => null).then(d => (ready.set(url, d), d)))
  return cache.get(url)
}

const httpUrl = s => (typeof s === 'string' && /^https?:\/\//i.test(s) ? s : null)

function Card({ url, onRemove }) {
  const [p, setP] = useState(() => ready.get(url) || null)
  const [imgOk, setImgOk] = useState(true)
  useEffect(() => {
    let on = true
    getPreview(url).then(d => on && setP(d))
    return () => { on = false }
  }, [url])
  if (!p || (!p.title && !p.description)) return null
  const color = /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : undefined
  const img = imgOk && httpUrl(p.image), fav = httpUrl(p.favicon)
  return (
    <div className="link-card" style={color && { borderLeftColor: color }}>
      <div className="link-card-text">
        <div className="link-card-site muted small">
          {fav && <img src={fav} alt="" width="14" height="14" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />}
          {p.site_name}
        </div>
        {p.title && <a className="link-card-title" href={url} target="_blank" rel="noopener noreferrer nofollow">{p.title}</a>}
        {p.description && <div className="link-card-desc small">{p.description}</div>}
      </div>
      {img && <img className="link-card-thumb" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />}
      {onRemove && <button className="icon-btn link-card-x" onClick={onRemove} title="Remove embeds" aria-label="Remove embeds">×</button>}
    </div>
  )
}

// Up to 3 cards under a message; fetched only once scrolled near view. The author can hide them for everyone.
export default function LinkPreviews({ m, mine }) {
  const urls = useMemo(() => previewLinks(m.content), [m.content])
  const ref = useRef(null)
  const [seen, setSeen] = useState(() => urls.some(u => ready.has(u)))
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!urls.length || seen || !ref.current) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [urls.length, seen])
  if (!urls.length || hidden || m.pending) return null

  async function remove() {
    setHidden(true)
    const { error } = await supabase.from('messages').update({ suppress_embeds: true }).eq('id', m.id)
    if (error) { setHidden(false); toast(error.message) }
  }
  return (
    <div ref={ref} className="link-cards">
      {seen && urls.map(u => <Card key={u} url={u} onRemove={mine ? remove : null} />)}
    </div>
  )
}
