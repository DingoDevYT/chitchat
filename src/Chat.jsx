import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, prefs, profiles, setPref, toast } from './lib/store'
import { applyReaction, mergeIncoming, startsGroup } from './lib/chat'
import { uploadFile } from './lib/upload'
import Message from './Message'
import { dmTitle } from './Sidebar'
import { Emoji } from './Markdown'
import EmojiPicker from './EmojiPicker'

const PAGE = 50
const msgCache = new Map() // channelId -> recent messages, so switching back is instant

export default function Chat({ channel, ctx, onMenu }) {
  const { userId, me, role, server } = ctx
  const [msgs, setMsgs] = useState(() => msgCache.get(channel.id) || null)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [typers, setTypers] = useState({})
  const [atBottom, setAtBottom] = useState(true)
  const chRef = useRef(null)
  const topRef = useRef(null)
  const scrollRef = useRef(null)
  const olderBusy = useRef(false)
  const profileMap = profiles.use()
  const showMembers = prefs.use(s => s.showMembers)
  const isAdmin = role === 'owner' || role === 'admin'

  useEffect(() => { if (msgs) msgCache.set(channel.id, msgs.filter(m => !m.pending).slice(-150)) }, [msgs, channel.id])

  useEffect(() => {
    let alive = true
    supabase.from('messages').select('*, reactions(emoji,user_id)').eq('channel_id', channel.id)
      .order('id', { ascending: false }).limit(PAGE)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) return toast('Could not load messages.')
        const rows = data.reverse().map(r => ({ ...r, key: r.id }))
        ensureProfiles(rows.map(r => r.author_id))
        const lastId = rows.at(-1)?.id ?? 0
        setMsgs(cur => [...rows, ...(cur || []).filter(m => m.pending || m.id > lastId)])
        setHasMore(data.length === PAGE)
      })

    const filter = `channel_id=eq.${channel.id}`
    const ch = supabase.channel(`chan:${channel.id}`, { config: { private: true, broadcast: { self: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, ({ new: row }) => {
        ensureProfiles([row.author_id])
        setMsgs(l => mergeIncoming(l, row, { live: !document.hidden }))
        setTypers(t => { if (!t[row.author_id]) return t; const n = { ...t }; delete n[row.author_id]; return n })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, ({ new: row }) =>
        setMsgs(l => l && l.map(m => m.id === row.id ? { ...m, content: row.content, edited_at: row.edited_at } : m)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) =>
        setMsgs(l => l && l.filter(m => m.id !== old.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter }, ({ new: r }) =>
        setMsgs(l => applyReaction(l, r, true)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, ({ old }) =>
        setMsgs(l => applyReaction(l, old, false)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => setTypers(t => ({ ...t, [payload.id]: Date.now() })))
      .subscribe()
    chRef.current = ch
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [channel.id])

  // Expire typing indicators.
  useEffect(() => {
    if (!Object.keys(typers).length) return
    const t = setInterval(() => setTypers(cur => {
      const n = Object.fromEntries(Object.entries(cur).filter(([, at]) => Date.now() - at < 4000))
      return Object.keys(n).length === Object.keys(cur).length ? cur : n
    }), 1000)
    return () => clearInterval(t)
  }, [typers])

  const loadOlder = useCallback(async () => {
    const first = msgs?.find(m => !m.pending)?.id
    if (!hasMore || olderBusy.current || !first) return
    olderBusy.current = true
    const { data } = await supabase.from('messages').select('*, reactions(emoji,user_id)').eq('channel_id', channel.id)
      .lt('id', first).order('id', { ascending: false }).limit(PAGE)
    olderBusy.current = false
    if (!data) return
    ensureProfiles(data.map(r => r.author_id))
    setMsgs(l => [...data.reverse().map(r => ({ ...r, key: r.id })), ...l])
    setHasMore(data.length === PAGE)
  }, [msgs, hasMore, channel.id])

  useEffect(() => {
    if (!topRef.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadOlder(), { root: scrollRef.current, rootMargin: '400px' })
    io.observe(topRef.current)
    return () => io.disconnect()
  }, [loadOlder])

  const send = useCallback(async (text, files) => {
    const content = text.trim()
    if (!content && !files.length) return
    const tmp = 'tmp-' + crypto.randomUUID()
    const reply = replyTo?.id ?? null
    setMsgs(l => [...(l || []), {
      id: tmp, key: tmp, pending: true, _live: true, channel_id: channel.id, author_id: userId, content, reply_to: reply,
      attachments: files.map(f => ({ name: f.name, type: f.type, url: URL.createObjectURL(f), uploading: true })),
      reactions: [], created_at: new Date().toISOString(),
    }])
    setReplyTo(null)
    try {
      const attachments = await Promise.all(files.map(f => uploadFile(f, userId)))
      const { data, error } = await supabase.from('messages')
        .insert({ channel_id: channel.id, author_id: userId, content, reply_to: reply, attachments }).select().single()
      if (error) throw error
      setMsgs(l => mergeIncoming(l, data))
    } catch (e) {
      setMsgs(l => l.map(m => m.id === tmp ? { ...m, pending: false, failed: true } : m))
      toast('Message failed: ' + e.message)
    }
  }, [channel.id, userId, replyTo])

  const react = useCallback(async (m, emoji) => {
    const mine = m.reactions.some(r => r.user_id === userId && r.emoji === emoji)
    const r = { message_id: m.id, user_id: userId, emoji }
    setMsgs(l => applyReaction(l, r, !mine))
    const { error } = mine
      ? await supabase.from('reactions').delete().match(r)
      : await supabase.from('reactions').insert({ ...r, channel_id: channel.id })
    if (error && error.code !== '23505') { setMsgs(l => applyReaction(l, r, mine)); toast(error.message) }
  }, [userId, channel.id])

  const remove = useCallback(async (m, skipConfirm) => {
    if (m.failed) return setMsgs(l => l.filter(x => x.id !== m.id))
    if (!skipConfirm && !confirm('Delete this message?')) return
    setMsgs(l => l.filter(x => x.id !== m.id))
    const { error } = await supabase.from('messages').delete().eq('id', m.id)
    if (error) toast(error.message)
  }, [])

  const saveEdit = useCallback(async v => {
    const id = editing
    setEditing(null)
    const content = v.trim()
    if (!content) return
    const edited_at = new Date().toISOString()
    setMsgs(l => l.map(m => m.id === id ? { ...m, content, edited_at } : m))
    const { error } = await supabase.from('messages').update({ content, edited_at }).eq('id', id)
    if (error) toast(error.message)
  }, [editing])

  const startEdit = useCallback(m => setEditing(m.id), [])
  const cancelEdit = useCallback(() => setEditing(null), [])
  const editLast = useCallback(() => {
    const last = [...(msgs || [])].reverse().find(m => m.author_id === userId && !m.pending && !m.failed)
    if (last) setEditing(last.id)
  }, [msgs, userId])

  const lastTyping = useRef(0)
  const onTyping = useCallback(() => {
    if (Date.now() - lastTyping.current < 2500) return
    lastTyping.current = Date.now()
    chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId } })
  }, [userId])

  const byId = useMemo(() => new Map((msgs || []).map(m => [m.id, m])), [msgs])
  const title = channel.kind === 'dm' ? dmTitle(channel, userId, profileMap) : channel.name
  const typingNames = Object.keys(typers).filter(id => id !== userId)
    .map(id => profileMap[id]?.display_name || profileMap[id]?.username || 'Someone')

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
        <span className="ch-icon">{channel.kind === 'dm' ? '@' : '#'}</span>
        <h2>{title}</h2>
        {channel.private && <span className="lock">🔒</span>}
        <span className="spacer" />
        {server && (
          <button className={`icon-btn${showMembers ? ' on' : ''}`} onClick={() => setPref('showMembers', !showMembers)}
            title="Toggle member list">👥</button>
        )}
      </header>

      <div className="scroller" ref={scrollRef} onScroll={e => setAtBottom(e.currentTarget.scrollTop > -200)}>
        <div className="msgs">
          <div ref={topRef} />
          {msgs && !hasMore && (
            <div className="chat-start">
              <h1>{channel.kind === 'dm' ? `This is the start of your chat with ${title}` : `Welcome to #${channel.name}!`}</h1>
              <p className="muted">Say something nice. Everyone hears it in your voice 🎶</p>
            </div>
          )}
          {!msgs && <div className="loading-msgs">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>}
          {msgs?.map((m, i) => {
            const prev = msgs[i - 1]
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            return (
              <div key={m.key}>
                {newDay && <div className="day-sep"><span>{new Date(m.created_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>}
                <Message m={m} head={newDay || startsGroup(prev, m)} me={userId} myName={me.username} canDelete={isAdmin}
                  replied={m.reply_to ? byId.get(m.reply_to) : null} editing={editing === m.id}
                  onReply={setReplyTo} onEdit={startEdit} onDelete={remove} onReact={react} onSaveEdit={saveEdit} onCancelEdit={cancelEdit} />
              </div>
            )
          })}
        </div>
      </div>

      {!atBottom && (
        <button className="jump pop" onClick={() => scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })}>Jump to latest ↓</button>
      )}

      <div className="typing-line" aria-live="polite">
        {typingNames.length > 0 && <><span className="dots"><i /><i /><i /></span>
          <b>{typingNames.slice(0, 3).join(', ')}</b> {typingNames.length > 1 ? 'are' : 'is'} typing…</>}
      </div>

      <Composer key={channel.id} placeholder={`Message ${channel.kind === 'dm' ? title : '#' + channel.name}`}
        onSend={send} onTyping={onTyping} onEditLast={editLast}
        replyTo={replyTo} onCancelReply={() => setReplyTo(null)} profileMap={profileMap} />
    </div>
  )
}

const DRAFTS = new Map() // channel drafts survive switching channels

function Composer({ placeholder, onSend, onTyping, onEditLast, replyTo, onCancelReply, profileMap }) {
  const ref = useRef(null)
  const key = placeholder
  const [text, setText] = useState(() => DRAFTS.get(key) || '')
  const [files, setFiles] = useState([])
  const [drag, setDrag] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => { DRAFTS.set(key, text) }, [key, text])
  useEffect(() => { ref.current?.focus() }, [replyTo])
  useEffect(() => {
    const el = ref.current
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [text])

  const addFiles = list => {
    const arr = [...list].filter(f => f.size <= 25 * 1024 * 1024)
    if (arr.length < list.length) toast('Files over 25 MB were skipped.')
    setFiles(f => [...f, ...arr].slice(0, 10))
  }

  function submit() {
    if (!text.trim() && !files.length) return
    onSend(text, files)
    setText('')
    setFiles([])
  }

  function insert(e) {
    const el = ref.current, s = el.selectionStart, end = el.selectionEnd
    setText(t => t.slice(0, s) + e + t.slice(end))
    setEmoji(false)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + e.length, s + e.length) })
  }

  const rp = replyTo && profileMap[replyTo.author_id]
  return (
    <div className={`composer${drag ? ' drag' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}>
      {replyTo && (
        <div className="reply-bar pop">
          Replying to <b>{rp?.display_name || rp?.username}</b>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Cancel reply">✕</button>
        </div>
      )}
      {files.length > 0 && (
        <div className="file-chips">
          {files.map((f, i) => (
            <span key={i} className="file-chip pop">
              {f.type.startsWith('image/') ? <img src={URL.createObjectURL(f)} alt="" /> : '📄'} {f.name}
              <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <button className="icon-btn attach" onClick={() => fileInput.current.click()} title="Attach files" aria-label="Attach files">＋</button>
        <input ref={fileInput} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} aria-label={placeholder}
          onChange={e => { setText(e.target.value); onTyping() }}
          onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files) } }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
            else if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onEditLast() }
            else if (e.key === 'Escape' && replyTo) onCancelReply()
          }} />
        <button className="icon-btn emoji-btn" onMouseDown={e => e.stopPropagation()} onClick={() => setEmoji(o => !o)} title="Emoji" aria-label="Emoji"><Emoji e="😊" /></button>
        {emoji && <EmojiPicker className="up" onPick={insert} onClose={() => setEmoji(false)} />}
        <button className="send-btn" onClick={submit} disabled={!text.trim() && !files.length} aria-label="Send">➤</button>
      </div>
    </div>
  )
}
