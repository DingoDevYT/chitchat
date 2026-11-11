// Pure role logic. Mirrors public.has_perm / can_set_role in 015_custom_roles.sql (RLS is the real gate; this only hides UI).
// data = { roles: [...] highest first, byUser: { userId: [roleId] } }; legacy = members.role ('owner' | 'admin' | 'member').

export const PERMS = [
  ['manage_server', 'Manage server', 'Rename the server, change its icon, rules and emoji.'],
  ['view_audit_log', 'View audit log', 'See who changed settings and who moderated whom.'],
  ['manage_channels', 'Manage rooms', 'Create, edit and delete rooms and stadiums, and see every private one.'],
  ['manage_roles', 'Manage roles', 'Create and edit roles below their own, and hand them out.'],
  ['manage_invites', 'Manage invites', "Make invite links even when members can't, and see or revoke everyone's."],
  ['kick_members', 'Kick members', 'Remove regular members ranked below them.'],
  ['ban_members', 'Ban members', "Remove members ranked below them for good (they can't rejoin), and lift bans."],
  ['timeout_members', 'Time out members', 'Pause members ranked below them from posting, reacting and joining stadiums for a while.'],
  ['manage_nicknames', 'Manage nicknames', "Change the server nicknames of members ranked below them."],
  ['manage_messages', 'Manage messages', "Delete other people's messages."],
  ['pin_messages', 'Pin messages', 'Pin and unpin messages in rooms.'],
  ['mention_everyone', 'Mention @everyone', 'Ping the whole server at once.'],
]

export const sortRoles = roles => [...roles].sort((a, b) => b.position - a.position || (a.created_at < b.created_at ? -1 : 1))

export function userRoles(data, uid) {
  const ids = data?.byUser[uid]
  return ids ? data.roles.filter(r => ids.includes(r.id)) : []
}

export const topColor = (data, uid) => userRoles(data, uid).find(r => r.color)?.color

export function myPerms(data, legacy, uid) {
  if (legacy === 'owner' || legacy === 'admin') return PERMS.map(p => p[0])
  return [...new Set(userRoles(data, uid).flatMap(r => r.permissions))]
}

export const hasPerm = (data, legacy, uid, perm) => myPerms(data, legacy, uid).includes(perm)

export function rank(data, legacy, uid) {
  if (legacy === 'owner') return Infinity
  const top = userRoles(data, uid)[0]
  return top ? top.position : -Infinity
}

// Mirrors the "leave or kick" policy and public.can_moderate(): owner acts on anyone; admins and role holders only on
// plain members, role holders only on those ranked below them. A non-member (targetRole undefined) counts as a plain member.
export function canModerate(data, myRole, me, uid, targetRole, perm) {
  if (!myRole || !uid || uid === me || targetRole === 'owner') return false
  if (myRole === 'owner') return true
  return (targetRole || 'member') === 'member' && hasPerm(data, myRole, me, perm)
    && (myRole === 'admin' || rank(data, 'member', uid) < rank(data, myRole, me))
}
export const canKick = (data, myRole, me, uid, targetRole) => !!targetRole && canModerate(data, myRole, me, uid, targetRole, 'kick_members')

export function canSetRole(data, legacy, uid, role) {
  if (legacy === 'owner') return true
  const mine = myPerms(data, legacy, uid)
  return mine.includes('manage_roles') && role.position < rank(data, legacy, uid) && role.permissions.every(p => mine.includes(p))
}

// Member list sections: online members under their highest hoisted role, then Online, then Offline.
export function groupMembers(members, data, isOnline) {
  const hoisted = (data?.roles || []).filter(r => r.hoist)
  const sections = hoisted.map(r => ({ key: r.id, label: r.name, color: r.color, list: [] }))
  const on = { key: 'online', label: 'Online', list: [] }, off = { key: 'offline', label: 'Offline', list: [] }
  for (const m of members) {
    if (!isOnline(m.user_id)) { off.list.push(m); continue }
    const ids = data?.byUser[m.user_id] || []
    const i = hoisted.findIndex(r => ids.includes(r.id))
    ;(i >= 0 ? sections[i] : on).list.push(m)
  }
  return [...sections, on, off].filter(s => s.list.length)
}
