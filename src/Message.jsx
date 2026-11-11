import { memo, useEffect, useRef, useState } from 'react'
import { prefs, profiles, setTalking, useProfile } from './lib/store'
import { blip } from './lib/animalese'
import { summarizeReactions } from './lib/chat'
import Avatar, { Name } from './Avatar'
import Markdown, { Emoji, emojify } from './Markdown'
import EmojiPicker from './EmojiPicker'

export const QUICK_EMOJI = ['👍', '❤️', '😂']

const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
function fmtStamp(iso) {
  const d = new Date(iso), now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return `Today at ${fmtTime(d)}`
  if (d.toDateString() === y.toDateString()) return `Yesterday at ${fmtTime(d)}`
  return `${d.toLocaleDateString()} ${fmtTime(d)}`
}
const fmtSize = b => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`

// Types new messages out letter by letter while the author's avatar talks in their voice.
function useTypewriter(m) {
  const live = useRef(!!m._live && !!m.content && !matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [n, setN] = useState(live.current ? 0 : Infinity)
  useEffect(() => {
    if (!live.current) return
    m._live = false // shortcut: mutate the row so a re-mount (channel switch) doesn't replay it
    const text = m.content, id = m.author_id
    const muted = !!prefs.get().muted[id]
    const voice = () => profiles.get()[id]?.voice || {}
    const speed = voice().speed || 1
    const step = Math.max(1, Math.ceil(text.length / (80 * speed))) // long messages finish in ~2.5s
    let i = 0, done = false
    setTalking(id, true)
    const t = setInterval(() => {
      i = Math.min(text.length, i + step)
      if (!muted) blip(text[i - 1], voice())
      setN(i)
      if (i >= text.length) { clearInterval(t); done = true; setTalking(id, false) }
    }, 32 / speed)
    return () => { clearInterval(t); if (!done) setTalking(id, false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return n
}

function Attachment({ a }) {
  if (a.type?.startsWith('image/')) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className={`att-img${a.uploading ? ' uploading' : ''}`}
        style={a.w ? { aspectRatio: `${a.w} / ${a.h}`, width: Math.min(a.w, 400) } : undefined}>
        <img src={a.url} alt={a.name} loading="lazy" />
      </a>
    )
  }
  if (a.type?.startsWith('video/')) return <video className="att-video" src={a.url} controls preload="metadata" />
  if (a.type?.startsWith('audio/')) return <audio src={a.url} controls preload="metadata" />
  return (
    <a className="att-file" href={a.url} target="_blank" rel="noopener noreferrer" download={a.name}>
      <span>📄</span><span><b>{a.name}</b><span className="muted small">{a.size ? fmtSize(a.size) : 'uploading…'}</span></span>
    </a>
  )
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

function ReplyPreview({ m }) {
  const author = useProfile(m?.author_id)
  if (!m) return <div className="reply-ref muted small">↪ Original message unavailable</div>
  return (
    <button className="reply-ref small" onClick={() => {
      const el = document.getElementById('msg-' + m.id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.classList.add('flash')
      setTimeout(() => el?.classList.remove('flash'), 1200)
    }}>
      ↪ <Avatar id={m.author_id} size={16} /> <b style={{ color: author?.color }}>{author?.display_name || author?.username}</b>
      <span className="muted">{m.content.slice(0, 80) || '📎 attachment'}</span>
    </button>
  )
}

function Message({ m, head, me, myName, canDelete, replied, editing, onReply, onEdit, onDelete, onReact, onSaveEdit, onCancelEdit }) {
  const n = useTypewriter(m)
  const [picker, setPicker] = useState(false)
  const typing = n < m.content.length
  const mine = m.author_id === me
  const reactions = summarizeReactions(m.reactions || [], me)
  const allProfiles = profiles.get()
  const mentionsMe = myName && new RegExp(`(^|[^\\w@])@${myName.replace(/\./g, '\\.')}\\b`, 'i').test(m.content)

  return (
    <div id={`msg-${m.id}`} className={`msg${head ? ' head' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}${mentionsMe ? ' mentioned' : ''}${typing ? ' typing' : ''}`}>
      {m.reply_to && <ReplyPreview m={replied} />}
      <div className="msg-row">
        <div className="msg-gutter">
          {head ? <Avatar id={m.author_id} size={42} /> : <time className="hover-time">{fmtTime(new Date(m.created_at))}</time>}
        </div>
        <div className="msg-body">
          {head && <div className="msg-meta"><Name id={m.author_id} /><time className="muted small">{fmtStamp(m.created_at)}</time></div>}
          {editing
            ? <EditBox initial={m.content} onSave={onSaveEdit} onCancel={onCancelEdit} />
            : m.content && (
              <div className="msg-text">
                {typing ? emojify(m.content.slice(0, n)) : <Markdown text={m.content} me={myName} />}
                {typing && <span className="caret" />}
                {m.edited_at && !typing && <span className="muted small edited"> (edited)</span>}
              </div>
            )}
          {m.failed && <div className="note err small">Didn't send. Check your connection and try again.</div>}
          {m.attachments?.length > 0 && <div className="atts">{m.attachments.map((a, i) => <Attachment key={i} a={a} />)}</div>}
          {reactions.length > 0 && (
            <div className="reactions">
              {reactions.map(r => (
                <button key={r.emoji} className={`react-chip pop${r.mine ? ' mine' : ''}`} onClick={() => onReact(m, r.emoji)}
                  title={r.users.map(u => allProfiles[u]?.display_name || allProfiles[u]?.username || '…').join(', ')}>
                  <Emoji e={r.emoji} /> <b>{r.count}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!m.pending && !m.failed && !editing && (
        <div className="msg-tools">
          {QUICK_EMOJI.map(e => <button key={e} onClick={() => onReact(m, e)} title={`React ${e}`}><Emoji e={e} /></button>)}
          <button onMouseDown={e => e.stopPropagation()} onClick={e => setPicker(p => !p && (e.currentTarget.getBoundingClientRect().top > innerHeight / 2 ? 'up' : 'down'))} title="More reactions"><Emoji e="😊" /></button>
          <button onClick={() => onReply(m)} title="Reply">↩️</button>
          {mine && <button onClick={() => onEdit(m)} title="Edit">✏️</button>}
          {(mine || canDelete) && <button onClick={e => onDelete(m, e.shiftKey)} title="Delete (Shift = no confirm)">🗑️</button>}
          {picker && <EmojiPicker className={picker} onPick={e => { onReact(m, e); setPicker(false) }} onClose={() => setPicker(false)} />}
        </div>
      )}
    </div>
  )
}

export default memo(Message)
