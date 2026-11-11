import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, prefs, startProfileSync, toast, toasts, useProfile } from './lib/store'
import { startPresence } from './lib/presence'
import { byPosition, moveId, step } from './lib/reorder'
import { useDrag } from './lib/useDrag'
import FriendsHome, { friendships, startFriends, useIncomingCount } from './Friends'
import { Splash } from './App'
import Avatar, { CropImg } from './Avatar'
import Sidebar from './Sidebar'
import Chat from './Chat'
import Members, { useMembers } from './Members'
import ProfileCardHost from './ProfileCard'
import { useMemberRoles } from './Roles'
import { hasPerm } from './lib/roles'
import { VoiceConnection, VoiceStage } from './Voice'
import StadiumChat from './StadiumChat'
import QuickSwitch from './QuickSwitch'
import { CreateJoinModal, ServerSettingsModal, ChannelModal, NewDMModal } from './Modals'
import Settings from './Settings'
import { ThreadPanel } from './Thread'
import ContextMenuHost, { openMenu } from './ContextMenu'
import { app, dmHidden, serverItems } from './menus'
import { channelMuted, nextExpiry } from './lib/mute'

function parseHash() {
  const [, kind, a, b] = location.hash.split('/')
  if (kind === 's') return { serverId: a, channelId: b || null }
  if (kind === 'dm') return { serverId: null, channelId: a || null }
  return { serverId: null, channelId: null }
}

export default function Shell({ userId }) {
  const me = useProfile(userId)
  const [servers, setServers] = useState(null)
  const [channels, setChannels] = useState([])
  const [reads, setReads] = useState({})
  const [route, setRoute] = useState(parseHash)
  const [modal, setModal] = useState(null)
  const [voice, setVoice] = useState(null)
  const [vstate, setVstate] = useState({ muted: false, deafened: false, live: false, cam: false })
  const joinVoice = c => { setVoice(c); setVstate(v => ({ ...v, live: false, cam: false })) }
  const [navOpen, setNavOpen] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)
  const showMembers = prefs.use(s => s.showMembers)
  const toastList = toasts.use()
  const mutes = prefs.use(s => s.mutes)
  const closedDMs = prefs.use(s => s.closedDMs)
  const [hold, setHold] = useState(null) // channel marked unread by hand: don't auto-read it while it stays open
  const [tick, setTick] = useState(0) // re-renders when a timed mute runs out
  useEffect(() => {
    const at = nextExpiry(mutes)
    if (!at) return
    const t = setTimeout(() => setTick(x => x + 1), Math.min(at - Date.now() + 50, 2 ** 31 - 1))
    return () => clearTimeout(t)
  }, [mutes, tick])

  const go = useCallback((serverId, channelId, replace) => {
    const path = serverId ? `#/s/${serverId}${channelId ? '/' + channelId : ''}` : `#/dm${channelId ? '/' + channelId : ''}`
    if (replace) history.replaceState(null, '', path)
    else history.pushState(null, '', path)
    setRoute(parseHash())
    setNavOpen(false)
  }, [])

  const load = useCallback(async () => {
    const [s, c, r, m] = await Promise.all([
      supabase.from('servers').select('*').order('created_at'),
      supabase.from('channels').select('*, channel_members(user_id)').order('position').order('created_at'),
      supabase.from('read_states').select('channel_id, last_read_id'),
      supabase.from('members').select('server_id, position').eq('user_id', userId),
    ])
    if (s.error || c.error) return toast('Could not load your stuff. Check your connection.')
    // your own rail order (members.position), unordered servers last by creation
    const order = Object.fromEntries((m.data || []).map(x => [x.server_id, x.position]))
    setServers(byPosition(s.data.map(x => ({ ...x, position: order[x.id] }))))
    setChannels(c.data)
    setReads(Object.fromEntries((r.data || []).map(x => [x.channel_id, x.last_read_id])))
    ensureProfiles(c.data.filter(x => x.kind === 'dm').flatMap(x => x.channel_members.map(m => m.user_id)))
  }, [])

  const joinInvite = useCallback(async code => {
    const { data, error } = await supabase.rpc('join_server', { code })
    if (error) return toast(error.message.includes('not found') ? 'That invite link is invalid.' : error.message)
    await load()
    go(data)
    toast('Joined! Say hi 👋')
  }, [load, go])

  useEffect(() => { load() }, [load])
  useEffect(() => startPresence(userId), [userId])
  useEffect(startProfileSync, [])
  useEffect(() => startFriends(userId), [userId])
  const incoming = useIncomingCount()
  const hasFriends = friendships.use(r => r.length > 0)

  useEffect(() => {
    const onHash = () => {
      const inv = location.hash.match(/^#\/invite\/([\w-]+)/)
      if (inv) { history.replaceState(null, '', '#/dm'); joinInvite(inv[1]) }
      setRoute(parseHash())
    }
    const onVis = () => setVisible(!document.hidden)
    addEventListener('hashchange', onHash)
    addEventListener('popstate', onHash)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      removeEventListener('hashchange', onHash)
      removeEventListener('popstate', onHash)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [joinInvite])

  // Invite captured before sign-in (see main.jsx).
  useEffect(() => {
    if (!servers) return
    let code = null
    try { code = localStorage.getItem('chitchat:invite'); localStorage.removeItem('chitchat:invite') } catch {}
    if (code) joinInvite(code)
  }, [servers === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates to the channel list, unread markers and server membership.
  useEffect(() => {
    const ch = supabase.channel('shell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channels' }, async ({ new: row }) => {
        const { data } = await supabase.from('channels').select('*, channel_members(user_id)').eq('id', row.id).maybeSingle()
        if (!data) return
        setChannels(cs => cs.some(c => c.id === data.id) ? cs : [...cs, data])
        ensureProfiles(data.channel_members.map(m => m.user_id))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'channels' }, ({ new: row }) =>
        setChannels(cs => cs.map(c => c.id === row.id ? { ...c, ...row } : c)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'channels' }, ({ old }) =>
        setChannels(cs => cs.filter(c => c.id !== old.id)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers' }, ({ new: row }) =>
        setServers(ss => ss && ss.map(s => s.id === row.id ? { ...s, ...row } : s)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, ({ old }) => {
        if (old.user_id === userId) load()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, load])

  const server = servers?.find(s => s.id === route.serverId) || null
  const serverChannels = useMemo(() => channels.filter(c => c.server_id === route.serverId && c.server_id && c.kind !== 'thread')
    .sort((a, b) => (a.kind === 'voice') - (b.kind === 'voice') || a.position - b.position), [channels, route.serverId])
  const dms = useMemo(() => channels.filter(c => c.kind === 'dm' && (!dmHidden(c, closedDMs) || c.id === route.channelId))
    .sort((a, b) => (b.last_message_id || 0) - (a.last_message_id || 0)), [channels, closedDMs, route.channelId])
  const channel = channels.find(c => c.id === route.channelId && (c.server_id || null) === route.serverId) || null
  const members = useMembers(route.serverId)
  const role = members.find(m => m.user_id === userId)?.role
  const roleData = useMemberRoles(route.serverId)

  // Threads: kind 'thread' channels, shown in a side panel next to their parent channel.
  const [threadId, setThreadId] = useState(null)
  useEffect(() => setThreadId(null), [channel?.id])
  const threads = useMemo(() => channels.filter(c => c.kind === 'thread' && c.server_id === route.serverId), [channels, route.serverId])
  const threadsByMsg = useMemo(() => new Map(threads.filter(t => t.parent_message_id).map(t => [t.parent_message_id, t])), [threads])
  const thread = threads.find(t => t.id === threadId && t.parent_channel_id === channel?.id) || null
  const closeThread = useCallback(() => setThreadId(null), [])
  const startThread = useCallback(async m => {
    const { data: id, error } = await supabase.rpc('start_thread', { message_id: m.id })
    if (error) return toast(error.message)
    const { data } = await supabase.from('channels').select('*, channel_members(user_id)').eq('id', id).maybeSingle()
    if (data) setChannels(cs => cs.some(c => c.id === id) ? cs : [...cs, data]) // don't wait for realtime
    setThreadId(id)
  }, [])

  // Fill in a sensible channel when the route doesn't name one.
  useEffect(() => {
    if (!servers) return
    if (route.serverId && !server) return go(null, null, true)
    if (server && !channel) {
      let last = null
      try { last = localStorage.getItem('chitchat:last:' + server.id) } catch {}
      const c = serverChannels.find(c => c.id === last && c.kind === 'text') || serverChannels.find(c => c.kind === 'text')
      if (c) go(server.id, c.id, true)
    }
  }, [servers, server, channel, serverChannels, route.serverId, go])

  useEffect(() => {
    if (server && channel?.kind === 'text') try { localStorage.setItem('chitchat:last:' + server.id, channel.id) } catch {}
  }, [server, channel])

  // Mark the open channel read.
  useEffect(() => {
    if (!channel?.last_message_id || !visible || hold === channel.id) return
    if ((reads[channel.id] ?? 0) >= channel.last_message_id) return
    const id = channel.id, last = channel.last_message_id
    const t = setTimeout(() => {
      setReads(r => ({ ...r, [id]: last }))
      supabase.from('read_states').upsert({ user_id: userId, channel_id: id, last_read_id: last }).then()
    }, 600)
    return () => clearTimeout(t)
  }, [channel?.id, channel?.last_message_id, reads, visible, userId, hold])
  useEffect(() => setHold(h => h === channel?.id ? h : null), [channel?.id])

  const markRead = useCallback(list => {
    const rows = list.filter(c => (c.last_message_id || 0) > (reads[c.id] ?? 0))
      .map(c => ({ user_id: userId, channel_id: c.id, last_read_id: c.last_message_id }))
    if (!rows.length) return
    setReads(r => ({ ...r, ...Object.fromEntries(rows.map(x => [x.channel_id, x.last_read_id])) }))
    setHold(null)
    supabase.from('read_states').upsert(rows).then(({ error }) => error && toast(error.message))
  }, [reads, userId])
  const markUnread = useCallback((id, last) => {
    setHold(id)
    setReads(r => ({ ...r, [id]: last }))
    supabase.from('read_states').upsert({ user_id: userId, channel_id: id, last_read_id: last }).then(({ error }) => error && toast(error.message))
  }, [userId])

  // Muted channels/servers/DMs never count as unread (no dot, badge or tab-title count).
  const isUnread = useCallback(c => c.kind !== 'voice' && (c.last_message_id || 0) > (reads[c.id] ?? 0) &&
    !(c.id === channel?.id && visible && hold !== c.id) && !channelMuted(mutes, c),
  [reads, channel?.id, visible, hold, mutes, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const unreadServers = useMemo(() => new Set(channels.filter(c => c.server_id && c.kind !== 'thread' && isUnread(c)).map(c => c.server_id)), [channels, isUnread])
  const unreadDMs = dms.filter(isUnread).length

  useEffect(() => {
    const n = unreadDMs + unreadServers.size
    document.title = n ? `(${n}) Chitchat` : 'Chitchat'
  }, [unreadDMs, unreadServers.size])

  // Server rail: everyone drags their own order; Ctrl+Alt+↑/↓ switches servers.
  const railDrag = useDrag({
    accepts: (t, z) => t === 'server' && z === 'server',
    onDrop: d => {
      const ids = servers.map(s => s.id)
      const next = moveId(ids, d.id, ids.indexOf(d.over) + (d.after ? 1 : 0))
      const prev = servers
      setServers(next.map((id, i) => ({ ...servers.find(s => s.id === id), position: i + 1 })))
      supabase.rpc('reorder_servers', { ids: next }).then(({ error }) => { if (error) { setServers(prev); toast(error.message) } })
    },
  })
  useEffect(() => {
    const onKey = e => {
      if (!e.ctrlKey || !e.altKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !servers?.length) return
      e.preventDefault()
      const id = step(servers.map(s => s.id), route.serverId, e.key === 'ArrowUp' ? -1 : 1)
      if (id) go(id)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [servers, route.serverId, go])

  async function openDM(userIds) {
    const { data, error } = await supabase.rpc('open_dm', { user_ids: userIds })
    if (error) return toast(error.message)
    if (!channels.some(c => c.id === data)) await load()
    go(null, data)
  }

  if (!me || !servers) return <Splash />

  const ctx = { me, userId, server, role, can: perm => !!server && hasPerm(roleData, role, userId, perm), go, openDM, setModal, load, setChannels, markRead, markUnread, joinVoice,
    threads, threadsByMsg, startThread, openThread: setThreadId, channels }
  Object.assign(app, { ctx, members, channels })

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}${server && showMembers ? ' with-members' : ''}`}>
      <nav className="rail" aria-label="Servers">
        <button className={`rail-btn home${!route.serverId ? ' active' : ''}`} onClick={() => go(null, dms[0]?.id)} title="Direct messages">
          <span>💬</span>{unreadDMs + incoming > 0 && <b className="badge">{unreadDMs + incoming}</b>}
        </button>
        <hr />
        {servers.map(s => (
          <button key={s.id} className={`rail-btn${s.id === route.serverId ? ' active' : ''}${unreadServers.has(s.id) ? ' unread' : ''}${railDrag.cls('server', s.id)}`}
            {...railDrag.item('server', s.id)} {...railDrag.zone('server', s.id)}
            onClick={() => go(s.id)} onContextMenu={e => openMenu(e, () => serverItems(s))} title={s.name}>
            {s.icon_url ? <CropImg src={s.icon_url} crop={s.icon_crop} /> :<span>{s.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3)}</span>}
          </button>
        ))}
        <button className="rail-btn add" onClick={() => setModal({ type: 'createJoin' })} title="Create or join a server">＋</button>
      </nav>

      <Sidebar ctx={ctx} channels={server ? serverChannels : dms} current={channel} isUnread={isUnread}
        voice={voice} vstate={vstate} setVstate={setVstate} onLeaveVoice={() => joinVoice(null)} />

      <main className={`main${thread && channel?.kind !== 'voice' ? ' with-thread' : ''}`}>
        {channel?.kind === 'voice'
          ? <StadiumChat key={channel.id} channel={channel} ctx={ctx}>
            <VoiceStage channel={channel} meId={userId} joined={voice?.id === channel.id} onJoin={() => joinVoice(channel)}
              live={vstate.live} onLive={() => setVstate(v => ({ ...v, live: !v.live }))}
              cam={vstate.cam} onCam={() => setVstate(v => ({ ...v, cam: !v.cam }))} onMenu={() => setNavOpen(true)} />
          </StadiumChat>
          : channel
            ? <Chat key={channel.id} channel={channel} ctx={ctx} members={members} onMenu={() => setNavOpen(true)} />
            : !server && (servers.length > 0 || hasFriends)
              ? <FriendsHome ctx={ctx} onMenu={() => setNavOpen(true)} />
              : <Welcome ctx={ctx} onMenu={() => setNavOpen(true)} hasServers={servers.length > 0} />}
        {thread && channel?.kind !== 'voice' && <ThreadPanel key={thread.id} thread={thread} ctx={ctx} onClose={closeThread} />}
      </main>

      {server && showMembers && <Members members={members} ctx={ctx} />}

      {voice && <VoiceConnection key={voice.id} channel={voice} me={me} vstate={vstate} setVstate={setVstate}
        onError={msg => { toast(msg); joinVoice(null) }} />}

      <QuickSwitch servers={servers} channels={channels.filter(c => c.kind !== 'thread')} go={go} />
      <ProfileCardHost ctx={ctx} members={members} />
      <ContextMenuHost />

      {modal?.type === 'createJoin' && <CreateJoinModal ctx={ctx} onClose={() => setModal(null)} joinInvite={joinInvite} />}
      {modal?.type === 'serverSettings' && server && <ServerSettingsModal ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === 'channel' && server && <ChannelModal ctx={ctx} members={members} channel={modal.channel} categoryId={modal.categoryId} onClose={() => setModal(null)} />}
      {modal?.type === 'newDM' && <NewDMModal ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && <Settings me={me} tab={modal.tab} onClose={() => setModal(null)} />}

      <div className="toasts" aria-live="polite">
        {toastList.map(t => <div key={t.id} className="toast pop">{t.text}</div>)}
      </div>
      <div className="scrim" onClick={() => setNavOpen(false)} />
    </div>
  )
}

function Welcome({ ctx, onMenu, hasServers }) {
  return (
    <div className="welcome">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
      <div className="welcome-card pop">
        <Avatar id={ctx.userId} size={96} />
        <h1>Hey {ctx.me.display_name || ctx.me.username}!</h1>
        <p className="muted">{hasServers ? 'Pick a conversation, or start a new one.' : 'Start a server for your friends, or join one with an invite link.'}</p>
        <div className="row">
          <button className="btn primary" onClick={() => ctx.setModal({ type: 'createJoin' })}>Create or join a server</button>
          <button className="btn ghost" onClick={() => ctx.setModal({ type: 'newDM' })}>Message a friend</button>
        </div>
        <p className="muted small">Tip: press <kbd>Ctrl</kbd> + <kbd>K</kbd> to jump anywhere.</p>
      </div>
    </div>
  )
}
