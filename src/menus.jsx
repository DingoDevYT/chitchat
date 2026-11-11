import { prefs, profiles, setPref, toast } from './lib/store'
import { openMenu } from './ContextMenu'
import { supabase } from './lib/supabase'
import { channelMuted, isMuted, muteValue, MUTE_FOR } from './lib/mute'
import { openProfile } from './ProfileCard'
import { acceptFriend, addFriend, friendStatus, removeFriend } from './Friends'
import { block, isBlocked, unblock } from './lib/blocks'
import { canKickNow } from './Roles'

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
  navigator.clipboard.writeText(text).then(() => toast(`${what} ✨`), () => prompt('Copy this:', text))
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
    label: `Unmute ${noun}`, icon: '🔔', onClick: () => setMute(id, false),
    hint: v === true ? '' : `until ${new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
  }
  return { label: `Mute ${noun}`, icon: '🔕', submenu: MUTE_FOR.map(([label, min]) => ({ label, onClick: () => setMute(id, min) })) }
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
    if (!confirm(`Remove ${name} from the server?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
  }
  return [
    { label: 'Profile', icon: '🪪', onClick: () => el?.isConnected && openProfile(id, el) },
    !self && { label: 'Message', icon: '💬', onClick: () => ctx.openDM([id]) },
    !self && { separator: true },
    !self && { label: 'Call volume', icon: '🔊', slider: { value: P.peerVol[id] ?? 1, min: 0, max: 2, step: 0.05, format: pct,
      onChange: v => setPref('peerVol', { ...prefs.get().peerVol, [id]: v }) } },
    !self && { label: 'Mute in call', checked: !!P.callMuted?.[id], onClick: () => flip('callMuted', id) },
    !self && { label: 'Mute typing voice', checked: !!P.muted[id], onClick: () => flip('muted', id) },
    !self && { separator: true },
    !self && fs === 'none' && p && { label: 'Add friend', icon: '👋', onClick: () => addFriend(p.username) },
    !self && fs === 'incoming' && { label: 'Accept friend request', icon: '🤝', onClick: () => acceptFriend(id) },
    !self && fs === 'outgoing' && { label: 'Cancel friend request', icon: '✕', onClick: () => removeFriend(id) },
    !self && fs === 'friends' && { label: 'Remove friend', icon: '💔', danger: true, onClick: () => removeFriend(id, `Remove ${p?.username} as a friend?`) },
    !self && (isBlocked(id)
      ? { label: 'Unblock', icon: '🤍', onClick: () => unblock(id) }
      : { label: 'Block', icon: '🚫', danger: true, onClick: () => confirm(`Block ${name}? Their messages get hidden and any friendship ends.`) && block(id) }),
    { separator: true },
    p && { label: 'Copy username', icon: '📋', onClick: () => copy(p.username, 'Username copied') },
    { label: 'Copy user ID', icon: '🆔', onClick: () => copy(id, 'User ID copied') },
    ctx.server && role && !self && my === 'owner' && role !== 'owner' && { separator: true },
    ctx.server && !self && my === 'owner' && role === 'member' && { label: 'Make admin', icon: '⭐', onClick: () => setRole('admin') },
    ctx.server && !self && my === 'owner' && role === 'admin' && { label: 'Remove admin', icon: '☆', onClick: () => setRole('member') },
    // the database enforces rank (no kicking people above you); this just hides the item when it can't work
    canKickNow(ctx, id, role) &&
      { label: `Kick ${name}`, icon: '🚪', danger: true, onClick: kick },
    ...extras('person', id),
  ]
}
// Spread onto anything that shows a person: <button {...personMenu(id)}>.
export const personMenu = id => ({ onContextMenu: e => openMenu(e, () => personItems(id, e.currentTarget)) })

// ── read state ──
const markRead = list => app.ctx?.markRead(list.filter(c => c.kind !== 'voice'))

// ── channel (sidebar) ──
export function channelItems(c) {
  const { ctx } = app
  const admin = ctx.can('manage_channels')
  async function destroy() {
    if (!confirm(`Delete #${c.name} and all its messages?`)) return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) return toast(error.message)
    ctx.load()
  }
  return [
    c.kind === 'voice' && { label: 'Join stadium', icon: '🏟️', onClick: () => { ctx.go(c.server_id, c.id); ctx.joinVoice?.(c) } },
    c.kind !== 'voice' && { label: 'Mark as read', icon: '👀', onClick: () => markRead([c]) },
    c.kind !== 'voice' && muteItem(c.id, 'channel'),
    { label: 'Copy link', icon: '🔗', onClick: () => copy(`${base()}#/s/${c.server_id}/${c.id}`, 'Link copied') },
    admin && { separator: true },
    admin && { label: 'Edit channel', icon: '⚙️', onClick: () => ctx.setModal({ type: 'channel', channel: c }) },
    admin && { label: 'Delete channel', icon: '🗑️', danger: true, onClick: destroy },
    ...extras('channel', c),
  ]
}

// ── server icon in the rail ──
export function serverItems(s) {
  const { ctx, channels } = app
  const owner = s.owner_id === ctx.userId
  const here = s.id === ctx.server?.id
  const settings = owner || (here && (ctx.can('manage_server') || ctx.can('manage_roles')))
  const channelsPerm = owner || (here && ctx.can('manage_channels'))
  const open = type => { if (s.id !== ctx.server?.id) ctx.go(s.id); ctx.setModal({ type }) }
  async function leave() {
    if (!confirm(`Leave ${s.name}?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', s.id).eq('user_id', ctx.userId)
    if (error) return toast(error.message)
    await ctx.load()
    if (s.id === ctx.server?.id) ctx.go(null)
  }
  return [
    { label: 'Mark all as read', icon: '👀', onClick: () => markRead(channels.filter(c => c.server_id === s.id)) },
    muteItem(s.id, 'server'),
    { label: 'Copy invite link', icon: '💌', onClick: () => copy(`${base()}#/invite/${s.invite_code}`, 'Invite link copied') },
    (settings || channelsPerm) && { separator: true },
    settings && { label: 'Server settings', icon: '⚙️', onClick: () => open('serverSettings') },
    channelsPerm && { label: 'Create channel', icon: '➕', onClick: () => open('channel') },
    !owner && { separator: true },
    !owner && { label: 'Leave server', icon: '🚪', danger: true, onClick: leave },
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
    { label: 'Mark as read', icon: '👀', onClick: () => markRead([c]) },
    muteItem(c.id, 'conversation'),
    { label: 'Close DM', icon: '✕', onClick: close },
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
    !focused && { label: 'Focus this stream', icon: '🎯', onClick: focus },
    video && { label: 'Pop out to fullscreen', icon: '⛶', onClick: full },
    !me && { separator: true },
    !me && { label: 'Stream volume', icon: '🔊', slider: { value: P.streamVol[id] ?? 1, min: 0, max: 2, step: 0.05, format: pct,
      onChange: v => setPref('streamVol', { ...prefs.get().streamVol, [id]: v }) } },
    !me && { label: 'Mute stream audio', checked: !!P.streamMuted[id], onClick: () => flip('streamMuted', id) },
    { separator: true },
    { label: 'Hide stream', icon: '🙈', onClick: hide },
    ...extras('stream', id),
  ]
}

// ── message ──
export function messageItems(m, { mine, canDelete, canPin, onReply, onEdit, onDelete, onReact, onPin, onThread, thread, openPicker, quick }) {
  const { ctx } = app
  const link = `${base()}#/${ctx?.server ? 's/' + ctx.server.id : 'dm'}/${m.channel_id}/${m.id}`
  const speak = () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(m.content)) }
  return [
    { label: 'Add reaction', icon: '😊', submenu: [
      ...quick.map(e => ({ label: e, onClick: () => onReact(m, e), hint: m.reactions?.some(r => r.emoji === e && r.user_id === ctx?.userId) ? 'remove' : '' })),
      { separator: true },
      { label: 'More reactions…', icon: '➕', onClick: openPicker },
    ] },
    { label: 'Reply', icon: '↩️', onClick: () => onReply(m) },
    onThread && { label: thread ? 'Open thread' : 'Start thread', icon: '🧵', onClick: () => onThread(m) },
    mine && { label: 'Edit message', icon: '✏️', onClick: () => onEdit(m) },
    canPin && onPin && { label: m.pinned_at ? 'Unpin message' : 'Pin message', icon: '📍', onClick: () => onPin(m) },
    { separator: true },
    m.content && { label: 'Copy text', icon: '📋', onClick: () => copy(m.content, 'Text copied') },
    { label: 'Copy message link', icon: '🔗', onClick: () => copy(link, 'Message link copied') },
    { label: 'Mark unread', icon: '🔵', onClick: () => ctx?.markUnread(m.channel_id, m.id - 1) },
    m.content && 'speechSynthesis' in window && { label: 'Speak message', icon: '🗣️', onClick: speak },
    ...extras('message', m),
    (mine || canDelete) && { separator: true },
    (mine || canDelete) && { label: 'Delete message', icon: '🗑️', danger: true, onClick: () => onDelete(m) },
  ]
}
