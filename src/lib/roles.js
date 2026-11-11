// Pure role logic. Mirrors public.has_perm / can_set_role in 015_custom_roles.sql (RLS is the real gate; this only hides UI).
// data = { roles: [...] highest first, byUser: { userId: [roleId] } }; legacy = members.role ('owner' | 'admin' | 'member').

export const PERMS = [
  ['manage_server', 'Manage server', 'Rename the server, change its icon and manage its emoji.'],
  ['manage_channels', 'Manage channels', 'Create, edit and delete channels, and see every private one.'],
  ['manage_roles', 'Manage roles', 'Create and edit roles below their own, and hand them out.'],
  ['kick_members', 'Kick members', 'Remove regular members ranked below them.'],
  ['manage_messages', 'Manage messages', "Delete other people's messages."],
  ['pin_messages', 'Pin messages', 'Pin and unpin messages in channels.'],
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
