import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { prefs, profiles, setTalking, useProfile } from './lib/store'
import { blip } from './lib/animalese'
import { mediaLinks, summarizeReactions } from './lib/chat'
import { mentionsMe } from './lib/cues'
import Avatar, { Name } from './Avatar'
import Markdown, { Emoji, emojify } from './Markdown'
import { openProfile } from './ProfileCard'
import Reveal from './Reveal'
import EmojiPicker from './EmojiPicker'
import Attachments from './Media'
import { openMenu } from './ContextMenu'
import { app, chanMuted, messageItems, personMenu } from './menus'
import { ThreadPill } from './Thread'
import { isBlocked, useBlocked } from './lib/blocks'
import LinkPreviews from './LinkPreview'

export const QUICK_EMOJI = ['👍', '❤️', '😂']

const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
function fmtStamp(iso) {
  const d = new Date(iso), now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return `Today at ${fmtTime(d)}`
  if (d.toDateString() === y.toDateString()) return `Yesterday at ${fmtTime(d)}`
  return `${d.toLocaleDateString()} ${fmtTime(d)}`
}

// Types new messages out letter by letter while the author's avatar talks in their voice.
function useTypewriter(m) {
  const live = useRef(!!m._live && !!m.content && !isBlocked(m.author_id) && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [n, setN] = useState(live.current ? 0 : Infinity)
  useEffect(() => {
    if (!live.current) return
    m._live = false // shortcut: mutate the row so a re-mount (channel switch) doesn't replay it
    const text = m.content, id = m.author_id
    // TTS messages are read out by the stadium (lib/stadium.js), so the typewriter stays quiet for them.
    const muted = !!prefs.get().muted[id] || m.tts || chanMuted(app.channels.find(c => c.id === m.channel_id))
    const voice = () => profiles.get()[id]?.voice || {}
    const speed = voice().speed || 1
    const step = Math.max(1, Math.ceil(text.length / (80 * speed))) // long messages finish in ~2.5s
    let i = 0, done = false
    setTalking(id, true)
    const t = setInterval(() => {
      i = Math.min(text.length, i + step)
      if (!muted) blip(text[i - 1], voice())
      setN(i)
      if (i >= text.length) {
        clearInterval(t); done = true; setTalking(id, false)
        // let the last letters finish floating in, then hand over to full markdown.
        // Infinity, so an edit that makes the text longer isn't cut off at the old length.
        settle = setTimeout(() => setN(Infinity), 260)
      }
    }, 32 / speed)
    let settle
    return () => { clearInterval(t); clearTimeout(settle); if (!done) setTalking(id, false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return n
}

function EditBox({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial)
  return (
    <div className="edit-box">
      <textarea autoFocus value={v} onChange={e => setV(e.target.value)} rows={Math.min(8, v.split('\n').length)}
        onFocus={e => e.target.setSelectionRange(v.length, v.length)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(v) }
        }} />
      <div className="muted small">Enter to save · Esc to cancel</div>
    </div>
  )
}

// Scrolls a loaded message into view and flashes it. Returns false if it isn't rendered.
export function flashTo(id) {
  const el = document.getElementById('msg-' + id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1200)
  return true
}

function ReplyPreview({ m }) {
  const author = useProfile(m?.author_id)
  if (!m) return <div className="reply-ref muted small">↪ Original message unavailable</div>
  return (
    <button className="reply-ref small" onClick={() => flashTo(m.id)}>
      ↪ <Avatar id={m.author_id} size={16} /> <b style={{ color: author?.color }}>{author?.display_name || author?.username}</b>
      <span className="muted">{m.content.slice(0, 80) || '📎 attachment'}</span>
    </button>
  )
}

function Message({ m, head, me, myName, serverId, canDelete, canPin, replied, editing, onReply, onEdit, onDelete, onReact, onPin, onSaveEdit, onCancelEdit, thread, onThread, onRetry }) {
  const n = useTypewriter(m)
  const blocked = useBlocked(m.author_id)
  const [reveal, setReveal] = useState(false)
  const [picker, setPicker] = useState(false)
  const typing = n !== Infinity
  const mine = m.author_id === me
  const reactions = summarizeReactions(m.reactions || [], me)
  // chips already there when the message appeared don't pop, so opening a room or loading history doesn't bounce them all
  const oldChips = useRef(null)
  oldChips.current ??= new Set(reactions.map(r => r.emoji))
  const allProfiles = profiles.get()
  const media = useMemo(() => [...(m.attachments || []), ...(typing ? [] : mediaLinks(m.content))], [m.attachments, m.content, typing])
  const mentioned = mentionsMe(m.content, myName) // same rule as the mention badges
  const menu = e => !m.pending && !m.failed && !editing && openMenu(e, () => messageItems(m, {
    mine, canDelete, canPin, onReply, onEdit, onDelete, onReact, onPin, onThread, thread,
    quick: [...new Set([...(prefs.get().recentEmoji || []), ...QUICK_EMOJI, '😮', '😢', '🎉'])].slice(0, 6),
    openPicker: () => setPicker(document.getElementById('msg-' + m.id)?.getBoundingClientRect().top > innerHeight / 2 ? 'up' : 'down'),
  }))

  if (blocked && !reveal) return (
    <div id={`msg-${m.id}`} className={`msg${head ? ' head' : ''} blocked-msg`}>
      <button className="muted small" onClick={() => setReveal(true)}>🚫 Blocked message · <u>show</u></button>
    </div>
  )

  return (
    <div id={`msg-${m.id}`} onContextMenu={menu} className={`msg${head ? ' head' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}${m.queued ? ' queued' : ''}${mentioned ? ' mentioned' : ''}${typing ? ' typing' : ''}`}>
      {m.reply_to && <ReplyPreview m={replied} />}
      <div className="msg-row">
        <div className="msg-gutter">
          {head ? <button className="av-btn" data-profile {...personMenu(m.author_id)} onClick={e => openProfile(m.author_id, e.currentTarget)} aria-label="View profile"><Avatar id={m.author_id} size={42} talk={typing} /></button> : <time className="hover-time">{fmtTime(new Date(m.created_at))}</time>}
        </div>
        <div className="msg-body">
          {head && <div className="msg-meta"><button className="name-btn" data-profile {...personMenu(m.author_id)} onClick={e => openProfile(m.author_id, e.currentTarget)}><Name id={m.author_id} serverId={serverId} /></button><time className="muted small">{fmtStamp(m.created_at)}</time></div>}
          {editing
            ? <EditBox initial={m.content} onSave={onSaveEdit} onCancel={onCancelEdit} />
            : m.content && (
              <div className="msg-text">
                {typing ? <Reveal text={m.content} n={n} /> : <Markdown text={m.content} me={myName} />}
                {m.edited_at && !typing && <span className="muted small edited"> (edited)</span>}
              </div>
            )}
          {(m.failed || m.queued) && <div className="msg-retry">
            <span className={`note small${m.failed ? ' err' : ''}`}>{m.failed ? "Didn't send." : 'Waiting for connection… it sends when you\'re back online.'}</span>
            {m.failed && onRetry && <button className="btn primary small" onClick={() => onRetry(m)}>Retry</button>}
            <button className="btn ghost small" onClick={() => onDelete(m)}>Delete</button>
          </div>}
          {m.pending && !m.queued && m._files?.length > 0 && <div className="muted small" role="status">Uploading {m._files.length === 1 ? m._files[0].name : `${m._files.length} files`}…</div>}
          {m.pinned_at && <div className="pin-mark">📌 pinned</div>}
          <Attachments list={media} />
          {!typing && !m.suppress_embeds && <LinkPreviews m={m} mine={mine} />}
          {reactions.length > 0 && (
            <div className="reactions">
              {reactions.map(r => (
                <button key={r.emoji} className={`react-chip${oldChips.current.has(r.emoji) ? '' : ' pop'}${r.mine ? ' mine' : ''}`} onClick={() => onReact(m, r.emoji)}
                  title={r.users.map(u => allProfiles[u]?.display_name || allProfiles[u]?.username || '…').join(', ')}>
                  <Emoji e={r.emoji} /> <b>{r.count}</b>
                </button>
              ))}
            </div>
          )}
          {thread && <ThreadPill thread={thread} onOpen={() => onThread?.(m)} />}
        </div>
      </div>

      {!m.pending && !m.failed && !editing && (
        <div className="msg-tools">
          {QUICK_EMOJI.map(e => <button key={e} onClick={() => onReact(m, e)} title={`React ${e}`}><Emoji e={e} /></button>)}
          <button onMouseDown={e => e.stopPropagation()} onClick={e => setPicker(p => !p && (e.currentTarget.getBoundingClientRect().top > innerHeight / 2 ? 'up' : 'down'))} title="More reactions"><Emoji e="😊" /></button>
          <button onClick={() => onReply(m)} title="Reply">↩️</button>
          {onThread && <button onClick={() => onThread(m)} title={thread ? 'Open thread' : 'Start thread'} aria-label={thread ? 'Open thread' : 'Start thread'}>🧵</button>}
          {canPin && <button onClick={() => onPin(m)} title={m.pinned_at ? 'Unpin' : 'Pin'} aria-label={m.pinned_at ? 'Unpin' : 'Pin'}>📌</button>}
          {mine && <button onClick={() => onEdit(m)} title="Edit">✏️</button>}
          {(mine || canDelete) && <button onClick={e => onDelete(m, e.shiftKey)} title="Delete (Shift = no confirm)">🗑️</button>}
          {picker && <EmojiPicker className={picker} onPick={e => { onReact(m, e); setPicker(false) }} onClose={() => setPicker(false)} />}
        </div>
      )}
    </div>
  )
}

export default memo(Message)
