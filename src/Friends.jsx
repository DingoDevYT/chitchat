import { useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, ensureProfiles, online, toast, profiles } from './lib/store'
import Avatar, { Name, CustomStatus } from './Avatar'
import { statusOf } from './lib/status'
import { openProfile } from './ProfileCard'
import { personMenu } from './menus'

// rows: { user_a (asker), user_b (asked), status }
export const friendships = createStore([])
let meId = null

async function reload() {
  const { data } = await supabase.from('friendships').select('user_a, user_b, status')
  if (!data) return
  ensureProfiles(data.flatMap(r => [r.user_a, r.user_b]))
  friendships.set(data)
}

export function startFriends(me) {
  meId = me
  reload()
  const ch = supabase.channel('friends')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, ({ eventType, new: row }) => {
      if (eventType === 'INSERT' && row.user_b === me) {
        ensureProfiles([row.user_a]).then(() => {
          const p = profiles.get()[row.user_a]
          toast(`👋 ${p?.display_name || p?.username || 'Someone'} sent you a friend request`)
        })
      }
      if (eventType === 'UPDATE' && row.user_a === me && row.status === 'accepted') {
        const p = profiles.get()[row.user_b]
        toast(`🎉 ${p?.display_name || p?.username || 'Someone'} accepted your friend request`)
      }
      reload()
    })
    .subscribe()
  return () => { supabase.removeChannel(ch); friendships.set([]) }
}

const other = r => (r.user_a === meId ? r.user_b : r.user_a)
export function friendStatus(id) {
  const r = friendships.get().find(r => other(r) === id)
  if (!r) return 'none'
  if (r.status === 'accepted') return 'friends'
  return r.user_a === meId ? 'outgoing' : 'incoming'
}
export const useIncomingCount = () => friendships.use(rows => rows.filter(r => r.status === 'pending' && r.user_b === meId).length)

export async function addFriend(username) {
  const { data, error } = await supabase.rpc('add_friend', { uname: username })
  if (error) { toast(error.message); return null }
  toast(data === 'accepted' ? "You're now friends! 🎉" : 'Friend request sent 💌')
  reload()
  return data
}
export async function acceptFriend(id) {
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('user_a', id).eq('user_b', meId)
  if (error) toast(error.message)
  reload()
}
export async function removeFriend(id, ask) {
  if (ask && !confirm(ask)) return
  const { error } = await supabase.from('friendships').delete().or(`and(user_a.eq.${id},user_b.eq.${meId}),and(user_a.eq.${meId},user_b.eq.${id})`)
  if (error) toast(error.message)
  reload()
}

function Row({ id, children }) {
  return (
    <div className="friend-row pop">
      <button className="friend-who" data-profile {...personMenu(id)} onClick={e => openProfile(id, e.currentTarget)}>
        <Avatar id={id} size={36} status />
        <span className="who"><span><Name id={id} /><span className="muted small"> @{profiles.get()[id]?.username}</span></span><CustomStatus id={id} /></span>
      </button>
      <div className="row">{children}</div>
    </div>
  )
}

export default function FriendsHome({ ctx, onMenu }) {
  const rows = friendships.use()
  const onlineMap = online.use()
  const incoming = rows.filter(r => r.status === 'pending' && r.user_b === meId)
  const [tab, setTab] = useState(incoming.length ? 'pending' : 'online')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const friends = rows.filter(r => r.status === 'accepted').map(other)
  const outgoing = rows.filter(r => r.status === 'pending' && r.user_a === meId)
  const shown = tab === 'online' ? friends.filter(id => statusOf(onlineMap[id]) !== 'offline') : friends

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    if (await addFriend(name)) setName('')
    setBusy(false)
  }

  const msg = id => <button className="icon-btn" title="Message" aria-label="Message" onClick={() => ctx.openDM([id])}>💬</button>

  return (
    <div className="friends">
      <header className="chat-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
        <h2>👯 Friends</h2>
        <div className="tabs friend-tabs">
          <button className={tab === 'online' ? 'on' : ''} onClick={() => setTab('online')}>Online</button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All</button>
          <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>
            Pending{incoming.length > 0 && <b className="badge inline">{incoming.length}</b>}</button>
          <button className={`add${tab === 'add' ? ' on' : ''}`} onClick={() => setTab('add')}>Add friend</button>
        </div>
      </header>

      <div className="friends-body">
        {tab === 'add' && (
          <form className="add-friend pop" onSubmit={submit}>
            <h3>Add a friend</h3>
            <p className="muted small">Type their Chitchat username. If they've already added you, you'll be friends straight away.</p>
            <div className="row nowrap">
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="username" aria-label="Username" />
              <button className="btn primary" disabled={busy || !name.trim()}>Send request</button>
            </div>
            <p className="muted small">Your username is <b>@{ctx.me.username}</b>. Share it so friends can add you.</p>
          </form>
        )}

        {tab === 'pending' && (
          <>
            {!incoming.length && !outgoing.length && <p className="muted pad">No pending requests.</p>}
            {incoming.length > 0 && <h4>Incoming: {incoming.length}</h4>}
            {incoming.map(r => (
              <Row key={r.user_a} id={r.user_a}>
                <button className="btn primary small" onClick={() => acceptFriend(r.user_a)}>Accept</button>
                <button className="btn ghost small" onClick={() => removeFriend(r.user_a)}>Ignore</button>
              </Row>
            ))}
            {outgoing.length > 0 && <h4>Sent: {outgoing.length}</h4>}
            {outgoing.map(r => (
              <Row key={r.user_b} id={r.user_b}>
                <span className="muted small">Waiting…</span>
                <button className="btn ghost small" onClick={() => removeFriend(r.user_b)}>Cancel</button>
              </Row>
            ))}
          </>
        )}

        {(tab === 'online' || tab === 'all') && (
          <>
            <h4>{tab === 'online' ? 'Online' : 'All friends'}: {shown.length}</h4>
            {!shown.length && (
              <div className="friends-empty pop">
                <p className="muted">{friends.length ? 'Nobody\'s online right now.' : 'No friends here yet.'}</p>
                {!friends.length && <button className="btn primary" onClick={() => setTab('add')}>Add your first friend</button>}
              </div>
            )}
            {shown.map(id => (
              <Row key={id} id={id}>
                {msg(id)}
                <button className="icon-btn" title="Remove friend" aria-label="Remove friend"
                  onClick={() => removeFriend(id, `Remove ${profiles.get()[id]?.username} as a friend?`)}>✕</button>
              </Row>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
