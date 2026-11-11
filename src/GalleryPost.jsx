import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { profiles, toast } from './lib/store'
import { summarizeReactions } from './lib/chat'
import { DESC_MAX, TITLE_MAX, postPath, timeAgo } from './lib/gallery'
import { ask } from './Dialog'
import Avatar, { Name } from './Avatar'
import Markdown, { Emoji } from './Markdown'
import EmojiPicker from './EmojiPicker'
import { QUICK_EMOJI } from './Message'
import { Lightbox, Video } from './Media'
import { openProfile } from './ProfileCard'
import Chat from './Chat'
import Icon from './icons/Icon'

const isVideo = m => m?.type?.startsWith('video/')
const pathOf = url => url?.split('/storage/v1/object/public/media/')[1]

// One post: the media viewer, the post itself, and its discussion (a normal Chat on the post's own channel).
// Desktop: media left, discussion right. Phones: media on top, discussion below.
export default function PostView({ post, gallery, ctx, onClose, onChange, onDeleted }) {
  const { userId, server } = ctx
  const [disc, setDisc] = useState(null)
  const [i, setI] = useState(0)
  const [lb, setLb] = useState(null) // lightbox index among the images
  const [shown, setShown] = useState({}) // spoilers clicked open
  const [editing, setEditing] = useState(false)
  const items = post.media
  const it = items[Math.min(i, items.length - 1)]
  const hidden = it.spoiler && !shown[i]
  const imgs = items.filter(m => !isVideo(m))
  const mine = post.author_id === userId
  const canDelete = mine || ctx.can('manage_messages')
  const many = items.length > 1
  const go = d => setI(x => (x + d + items.length) % items.length)

  useEffect(() => {
    supabase.from('channels').select('*').eq('id', post.discussion_channel_id).maybeSingle().then(({ data, error }) => {
      if (error) toast('Could not load the comments.')
      setDisc(data || null)
    })
  }, [post.discussion_channel_id])

  // Reading the discussion here marks it read (the cards' new-comment dots compare against this).
  const did = post.discussion_channel_id, last = post.last_comment_id || 0, read = ctx.reads?.[did] ?? 0
  useEffect(() => {
    if (!last || last <= read || document.hidden) return
    const t = setTimeout(() => ctx.markRead([{ id: did, last_message_id: last }]), 600)
    return () => clearTimeout(t)
  }, [did, last, read]) // eslint-disable-line react-hooks/exhaustive-deps

  // ←/→ flip through the items, Esc closes (unless you're typing or something else is open on top).
  const live = useRef({})
  live.current = { go, onClose, many }
  useEffect(() => {
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, [contenteditable]')) return
      if (document.querySelector('.backdrop, .lightbox, .ctx-menu, .emoji-picker')) return
      if (e.key === 'Escape') live.current.onClose()
      else if (live.current.many && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); live.current.go(e.key === 'ArrowLeft' ? -1 : 1) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const swipe = useRef(null)

  async function destroy() {
    if (!await ask({ text: mine ? 'Delete your post and all its comments?' : `Delete this post by ${profiles.get()[post.author_id]?.username || 'someone'} and all its comments?`, confirm: 'Delete', danger: true })) return
    const { error } = await supabase.from('gallery_posts').delete().eq('id', post.id)
    if (error) return toast(error.message)
    // your own uploads go too (moderators can't remove other people's files)
    if (mine) supabase.storage.from('media').remove(items.flatMap(m => [m.url, m.poster]).map(pathOf).filter(p => p?.startsWith(userId + '/'))).then()
    toast('Post deleted')
    onDeleted(post.id)
  }
  const copyLink = () => navigator.clipboard?.writeText(location.href.split('#')[0] + postPath(server.id, gallery.id, post.id))
    .then(() => toast('Link copied'), () => toast("Couldn't copy the link."))

  return (
    <section className="g-post" aria-label={post.title}>
      <header className="chat-head g-post-head">
        <button className="btn ghost small g-back" onClick={onClose} title="Back to the gallery (Esc)"><Icon name="chevron-left" size={18} /><span>{gallery.name}</span></button>
        <span className="spacer" />
        <button className="icon-btn" onClick={copyLink} title="Copy link" aria-label="Copy link to this post"><Icon name="link" /></button>
        {mine && <button className={`icon-btn${editing ? ' on' : ''}`} onClick={() => setEditing(e => !e)} title="Edit post" aria-label="Edit post"><Icon name="edit" /></button>}
        {canDelete && <button className="icon-btn danger" onClick={destroy} title="Delete post" aria-label="Delete post"><Icon name="trash" /></button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close post"><Icon name="close" /></button>
      </header>

      <div className="g-post-body">
        <div className="g-viewer" aria-roledescription="carousel" aria-label="Pictures and videos">
          <div className="g-stage"
            onPointerDown={e => { if (e.pointerType === 'touch') swipe.current = e.clientX }}
            onPointerUp={e => { const x0 = swipe.current; swipe.current = null; if (x0 != null && many && Math.abs(e.clientX - x0) > 50) go(e.clientX < x0 ? 1 : -1) }}>
            {hidden
              ? <button className="g-spoiler-gate" onClick={() => setShown(s => ({ ...s, [i]: true }))}>
                {it.poster || !isVideo(it) ? <img src={isVideo(it) ? it.poster : it.url} alt="" /> : null}
                <span className="g-spoiler"><Icon name="eye-off" size={16} /> Spoiler · show</span>
              </button>
              : isVideo(it)
                ? <Video key={it.url} a={{ url: it.url, name: it.alt || post.title }} />
                : <button key={it.url} className="g-img" onClick={() => setLb(imgs.indexOf(it))} title={it.alt || 'Open full size'} aria-label={`Open full size${it.alt ? ': ' + it.alt : ''}`}>
                  <img src={it.url} alt={it.alt || ''} draggable="false" />
                </button>}
            {many && <>
              <button className="g-nav prev" onClick={() => go(-1)} aria-label="Previous"><Icon name="chevron-left" size={24} /></button>
              <button className="g-nav next" onClick={() => go(1)} aria-label="Next"><Icon name="chevron-right" size={24} /></button>
            </>}
          </div>
          {many && <div className="g-dots" role="tablist" aria-label="Items">
            {items.map((m, k) => <button key={k} role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}
              aria-label={`${isVideo(m) ? 'Video' : 'Picture'} ${k + 1} of ${items.length}`} />)}
            <span className="muted small">{i + 1} / {items.length}</span>
          </div>}
          {it.alt && !hidden && <p className="g-alt muted small"><b>ALT</b> {it.alt}</p>}
        </div>

        <aside className="g-side">
          <div className="g-info">
            {editing ? <EditPost post={post} onDone={p => { setEditing(false); if (p) onChange(p) }} /> : <>
              <h1 className="g-post-title">{post.title}</h1>
              <div className="g-byline">
                <button className="name-btn" data-profile onClick={e => openProfile(post.author_id, e.currentTarget)}>
                  <Avatar id={post.author_id} size={26} /> <Name id={post.author_id} serverId={server.id} />
                </button>
                <time className="muted small" dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{timeAgo(post.created_at)}</time>
                {post.edited_at && <span className="muted small">(edited)</span>}
              </div>
              {post.description && <div className="g-desc"><Markdown text={post.description} me={ctx.me.username} /></div>}
              <PostReactions post={post} userId={userId} />
            </>}
          </div>
          {disc ? <Chat key={disc.id} channel={{ ...disc, slowmode_sec: gallery.slowmode_sec }} ctx={ctx} />
            : <div className="loading-msgs g-chat-wait"><div className="g-wait" /></div>}
        </aside>
      </div>
      {lb != null && lb >= 0 && <Lightbox items={imgs.map(m => ({ ...m, name: m.alt || post.title }))} i={lb} setI={setLb} onClose={() => setLb(null)} />}
    </section>
  )
}

function EditPost({ post, onDone }) {
  const [title, setTitle] = useState(post.title)
  const [desc, setDesc] = useState(post.description || '')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!title.trim()) return toast('Your post needs a title.')
    setBusy(true)
    const { data, error } = await supabase.from('gallery_posts').update({ title: title.trim(), description: desc.trim() || null }).eq('id', post.id).select().single()
    setBusy(false)
    if (error) return toast(error.message)
    onDone(data)
  }
  return (
    <div className="col g-edit">
      <label><span className="srv-label">Title <span className="srv-count">{title.length}/{TITLE_MAX}</span></span>
        <input value={title} maxLength={TITLE_MAX} onChange={e => setTitle(e.target.value)} autoFocus /></label>
      <label><span className="srv-label">Description <span className="srv-count">{desc.length}/{DESC_MAX}</span></span>
        <textarea rows={4} value={desc} maxLength={DESC_MAX} onChange={e => setDesc(e.target.value)} /></label>
      <div className="row"><span className="spacer" />
        <button className="btn ghost small" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn primary small" onClick={save} disabled={busy}>Save</button></div>
    </div>
  )
}

// shortcut: post reactions load when the post opens and update optimistically; other people's arrive on reopen, add realtime if that bites
function PostReactions({ post, userId }) {
  const [list, setList] = useState([])
  const [picker, setPicker] = useState(false)
  const allProfiles = profiles.use()
  useEffect(() => {
    supabase.from('post_reactions').select('emoji, user_id').eq('post_id', post.id).then(({ data }) => data && setList(data))
  }, [post.id])
  async function toggle(emoji) {
    const had = list.some(r => r.user_id === userId && r.emoji === emoji)
    const row = { post_id: post.id, user_id: userId, emoji }
    const flip = on => setList(l => on ? [...l, { emoji, user_id: userId }] : l.filter(r => !(r.user_id === userId && r.emoji === emoji)))
    flip(!had)
    const { error } = had ? await supabase.from('post_reactions').delete().match(row)
      : await supabase.from('post_reactions').insert({ ...row, channel_id: post.channel_id })
    if (error && error.code !== '23505') { flip(had); toast(error.message) }
  }
  const sum = summarizeReactions(list, userId)
  const quick = QUICK_EMOJI.filter(e => !sum.some(r => r.emoji === e))
  return (
    <div className="reactions g-reacts">
      {sum.map(r => <button key={r.emoji} className={`react-chip${r.mine ? ' mine' : ''}`} onClick={() => toggle(r.emoji)} aria-pressed={r.mine}
        title={r.users.map(u => allProfiles[u]?.display_name || allProfiles[u]?.username || '…').join(', ')}><Emoji e={r.emoji} /> <b>{r.count}</b></button>)}
      {quick.map(e => <button key={e} className="react-chip g-quick" onClick={() => toggle(e)} title={`React ${e}`} aria-label={`React ${e}`}><Emoji e={e} /></button>)}
      <span className="g-react-more">
        <button className="react-chip" onMouseDown={e => e.stopPropagation()} onClick={() => setPicker(p => !p)} title="More reactions" aria-label="More reactions"><Icon name="smile" size={16} /></button>
        {picker && <EmojiPicker className="down" onPick={e => { toggle(e); setPicker(false) }} onClose={() => setPicker(false)} />}
      </span>
    </div>
  )
}
