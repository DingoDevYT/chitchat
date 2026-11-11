import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, prefs, toast, toasts, useProfile } from './lib/store'
import { startPresence } from './lib/presence'
import FriendsHome, { friendships, startFriends, useIncomingCount } from './Friends'
import { Splash } from './App'
import Avatar from './Avatar'
import Sidebar from './Sidebar'
import Chat from './Chat'
import Members, { useMembers } from './Members'
import ProfileCardHost from './ProfileCard'
import { VoiceConnection, VoiceStage } from './Voice'
import QuickSwitch from './QuickSwitch'
import { CreateJoinModal, ServerSettingsModal, ChannelModal, NewDMModal } from './Modals'
import Settings from './Settings'

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

  const go = useCallback((serverId, channelId, replace) => {
    const path = serverId ? `#/s/${serverId}${channelId ? '/' + channelId : ''}` : `#/dm${channelId ? '/' + channelId : ''}`
    if (replace) history.replaceState(null, '', path)
    else history.pushState(null, '', path)
    setRoute(parseHash())
    setNavOpen(false)
  }, [])

  const load = useCallback(async () => {
    const [s, c, r] = await Promise.all([
      supabase.from('servers').select('*').order('created_at'),
      supabase.from('channels').select('*, channel_members(user_id)').order('position').order('created_at'),
      supabase.from('read_states').select('channel_id, last_read_id'),
    ])
    if (s.error || c.error) return toast('Could not load your stuff. Check your connection.')
    setServers(s.data)
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, ({ old }) => {
        if (old.user_id === userId) load()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, load])

  const server = servers?.find(s => s.id === route.serverId) || null
  const serverChannels = useMemo(() => channels.filter(c => c.server_id === route.serverId && c.server_id)
    .sort((a, b) => (a.kind === 'voice') - (b.kind === 'voice') || a.position - b.position), [channels, route.serverId])
  const dms = useMemo(() => channels.filter(c => c.kind === 'dm')
    .sort((a, b) => (b.last_message_id || 0) - (a.last_message_id || 0)), [channels])
  const channel = channels.find(c => c.id === route.channelId && (c.server_id || null) === route.serverId) || null
  const members = useMembers(route.serverId)
  const role = members.find(m => m.user_id === userId)?.role

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
    if (!channel?.last_message_id || !visible) return
    if ((reads[channel.id] ?? 0) >= channel.last_message_id) return
    const id = channel.id, last = channel.last_message_id
    const t = setTimeout(() => {
      setReads(r => ({ ...r, [id]: last }))
      supabase.from('read_states').upsert({ user_id: userId, channel_id: id, last_read_id: last }).then()
    }, 600)
    return () => clearTimeout(t)
  }, [channel?.id, channel?.last_message_id, reads, visible, userId])

  const isUnread = useCallback(c => c.kind !== 'voice' && (c.last_message_id || 0) > (reads[c.id] ?? 0) &&
    !(c.id === channel?.id && visible), [reads, channel?.id, visible])
  const unreadServers = useMemo(() => new Set(channels.filter(c => c.server_id && isUnread(c)).map(c => c.server_id)), [channels, isUnread])
  const unreadDMs = dms.filter(isUnread).length

  useEffect(() => {
    const n = unreadDMs + unreadServers.size
    document.title = n ? `(${n}) Chitchat` : 'Chitchat'
  }, [unreadDMs, unreadServers.size])

  async function openDM(userIds) {
    const { data, error } = await supabase.rpc('open_dm', { user_ids: userIds })
    if (error) return toast(error.message)
    if (!channels.some(c => c.id === data)) await load()
    go(null, data)
  }

  if (!me || !servers) return <Splash />

  const ctx = { me, userId, server, role, go, openDM, setModal, load }

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}${server && showMembers ? ' with-members' : ''}`}>
      <nav className="rail" aria-label="Servers">
        <button className={`rail-btn home${!route.serverId ? ' active' : ''}`} onClick={() => go(null, dms[0]?.id)} title="Direct messages">
          <span>💬</span>{unreadDMs + incoming > 0 && <b className="badge">{unreadDMs + incoming}</b>}
        </button>
        <hr />
        {servers.map(s => (
          <button key={s.id} className={`rail-btn${s.id === route.serverId ? ' active' : ''}${unreadServers.has(s.id) ? ' unread' : ''}`}
            onClick={() => go(s.id)} title={s.name}>
            {s.icon_url ? <img src={s.icon_url} alt="" /> : <span>{s.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3)}</span>}
          </button>
        ))}
        <button className="rail-btn add" onClick={() => setModal({ type: 'createJoin' })} title="Create or join a server">＋</button>
      </nav>

      <Sidebar ctx={ctx} channels={server ? serverChannels : dms} current={channel} isUnread={isUnread}
        voice={voice} vstate={vstate} setVstate={setVstate} onLeaveVoice={() => joinVoice(null)} />

      <main className="main">
        {channel?.kind === 'voice'
          ? <VoiceStage channel={channel} meId={userId} joined={voice?.id === channel.id} onJoin={() => joinVoice(channel)}
            live={vstate.live} onLive={() => setVstate(v => ({ ...v, live: !v.live }))}
            cam={vstate.cam} onCam={() => setVstate(v => ({ ...v, cam: !v.cam }))} onMenu={() => setNavOpen(true)} />
          : channel
            ? <Chat key={channel.id} channel={channel} ctx={ctx} members={members} onMenu={() => setNavOpen(true)} />
            : !server && (servers.length > 0 || hasFriends)
              ? <FriendsHome ctx={ctx} onMenu={() => setNavOpen(true)} />
              : <Welcome ctx={ctx} onMenu={() => setNavOpen(true)} hasServers={servers.length > 0} />}
      </main>

      {server && showMembers && <Members members={members} ctx={ctx} />}

      {voice && <VoiceConnection key={voice.id} channel={voice} me={me} vstate={vstate} setVstate={setVstate}
        onError={msg => { toast(msg); joinVoice(null) }} />}

      <QuickSwitch servers={servers} channels={channels} go={go} />
      <ProfileCardHost ctx={ctx} members={members} />

      {modal?.type === 'createJoin' && <CreateJoinModal ctx={ctx} onClose={() => setModal(null)} joinInvite={joinInvite} />}
      {modal?.type === 'serverSettings' && server && <ServerSettingsModal ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === 'channel' && server && <ChannelModal ctx={ctx} members={members} channel={modal.channel} onClose={() => setModal(null)} />}
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
