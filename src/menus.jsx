import { prefs, profiles, setPref, toast } from './lib/store'
import { ask, askText } from './Dialog'
import { openMenu } from './ContextMenu'
import { supabase } from './lib/supabase'
import { channelMuted, isMuted, muteValue, MUTE_FOR } from './lib/mute'
import { openProfile } from './ProfileCard'
import { acceptFriend, addFriend, friendStatus, removeFriend } from './Friends'
import { block, isBlocked, unblock } from './lib/blocks'
import { canKickNow } from './Roles'
import { ForwardIcon } from './icons'

// shortcut: Shell copies its ctx/members/channels here every render so menus opened deep in the tree
// (messages, stadium seats, friends) need no prop drilling. Move to a context if it ever needs to re-render things.
export const app = { ctx: null, members: [], channels: [] }

// Other features add their own items here: menuExtras.person.push((id, app) => [{ label: 'Block', onClick }]).
// Each fn returns an array (or nothing); its items are appended after a separator.
export const menuExtras = { person: [], message: [], channel: [], server: [], dm: [], stream: [] }
const extras = (kind, ...args) => {
  const list = menuExtras[kind].flatMap(f => f(...args, app) || [])
  return list.length ? [{ separator: true }, ...list] : []
}

export function copy(text, what = 'Copied') {
  navigator.clipboard.writeText(text).then(() => toast(`${what} ✨`), () => askText({ text: 'Copy this:', value: text, confirm: 'Done' }))
}
const flip = (key, id) => setPref(key, { ...prefs.get()[key], [id]: !prefs.get()[key]?.[id] || undefined })
const pct = v => `${Math.round(v * 100)}%`
const base = () => location.origin + location.pathname

// ── mutes ──
export const chanMuted = c => channelMuted(prefs.get().mutes, c)
export function setMute(id, minutes) {
  const m = { ...prefs.get().mutes }
  if (minutes === false) delete m[id]
  else m[id] = muteValue(minutes)
  setPref('mutes', m)
}
function muteItem(id, noun) {
  const v = prefs.get().mutes?.[id]
  if (isMuted(prefs.get().mutes, id)) return {
    label: `Unmute ${noun}`, icon: 'bell', onClick: () => setMute(id, false),
    hint: v === true ? '' : `until ${new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
  }
  return { label: `Mute ${noun}`, icon: 'bell-off', submenu: MUTE_FOR.map(([label, min]) => ({ label, onClick: () => setMute(id, min) })) }
}

// ── person ──
export function personItems(id, el) {
  const { ctx, members } = app
  if (!ctx || !id) return []
  const P = prefs.get(), p = profiles.get()[id], self = id === ctx.userId
  const role = members.find(m => m.user_id === id)?.role, my = ctx.role
  const fs = friendStatus(id)
  const name = p?.display_name || p?.username || 'them'
  async function setRole(r) {
    const { error } = await supabase.from('members').update({ role: r }).eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
  }
  async function kick() {
    if (!await ask({ text: `Remove ${name} from the server?`, confirm: 'Remove', danger: true })) return
    const { error } = await supabase.from('members').delete().eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
  }
  return [
    { label: 'Profile', icon: 'user', onClick: () => el?.isConnected && openProfile(id, el) },
    !self && { label: 'Message', icon: 'chat', onClick: () => ctx.openDM([id]) },
    !self && { separator: true },
    !self && { label: 'Call volume', icon: 'volume', slider: { value: P.peerVol[id] ?? 1, min: 0, max: 2, step: 0.05, format: pct,
      onChange: v => setPref('peerVol', { ...prefs.get().peerVol, [id]: v }) } },
    !self && { label: 'Mute in call', checked: !!P.callMuted?.[id], onClick: () => flip('callMuted', id) },
    !self && { label: 'Mute typing voice', checked: !!P.muted[id], onClick: () => flip('muted', id) },
    !self && { separator: true },
    !self && fs === 'none' && p && { label: 'Add friend', icon: 'user-plus', onClick: () => addFriend(p.username) },
    !self && fs === 'incoming' && { label: 'Accept friend request', icon: 'user-check', onClick: () => acceptFriend(id) },
    !self && fs === 'outgoing' && { label: 'Cancel friend request', icon: 'close', onClick: () => removeFriend(id) },
    !self && fs === 'friends' && { label: 'Remove friend', icon: 'user-minus', danger: true, onClick: () => removeFriend(id, `Remove ${p?.username} as a friend?`) },
    !self && (isBlocked(id)
      ? { label: 'Unblock', icon: 'heart', onClick: () => unblock(id) }
      : { label: 'Block', icon: 'block', danger: true, onClick: async () => await ask({ text: `Block ${name}? Their messages get hidden and any friendship ends.`, confirm: 'Block', danger: true }) && block(id) }),
    { separator: true },
    p && { label: 'Copy username', icon: 'copy', onClick: () => copy(p.username, 'Username copied') },
    { label: 'Copy user ID', icon: 'id', onClick: () => copy(id, 'User ID copied') },
    ctx.server && role && !self && my === 'owner' && role !== 'owner' && { separator: true },
    ctx.server && !self && my === 'owner' && role === 'member' && { label: 'Make admin', icon: 'star', onClick: () => setRole('admin') },
    ctx.server && !self && my === 'owner' && role === 'admin' && { label: 'Remove admin', icon: 'star-off', onClick: () => setRole('member') },
    // the database enforces rank (no kicking people above you); this just hides the item when it can't work
    canKickNow(ctx, id, role) &&
      { label: `Kick ${name}`, icon: 'door', danger: true, onClick: kick },
    ...extras('person', id),
  ]
}
// Spread onto anything that shows a person: <button {...personMenu(id)}>.
export const personMenu = id => ({ onContextMenu: e => openMenu(e, () => personItems(id, e.currentTarget)) })

// ── read state ──
const markRead = list => app.ctx?.markRead(list.filter(c => c.kind !== 'voice'))

// ── channel (sidebar) ──
const noun = c => c.kind === 'voice' ? 'stadium' : c.kind === 'gallery' ? 'gallery' : 'room'
export function channelItems(c) {
  const { ctx } = app
  const admin = ctx.can('manage_channels')
  async function destroy() {
    if (!await ask({ text: `Delete ${c.name} and all its messages?`, confirm: 'Delete', danger: true })) return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) return toast(error.message)
    ctx.load()
  }
  return [
    c.kind === 'voice' && { label: 'Join stadium', icon: 'stadium', onClick: () => { ctx.go(c.server_id, c.id); ctx.joinVoice?.(c) } },
    c.kind !== 'voice' && { label: 'Mark as read', icon: 'eye', onClick: () => markRead([c]) },
    c.kind !== 'voice' && muteItem(c.id, 'room'),
    { label: 'Copy link', icon: 'link', onClick: () => copy(`${base()}#/s/${c.server_id}/${c.id}`, 'Link copied') },
    admin && { separator: true },
    admin && { label: `Edit ${noun(c)}`, icon: 'settings', onClick: () => ctx.setModal({ type: 'channel', channel: c }) },
    admin && { label: `Delete ${noun(c)}`, icon: 'trash', danger: true, onClick: destroy },
    ...extras('channel', c),
  ]
}

// Any of these opens Server settings (roles, rules, invites, bans, audit log tabs).
export const SETTINGS_PERMS = ['manage_server', 'manage_roles', 'manage_invites', 'ban_members', 'view_audit_log']
// "Copy invite link": reuses your newest open-ended invite with a day or more left, else makes a 7-day one (create_invite).
export async function copyInvite(sid) {
  const { data, error } = await supabase.rpc('create_invite', { sid, reuse: true })
  if (error) return toast(error.message)
  copy(`${base()}#/invite/${data}`, 'Invite link copied')
}

// ── server icon in the rail ──
export function serverItems(s) {
  const { ctx, channels } = app
  const owner = s.owner_id === ctx.userId
  const here = s.id === ctx.server?.id
  const settings = owner || (here && SETTINGS_PERMS.some(ctx.can))
  const channelsPerm = owner || (here && ctx.can('manage_channels'))
  const open = type => { if (s.id !== ctx.server?.id) ctx.go(s.id); ctx.setModal({ type }) }
  async function leave() {
    if (!await ask({ text: `Leave ${s.name}?`, confirm: 'Leave', danger: true })) return
    const { error } = await supabase.from('members').delete().eq('server_id', s.id).eq('user_id', ctx.userId)
    if (error) return toast(error.message)
    await ctx.load()
    if (s.id === ctx.server?.id) ctx.go(null)
  }
  return [
    { label: 'Mark all as read', icon: 'eye', onClick: () => markRead(channels.filter(c => c.server_id === s.id)) },
    muteItem(s.id, 'server'),
    (owner || s.members_can_invite !== false || (here && ctx.can('manage_invites'))) &&
      { label: 'Copy invite link', icon: 'mail', onClick: () => copyInvite(s.id) },
    (settings || channelsPerm) && { separator: true },
    settings && { label: 'Server settings', icon: 'settings', onClick: () => open('serverSettings') },
    channelsPerm && { label: 'Create room', icon: 'plus', onClick: () => open('channel') },
    !owner && { separator: true },
    !owner && { label: 'Leave server', icon: 'door', danger: true, onClick: leave },
    ...extras('server', s),
  ]
}

// ── DM in the sidebar ──
export function dmItems(c, el) {
  const { ctx } = app
  const others = c.channel_members.map(m => m.user_id).filter(id => id !== ctx.userId)
  function close() {
    setPref('closedDMs', { ...prefs.get().closedDMs, [c.id]: c.last_message_id || 0 })
    markRead([c])
    if (location.hash.includes(c.id)) ctx.go(null)
  }
  return [
    { label: 'Mark as read', icon: 'eye', onClick: () => markRead([c]) },
    muteItem(c.id, 'conversation'),
    { label: 'Close DM', icon: 'close', onClick: close },
    ...extras('dm', c),
    ...(others.length === 1 ? [{ separator: true }, ...personItems(others[0], el)] : []),
  ]
}
// Closed DMs stay hidden until a newer message arrives.
export const dmHidden = (c, closed) => closed?.[c.id] != null && (c.last_message_id || 0) <= closed[c.id]

// ── stream on the stadium big screen / thumbnails ──
export function streamItems(id, { me, focused, focus, hide, video }) {
  const P = prefs.get()
  const full = () => (video?.requestFullscreen?.() ?? Promise.reject()).catch(() => video?.webkitEnterFullscreen?.() ?? toast("Couldn't go fullscreen."))
  return [
    !focused && { label: 'Focus this stream', icon: 'focus', onClick: focus },
    video && { label: 'Pop out to fullscreen', icon: 'fullscreen', onClick: full },
    !me && { separator: true },
    !me && { label: 'Stream volume', icon: 'volume', slider: { value: P.streamVol[id] ?? 1, min: 0, max: 2, step: 0.05, format: pct,
      onChange: v => setPref('streamVol', { ...prefs.get().streamVol, [id]: v }) } },
    !me && { label: 'Mute stream audio', checked: !!P.streamMuted[id], onClick: () => flip('streamMuted', id) },
    { separator: true },
    { label: 'Hide stream', icon: 'eye-off', onClick: hide },
    ...extras('stream', id),
  ]
}

// ── message ──
export function messageItems(m, { mine, canDelete, canPin, onReply, onEdit, onDelete, onReact, onPin, openPicker, quick }) {
  const { ctx } = app
  const link = `${base()}#/${ctx?.server ? 's/' + ctx.server.id : 'dm'}/${m.channel_id}/${m.id}`
  const speak = () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(m.content)) }
  return [
    { label: 'Add reaction', icon: 'smile', submenu: [
      ...quick.map(e => ({ label: e, onClick: () => onReact(m, e), hint: m.reactions?.some(r => r.emoji === e && r.user_id === ctx?.userId) ? 'remove' : '' })),
      { separator: true },
      { label: 'More reactions…', icon: 'plus', onClick: openPicker },
    ] },
    { label: 'Reply', icon: 'reply', onClick: () => onReply(m) },
    mine && m.content && !m.forward && { label: 'Edit message', icon: 'edit', onClick: () => onEdit(m) },
    // polls are the only messages with neither text nor files; they can't be forwarded (the DB says so too)
    (m.content || m.attachments?.length > 0) && { label: 'Forward', icon: <ForwardIcon size={16} />, onClick: () => ctx?.setModal({ type: 'forward', message: m }) },
    canPin && onPin && { label: m.pinned_at ? 'Unpin message' : 'Pin message', icon: 'pin', onClick: () => onPin(m) },
    { separator: true },
    m.content && { label: 'Copy text', icon: 'copy', onClick: () => copy(m.content, 'Text copied') },
    { label: 'Copy message link', icon: 'link', onClick: () => copy(link, 'Message link copied') },
    { label: 'Mark unread', icon: 'unread', onClick: () => ctx?.markUnread(m.channel_id, m.id - 1) },
    m.content && 'speechSynthesis' in window && { label: 'Speak message', icon: 'volume', onClick: speak },
    ...extras('message', m),
    (mine || canDelete) && { separator: true },
    (mine || canDelete) && { label: 'Delete message', icon: 'trash', danger: true, onClick: () => onDelete(m) },
  ]
}
