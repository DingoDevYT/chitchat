import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, prefs, profiles, setPref, setTypingIn, toast } from './lib/store'
import TypingRow from './Typing'
import { applyReaction, mergeIncoming, overLimit, startsGroup, MAX_LEN } from './lib/chat'
import { uploadFile } from './lib/upload'
import Message, { flashTo } from './Message'
import { PinsPanel, SearchPanel } from './PinsSearch'
import { dmTitle } from './Sidebar'
import { Emoji } from './Markdown'
import EmojiPicker from './EmojiPicker'
import { useEmojiAutocomplete } from './EmojiAutocomplete'
import GifPicker from './GifPicker'
import { ThreadsButton } from './Thread'
import { firstUnreadId, mergeRecent } from './lib/cues'
import { conn } from './ChatCues'
import Markdown from './Markdown'
import { RoomBackdrop, RoomTitle, SlowBadge, roomVars, useBannerShrink, useSlowLeft } from './Rooms'
import { slowUntil } from './lib/rooms'
import ThemeBackdrop, { useRoomTheme } from './themes/ThemeBackdrop'

const PAGE = 50
const msgCache = new Map() // channelId -> recent messages, so switching back is instant
let pendingJump = null // { cid, id }: a search result in another channel, jumped to once that Chat loads

// `stadium` ({ onType, onArrive, onClose }) turns this into a stadium's side chat: own realtime topic, TTS toggle, no nav.
export default function Chat({ channel, ctx, onMenu, stadium }) {
  const { userId, me, role, server } = ctx
  const [msgs, setMsgs] = useState(() => msgCache.get(channel.id) || null)
  const [hasMore, setHasMore] = useState(true)
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [typers, setTypers] = useState({})
  const [atBottom, setAtBottom] = useState(true)
  const [panel, setPanel] = useState(null) // 'pins' | 'search' | null
  const [loaded, setLoaded] = useState(false)
  const chRef = useRef(null)
  const topRef = useRef(null)
  const scrollRef = useRef(null)
  const olderBusy = useRef(false)
  const profileMap = profiles.use()
  const showMembers = prefs.use(s => s.showMembers)
  const isAdmin = role === 'owner' || role === 'admin'
  const canModerate = ctx.can('manage_messages')
  const canPinPerm = ctx.can('pin_messages')

  // queued (offline) sends survive switching channels; they go out when the connection is back
  useEffect(() => { if (msgs) msgCache.set(channel.id, msgs.filter(m => !m.pending || m.queued).slice(-150)) }, [msgs, channel.id])

  // "New messages" divider: where you'd read up to when you opened the channel. Fixed while you read; cleared when you send.
  const [lastRead, setLastRead] = useState(() => {
    const r = ctx.reads?.[channel.id]
    return r != null && (channel.last_message_id || 0) > r ? r : null
  })
  const [knownFirst, setKnownFirst] = useState(null) // first unread id, once looked up for the jump pill
  const [seenDivider, setSeenDivider] = useState(false)

  const loadRecent = useCallback(alive => supabase.from('messages').select('*, reactions(emoji,user_id)').eq('channel_id', channel.id)
    .order('id', { ascending: false }).limit(PAGE)
    .then(({ data, error }) => {
      if (alive && !alive()) return
      if (error) return toast('Could not load messages.')
      const rows = data.reverse().map(r => ({ ...r, key: r.id }))
      ensureProfiles(rows.map(r => r.author_id))
      setMsgs(cur => mergeRecent(cur, rows))
      setHasMore(data.length === PAGE)
      setLoaded(true)
    }), [channel.id])
  // back online / socket restored: pick up anything missed
  const epoch = conn.use(s => s.epoch)
  useEffect(() => { if (epoch) loadRecent() }, [epoch]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    loadRecent(() => alive)

    const filter = `channel_id=eq.${channel.id}`
    // A stadium's 'chan:' topic carries voice presence (VoiceConnection), and supabase-js shares one channel per topic.
    const ch = supabase.channel(`${stadium ? 'chat' : 'chan'}:${channel.id}`, { config: { private: true, broadcast: { self: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, ({ new: row }) => {
        ensureProfiles([row.author_id])
        stadium?.onArrive(row)
        setMsgs(l => mergeIncoming(l, row, { live: !document.hidden }))
        setTypers(t => { if (!t[row.author_id]) return t; const n = { ...t }; delete n[row.author_id]; return n })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, ({ new: row }) =>
        setMsgs(l => l && l.map(m => m.id === row.id ? { ...m, content: row.content, edited_at: row.edited_at, pinned_at: row.pinned_at, pinned_by: row.pinned_by, suppress_embeds: row.suppress_embeds } : m)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) =>
        setMsgs(l => l && l.filter(m => m.id !== old.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter }, ({ new: r }) =>
        setMsgs(l => applyReaction(l, r, true)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, ({ old }) =>
        setMsgs(l => applyReaction(l, old, false)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => { stadium?.onType(payload.id); setTypers(t => ({ ...t, [payload.id]: Date.now() })) })
      .subscribe()
    chRef.current = ch
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [channel.id])

  // Share who's typing here so avatars everywhere can switch to their typing expression.
  useEffect(() => { setTypingIn(channel.id, Object.keys(typers)) }, [typers, channel.id])
  useEffect(() => () => setTypingIn(channel.id, []), [channel.id])

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
    // the list was replaced meanwhile (fresh page over a stale cache): this page no longer joins up, and its hasMore would be wrong
    if (!data || msgsRef.current?.find(m => !m.pending)?.id !== first) return
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

  // Sends an optimistic row (its _files/_ready kept for retries). Offline: it waits as `queued` and goes out on reconnect.
  const deliver = useCallback(async m => {
    const mark = patch => setMsgs(l => l && l.map(x => x.id === m.id ? { ...x, ...patch } : x))
    if (!navigator.onLine) return mark({ pending: true, failed: false, queued: true })
    if (m.queued) mark({ queued: false }) // so a second flush doesn't send it twice
    try {
      const attachments = [...m._ready, ...await Promise.all(m._files.map(f => uploadFile(f, userId)))]
      const { data, error } = await supabase.from('messages')
        .insert({ channel_id: channel.id, author_id: userId, content: m.content, reply_to: m.reply_to, attachments, ...(m.tts && { tts: true }) }).select().single()
      if (error) throw error
      setMsgs(l => mergeIncoming(l, data))
    } catch (e) {
      const off = !navigator.onLine
      mark({ pending: off, failed: !off, queued: off })
      if (!off) toast('Message failed: ' + e.message)
    }
  }, [channel.id, userId])

  const send = useCallback(async (text, files, ready = [], tts = false) => {
    const content = text.trim()
    if (!content && !files.length && !ready.length) return
    const tmp = 'tmp-' + crypto.randomUUID()
    const row = {
      id: tmp, key: tmp, pending: true, _live: true, channel_id: channel.id, author_id: userId, content, reply_to: replyTo?.id ?? null, tts: !!(tts && content),
      attachments: [...ready, ...files.map(f => ({ name: f.name, type: f.type, url: URL.createObjectURL(f), uploading: true }))],
      reactions: [], created_at: new Date().toISOString(), _files: files, _ready: ready,
    }
    setMsgs(l => [...(l || []), row])
    setReplyTo(null)
    setLastRead(null)
    scrollRef.current?.scrollTo({ top: 0 }) // column-reverse: 0 = latest, so you see your message (and its Retry if it fails)
    deliver(row)
  }, [channel.id, userId, replyTo, deliver])

  // Retry goes to the bottom, where the server will put it.
  const retry = useCallback(m => {
    const row = { ...m, pending: true, failed: false, queued: false, created_at: new Date().toISOString() }
    setMsgs(l => [...l.filter(x => x.id !== m.id), row])
    deliver(row)
  }, [deliver])

  // Requests for the same reaction run one after another, so fast toggling can't land out of order and leave the opposite state.
  const reactQueue = useRef(new Map())
  const react = useCallback((m, emoji) => {
    const mine = m.reactions.some(r => r.user_id === userId && r.emoji === emoji)
    const r = { message_id: m.id, user_id: userId, emoji }
    setMsgs(l => applyReaction(l, r, !mine))
    const k = m.id + ' ' + emoji
    const job = (reactQueue.current.get(k) || Promise.resolve()).then(async () => {
      const { error } = mine
        ? await supabase.from('reactions').delete().match(r)
        : await supabase.from('reactions').insert({ ...r, channel_id: channel.id })
      if (error && error.code !== '23505') { setMsgs(l => applyReaction(l, r, mine)); toast(error.message) }
    })
    reactQueue.current.set(k, job)
    job.finally(() => reactQueue.current.get(k) === job && reactQueue.current.delete(k))
  }, [userId, channel.id])

  const remove = useCallback(async (m, skipConfirm) => {
    if (m.failed || m.queued) return setMsgs(l => l.filter(x => x.id !== m.id))
    if (!skipConfirm && !confirm('Delete this message?')) return
    setMsgs(l => l.filter(x => x.id !== m.id))
    const { error } = await supabase.from('messages').delete().eq('id', m.id)
    if (error) toast(error.message)
  }, [])

  const msgsRef = useRef(msgs)
  msgsRef.current = msgs // read in saveEdit without re-rendering every memoised Message on each change
  // Queued sends go out in order once we're back (and on open, for ones queued before a channel switch).
  useEffect(() => {
    if (!navigator.onLine) return
    const queued = (msgsRef.current || []).filter(m => m.queued)
    ;(async () => { for (const m of queued) await deliver(m) })()
  }, [epoch, deliver])
  const saveEdit = useCallback(async v => {
    const id = editing
    const content = v.trim()
    if (overLimit(content)) return toast(`Messages can be up to ${MAX_LEN} characters. That's ${overLimit(content)} too many.`)
    setEditing(null)
    const old = msgsRef.current?.find(m => m.id === id)
    if (!content || !old || content === old.content) return
    const edited_at = new Date().toISOString()
    setMsgs(l => l.map(m => m.id === id ? { ...m, content, edited_at } : m))
    const { error } = await supabase.from('messages').update({ content, edited_at }).eq('id', id)
    if (error) { setMsgs(l => l.map(m => m.id === id ? { ...m, content: old.content, edited_at: old.edited_at } : m)); toast(error.message) }
  }, [editing])

  const startEdit = useCallback(m => setEditing(m.id), [])
  const cancelEdit = useCallback(() => setEditing(null), [])
  const editLast = useCallback(() => {
    const last = [...(msgs || [])].reverse().find(m => m.author_id === userId && !m.pending && !m.failed)
    if (last) setEditing(last.id)
  }, [msgs, userId])

  const lastTyping = useRef(0)
  const selfTyping = useRef(0)
  const [meTyping, setMeTyping] = useState(false)
  const stopMeTyping = useCallback(() => { clearTimeout(selfTyping.current); setMeTyping(false); setTypingIn('self', []) }, [])
  useEffect(() => stopMeTyping, [stopMeTyping])
  const onTyping = useCallback(() => {
    // you see yourself typing too (broadcasts don't echo back to you)
    setTypingIn('self', [userId])
    setMeTyping(true)
    clearTimeout(selfTyping.current)
    selfTyping.current = setTimeout(stopMeTyping, 3000)
    if (Date.now() - lastTyping.current < 2500) return
    lastTyping.current = Date.now()
    stadium?.onType(userId)
    chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId } })
  }, [userId])

  const canPin = canPinPerm || channel.kind === 'dm' // mirrors public.can_pin() in the DB
  const togglePin = useCallback(async m => {
    const flip = l => l.map(x => x.id === m.id ? { ...x, pinned_at: m.pinned_at ? null : new Date().toISOString() } : x)
    setMsgs(l => l && flip(l))
    const { error } = await supabase.rpc('toggle_pin', { message_id: m.id })
    if (error) { setMsgs(l => l && l.map(x => x.id === m.id ? { ...x, pinned_at: m.pinned_at } : x)); toast(error.message) }
  }, [])

  // Scroll to a message in this channel, first loading everything between it and what's loaded (up to 500 rows).
  const jumpTo = useCallback(async id => {
    if (flashTo(id)) return
    const first = msgs?.find(m => !m.pending)?.id
    if (first && id < first) {
      const { data } = await supabase.from('messages').select('*, reactions(emoji,user_id)').eq('channel_id', channel.id)
        .gte('id', id).lt('id', first).order('id').limit(500)
      if (data?.[0]?.id === id && data.length < 500) {
        ensureProfiles(data.map(r => r.author_id))
        setMsgs(l => [...data.map(r => ({ ...r, key: r.id })), ...l])
        return setTimeout(() => flashTo(id), 60)
      }
    }
    toast("That message is too far back to jump to, or it's gone.")
  }, [msgs, channel.id])

  const openResult = useCallback(m => {
    if (m.channel_id === channel.id) return jumpTo(m.id)
    const c = ctx.channels?.find(x => x.id === m.channel_id)
    if (!c) return toast("Can't open that room.")
    pendingJump = { cid: c.id, id: m.id }
    ctx.go(c.server_id || null, c.id)
  }, [channel.id, jumpTo, ctx])

  useEffect(() => {
    if (!loaded || pendingJump?.cid !== channel.id) return
    const id = pendingJump.id
    pendingJump = null
    setTimeout(() => jumpTo(id), 60)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Message links (#/s/<server>/<channel>/<message>, #/dm/<channel>/<message>) jump to the message, then drop the id.
  useEffect(() => {
    if (!loaded) return
    const check = () => {
      const h = location.hash, parts = h.split('/'), id = +parts[parts[1] === 's' ? 4 : 3]
      if (!id || !parts.includes(channel.id)) return
      history.replaceState(null, '', h.slice(0, h.lastIndexOf('/')))
      setTimeout(() => jumpTo(id), 60)
    }
    check()
    addEventListener('hashchange', check)
    return () => removeEventListener('hashchange', check)
  }, [loaded, jumpTo, channel.id])

  // Ctrl/Cmd+F opens search while the chat (or nothing in particular) has focus.
  const rootRef = useRef(null)
  useEffect(() => {
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f' || e.shiftKey || e.altKey) return
      const a = document.activeElement
      if (a && a !== document.body && !rootRef.current?.contains(a)) return
      e.preventDefault()
      setPanel('search')
      setTimeout(() => rootRef.current?.querySelector('.ps-search input')?.focus())
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const pinKey = useMemo(() => (msgs || []).filter(m => m.pinned_at).map(m => m.id).join(), [msgs])
  const byId = useMemo(() => new Map((msgs || []).map(m => [m.id, m])), [msgs])
  // Replies to messages older than the loaded page fetch their original (null = gone; deletes null out reply_to anyway).
  const [refs, setRefs] = useState({})
  const refsAsked = useRef(new Set())
  useEffect(() => {
    const want = [...new Set((msgs || []).map(m => m.reply_to).filter(id => id && !byId.has(id) && !refsAsked.current.has(id)))]
    if (!want.length) return
    want.forEach(id => refsAsked.current.add(id))
    supabase.from('messages').select('id, author_id, content').in('id', want).then(({ data }) => {
      if (!data?.length) return
      ensureProfiles(data.map(r => r.author_id))
      setRefs(r => ({ ...r, ...Object.fromEntries(data.map(x => [x.id, x])) }))
    })
  }, [byId]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstUnread = useMemo(() => lastRead == null ? null : knownFirst ?? firstUnreadId(msgs, lastRead, userId, hasMore), [msgs, lastRead, knownFirst, userId, hasMore])
  // The pill shows until the divider has been on screen once (or nothing unread from others turns out to be there).
  const dividerRef = useRef(null)
  useEffect(() => {
    const el = dividerRef.current
    if (!el || seenDivider) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeenDivider(true), { root: scrollRef.current })
    io.observe(el)
    return () => io.disconnect()
  }, [firstUnread, seenDivider, msgs])
  const showPill = loaded && lastRead != null && !seenDivider &&
    (firstUnread != null || (hasMore && !(msgs?.find(m => typeof m.id === 'number')?.id <= lastRead))) // or not loaded back that far yet
  const jumpUnread = useCallback(async () => {
    if (firstUnread != null && flashTo(firstUnread)) return
    const { data } = await supabase.from('messages').select('id').eq('channel_id', channel.id).gt('id', lastRead)
      .neq('author_id', userId).order('id').limit(1).maybeSingle()
    if (!data) return setSeenDivider(true)
    setKnownFirst(data.id)
    jumpTo(data.id)
  }, [firstUnread, lastRead, channel.id, userId, jumpTo])

  const title = channel.kind === 'dm' ? dmTitle(channel, userId, profileMap) : channel.name
  const typingIds = [...Object.keys(typers).filter(id => id !== userId), ...(meTyping ? [userId] : [])]
  const typingNames = typingIds.map(id => profileMap[id]?.display_name || profileMap[id]?.username || 'Someone')
  // Rooms: banner header, accent, background and welcome text (see Rooms.jsx). Stadium side chats get the accent and welcome.
  const room = !!server && channel.kind === 'text' && !stadium
  const theme = useRoomTheme(room ? channel : null, server) // animated theme (src/themes); 'none' if the room has a background image
  const headRef = useRef(null)
  useBannerShrink(scrollRef, headRef, room)
  const exempt = role === 'owner' || ctx.can('manage_messages') || ctx.can('manage_channels')
  const slow = server && channel.kind !== 'dm' ? channel.slowmode_sec || 0 : 0

  return (
    <div className={`chat${server && channel.kind !== 'dm' ? ' room-chat' : ''}`} ref={rootRef} style={server && channel.kind !== 'dm' ? roomVars(channel, server) : undefined}>
      {room && <RoomBackdrop c={channel}><ThemeBackdrop theme={theme} /></RoomBackdrop>}
      {channel.kind !== 'thread' && <header className={`chat-head${room ? ' room-head' : ''}`} ref={headRef}>
        {!stadium && <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>}
        {room ? <RoomTitle c={channel} /> : <>
          <span className="ch-icon">{stadium ? '💬' : '@'}</span>
          <h2>{title}</h2>
        </>}
        {channel.private && <span className="lock">🔒</span>}
        <span className="spacer" />
        {server && channel.kind === 'text' && <ThreadsButton channel={channel} ctx={ctx} />}
        <button className={`icon-btn${panel === 'pins' ? ' on' : ''}`} onClick={() => setPanel(p => p === 'pins' ? null : 'pins')}
          title="Pinned messages" aria-label="Pinned messages">📌</button>
        <button className={`icon-btn${panel === 'search' ? ' on' : ''}`} onClick={() => setPanel(p => p === 'search' ? null : 'search')}
          title="Search (Ctrl+F)" aria-label="Search messages">🔍</button>
        {server && !stadium && (
          <button className={`icon-btn${showMembers ? ' on' : ''}`} onClick={() => setPref('showMembers', !showMembers)}
            title="Toggle member list">👥</button>
        )}
        {stadium && <button className="icon-btn" onClick={stadium.onClose} title="Hide chat" aria-label="Hide chat">✕</button>}
      </header>}

      <div className="scroller" ref={scrollRef} onScroll={e => setAtBottom(e.currentTarget.scrollTop > -200)}>
        <div className="msgs">
          <div ref={topRef} />
          {msgs && !hasMore && (
            <div className="chat-start">
              <h1>{channel.kind === 'dm' ? `This is the start of your chat with ${title}` : channel.kind === 'thread' ? 'The thread starts here 🧵' : `Welcome to ${channel.name}${/[!?.]$/.test(channel.name) ? "" : "!"}`}</h1>
              {channel.welcome && channel.kind !== 'dm'
                ? <div className="room-welcome"><Markdown text={channel.welcome} me={me.username} /></div>
                : <p className="muted">Say something nice. Everyone hears it in your voice 🎶</p>}
            </div>
          )}
          {!msgs && <div className="loading-msgs">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>}
          {msgs?.map((m, i) => {
            const prev = msgs[i - 1]
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            return (
              <div key={m.key}>
                {newDay && <div className="day-sep"><span>{new Date(m.created_at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>}
                {m.id === firstUnread && <div className="new-divider" ref={dividerRef} role="separator" aria-label="New messages"><span>New messages</span></div>}
                <Message m={m} onRetry={retry} head={newDay || startsGroup(prev, m)} me={userId} myName={me.username} serverId={server?.id} canDelete={canModerate} canPin={canPin}
                  replied={m.reply_to ? byId.get(m.reply_to) || refs[m.reply_to] : null} editing={editing === m.id}
                  onReply={setReplyTo} onEdit={startEdit} onDelete={remove} onReact={react} onPin={togglePin} onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                  thread={ctx.threadsByMsg?.get(m.id)} onThread={server && channel.kind === 'text' ? ctx.startThread : null} />
              </div>
            )
          })}
        </div>
      </div>

      {panel === 'pins' && <PinsPanel channel={channel} canPin={canPin} pinKey={pinKey} onJump={m => jumpTo(m.id)}
        onTogglePin={togglePin} onClose={() => setPanel(null)} />}
      {panel === 'search' && <SearchPanel ctx={ctx} channel={channel} onJump={openResult} onClose={() => setPanel(null)} />}

      {showPill && (
        <div className="jump-unread pop">
          <button onClick={jumpUnread}>↑ Jump to first unread</button>
          <button className="x" onClick={() => setSeenDivider(true)} aria-label="Dismiss" title="Dismiss">✕</button>
        </div>
      )}

      {!atBottom && (
        <button className="jump pop" onClick={() => scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })}>Jump to latest ↓</button>
      )}

      <div className="typing-line" aria-live="polite">
        <TypingRow ids={typingIds} names={typingNames} meId={userId} />
      </div>

      <Composer key={channel.id} draftKey={channel.id} placeholder={`Message ${title}`} slow={slow} exempt={exempt} slowUntil={exempt ? null : slowUntil(msgs, userId, slow)}
        onSend={(...a) => { stopMeTyping(); return send(...a) }} onTyping={onTyping} onEditLast={editLast}
        replyTo={replyTo} onCancelReply={() => setReplyTo(null)} profileMap={profileMap} serverId={server?.id} canTTS={!!stadium} />
    </div>
  )
}

const DRAFTS = new Map() // channel drafts survive switching channels

function Composer({ draftKey: key, placeholder, onSend, onTyping, onEditLast, replyTo, onCancelReply, profileMap, serverId, canTTS, slow, exempt, slowUntil: until }) {
  const slowLeft = useSlowLeft(until) // slowmode countdown; the database enforces it too
  const ref = useRef(null)
  const [tts, setTTS] = useState(false)
  const [text, setText] = useState(() => DRAFTS.get(key) || '')
  const ac = useEmojiAutocomplete(ref, text, setText, serverId)
  const [files, setFiles] = useState([])
  const [drag, setDrag] = useState(false)
  const [picker, setPicker] = useState(null) // 'emoji' | 'gif' | null
  const fileInput = useRef(null)
  const previews = useMemo(() => files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null), [files])
  useEffect(() => () => previews.forEach(u => u && URL.revokeObjectURL(u)), [previews])

  useEffect(() => { DRAFTS.set(key, text) }, [key, text])
  useEffect(() => { ref.current?.focus() }, [replyTo])
  useEffect(() => {
    const el = ref.current
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [text])

  // Keep focus on the textarea so Enter sends instead of re-pressing whatever button was clicked.
  const focus = () => ref.current?.focus()
  const addFiles = list => {
    const arr = [...list].filter(f => f.size <= 25 * 1024 * 1024)
    if (arr.length < list.length) toast('Files over 25 MB were skipped.')
    setFiles(f => [...f, ...arr].slice(0, 10))
    focus()
  }

  function submit() {
    if ((!text.trim() && !files.length) || slowLeft > 0) return
    const out = ac.encode(text)
    if (overLimit(out)) return toast(`Messages can be up to ${MAX_LEN} characters. That's ${overLimit(out)} too many.`)
    onSend(out, files, [], canTTS && tts)
    setText('')
    setFiles([])
  }

  function insert(e) {
    e = ac.fromPicker(e)
    const el = ref.current, s = el.selectionStart, end = el.selectionEnd
    setText(t => t.slice(0, s) + e + t.slice(end))
    setPicker(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + e.length, s + e.length) })
  }

  // GIFs send straight away (like Discord), keeping any reply that's set.
  function sendGif(g) {
    setPicker(null)
    if (slowLeft > 0) return
    onSend('', [], [{ url: g.url, type: 'image/gif', name: `${g.title}.gif`, w: g.w, h: g.h, gif: true }])
    focus()
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
              {previews[i] ? <img src={previews[i]} alt="" /> : '📄'} {f.name}
              <button onClick={() => { setFiles(fs => fs.filter((_, j) => j !== i)); focus() }} aria-label={`Remove ${f.name}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      {ac.popup}
      {slow > 0 && <SlowBadge sec={slow} left={slowLeft} exempt={exempt} />}
      <div className="composer-row">
        <button className="icon-btn attach" onMouseDown={e => e.preventDefault()} onClick={() => fileInput.current.click()} title="Attach files" aria-label="Attach files">＋</button>
        <input ref={fileInput} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} aria-label={placeholder}
          onChange={e => { setText(e.target.value); onTyping(); ac.track(e) }} onSelect={ac.track}
          onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files) } }}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing || ac.onKeyDown(e)) return
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
            else if (e.key === 'ArrowUp' && !text) { e.preventDefault(); onEditLast() }
            else if (e.key === 'Escape' && replyTo) onCancelReply()
          }} />
        <button className="icon-btn gif-btn" onMouseDown={e => e.stopPropagation()} onClick={() => setPicker(p => p === 'gif' ? null : 'gif')} title="GIFs" aria-label="GIFs">GIF</button>
        <button className="icon-btn emoji-btn" onMouseDown={e => e.stopPropagation()} onClick={() => setPicker(p => p === 'emoji' ? null : 'emoji')} title="Emoji" aria-label="Emoji"><Emoji e="😊" /></button>
        {picker === 'emoji' && <EmojiPicker className="up" onPick={insert} onClose={() => setPicker(null)} />}
        {picker === 'gif' && <GifPicker className="up" onPick={sendGif} onClose={() => setPicker(null)} />}
        <button className="send-btn" onClick={submit} disabled={(!text.trim() && !files.length) || slowLeft > 0} aria-label="Send">➤</button>
      </div>
      {canTTS && (
        <div className="composer-sub">
          <button className={`tts-toggle${tts ? ' on' : ''}`} aria-pressed={tts} onMouseDown={e => e.preventDefault()} onClick={() => setTTS(t => !t)}
            title="Read your messages aloud to everyone in the stadium">🔊 TTS</button>
        </div>
      )}
    </div>
  )
}
