import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ensureProfiles, online } from './lib/store'
import { openProfile, ROLE_BADGE } from './ProfileCard'
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

export default function Members({ members, ctx }) {
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
            <button key={m.user_id} data-profile className={`member${label === 'Offline' ? ' offline' : ''}`}
              onClick={e => openProfile(m.user_id, e.currentTarget)}>
              <Avatar id={m.user_id} size={32} status />
              <Name id={m.user_id} />
              <span className="role-badge">{ROLE_BADGE[m.role]}</span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  )
}
