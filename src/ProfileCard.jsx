import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import { createStore, prefs, profiles, setPref, toast, useProfile } from './lib/store'
import Avatar, { Name } from './Avatar'

export const ROLE_BADGE = { owner: '👑', admin: '⭐' }

// One profile popover for the whole app, opened from member list, message avatars/names and @mentions.
const pop = createStore(null) // { id, rect }
export function openProfile(id, el) {
  if (!id) return
  const cur = pop.get()
  pop.set(cur?.id === id ? null : { id, rect: el.getBoundingClientRect() })
}
export function openProfileByUsername(username, el) {
  const p = Object.values(profiles.get()).find(x => x.username === username)
  if (p) openProfile(p.id, el)
}

export default function ProfileCardHost({ ctx, members }) {
  const state = pop.use()
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!state) return
    const close = e => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-profile]')) pop.set(null) }
    const esc = e => e.key === 'Escape' && pop.set(null)
    document.addEventListener('mousedown', close)
    addEventListener('keydown', esc)
    addEventListener('resize', () => pop.set(null), { once: true })
    return () => { document.removeEventListener('mousedown', close); removeEventListener('keydown', esc) }
  }, [state])

  // Place beside the clicked element, flipped/clamped to stay on screen.
  useLayoutEffect(() => {
    if (!state || !ref.current) return setPos(null)
    const { rect } = state, w = ref.current.offsetWidth, h = ref.current.offsetHeight, m = 8
    let left = rect.right + m
    if (left + w > innerWidth - m) left = rect.left - w - m
    left = Math.max(m, Math.min(left, innerWidth - w - m))
    const top = Math.max(m, Math.min(rect.top, innerHeight - h - m))
    setPos({ left, top })
  }, [state])

  if (!state) return null
  const close = () => pop.set(null)
  const role = members.find(m => m.user_id === state.id)?.role
  return createPortal(
    <div ref={ref} className="profile-card pop" role="dialog" aria-label="Profile"
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      <Card id={state.id} role={role} ctx={ctx} onClose={close} />
    </div>,
    document.body,
  )
}

function Card({ id, role, ctx, onClose }) {
  const p = useProfile(id)
  const self = id === ctx.userId
  const myRole = ctx.role
  const muted = prefs.use(s => !!s.muted[id])

  async function setRole(r) {
    const { error } = await supabase.from('members').update({ role: r }).eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }
  async function kick() {
    if (!confirm(`Remove ${p?.display_name || p?.username} from the server?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }

  return (
    <>
      <div className="profile-banner" style={{ background: p?.color }} />
      <div className="profile-av"><Avatar id={id} size={72} status /></div>
      <h3><Name id={id} /> {ROLE_BADGE[role]}</h3>
      <div className="muted small">@{p?.username}</div>
      {p?.bio && <p className="bio">{p.bio}</p>}
      <div className="col">
        {self && <button className="btn ghost" onClick={() => { ctx.setModal({ type: 'settings' }); onClose() }}>Edit profile</button>}
        {!self && <button className="btn primary" onClick={() => { ctx.openDM([id]); onClose() }}>Message</button>}
        {!self && <button className="btn ghost" onClick={() => setPref('muted', { ...prefs.get().muted, [id]: !muted || undefined })}>
          {muted ? '🔊 Unmute their voice' : '🔇 Mute their voice'}</button>}
        {ctx.server && myRole === 'owner' && !self && role === 'member' && <button className="btn ghost" onClick={() => setRole('admin')}>Make admin</button>}
        {ctx.server && myRole === 'owner' && !self && role === 'admin' && <button className="btn ghost" onClick={() => setRole('member')}>Remove admin</button>}
        {ctx.server && role && !self && role !== 'owner' && (myRole === 'owner' || (myRole === 'admin' && role === 'member')) &&
          <button className="btn danger" onClick={kick}>Remove from server</button>}
      </div>
    </>
  )
}
