import { useEffect, useRef, useState } from 'react'
import { searchGifs } from './lib/giphy'
import { supabase } from './lib/supabase'
import { createStore, prefs, setPref, toast } from './lib/store'
import { StarIcon } from './icons'

// ── favourite GIFs: one fetch per session, kept in public.gif_favorites (synced across devices) ──
export const gifFavs = createStore(null) // null until loaded; newest first
let favLoad = null
export function loadFavs() {
  return favLoad ||= supabase.from('gif_favorites').select('id, url, preview, w, h').order('created_at', { ascending: false }).limit(500)
    .then(({ data, error }) => { if (error) favLoad = null; else gifFavs.set(data) })
}
export async function toggleFav(g) {
  if (!g.url) return
  await loadFavs()
  const hit = gifFavs.get()?.find(f => f.url === g.url)
  if (hit) {
    gifFavs.set(l => l.filter(f => f !== hit))
    const { error } = await supabase.from('gif_favorites').delete().eq('id', hit.id)
    if (error) { gifFavs.set(l => [hit, ...l]); toast(error.message) }
    return
  }
  const row = { url: g.url, preview: g.preview || null, w: g.w || null, h: g.h || null }
  const tmp = { ...row, id: 'tmp-' + crypto.randomUUID() }
  gifFavs.set(l => [tmp, ...(l || [])])
  const { data, error } = await supabase.from('gif_favorites').insert(row).select('id, url, preview, w, h').single()
  gifFavs.set(l => error ? l.filter(f => f !== tmp) : l.map(f => f === tmp ? data : f))
  if (error) toast(error.message.includes('check constraint') ? "That GIF can't be saved." : error.message)
}

// Star toggle for any GIF (picker cells, GIFs in chat). Sits beside the GIF's own button, never inside it.
export function FavStar({ gif }) {
  const on = gifFavs.use(l => !!l?.some(f => f.url === gif.url))
  useEffect(() => { loadFavs() }, [])
  return (
    <button className={`fav-star${on ? ' on' : ''}`} onClick={e => { e.stopPropagation(); toggleFav(gif) }} aria-pressed={on}
      aria-label={on ? 'Remove from favourite GIFs' : 'Add to favourite GIFs'} title={on ? 'Unfavourite' : 'Favourite'}>
      <StarIcon size={16} fill={on} />
    </button>
  )
}

export default function GifPicker({ onPick: send, onClose, className = '' }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState(null)
  const [err, setErr] = useState(null)
  const root = useRef(null)
  const favs = gifFavs.use()
  const recent = prefs.use(s => s.recentGifs) || []
  const [tab, setTab] = useState(null) // picked once favourites load: Favourites when you have some, else Trending
  useEffect(() => { loadFavs() }, [])
  useEffect(() => { if (tab === null && favs !== null) setTab(favs.length ? 'favs' : 'trending') }, [favs, tab])
  const view = q.trim() ? 'search' : tab
  const onPick = g => {
    const { id, url, preview, w, h, pw, ph, title } = g
    setPref('recentGifs', [{ id, url, preview, w, h, pw, ph, title }, ...recent.filter(r => r.url !== url)].slice(0, 30))
    send({ ...g, title: g.title || 'GIF' })
  }

  useEffect(() => {
    const down = e => { if (!root.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [onClose])

  // Debounced so typing "dancing cat" is one request, not eleven. Favourites and Recent cost no GIPHY calls.
  useEffect(() => {
    if (view !== 'search' && view !== 'trending') return
    let alive = true
    setGifs(null)
    const t = setTimeout(() => {
      setErr(null)
      searchGifs(view === 'search' ? q : '').then(g => alive && setGifs(g), e => alive && setErr(e.message))
    }, view === 'search' ? 450 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [q, view])

  const list = view === 'favs' ? favs : view === 'recent' ? recent : gifs
  const cols = [[], []]
  list?.forEach((g, i) => cols[i % 2].push(g))
  const empty = { favs: <><StarIcon size={15} /> Star a GIF to keep it here.</>, recent: 'GIFs you send show up here.', search: `No GIFs for “${q}”.`, trending: 'No GIFs right now.' }

  return (
    <div ref={root} className={`emoji-picker gif-picker pop ${className}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="ep-top">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search GIPHY" aria-label="Search GIFs"
          onKeyDown={e => { if (e.key === 'Enter' && list?.[0]) { e.preventDefault(); onPick(list[0]) } }} />
      </div>
      {view !== 'search' && (
        <div className="tabs small gif-tabs" role="tablist">
          {[['favs', 'Favourites'], ['recent', 'Recent'], ['trending', 'Trending']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      )}
      <div className="ep-grid">
        {err && (view === 'search' || view === 'trending') ? <p className="muted small">{err}</p>
          : !list ? <p className="muted small">Loading GIFs…</p>
          : !list.length ? <p className="muted small gif-empty">{empty[view]}</p>
          : <div className="gif-cols">{cols.map((col, i) => (
            <div key={i}>{col.map(g => (
              <div key={g.id || g.url} className="gif-cell-wrap">
                <button className="gif-cell" onClick={() => onPick(g)} title={g.title || 'GIF'} style={{ aspectRatio: `${g.pw || g.w || 1} / ${g.ph || g.h || 1}` }}>
                  <img src={g.preview || g.url} alt={g.title || 'GIF'} loading="lazy" />
                </button>
                <FavStar gif={g} />
              </div>
            ))}</div>
          ))}</div>}
      </div>
      <div className="gif-attrib">Powered by GIPHY</div>
    </div>
  )
}
