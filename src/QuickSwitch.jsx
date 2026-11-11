import { useEffect, useMemo, useState } from 'react'
import { profiles } from './lib/store'
import { dmTitle } from './Sidebar'
import { RoomIcon } from './Rooms'

// Ctrl/Cmd+K: fuzzy-ish jump to any room, stadium or DM.
export default function QuickSwitch({ servers, channels, go }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const pmap = profiles.use()

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); setSel(0) }
      if (e.key === 'Escape') setOpen(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(() => {
    const sname = Object.fromEntries(servers.map(s => [s.id, s.name]))
    const all = channels.map(c => ({
      c, label: c.kind === 'dm' ? dmTitle(c, null, pmap) : c.name,
      sub: c.kind === 'dm' ? 'Direct message' : sname[c.server_id],
    }))
    const t = q.toLowerCase()
    return all.filter(i => (i.label + ' ' + i.sub).toLowerCase().includes(t)).slice(0, 8)
  }, [channels, servers, q, pmap])

  if (!open) return null
  const pick = i => { if (!i) return; go(i.c.server_id || null, i.c.id); setOpen(false) }
  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="quick pop" role="dialog" aria-label="Jump to">
        <input autoFocus value={q} placeholder="Where to?" onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
            if (e.key === 'Enter') pick(items[sel])
          }} />
        {items.map((i, n) => (
          <button key={i.c.id} className={`quick-item${n === sel ? ' on' : ''}`} onMouseEnter={() => setSel(n)} onClick={() => pick(i)}>
            {i.c.kind === 'dm' ? <span className="ch-icon">@</span> : <RoomIcon c={i.c} />} {i.label} <span className="muted small">{i.sub}</span>
          </button>
        ))}
        {items.length === 0 && <p className="muted small pad">Nothing matches.</p>}
      </div>
    </div>
  )
}
