import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { profiles, toast, useProfile } from './lib/store'
import { dmTitle } from './Sidebar'
import { app } from './menus'
import Modal from './Modal'
import { ForwardIcon } from './icons'

// Pick a room or DM, add an optional note. The database copies the original and records where it came from.
export function ForwardModal({ m, ctx, servers, onClose }) {
  const [q, setQ] = useState('')
  const [to, setTo] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const profileMap = profiles.use()
  const targets = useMemo(() => {
    const serverName = Object.fromEntries((servers || []).map(s => [s.id, s.name]))
    return ctx.channels.filter(c => c.kind === 'text' || c.kind === 'dm')
      .map(c => ({ c, label: c.kind === 'dm' ? dmTitle(c, ctx.userId, profileMap) : c.name, sub: c.kind === 'dm' ? 'Direct message' : serverName[c.server_id] || '' }))
      .sort((a, b) => (b.c.last_message_id || 0) - (a.c.last_message_id || 0))
  }, [ctx.channels, ctx.userId, servers, profileMap])
  const shown = targets.filter(t => `${t.label} ${t.sub}`.toLowerCase().includes(q.trim().toLowerCase()))

  async function send(e) {
    e.preventDefault()
    if (!to || busy) return
    setBusy(true)
    const { error } = await supabase.from('messages').insert({ channel_id: to.c.id, author_id: ctx.userId, forward: { message_id: m.id } })
    const extra = !error && note.trim() && await supabase.from('messages').insert({ channel_id: to.c.id, author_id: ctx.userId, content: note.trim().slice(0, 4000) })
    setBusy(false)
    if (error || extra?.error) return toast((error || extra.error).message)
    toast(`Forwarded to ${to.label}.`)
    onClose()
  }

  return (
    <Modal title="Forward message" onClose={onClose}>
      <form className="col fwd-form" onSubmit={send}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search rooms and DMs" aria-label="Search rooms and DMs" />
        <div className="fwd-list" role="listbox" aria-label="Where to forward">
          {shown.map(t => (
            <button type="button" key={t.c.id} role="option" aria-selected={to?.c.id === t.c.id} className={`fwd-item${to?.c.id === t.c.id ? ' on' : ''}`}
              onClick={() => setTo(t)} onDoubleClick={send}>
              <b>{t.label}</b><span className="muted small">{t.sub}</span>
            </button>
          ))}
          {!shown.length && <p className="muted small">Nothing matches “{q}”.</p>}
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Add a note (optional)" aria-label="Note" />
        <button className="btn primary" disabled={!to || busy}><ForwardIcon size={16} /> {to ? `Forward to ${to.label}` : 'Pick where to send it'}</button>
      </form>
    </Modal>
  )
}

// "Forwarded from <author> in <room>" with a jump link to the original (if you can open it).
export function ForwardHeader({ f }) {
  const author = useProfile(f.author_id)
  const href = f.server_id ? `#/s/${f.server_id}/${f.channel_id}/${f.message_id}` : `#/dm/${f.channel_id}/${f.message_id}`
  const jump = e => { if (!app.channels.some(c => c.id === f.channel_id)) { e.preventDefault(); toast("You can't open the room it came from.") } }
  return (
    <div className="fwd-head muted small">
      <ForwardIcon size={14} />
      <span>Forwarded from <b>{author?.display_name || author?.username || 'someone'}</b>{f.room ? <> in <b>{f.room}</b></> : ' in a DM'}</span>
      <a href={href} onClick={jump} className="fwd-jump">Jump</a>
    </div>
  )
}
