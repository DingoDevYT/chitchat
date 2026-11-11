import { useEffect, useRef, useState } from 'react'
import { searchGifs } from './lib/giphy'

export default function GifPicker({ onPick, onClose, className = '' }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState(null)
  const [err, setErr] = useState(null)
  const root = useRef(null)

  useEffect(() => {
    const down = e => { if (!root.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [onClose])

  // Debounced so typing "dancing cat" is one request, not eleven.
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      setErr(null)
      searchGifs(q).then(g => alive && setGifs(g), e => alive && setErr(e.message))
    }, q ? 450 : 0)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  const cols = [[], []]
  gifs?.forEach((g, i) => cols[i % 2].push(g))

  return (
    <div ref={root} className={`emoji-picker gif-picker pop ${className}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="ep-top">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search GIPHY" aria-label="Search GIFs"
          onKeyDown={e => { if (e.key === 'Enter' && gifs?.[0]) { e.preventDefault(); onPick(gifs[0]) } }} />
      </div>
      <div className="ep-grid">
        {err ? <p className="muted small">{err}</p>
          : !gifs ? <p className="muted small">Loading GIFs…</p>
          : !gifs.length ? <p className="muted small">No GIFs for “{q}”.</p>
          : <div className="gif-cols">{cols.map((col, i) => (
            <div key={i}>{col.map(g => (
              <button key={g.id} className="gif-cell" onClick={() => onPick(g)} title={g.title} style={{ aspectRatio: `${g.pw} / ${g.ph}` }}>
                <img src={g.preview} alt={g.title} loading="lazy" />
              </button>
            ))}</div>
          ))}</div>}
      </div>
      <div className="gif-attrib">Powered by GIPHY</div>
    </div>
  )
}
