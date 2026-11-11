import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, ensureProfiles, isDND, prefs, profiles, setPref, toast } from './lib/store'
import { blockedDM, channelMuted } from './lib/mute'
import { blocks, isBlocked } from './lib/blocks'
import { categories, setCategories } from './lib/categories'
import { previewText } from './lib/cues'
import { playChime } from './lib/voicecues'
import { LEVELS, defaultLevel, effectiveLevel, levelLabel, pingCounts, shouldNotify } from './lib/notify'
import { app, menuExtras } from './menus'
import { dmTitle } from './Sidebar'
import Modal from './Modal'
import { BellIcon, InboxPanel, ShortcutsModal, inbox, openMessage, shortcuts } from './Inbox'
import './styles/notify.css'

// ── your notification levels (notify_settings rows by target id) and member counts per server, synced live ──
export const notifyStore = createStore({ settings: {}, sizes: {}, modal: null })
let me = null

const parentIn = list => id => list.find(c => c.id === id)
export const levelOf = (c, s = notifyStore.get(), list = app.channels) => effectiveLevel(s.settings, c, s.sizes, parentIn(list))
// Shell: is this room/DM on "Nothing"? (dim dot, no badge, not in the tab title)
// (a new function whenever your settings change, so Shell also refetches mention_counts, which reads the suppress switches)
export function useQuiet(channels) {
  const settings = notifyStore.use(s => s.settings), sizes = notifyStore.use(s => s.sizes)
  return useCallback(c => levelOf(c, { settings, sizes }, channels) === 'none', [settings, sizes, channels])
}

const put = row => notifyStore.set(s => {
  const settings = { ...s.settings }
  if (row.level || row.suppress_everyone || row.suppress_roles) settings[row.target_id] = row
  else delete settings[row.target_id]
  return { ...s, settings }
})

// Optimistic; a row left with nothing set is deleted rather than stored.
export async function setNotify(target_id, patch) {
  const prev = notifyStore.get().settings[target_id]
  const row = { level: null, suppress_everyone: false, suppress_roles: false, ...prev, ...patch, target_id, user_id: me }
  put(row)
  const empty = !row.level && !row.suppress_everyone && !row.suppress_roles
  const { error } = empty
    ? await supabase.from('notify_settings').delete().eq('user_id', me).eq('target_id', target_id)
    : await supabase.from('notify_settings').upsert({ user_id: me, target_id, level: row.level, suppress_everyone: row.suppress_everyone, suppress_roles: row.suppress_roles })
  if (error) { put(prev || { target_id }); toast(error.message) }
}

function startSync(userId) {
  me = userId
  const load = () => supabase.from('notify_settings').select('target_id, level, suppress_everyone, suppress_roles').then(({ data }) => {
    if (data) notifyStore.set(s => ({ ...s, settings: Object.fromEntries(data.map(r => [r.target_id, r])) }))
  })
  load()
  const ch = supabase.channel('notify:' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notify_settings', filter: `user_id=eq.${userId}` }, ({ new: r }) => put(r))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notify_settings', filter: `user_id=eq.${userId}` }, ({ new: r }) => put(r))
    // DELETE events can't be filtered and only carry the key
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notify_settings' }, ({ old }) => old.user_id === userId && put({ target_id: old.target_id }))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

async function loadSizes() {
  const { data } = await supabase.from('members').select('server_id')
  if (!data) return
  const sizes = {}
  for (const r of data) sizes[r.server_id] = (sizes[r.server_id] || 0) + 1
  notifyStore.set(s => ({ ...s, sizes }))
}

export const openNotifyModal = serverId => notifyStore.set(s => ({ ...s, modal: serverId }))

// ── right-click menus: Notifications submenu on servers, rooms and DMs ──
const levelItems = (id, cur, inherited) => [
  { label: `Default (${levelLabel(inherited)})`, checked: !cur, onClick: () => setNotify(id, { level: null }) },
  { separator: true },
  ...LEVELS.map(([l, label]) => ({ label, checked: cur === l, onClick: () => setNotify(id, { level: l }) })),
]
// replaces our own earlier entry, so a hot reload of this file doesn't add a second Notifications item
function register(kind, f) {
  const list = menuExtras[kind], i = list.findIndex(x => x.notify)
  f.notify = true
  if (i >= 0) list.splice(i, 1, f)
  else list.push(f)
}
register('server', s => {
  const { settings, sizes } = notifyStore.get(), row = settings[s.id] || {}
  return [{ label: 'Notifications', icon: <BellIcon size={15} />, submenu: [
    ...levelItems(s.id, row.level, defaultLevel({ server_id: s.id }, sizes)),
    { separator: true },
    { label: 'Suppress @everyone and @here', checked: !!row.suppress_everyone, onClick: () => setNotify(s.id, { suppress_everyone: !row.suppress_everyone }) },
    { label: 'Suppress role mentions', checked: !!row.suppress_roles, onClick: () => setNotify(s.id, { suppress_roles: !row.suppress_roles }) },
    { separator: true },
    { label: 'Notification settings…', onClick: () => openNotifyModal(s.id) },
  ] }]
})
register('channel', c => {
  if (c.kind === 'voice') return
  const s = notifyStore.get()
  return [{ label: 'Notifications', icon: <BellIcon size={15} />,
    submenu: levelItems(c.id, s.settings[c.id]?.level, effectiveLevel(s.settings, c, s.sizes, parentIn(app.channels), true)) }]
})
register('dm', c => [{ label: 'Notifications', icon: <BellIcon size={15} />, submenu: levelItems(c.id, notifyStore.get().settings[c.id]?.level, 'all') }])

// ── per-server modal: server level, suppress switches, category and room overrides ──
function NotifyModal({ serverId, servers }) {
  const { settings, sizes } = notifyStore.use()
  const cats = categories.use(s => s[serverId])
  useEffect(() => {
    if (!cats) supabase.from('categories').select('*').eq('server_id', serverId).then(({ data }) => data && setCategories(serverId, () => data))
  }, [serverId, cats])
  const server = servers.find(s => s.id === serverId)
  const close = useCallback(() => openNotifyModal(null), [])
  if (!server) return null
  const row = settings[serverId] || {}
  const rooms = app.channels.filter(c => c.server_id === serverId && c.kind === 'text').sort((a, b) => a.position - b.position)
  const serverLevel = row.level || defaultLevel({ server_id: serverId }, sizes)
  const pick = (target, inherited) => (
    <select value={settings[target]?.level || ''} onChange={e => setNotify(target, { level: e.target.value || null })} aria-label="Notification level">
      <option value="">Default ({levelLabel(inherited)})</option>
      {LEVELS.map(([l, label]) => <option key={l} value={l}>{label}</option>)}
    </select>
  )
  return (
    <Modal title={`Notifications · ${server.name}`} onClose={close}>
      <div className="col notify-modal">
        <div>Server
          <div className="tabs small" role="radiogroup" aria-label="Server notification level">
            {LEVELS.map(([l, label]) => <button key={l} role="radio" aria-checked={serverLevel === l} className={serverLevel === l ? 'on' : ''}
              onClick={() => setNotify(serverId, { level: l })}>{label}</button>)}
          </div>
          <span className="muted small">{row.level
            ? <>Default here is {levelLabel(defaultLevel({ server_id: serverId }, sizes))}. <button className="link" onClick={() => setNotify(serverId, { level: null })}>Use default</button></>
            : `Default: servers with more than 15 members only notify you for @mentions.`}</span>
        </div>
        <label className="toggle"><input type="checkbox" checked={!!row.suppress_everyone} onChange={e => setNotify(serverId, { suppress_everyone: e.target.checked })} />
          <span>Suppress @everyone and @here</span></label>
        <label className="toggle"><input type="checkbox" checked={!!row.suppress_roles} onChange={e => setNotify(serverId, { suppress_roles: e.target.checked })} />
          <span>Suppress role mentions</span></label>
        <div className="notify-overrides">
          <b>Categories and rooms</b>
          {(cats || []).map(k => <div key={k.id} className="notify-row"><span className="notify-row-name">{k.name} <span className="muted small">category</span></span>{pick(k.id, serverLevel)}</div>)}
          {rooms.map(c => <div key={c.id} className="notify-row"><span className="notify-row-name">{c.name}</span>
            {pick(c.id, effectiveLevel(settings, c, sizes, undefined, true))}</div>)}
          {!rooms.length && <p className="muted small">No rooms yet.</p>}
        </div>
        <p className="muted small">"Nothing" keeps a room's unread dot dim and out of your badges. Mutes still win over everything here.</p>
      </div>
    </Modal>
  )
}

// ── Settings → Notifications ──
let actx = null
function chime() {
  try { actx ||= new AudioContext(); actx.resume?.(); playChime(actx, actx.destination, 'join', 0.035) } catch {}
}

export function NotificationsTab() {
  const p = prefs.use()
  const [perm, setPerm] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  async function enable() {
    const r = await Notification.requestPermission() // only ever asked from this click
    setPerm(r)
    if (r === 'granted') setPref('notifyDesktop', true)
  }
  const server = app.ctx?.server
  return (
    <div className="col notify-tab">
      {perm === 'unsupported' ? <p className="muted">This browser can't show desktop notifications.</p>
        : perm === 'granted' ? <label className="toggle"><input type="checkbox" checked={!!p.notifyDesktop} onChange={e => setPref('notifyDesktop', e.target.checked)} />
          <span>Desktop notifications</span></label>
        : perm === 'denied' ? <p className="muted">Notifications are blocked for Chitchat in your browser's site settings.</p>
        : <div><button className="btn primary" onClick={enable}><BellIcon size={16} /> Enable desktop notifications</button></div>}
      <p className="muted small">For DMs, @mentions and replies (or every message where you've picked All messages) while Chitchat is in the background
        or you're in another room. Nothing while you're on Do Not Disturb, and nothing from muted rooms or people you've blocked.</p>
      <div className="row">
        <label className="toggle" style={{ flex: 1 }}><input type="checkbox" checked={!!p.notifySound} onChange={e => setPref('notifySound', e.target.checked)} />
          <span>Play a quiet sound</span></label>
        <button className="btn ghost small" onClick={chime}>Test sound</button>
      </div>
      <p className="muted small">Per server, room or DM: right-click it and choose Notifications.{' '}
        {server && <button className="link" onClick={() => { app.ctx.setModal(null); openNotifyModal(server.id) }}>Notification settings for {server.name}</button>}</p>
    </div>
  )
}

// ── desktop notifications: Shell's channels move last_message_id; look at the new message and decide ──
async function consider(c, here) {
  const userId = app.ctx?.userId, P = prefs.get()
  const level = levelOf(c)
  if (here || level === 'none' || isDND() || channelMuted(P.mutes, c) || blockedDM(blocks.get(), c, userId)) return
  const { data: m } = await supabase.from('messages').select('id, channel_id, author_id, content, attachments, created_at, message_pings(kind)')
    .eq('id', c.last_message_id).maybeSingle()
  if (!m) return
  const kind = m.message_pings?.[0]?.kind
  const ok = shouldNotify({ level, pinged: pingCounts(kind, notifyStore.get().settings[c.server_id]), mine: m.author_id === userId,
    dnd: isDND(), muted: channelMuted(prefs.get().mutes, c), blocked: isBlocked(m.author_id), ageMs: Date.now() - Date.parse(m.created_at) })
  if (!ok) return
  if (P.notifySound) chime()
  if (!P.notifyDesktop || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  await ensureProfiles([m.author_id])
  const a = profiles.get()[m.author_id], name = a?.display_name || a?.username || 'Someone'
  const room = c.kind === 'dm' ? (c.name || (c.channel_members?.length > 2 ? dmTitle(c, userId, profiles.get()) : '')) : c.name
  const srv = c.server_id && notifyStore.get().servers?.find(s => s.id === c.server_id)?.name
  const icon = /^https?:/.test(a?.avatar_idle || '') ? a.avatar_idle : document.querySelector('link[rel=icon]')?.href
  const n = new Notification(room ? `${name} · ${room}${srv ? ` (${srv})` : ''}` : name, {
    body: previewText(m, 140) || 'Sent something', icon, tag: c.id, silent: true, // our own optional sound, never the system one
  })
  n.onclick = () => { window.focus(); n.close(); openMessage(c, m.id) }
}

// Mounted once by Shell: sync, notifications, the notification modal, inbox, shortcut sheet and Esc / Shift+Esc / Ctrl+/.
export default function NotifyHost({ ctx, servers, isUnread, visible, current }) {
  const modal = notifyStore.use(s => s.modal)
  const inboxOpen = inbox.use(), sheet = shortcuts.use()
  const live = useRef({})
  live.current = { ctx, visible, current }

  useEffect(() => startSync(ctx.userId), [ctx.userId])
  const serverKey = servers.map(s => s.id).join()
  useEffect(() => { loadSizes() }, [serverKey])
  useEffect(() => { notifyStore.set(s => ({ ...s, servers })) }, [servers])

  const prev = useRef(null)
  useEffect(() => {
    const before = prev.current
    prev.current = new Map(ctx.channels.map(c => [c.id, c.last_message_id || 0]))
    const P = prefs.get()
    if (!before || (!P.notifyDesktop && !P.notifySound)) return
    for (const c of ctx.channels) {
      // a channel we didn't have before only counts if it's a DM (someone just messaged you); joined servers bring old history
      const was = before.get(c.id) ?? (c.kind === 'dm' ? 0 : Infinity)
      if (c.kind === 'voice' || !((c.last_message_id || 0) > was)) continue
      consider(c, c.id === current?.id && visible).catch(() => {})
    }
  }, [ctx.channels]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === '/' || e.code === 'Slash')) { e.preventDefault(); shortcuts.set(o => !o); return }
      if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || inbox.get()) return
      // capture phase: anything Esc is about to close (dialogs, menus, pickers) still exists, so leave it alone
      if (document.querySelector('.backdrop, .ctx-menu, .emoji-picker, .lightbox')) return
      const { ctx, current } = live.current
      if (e.shiftKey) {
        ctx.markRead(ctx.channels.filter(c => c.kind !== 'voice'))
        toast('All caught up')
      } else if (current && current.kind !== 'voice') ctx.markRead([current])
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [])

  return <>
    {modal && <NotifyModal serverId={modal} servers={servers} />}
    {inboxOpen && <InboxPanel ctx={ctx} servers={servers} isUnread={isUnread} />}
    {sheet && <ShortcutsModal />}
  </>
}
