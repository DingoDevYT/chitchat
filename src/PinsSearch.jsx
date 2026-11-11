import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, toast } from './lib/store'
import { hasFilters, highlightParts, parseSearch } from './lib/search'
import Avatar, { Name } from './Avatar'
import { emojify } from './Markdown'
import './styles/pins-search.css'

const SEARCH_PAGE = 20
const fmt = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Hit({ m, terms, channelName, onJump, children }) {
  const text = m.content.length > 300 ? m.content.slice(0, 300) + '…' : m.content
  return (
    <div className="ps-hit pop">
      <button className="ps-hit-main" onClick={() => onJump(m)} title="Jump to message">
        <Avatar id={m.author_id} size={28} />
        <span className="ps-hit-body">
          <span className="ps-hit-meta"><Name id={m.author_id} />{channelName && <span className="muted small">{channelName}</span>}<time className="muted small">{fmt(m.created_at)}</time></span>
          <span className="ps-hit-text">
            {text ? highlightParts(text, terms).map((p, i) => p.hit ? <mark key={i}>{p.t}</mark> : <span key={i}>{emojify(p.t)}</span>) : null}
            {m.attachments?.length > 0 && <span className="muted small"> 📎 {m.attachments.length}</span>}
          </span>
        </span>
      </button>
      {children}
    </div>
  )
}

export function PinsPanel({ channel, canPin, pinKey, onJump, onTogglePin, onClose }) {
  const [pins, setPins] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('messages').select('*').eq('channel_id', channel.id).not('pinned_at', 'is', null)
      .order('pinned_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) return toast('Could not load pins.')
        ensureProfiles(data.map(m => m.author_id))
        setPins(data)
      })
    return () => { alive = false }
  }, [channel.id, pinKey])

  return (
    <aside className="ps-panel pop" aria-label="Pinned messages">
      <div className="ps-head"><b>📌 Pinned messages</b><span className="spacer" /><button className="icon-btn" onClick={onClose} aria-label="Close pins">✕</button></div>
      <div className="ps-list">
        {!pins && <div className="skeleton" />}
        {pins?.length === 0 && <p className="muted small ps-empty">Nothing pinned yet. {canPin ? 'Hover a message and hit 📌 to keep it here.' : ''}</p>}
        {pins?.map(m => (
          <Hit key={m.id} m={m} onJump={onJump}>
            {canPin && <button className="icon-btn ps-unpin" onClick={() => { setPins(l => l.filter(x => x.id !== m.id)); onTogglePin(m) }} title="Unpin" aria-label="Unpin">✕</button>}
          </Hit>
        ))}
      </div>
    </aside>
  )
}

export function SearchPanel({ ctx, channel, onJump, onClose }) {
  const [input, setInput] = useState('')
  const [scope, setScope] = useState('channel') // 'channel' | 'server' | 'dms'
  const [results, setResults] = useState(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const runSeq = useRef(0)
  const q = parseSearch(input)
  const ready = hasFilters(q)
  useEffect(() => { ref.current?.focus() }, [])

  async function run(append) {
    if (!ready) return
    const seq = ++runSeq.current
    setBusy(true)
    // in:"Room name" only makes sense across the current server
    const sc = q.in && channel.server_id ? 'server' : scope
    const { data, error } = await supabase.rpc('search_messages', {
      terms: q.text, from_user: q.from, has: q.has, before_ts: q.before, after_ts: q.after,
      in_channel: sc === 'server' ? q.in : null,
      scope_channel: sc === 'channel' ? channel.id : null,
      scope_server: sc === 'server' ? channel.server_id : null,
      dms_only: sc === 'dms',
      before_id: append ? results.at(-1)?.id : null, lim: SEARCH_PAGE,
    })
    if (seq !== runSeq.current) return // a newer search (e.g. scope switch) superseded this one
    setBusy(false)
    if (error) return toast('Search failed: ' + error.message)
    ensureProfiles(data.map(m => m.author_id))
    setResults(r => append ? [...r, ...data] : data)
    setMore(data.length === SEARCH_PAGE)
  }
  // Re-run when the scope changes.
  useEffect(() => { if (results) run(false) }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const chName = id => {
    if (id === channel.id && scope === 'channel') return null
    const c = ctx.channels?.find(x => x.id === id)
    return c ? (c.server_id ? c.name : '@ DM') : null
  }

  return (
    <aside className="ps-panel pop" aria-label="Search messages">
      <div className="ps-head">
        <form className="ps-search" onSubmit={e => { e.preventDefault(); run(false) }}>
          <input ref={ref} value={input} onChange={e => setInput(e.target.value)} placeholder="Search…  from: in: has: before: after:"
            aria-label="Search messages" onKeyDown={e => e.key === 'Escape' && onClose()} />
        </form>
        <button className="icon-btn" onClick={onClose} aria-label="Close search">✕</button>
      </div>
      <div className="tabs small ps-scope" role="tablist">
        <button className={scope === 'channel' ? 'on' : ''} onClick={() => setScope('channel')}>{channel.kind === 'dm' ? 'This chat' : channel.kind === 'voice' ? 'This stadium' : 'This room'}</button>
        {channel.server_id && <button className={scope === 'server' ? 'on' : ''} onClick={() => setScope('server')}>Whole server</button>}
        <button className={scope === 'dms' ? 'on' : ''} onClick={() => setScope('dms')}>All my DMs</button>
      </div>
      <div className="ps-list">
        {!results && <p className="muted small ps-empty">Type and press Enter. Try <code>from:pip has:image</code> or <code>in:"General Chat"</code>.</p>}
        {results?.length === 0 && <p className="muted small ps-empty">No matches. 🍃</p>}
        {results?.map(m => <Hit key={m.id} m={m} terms={q.text} channelName={chName(m.channel_id)} onJump={onJump} />)}
        {more && <button className="btn ghost small ps-more" disabled={busy} onClick={() => run(true)}>{busy ? 'Loading…' : 'Load more'}</button>}
      </div>
    </aside>
  )
}
