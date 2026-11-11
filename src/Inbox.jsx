import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, ensureProfiles, prefs, profiles, toast } from './lib/store'
import { previewText } from './lib/cues'
import { blocks } from './lib/blocks'
import { keyLabel } from './lib/voice'
import { app } from './menus'
import Avatar from './Avatar'
import Modal from './Modal'
import { MentionBadge } from './ChatCues'
import { dmTitle } from './Sidebar'
import './styles/notify.css'
import Icon from './icons/Icon'

// ── Chitchat doodle icons (brand rule: no emoji as UI icons) ──
export const InboxIcon = ({ size = 18 }) => <Icon name="inbox" size={size} className="nf-ico" />
export const BellIcon = ({ size = 18 }) => <Icon name="bell" size={size} className="nf-ico" />

export const inbox = createStore(false)     // inbox panel open?
export const shortcuts = createStore(false) // Ctrl+/ sheet open?

// Opens a message: rooms and DMs through their message link (Chat jumps to it), threads beside their room.
export function openMessage(c, id) {
  const ctx = app.ctx
  if (!c || !ctx) return
  if (c.kind === 'thread') {
    ctx.go(c.server_id, c.parent_channel_id)
    setTimeout(() => ctx.openThread(c.id), 120) // after Shell's "new room closes the thread" effect
    return
  }
  location.hash = c.server_id ? `#/s/${c.server_id}/${c.id}/${id}` : `#/dm/${c.id}/${id}`
}

export function InboxButton({ cards }) {
  const open = inbox.use()
  return <button className={`rail-btn inbox-btn${open ? ' active' : ''}`} onClick={() => inbox.set(o => !o)}
    title="Inbox" aria-label="Inbox" aria-expanded={open}>
    <span className="inbox-btn-ico"><InboxIcon size={22} /></span>{cards && <span className="pill-label">Inbox</span>}
  </button>
}

const KIND = { user: 'mentioned you', reply: 'replied to you', role: 'pinged your role', here: 'pinged @here', everyone: 'pinged @everyone' }
const when = iso => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function InboxPanel({ ctx, servers, isUnread }) {
  const [tab, setTab] = useState('you')
  const [rows, setRows] = useState(null)
  const pmap = profiles.use()
  const blocked = blocks.use()
  const close = () => inbox.set(false)
  const chan = id => ctx.channels.find(c => c.id === id)
  const where = c => {
    if (!c) return ''
    if (c.kind === 'dm') return c.name || dmTitle(c, ctx.userId, pmap)
    const s = servers.find(x => x.id === c.server_id)
    return `${c.name}${s ? ' · ' + s.name : ''}`
  }

  useEffect(() => {
    if (tab !== 'you') return
    let on = true
    supabase.from('message_pings').select('kind, message_id, messages!inner(id, channel_id, author_id, content, attachments, created_at)')
      .eq('user_id', ctx.userId).order('message_id', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!on) return
        if (error) { setRows([]); return toast('Could not load your inbox.') }
        ensureProfiles(data.map(r => r.messages.author_id))
        setRows(data)
      })
    return () => { on = false }
  }, [tab, ctx.userId])

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape' && !document.querySelector('.backdrop')) { e.stopPropagation(); close() } }
    addEventListener('keydown', esc, true)
    return () => removeEventListener('keydown', esc, true)
  }, [])

  const forYou = (rows || []).filter(r => chan(r.messages.channel_id) && !blocked[r.messages.author_id])
  const groups = useMemo(() => {
    const list = ctx.channels.filter(c => c.kind !== 'voice' && c.kind !== 'thread' && isUnread(c))
    const dms = list.filter(c => !c.server_id)
    return [
      ...(dms.length ? [{ id: 'dm', name: 'Direct messages', list: dms }] : []),
      ...servers.map(s => ({ id: s.id, name: s.name, list: list.filter(c => c.server_id === s.id) })).filter(g => g.list.length),
    ]
  }, [ctx.channels, servers, isUnread])
  const go = c => { ctx.go(c.server_id || null, c.id); close() }

  return <>
    <div className="inbox-scrim" onMouseDown={close} />
    <section className="inbox-panel pop" role="dialog" aria-label="Inbox">
      <header className="inbox-head">
        <InboxIcon /><h2>Inbox</h2>
        <div className="tabs small" role="tablist">
          {[['you', 'For you'], ['unreads', 'Unreads']].map(([k, l]) =>
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <button className="icon-btn" onClick={close} aria-label="Close inbox"><Icon name="close" /></button>
      </header>

      {tab === 'you' && <div className="inbox-body">
        {!rows && <p className="muted small pad">Loading…</p>}
        {rows && !forYou.length && <p className="inbox-empty muted">Nothing for you yet. Mentions and replies land here.</p>}
        {forYou.map(({ kind, messages: m }) => {
          const c = chan(m.channel_id), p = pmap[m.author_id]
          const unread = m.id > (ctx.reads[c.id] ?? 0)
          return <article key={m.id} className={`inbox-item${unread ? ' unread' : ''}`}>
            <Avatar id={m.author_id} size={36} />
            <div className="inbox-main">
              <div className="inbox-meta"><b>{p?.display_name || p?.username || '…'}</b> <span className="muted">{KIND[kind]}</span>
                <time className="muted small">{when(m.created_at)}</time></div>
              <div className="inbox-where muted small">{where(c)}</div>
              <div className="inbox-text">{previewText(m, 160) || '…'}</div>
            </div>
            <div className="inbox-acts">
              <button className="btn ghost small" onClick={() => { openMessage(c, m.id); close() }}>Jump</button>
              {unread && <button className="btn ghost small" onClick={() => ctx.markRead([c])}>Mark read</button>}
            </div>
          </article>
        })}
      </div>}

      {tab === 'unreads' && <div className="inbox-body">
        {!groups.length && <p className="inbox-empty muted">All caught up. Chit is proud of you.</p>}
        {groups.length > 0 && <div className="inbox-allread"><button className="btn ghost small" onClick={() => ctx.markRead(groups.flatMap(g => g.list))}>Mark all read</button></div>}
        {groups.map(g => <div key={g.id} className="inbox-group">
          <div className="inbox-group-head"><b>{g.name}</b><button className="link small" onClick={() => ctx.markRead(g.list)}>Mark read</button></div>
          {g.list.map(c => <button key={c.id} className={`inbox-room${ctx.quiet?.(c) ? ' quiet' : ''}`} onClick={() => go(c)}>
            <i className="unread-dot" aria-hidden="true" /><span className="inbox-room-name">{where(c).split(' · ')[0]}</span>
            <MentionBadge n={ctx.mentionOf?.(c)} />
          </button>)}
        </div>)}
      </div>}
      <footer className="inbox-foot muted small"><kbd>Esc</kbd> marks this room read · <kbd>Shift</kbd>+<kbd>Esc</kbd> marks everything read</footer>
    </section>
  </>
}

// ── Ctrl+/ cheat sheet. Mirrors the keydown handlers in Shell, Sidebar, Chat, QuickSwitch, Notify, Media, ImageCropper, Voice. ──
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = mac ? '⌘' : 'Ctrl'
function sections() {
  const P = prefs.get()
  return [
    ['Getting around', [
      [[MOD, 'K'], 'Jump to any room, stadium or DM'],
      [['Alt', '↑'], ['Alt', '↓'], 'Previous / next room'],
      [['Alt', 'Shift', '↑'], ['Alt', 'Shift', '↓'], 'Previous / next unread room'],
      [['Ctrl', 'Alt', '↑'], ['Ctrl', 'Alt', '↓'], 'Previous / next server'], // Shell checks ctrlKey, even on a Mac
      [[MOD, 'F'], 'Search messages in this room'],
      [[MOD, '/'], 'Show these shortcuts'],
    ]],
    ['Writing', [
      [['Enter'], 'Send'],
      [['Shift', 'Enter'], 'New line'],
      [['↑'], 'Edit your last message (empty box)'],
      [['Esc'], 'Cancel a reply or an edit'],
      [['@'], 'Mention someone (or a role, @everyone, @here)'],
      [[':'], 'Emoji'],
      [['~'], 'Link a room'],
      [['Tab'], 'Pick the highlighted suggestion (Enter works too)'],
    ]],
    ['Reading', [
      [['Esc'], 'Mark this room read'],
      [['Shift', 'Esc'], 'Mark everything read'],
      [['Shift', 'click'], 'Delete a message without asking (on its delete button)'],
      [['←'], ['→'], 'Previous / next picture in the viewer'],
    ]],
    ['Stadiums', [
      P.ptt ? [[keyLabel(P.pttKey)], 'Hold to talk (push-to-talk)'] : [['—'], 'Push-to-talk is off (Settings → Voice & video)'],
    ]],
  ]
}
const Keys = ({ k }) => <span className="keys">{k.map((x, i) => <kbd key={i}>{x}</kbd>)}</span>

export function ShortcutsModal() {
  return <Modal title="Keyboard shortcuts" onClose={() => shortcuts.set(false)} wide>
    <div className="shortcuts">
      {sections().map(([title, rows]) => <section key={title}>
        <h3>{title}</h3>
        {rows.map((r, i) => <div key={i} className="shortcut-row">
          <span className="shortcut-keys">{r.slice(0, -1).map((k, j) => <span key={j}>{j > 0 && <span className="muted"> / </span>}<Keys k={k} /></span>)}</span>
          <span className="shortcut-what">{r.at(-1)}</span>
        </div>)}
      </section>)}
    </div>
  </Modal>
}
