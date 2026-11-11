import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore, online, profiles, useProfile } from './lib/store'
import { statusOf } from './lib/status'
import { lastSeenText, previewText, shouldMarkSeen } from './lib/cues'
import Avatar from './Avatar'
import { dmTitle } from './Sidebar'
import './styles/chat-cues.css'

// ── connection: navigator online/offline + the realtime socket + Shell's channel status ──
// epoch bumps each time we come back, so Shell and the open Chat refetch what they may have missed.
export const conn = createStore({ down: false, back: false, epoch: 0 })
let chanBad = false, seenSocket = false, backTimer = 0

function evaluate() {
  const sock = supabase.realtime.isConnected()
  if (sock) seenSocket = true
  const down = !navigator.onLine || chanBad || (seenSocket && !sock)
  const cur = conn.get()
  if (down === cur.down) return
  clearTimeout(backTimer)
  if (down) return conn.set({ ...cur, down: true, back: false })
  conn.set({ down: false, back: true, epoch: cur.epoch + 1 })
  backTimer = setTimeout(() => conn.set(s => ({ ...s, back: false })), 2500)
}
// Pass as a channel's .subscribe() callback.
export function reportRealtime(status) {
  if (status === 'SUBSCRIBED') chanBad = false
  else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') chanBad = true
  evaluate()
}
export function startConnWatch() {
  addEventListener('online', evaluate)
  addEventListener('offline', evaluate)
  const t = setInterval(evaluate, 2000) // shortcut: polls socket state (realtime-js has no public close event); cheap
  return () => { removeEventListener('online', evaluate); removeEventListener('offline', evaluate); clearInterval(t) }
}

export function ConnBanner() {
  const { down, back } = conn.use()
  if (!down && !back) return null
  return <div className={`conn-banner${down ? '' : ' ok'}`} role="status" aria-live="polite">
    {down ? <><span className="conn-spin" aria-hidden="true" />Reconnecting…</> : 'Back online ✨'}
  </div>
}

// ── last seen: profiles.last_seen_at, at most every 5 minutes and on pagehide, never while invisible ──
export function startLastSeen(userId) {
  let last = 0, token = null
  const url = `${supabase.supabaseUrl}/rest/v1/profiles?id=eq.${userId}`
  const write = async force => {
    const status = profiles.get()[userId]?.status
    if (!status || !shouldMarkSeen(status, last, Date.now(), force)) return
    last = Date.now()
    const body = { last_seen_at: new Date().toISOString() }
    if (force && token) {
      // keepalive lets the request outlive the page
      fetch(url, { method: 'PATCH', keepalive: true, body: JSON.stringify(body),
        headers: { apikey: supabase.supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }).catch(() => {})
      return
    }
    token = (await supabase.auth.getSession()).data.session?.access_token || null
    supabase.from('profiles').update(body).eq('id', userId).then()
  }
  const t0 = setTimeout(write, 3000) // after the profile has loaded
  const t = setInterval(write, 60000)
  const hide = () => write(true)
  addEventListener('pagehide', hide)
  return () => { clearTimeout(t0); clearInterval(t); removeEventListener('pagehide', hide) }
}

// "last seen 2h ago" for someone who looks offline; re-renders every minute.
export function LastSeen({ id, className = '' }) {
  const p = useProfile(id)
  const off = online.use(s => statusOf(s[id]) === 'offline')
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t) }, [])
  const text = off && lastSeenText(p?.last_seen_at)
  return text ? <span className={`last-seen muted small ${className}`}>{text}</span> : null
}

export const MentionBadge = ({ n, className = '' }) => n > 0
  ? <b className={`mention-badge ${className}`} aria-label={`${n} mention${n === 1 ? '' : 's'}`}>{n > 99 ? '99+' : n}</b> : null

// ── unread DM cards in the rail ──
const previews = new Map() // message id -> row
export function DMCards({ list, cards, userId, go }) {
  const [, bump] = useState(0)
  const ids = list.map(x => x.c.last_message_id).filter(id => id && !previews.has(id))
  const key = ids.join()
  useEffect(() => {
    if (!key) return
    supabase.from('messages').select('id, channel_id, author_id, content, attachments').in('id', ids).then(({ data }) => {
      for (const m of data || []) previews.set(m.id, m)
      bump(n => n + 1)
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const profileMap = profiles.use()
  if (!list.length) return null
  return <div className={`dm-cards${cards ? '' : ' compact'}`} role="list" aria-label="Unread direct messages">
    {list.map(({ c, count }) => {
      const m = previews.get(c.last_message_id)
      const others = c.channel_members.map(x => x.user_id).filter(id => id !== userId)
      const who = others.length === 1 ? others[0] : m?.author_id && m.author_id !== userId ? m.author_id : others[0] || userId
      const name = c.name || dmTitle(c, userId, profileMap)
      const label = `${name}, ${count} unread`
      return <button key={c.id} role="listitem" className={`rail-btn dm-card${cards ? ' srv' : ''}`} onClick={() => go(null, c.id)} title={name} aria-label={label}>
        <span className="dm-card-av"><Avatar id={who} size={cards ? 36 : 44} status={false} /></span>
        {cards && <span className="dm-card-text">
          <b className="dm-card-name">{name}</b>
          <span className="dm-card-preview">{m ? previewText(m, 60) || '…' : '…'}</span>
        </span>}
        <b className="badge">{count > 99 ? '99+' : count}</b>
      </button>
    })}
  </div>
}
