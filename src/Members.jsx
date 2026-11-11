import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, online, prefs, setPref, toast, useProfile } from './lib/store'
import Avatar, { Name } from './Avatar'

export function useMembers(serverId) {
  const [list, setList] = useState([])
  useEffect(() => {
    setList([])
    if (!serverId) return
    let alive = true
    const fetch = () => supabase.from('members').select('user_id, role').eq('server_id', serverId).then(({ data }) => {
      if (!alive || !data) return
      setList(data)
      ensureProfiles(data.map(m => m.user_id))
    })
    fetch()
    const ch = supabase.channel('members:' + serverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `server_id=eq.${serverId}` }, fetch)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, ({ old }) => old.server_id === serverId && fetch())
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [serverId])
  return list
}

const ROLE_BADGE = { owner: '👑', admin: '⭐' }

function ProfileCard({ id, role, ctx, onClose }) {
  const p = useProfile(id)
  const myRole = ctx.role
  const self = id === ctx.userId
  const muted = prefs.use(s => !!s.muted[id])

  async function setRole(r) {
    const { error } = await supabase.from('members').update({ role: r }).eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }
  async function kick() {
    if (!confirm(`Remove ${p?.display_name || p?.username} from the server?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }

  return (
    <div className="profile-card pop" onMouseLeave={onClose}>
      <div className="profile-banner" style={{ background: p?.color }} />
      <div className="profile-av"><Avatar id={id} size={72} status /></div>
      <h3><Name id={id} /> {ROLE_BADGE[role]}</h3>
      <div className="muted small">@{p?.username}</div>
      {p?.bio && <p className="bio">{p.bio}</p>}
      <div className="col">
        {!self && <button className="btn primary" onClick={() => { ctx.openDM([id]); onClose() }}>Message</button>}
        {!self && <button className="btn ghost" onClick={() => setPref('muted', { ...prefs.get().muted, [id]: !muted || undefined })}>
          {muted ? '🔊 Unmute their voice' : '🔇 Mute their voice'}</button>}
        {myRole === 'owner' && !self && role === 'member' && <button className="btn ghost" onClick={() => setRole('admin')}>Make admin</button>}
        {myRole === 'owner' && !self && role === 'admin' && <button className="btn ghost" onClick={() => setRole('member')}>Remove admin</button>}
        {!self && role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && role === 'member')) &&
          <button className="btn danger" onClick={kick}>Remove from server</button>}
      </div>
    </div>
  )
}

export default function Members({ members, ctx }) {
  const [open, setOpen] = useState(null)
  const onlineMap = online.use()
  const rank = { owner: 0, admin: 1, member: 2 }
  const sorted = [...members].sort((a, b) => rank[a.role] - rank[b.role])
  const groups = [
    ['Online', sorted.filter(m => onlineMap[m.user_id])],
    ['Offline', sorted.filter(m => !onlineMap[m.user_id])],
  ]
  return (
    <aside className="members" aria-label="Members">
      {groups.map(([label, list]) => list.length > 0 && (
        <section key={label}>
          <h4>{label} — {list.length}</h4>
          {list.map(m => (
            <div key={m.user_id} className="member-wrap">
              <button className={`member${label === 'Offline' ? ' offline' : ''}`} onClick={() => setOpen(open === m.user_id ? null : m.user_id)}>
                <Avatar id={m.user_id} size={32} status />
                <Name id={m.user_id} />
                <span className="role-badge">{ROLE_BADGE[m.role]}</span>
              </button>
              {open === m.user_id && <ProfileCard id={m.user_id} role={m.role} ctx={ctx} onClose={() => setOpen(null)} />}
            </div>
          ))}
        </section>
      ))}
    </aside>
  )
}
