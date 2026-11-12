import { useEffect, useState } from 'react'
import { freshChannel, supabase } from './lib/supabase'
import { ensureProfiles, nicknames, online } from './lib/store'
import { TimeoutBadge } from './Moderation'
import { openProfile, ROLE_BADGE } from './ProfileCard'
import Avatar, { Name, CustomStatus } from './Avatar'
import { InStadium, LiveTag } from './VoiceCues'
import { statusOf } from './lib/status'
import { personMenu } from './menus'
import { useMemberRoles } from './Roles'
import { groupMembers } from './lib/roles'

// Members of another server (or not loaded yet): never shown under this one, and Members draws a skeleton instead of a blank.
export const LOADING_MEMBERS = Object.freeze([])

export function useMembers(serverId) {
  const [list, setList] = useState({ sid: null, data: [] })
  useEffect(() => {
    nicknames.set({ sid: serverId || null, map: {} })
    if (!serverId) return
    let alive = true
    const fetch = () => supabase.from('members').select('user_id, role, nickname, timeout_until, joined_at, rules_agreed_at').eq('server_id', serverId).then(({ data }) => {
      if (!alive) return
      if (!data) return setList(l => l.sid === serverId ? l : { sid: serverId, data: [] }) // failed: empty, not a skeleton forever
      setList({ sid: serverId, data })
      nicknames.set({ sid: serverId, map: Object.fromEntries(data.filter(m => m.nickname).map(m => [m.user_id, m.nickname])) })
      ensureProfiles(data.map(m => m.user_id))
    })
    fetch()
    const ch = freshChannel('members:' + serverId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `server_id=eq.${serverId}` }, fetch)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, ({ old }) => old.server_id === serverId && fetch())
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [serverId])
  return !serverId ? NO_MEMBERS : list.sid === serverId ? list.data : LOADING_MEMBERS
}
const NO_MEMBERS = Object.freeze([])

export default function Members({ members, ctx }) {
  const onlineMap = online.use()
  const rank = { owner: 0, admin: 1, member: 2 }
  const sorted = [...members].sort((a, b) => rank[a.role] - rank[b.role])
  const sid = ctx.server?.id
  const groups = groupMembers(sorted, useMemberRoles(sid), id => statusOf(onlineMap[id]) !== 'offline')
  return (
    <aside className="members" aria-label="Members" aria-busy={members === LOADING_MEMBERS}>
      {members === LOADING_MEMBERS && <div className="loading-msgs">{[0, 1, 2].map(i => <div key={i} className="skeleton" />)}</div>}
      {groups.map(({ key, label, color, list }) => (
        <section key={key}>
          <h4 style={color ? { color } : undefined}>{label} — {list.length}</h4>
          {list.map(m => (
            <button key={m.user_id} data-profile {...personMenu(m.user_id)} className={`member${key === 'offline' ? ' offline' : ''}`}
              onClick={e => openProfile(m.user_id, e.currentTarget)}>
              <Avatar id={m.user_id} size={32} status />
              <span className="who"><Name id={m.user_id} serverId={sid} /><CustomStatus id={m.user_id} /><InStadium id={m.user_id} ctx={ctx} /></span>
              <LiveTag id={m.user_id} />
              <TimeoutBadge m={m} ctx={ctx} />
              <span className="role-badge">{ROLE_BADGE[m.role]}</span>
            </button>
          ))}
        </section>
      ))}
    </aside>
  )
}
