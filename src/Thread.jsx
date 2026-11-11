import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, toast } from './lib/store'
import { activeThreads, replies, timeAgo } from './lib/threads'
import Avatar, { Name } from './Avatar'
import Markdown from './Markdown'
import Chat from './Chat'
import './styles/threads.css'

// Right-hand panel (full-screen sheet on mobile) showing one thread, reusing Chat for the replies.
export function ThreadPanel({ thread, ctx, onClose }) {
  const [parent, setParent] = useState(undefined)
  const isAdmin = ctx.role === 'owner' || ctx.role === 'admin'

  useEffect(() => {
    setParent(undefined)
    if (!thread.parent_message_id) return setParent(null)
    supabase.from('messages').select('id, author_id, content, created_at').eq('id', thread.parent_message_id).maybeSingle()
      .then(({ data }) => { if (data) ensureProfiles([data.author_id]); setParent(data) })
  }, [thread.parent_message_id])

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && !e.target.closest?.('textarea, input') && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  async function toggleArchive() {
    const { error } = await supabase.from('channels').update({ archived: !thread.archived }).eq('id', thread.id)
    if (error) toast(error.message)
    else if (!thread.archived) onClose()
  }

  return (
    <aside className="thread-panel" aria-label={`Thread: ${thread.name}`}>
      <header className="chat-head">
        <span className="ch-icon">🧵</span>
        <h2>{thread.name}</h2>
        {thread.archived && <span className="muted small">archived</span>}
        <span className="spacer" />
        {isAdmin && <button className="icon-btn" onClick={toggleArchive} title={thread.archived ? 'Unarchive thread' : 'Archive thread'}>{thread.archived ? '📤' : '📥'}</button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close thread">✕</button>
      </header>
      <div className="thread-parent">
        {parent === undefined ? <div className="skeleton" />
          : parent ? <>
            <div className="row"><Avatar id={parent.author_id} size={22} /><b><Name id={parent.author_id} /></b><span className="muted small">{timeAgo(parent.created_at)}</span></div>
            <div className="thread-parent-text">{parent.content ? <Markdown text={parent.content} /> : <span className="muted">📎 attachment</span>}</div>
          </>
          : <span className="muted small">Original message was deleted.</span>}
      </div>
      <Chat key={thread.id} channel={thread} ctx={ctx} />
    </aside>
  )
}

// "Threads" button for a channel header, listing the channel's active threads.
export function ThreadsButton({ channel, ctx }) {
  const [open, setOpen] = useState(false)
  const list = activeThreads(ctx.threads || [], channel.id)
  useEffect(() => {
    if (!open) return
    const close = e => !e.target.closest('.threads-menu, .threads-btn') && setOpen(false)
    addEventListener('mousedown', close)
    return () => removeEventListener('mousedown', close)
  }, [open])
  return (
    <span className="threads-wrap">
      <button className={`icon-btn threads-btn${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} title="Threads" aria-expanded={open}>🧵</button>
      {open && (
        <div className="menu threads-menu pop" role="menu">
          <b className="small muted pad">Threads</b>
          {list.map(t => (
            <button key={t.id} onClick={() => { ctx.openThread(t.id); setOpen(false) }}>
              <span className="thread-menu-name">{t.name}</span>
              <span className="muted small">{replies(t.reply_count)} · {timeAgo(t.last_reply_at || t.created_at)}</span>
            </button>
          ))}
          {list.length === 0 && <p className="muted small pad">No active threads. Hover a message and hit 🧵 to start one.</p>}
        </div>
      )}
    </span>
  )
}

export function ThreadPill({ thread, onOpen }) {
  return (
    <button className="thread-pill" onClick={onOpen}>
      🧵 <b>{thread.name}</b>
      <span className="muted">· {replies(thread.reply_count)}{thread.last_reply_at && ` · last reply ${timeAgo(thread.last_reply_at)}`}</span>
    </button>
  )
}
