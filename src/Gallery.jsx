import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, prefs, setPref, toast } from './lib/store'
import { SORTS, comments, hasNewComments, justify, mergePosts, postIdOf, postPath, targetHeight } from './lib/gallery'
import { postBlock } from './lib/moderation'
import Avatar, { Name } from './Avatar'
import { RoomBackdrop, RoomTitle, roomVars } from './Rooms'
import ThemeBackdrop, { useRoomTheme } from './themes/ThemeBackdrop'
import NewPostModal from './NewPost'
import PostView from './GalleryPost'
import Icon from './icons/Icon'
import './styles/gallery.css'

const PAGE = 30
const GAP = 8
// Each post plus whether you've commented on it: at most one of your messages in its discussion.
const SELECT = '*, discussion:channels!discussion_channel_id(mine:messages(id))'
export const postQuery = (q, userId) => q.eq('discussion.mine.author_id', userId).limit(1, { referencedTable: 'discussion.mine' })
export const flatPost = ({ discussion, ...p }) => ({ ...p, mine: !!discussion?.mine?.length })
const isVideo = m => m?.type?.startsWith('video/')

// A gallery room: posts (a title + up to 10 pictures/videos) on a justified photo wall; each opens with its own discussion.
export default function Gallery({ channel, ctx, onMenu }) {
  const { server, userId } = ctx
  const [posts, setPosts] = useState(null)
  const [sort, setSort] = useState('new')
  const [more, setMore] = useState(true)
  const [width, setWidth] = useState(0)
  const [composing, setComposing] = useState(false)
  const [postId, setPostId] = useState(() => postIdOf(location.hash))
  const [extra, setExtra] = useState(null) // a deep-linked post that isn't in the loaded pages (kept out so paging stays exact)
  const showMembers = prefs.use(s => s.showMembers)
  const sortRef = useRef(sort)
  sortRef.current = sort
  const busy = useRef(false)
  const scrollRef = useRef(null), gridRef = useRef(null), endRef = useRef(null)
  const theme = useRoomTheme(channel.background_url ? null : channel, server) // a background photo replaces the scene

  const fetchPage = useCallback(async (from, s) => {
    let q = supabase.from('gallery_posts').select(SELECT).eq('channel_id', channel.id)
    q = s === 'active' ? q.order('comment_count', { ascending: false }).order('last_activity_at', { ascending: false }) : q.order('created_at', { ascending: false })
    const { data, error } = await postQuery(q.order('id', { ascending: false }).range(from, from + PAGE - 1), userId)
    if (error) { toast('Could not load posts. Check your connection.'); return null }
    ensureProfiles(data.map(p => p.author_id))
    return data.map(flatPost)
  }, [channel.id, userId])

  useEffect(() => {
    let alive = true
    setPosts(null)
    fetchPage(0, sort).then(rows => {
      if (!alive) return
      setPosts(mergePosts([], rows || [], sort))
      setMore(rows?.length === PAGE)
    })
    return () => { alive = false }
  }, [fetchPage, sort])

  // shortcut: offset paging; live inserts/deletes are counted in posts.length, so pages still line up with the server's order
  const loadMore = useCallback(async () => {
    if (busy.current || !more || !posts) return
    busy.current = true
    const rows = await fetchPage(posts.length, sortRef.current)
    busy.current = false
    if (!rows) return
    setPosts(l => mergePosts(l, rows, sortRef.current))
    setMore(rows.length === PAGE)
  }, [more, posts, fetchPage])

  useEffect(() => {
    if (!endRef.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), { root: scrollRef.current, rootMargin: '600px' })
    io.observe(endRef.current)
    return () => io.disconnect()
  }, [loadMore])

  // Live: new posts slot in, edits and comment counts update in place (no reshuffling under your cursor), deletes vanish.
  useEffect(() => {
    const filter = `channel_id=eq.${channel.id}`
    const patch = p => x => x?.id === p.id ? { ...x, ...p } : x
    const ch = supabase.channel(`gallery:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gallery_posts', filter }, ({ new: p }) => {
        ensureProfiles([p.author_id])
        setPosts(l => l && mergePosts(l, [p], sortRef.current))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gallery_posts', filter }, ({ new: p }) => {
        setPosts(l => l && l.map(patch(p)))
        setExtra(patch(p))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'gallery_posts' }, ({ old }) =>
        setPosts(l => l && l.filter(x => x.id !== old.id)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [channel.id])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const layout = useMemo(() => justify((posts || []).map(p => p.cover_ratio), width, { target: targetHeight(width), gap: GAP }), [posts, width])

  // ── the open post: #/s/<server>/<gallery>/p/<post>, so links and back/forward work ──
  useEffect(() => {
    const on = () => setPostId(postIdOf(location.hash))
    addEventListener('popstate', on)
    addEventListener('hashchange', on)
    return () => { removeEventListener('popstate', on); removeEventListener('hashchange', on) }
  }, [])
  const post = posts?.find(p => p.id === postId) || (extra?.id === postId ? extra : null)
  const open = id => { history.pushState({ galleryPost: id }, '', postPath(server.id, channel.id, id)); setPostId(id) }
  const close = useCallback(() => {
    const id = postId
    if (history.state?.galleryPost === id) history.back() // popstate clears postId
    else { history.replaceState(null, '', postPath(server.id, channel.id)); setPostId(null) }
    // back on the grid: focus the card you came from, and pick up a comment you may have just left
    requestAnimationFrame(() => document.querySelector(`[data-post="${id}"]`)?.focus({ preventScroll: true }))
    const p = posts?.find(x => x.id === id)
    if (p && !p.mine) supabase.from('messages').select('id').eq('channel_id', p.discussion_channel_id).eq('author_id', userId).limit(1)
      .then(({ data }) => data?.length && setPosts(l => l && l.map(x => x.id === id ? { ...x, mine: true } : x)))
  }, [postId, posts, server.id, channel.id, userId])
  useEffect(() => {
    if (!postId || !posts || post) return
    let alive = true
    postQuery(supabase.from('gallery_posts').select(SELECT).eq('id', postId), userId).maybeSingle().then(({ data }) => {
      if (!alive) return
      if (!data || data.channel_id !== channel.id) {
        toast("That post isn't here any more.")
        history.replaceState(null, '', postPath(server.id, channel.id))
        return setPostId(null)
      }
      ensureProfiles([data.author_id])
      setExtra(flatPost(data))
    })
    return () => { alive = false }
  }, [postId, posts, post, channel.id, server.id, userId])

  const block = postBlock(server, ctx.member, ctx.can('manage_server'))
  const newPost = () => block
    ? toast(block === 'timeout' ? "You're in a timeout, so posting is off for now." : 'Agree to the server rules first, then you can post.')
    : setComposing(true)
  const onPosted = p => { ensureProfiles([p.author_id]); setPosts(l => mergePosts(l || [], [{ ...p, mine: false }], sortRef.current)); scrollRef.current?.scrollTo({ top: 0 }) }

  return (
    <div className="chat room-chat gallery" style={roomVars(channel, server)}>
      <RoomBackdrop c={channel}><ThemeBackdrop theme={theme} /></RoomBackdrop>
      <header className="chat-head room-head g-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button>
        <RoomTitle c={channel} />
        {channel.private && <span className="lock" title="Private"><Icon name="lock" size={14} /></span>}
        <span className="spacer" />
        <button className="btn primary small g-new-btn" onClick={newPost}><Icon name="plus" size={16} /><span>New post</span></button>
        <button className={`icon-btn${showMembers ? ' on' : ''}`} onClick={() => setPref('showMembers', !showMembers)}
          title="Toggle member list" aria-label="Toggle member list"><Icon name="friends" /></button>
      </header>

      <div className="g-scroll" ref={scrollRef} {...(post ? { inert: '' } : {})}>
        <div className="g-bar">
          <div className="tabs small g-sort" role="tablist" aria-label="Sort posts">
            {SORTS.map(([k, label]) => <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>)}
          </div>
        </div>
        <div className="g-grid" ref={gridRef} style={{ height: posts?.length ? layout.height : undefined }}>
          {!posts && <div className="g-loading" aria-label="Loading posts">{[3, 2, 4, 3, 2].map((f, i) => <i key={i} style={{ flexGrow: f }} />)}</div>}
          {posts?.length === 0 && (
            <div className="g-empty">
              <Icon name="gallery" size={40} />
              <p><b>Nothing on the wall yet.</b><br /><span className="muted">Share a drawing, a photo or a clip, and people can chat about it.</span></p>
              <button className="btn primary" onClick={newPost}>Share the first one</button>
            </div>
          )}
          {posts && width > 0 && layout.rows.map(row => row.items.map(it => {
            const p = posts[it.index]
            return <Card key={p.id} p={p} serverId={server.id} galleryId={channel.id} onOpen={open}
              box={{ left: it.left, top: row.top, width: it.width, height: row.height }}
              fresh={hasNewComments(p, ctx.reads?.[p.discussion_channel_id], p.mine || p.author_id === userId)} />
          }))}
        </div>
        {more && posts?.length > 0 && <div ref={endRef} className="g-end" />}
      </div>

      {post && <PostView key={post.id} post={post} gallery={channel} ctx={ctx} onClose={close}
        onChange={p => { setPosts(l => l && l.map(x => x.id === p.id ? { ...x, ...p } : x)); setExtra(e => e?.id === p.id ? { ...e, ...p } : e) }}
        onDeleted={id => { setPosts(l => l && l.filter(x => x.id !== id)); close() }} />}
      {composing && <NewPostModal gallery={channel} ctx={ctx} onClose={() => setComposing(false)} onPosted={onPosted} />}
    </div>
  )
}

function Card({ p, box, serverId, galleryId, onOpen, fresh }) {
  const cover = p.media[0]
  const src = isVideo(cover) ? cover.poster : cover.url
  const video = p.media.some(isVideo)
  const n = p.media.length
  return (
    <a href={postPath(serverId, galleryId, p.id)} data-post={p.id} style={box}
      className={`g-card${cover.spoiler ? ' spoiler' : ''}${fresh ? ' fresh' : ''}`}
      aria-label={`${p.title}, ${comments(p.comment_count)}${n > 1 ? `, ${n} items` : ''}${video ? ', has video' : ''}${fresh ? ', new comments' : ''}`}
      onClick={e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onOpen(p.id) }}>
      {src ? <img src={src} alt={cover.alt || ''} loading="lazy" decoding="async" draggable="false" />
        : <video src={cover.url + '#t=0.1'} preload="metadata" muted playsInline tabIndex={-1} />}
      {cover.spoiler && <span className="g-spoiler"><Icon name="eye-off" size={16} /> Spoiler</span>}
      {(n > 1 || video) && <span className="g-badges" aria-hidden="true">
        {video && <span className="g-badge"><Icon name="play" size={13} /></span>}
        {n > 1 && <span className="g-badge"><Icon name="stack" size={13} />{n}</span>}
      </span>}
      {fresh && <i className="g-fresh" aria-hidden="true" />}
      <span className="g-cap" aria-hidden="true">
        <b className="g-title">{p.title}</b>
        <span className="g-meta">
          <Avatar id={p.author_id} size={18} />
          <span className="g-author"><Name id={p.author_id} serverId={serverId} /></span>
          <span className="g-count"><Icon name="chat" size={14} />{p.comment_count}</span>
        </span>
      </span>
    </a>
  )
}
