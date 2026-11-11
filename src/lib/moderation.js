// Pure moderation helpers. The database is the real gate (032_moderation.sql); these only shape the UI.

export const INVITE_AGES = [['30 minutes', 1800], ['1 hour', 3600], ['6 hours', 21600], ['12 hours', 43200], ['1 day', 86400], ['7 days', 604800], ['Never', 0]]
export const INVITE_USES = [['No limit', 0], ['1 use', 1], ['5 uses', 5], ['10 uses', 10], ['25 uses', 25], ['50 uses', 50], ['100 uses', 100]]
export const TIMEOUTS = [['60 seconds', 60], ['5 minutes', 300], ['10 minutes', 600], ['1 hour', 3600], ['1 day', 86400], ['1 week', 604800]]
export const BAN_PURGE = [["Don't delete any", 0], ['From the last hour', 3600], ['From the last 24 hours', 86400], ['From the last 7 days', 604800]]

const ms = v => (v ? Date.parse(v) : 0)

export const timedOut = (m, now = Date.now()) => ms(m?.timeout_until) > now

// Mirrors public.post_block(): 'timeout' | 'rules' | null. canManage = has manage_server there.
export function postBlock(server, m, canManage, now = Date.now()) {
  if (!server || !m) return null
  if (timedOut(m, now)) return 'timeout'
  if (server.screening_at && server.rules?.trim() && m.role !== 'owner' && !m.rules_agreed_at && !canManage
    && ms(m.joined_at) >= ms(server.screening_at)) return 'rules'
  return null
}

// Countdown text: "45s", "4m 05s", "2h 10m", "3d 4h".
export function leftText(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
// "just now", "5 minutes ago", "in 3 hours", "yesterday"
export function relTime(iso, now = Date.now()) {
  const diff = (ms(iso) - now) / 1000, a = Math.abs(diff)
  if (a < 45) return diff > 0 ? 'in a moment' : 'just now'
  const [unit, size] = a < 2700 ? ['minute', 60] : a < 79200 ? ['hour', 3600] : a < 2246400 ? ['day', 86400] : a < 28512000 ? ['month', 2592000] : ['year', 31536000]
  return rtf.format(Math.round(diff / size), unit)
}

export function inviteState(inv, now = Date.now()) {
  if (inv.expires_at && ms(inv.expires_at) <= now) return { live: false, label: 'Expired' }
  if (inv.max_uses && inv.uses >= inv.max_uses) return { live: false, label: 'Used up' }
  return { live: true, label: inv.expires_at ? `Expires ${relTime(inv.expires_at, now)}` : 'Never expires' }
}
export const usesText = inv => (inv.max_uses ? `${inv.uses} of ${inv.max_uses} uses` : `${inv.uses} use${inv.uses === 1 ? '' : 's'}`)

export const AUDIT_ACTIONS = [
  ['member_kick', 'Kicks'], ['member_ban', 'Bans'], ['member_unban', 'Bans lifted'], ['member_timeout', 'Timeouts'],
  ['member_timeout_remove', 'Timeouts ended'], ['member_nickname', 'Nicknames'], ['member_update', 'Admins'],
  ['member_role_add', 'Roles given'], ['member_role_remove', 'Roles taken'], ['role_create', 'Roles created'],
  ['role_update', 'Roles edited'], ['role_delete', 'Roles deleted'], ['channel_create', 'Rooms created'],
  ['channel_update', 'Rooms edited'], ['channel_delete', 'Rooms deleted'], ['invite_create', 'Invites created'],
  ['invite_delete', 'Invites revoked'], ['server_update', 'Server settings'], ['message_delete', 'Messages deleted'],
]

const FIELD = {
  icon_url: 'icon', icon_crop: 'icon', banner_url: 'banner', banner_crop: 'banner', accent: 'accent colour', motd: 'status line',
  members_can_invite: 'who can invite', screening_at: 'rules screening', slowmode_sec: 'slowmode', welcome: 'welcome text',
  background_url: 'background', background_dim: 'background', color: 'colour', hoist: 'separate listing', private: 'privacy',
}
export const fieldList = keys => [...new Set((keys || []).map(k => FIELD[k] || k.replace(/_/g, ' ')))].join(', ')
const DUR = Object.fromEntries(TIMEOUTS.map(([l, s]) => [s, l]))

// One readable line per audit entry (the actor's name is shown separately). name(id) -> display name.
export function describeAudit(e, name) {
  const d = e.details || {}, t = name(e.target_id), noun = d.kind === 'voice' ? 'stadium' : d.kind === 'gallery' ? 'gallery' : 'room'
  const what = d.changed?.length ? ` (${fieldList(d.changed)})` : ''
  switch (e.action) {
    case 'member_kick': return `kicked ${t}`
    case 'member_ban': return `banned ${t}${d.deleted ? ` and cleared ${d.deleted} message${d.deleted === 1 ? '' : 's'}` : ''}`
    case 'member_unban': return `lifted the ban on ${t}`
    case 'member_timeout': return `timed out ${t} for ${DUR[d.secs] || leftText((d.secs || 0) * 1000)}`
    case 'member_timeout_remove': return `ended ${t}'s timeout`
    case 'member_nickname': return d.nickname ? `changed ${t}'s nickname to “${d.nickname}”` : `cleared ${t}'s nickname`
    case 'member_update': return d.role === 'admin' ? `made ${t} an admin` : `removed admin from ${t}`
    case 'member_role_add': return `gave ${t} the ${d.role} role`
    case 'member_role_remove': return `took the ${d.role} role from ${t}`
    case 'role_create': return `created the ${d.name} role`
    case 'role_update': return d.from ? `renamed the ${d.from} role to ${d.name}` : `edited the ${d.name} role${what}`
    case 'role_delete': return `deleted the ${d.name} role`
    case 'channel_create': return `created the ${noun} ${d.name}`
    case 'channel_update': return d.from ? `renamed the ${noun} ${d.from} to ${d.name}` : `edited the ${noun} ${d.name}${what}`
    case 'channel_delete': return `deleted the ${noun} ${d.name}`
    case 'invite_create': return `created an invite link${d.ttl ? '' : ' that never expires'}`
    case 'invite_delete': return `revoked the invite ${d.code}`
    case 'server_update': return `changed server settings${what}`
    case 'message_delete': return `deleted a message by ${t}${d.room ? ` in ${d.room}` : ''}`
    case 'post_delete': return `deleted ${t}'s post${d.title ? ` “${d.title}”` : ''}${d.room ? ` in ${d.room}` : ''}`
    default: return e.action.replace(/_/g, ' ')
  }
}
