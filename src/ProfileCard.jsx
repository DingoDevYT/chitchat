import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { overlayRoot } from './lib/fullscreen'
import { supabase } from './lib/supabase'
import { createStore, prefs, profiles, refreshProfile, setPref, toast, useProfile } from './lib/store'
import { ask } from './Dialog'
import Avatar, { Name, CustomStatus } from './Avatar'
import { LastSeen } from './ChatCues'
import { InStadium, LiveTag } from './VoiceCues'
import { acceptFriend, addFriend, friendships, friendStatus, removeFriend } from './Friends'
import { RoleChips, useCanKick } from './Roles'
import { ModButtons, NoteBox, TimeoutBadge } from './Moderation'
import { block, unblock, useBlocked } from './lib/blocks'
import Icon from './icons/Icon'

export const ROLE_BADGE = { owner: <Icon name="crown" size="1.1em" title="Owner" />, admin: <Icon name="star" size="1.1em" title="Admin" /> }

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
    overlayRoot(),
  )
}

function Card({ id, role, ctx, onClose }) {
  const p = useProfile(id)
  useEffect(() => { refreshProfile(id) }, [id])
  const self = id === ctx.userId
  const myRole = ctx.role
  const muted = prefs.use(s => !!s.muted[id])
  const vol = prefs.use(s => s.peerVol[id] ?? 1)
  const canKick = useCanKick(ctx, id, role)

  async function setRole(r) {
    const { error } = await supabase.from('members').update({ role: r }).eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }
  async function kick() {
    if (!await ask({ text: `Remove ${p?.display_name || p?.username} from the server?`, confirm: 'Remove', danger: true })) return
    const { error } = await supabase.from('members').delete().eq('server_id', ctx.server.id).eq('user_id', id)
    if (error) toast(error.message)
    onClose()
  }

  return (
    <>
      <div className="profile-banner" style={{ background: p?.color }} />
      <div className="profile-av"><Avatar id={id} size={72} status vbadge /></div>
      <h3><Name id={id} serverId={ctx.server?.id} /> {ROLE_BADGE[role]}<LiveTag id={id} /><TimeoutBadge uid={id} ctx={ctx} /></h3>
      <InStadium id={id} ctx={ctx} />
      <div className="muted small">@{p?.username}</div>
      {role && <RoleChips ctx={ctx} uid={id} />}
      <CustomStatus id={id} className="profile-cs" />
      {!self && <LastSeen id={id} />}
      {p?.bio && <p className="bio">{p.bio}</p>}
      {!self && <NoteBox id={id} ctx={ctx} />}
      <div className="col">
        {self && <button className="btn ghost" onClick={() => { ctx.setModal({ type: 'settings' }); onClose() }}>Edit profile</button>}
        {!self && <button className="btn primary" onClick={() => { ctx.openDM([id]); onClose() }}>Message</button>}
        {!self && <FriendButton id={id} />}
        {!self && <button className="btn ghost" onClick={() => setPref('muted', { ...prefs.get().muted, [id]: !muted || undefined })}>
          <Icon name={muted ? 'volume' : 'volume-mute'} size={18} /> {muted ? 'Unmute their typing voice' : 'Mute their typing voice'}</button>}
        {!self && <label>Voice call volume {Math.round(vol * 100)}%
          <input type="range" min="0" max="2" step="0.05" value={vol}
            onChange={e => setPref('peerVol', { ...prefs.get().peerVol, [id]: +e.target.value })} /></label>}
        {ctx.server && myRole === 'owner' && !self && role === 'member' && <button className="btn ghost" onClick={() => setRole('admin')}>Make admin</button>}
        {ctx.server && myRole === 'owner' && !self && role === 'admin' && <button className="btn ghost" onClick={() => setRole('member')}>Remove admin</button>}
        {canKick && <button className="btn danger" onClick={kick}>Remove from server</button>}
        <ModButtons ctx={ctx} id={id} role={role} onClose={onClose} />
        {!self && <BlockButton id={id} />}
      </div>
    </>
  )
}

function BlockButton({ id }) {
  const blocked = useBlocked(id)
  const p = profiles.get()[id], name = p?.display_name || p?.username || 'them'
  const go = async () => blocked
    ? await ask({ text: `Unblock ${name}?`, confirm: 'Unblock' }) && unblock(id)
    : await ask({ text: `Block ${name}? Their messages get hidden for you, they can't friend you or start new DMs with you, and any friendship ends.`, confirm: 'Block', danger: true }) && block(id)
  return <button className="btn ghost" onClick={go}>{blocked ? 'Unblock' : <><Icon name="block" size={18} /> Block</>}</button>
}

function FriendButton({ id }) {
  friendships.use() // re-render when friendships change
  const s = friendStatus(id)
  const p = profiles.get()[id]
  if (s === 'friends') return <button className="btn ghost" onClick={() => removeFriend(id, `Remove ${p?.username} as a friend?`)}><Icon name="check" size={18} /> Friends</button>
  if (s === 'incoming') return <button className="btn ghost" onClick={() => acceptFriend(id)}>Accept friend request</button>
  if (s === 'outgoing') return <button className="btn ghost" onClick={() => removeFriend(id)}>Request sent (cancel)</button>
  return <button className="btn ghost" onClick={() => p && addFriend(p.username)}><Icon name="user-plus" size={18} /> Add friend</button>
}
