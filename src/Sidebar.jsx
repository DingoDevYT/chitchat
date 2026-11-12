import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { online, prefs, profiles, pttDown, setPref, talking, toast, useProfile } from './lib/store'
import { ask, askText } from './Dialog'
import { setCategories, useCategories } from './lib/categories'
import { applyItems, byPosition, groupChannels, moveCategory, moveChannel, step } from './lib/reorder'
import { useDrag } from './lib/useDrag'
import './styles/categories.css'
import { keyLabel } from './lib/voice'
import Avatar, { Name, CustomStatus } from './Avatar'
import MeStatus, { MeSub } from './StatusPicker'
import { AvatarSwitcher } from './AvatarSetups'
import { canShare, canCam } from './Voice'
import { InStadium, LiveTag, PeerState } from './VoiceCues'
import { CallTag } from './DMCalls'
import { useIncomingCount } from './Friends'
import { openMenu } from './ContextMenu'
import { channelItems, chanMuted, copyInvite as copyServerInvite, dmItems, personMenu, serverItems, SETTINGS_PERMS } from './menus'
import { MentionBadge } from './ChatCues'
import { RoomIcon, RoomName, RoomTint, roomVars } from './Rooms'
import { CategoryModal } from './RoomEditor'
import Icon from './icons/Icon'

export function dmTitle(channel, meId, profileMap) {
  const others = channel.channel_members.map(m => m.user_id).filter(id => id !== meId)
  return others.map(id => profileMap[id]?.display_name || profileMap[id]?.username || '…').join(', ') || 'Just you'
}

function DMItem({ c, meId, active, unread, onClick, ctx }) {
  const others = c.channel_members.map(m => m.user_id).filter(id => id !== meId)
  return (
    <button className={`ch-item dm${active ? ' active' : ''}${unread ? ' unread' : ''}${chanMuted(c) ? ' ch-muted' : ''}${ctx?.quiet?.(c) ? ' ch-quiet' : ''}`} onClick={onClick}
      onContextMenu={e => openMenu(e, () => dmItems(c, e.currentTarget))}>
      <Avatar id={others[0] || meId} size={32} status={others.length === 1} />
      <span className="who">
        <span className="ch-name">
          {others.length ? others.map((id, i) => <span key={id}>{i > 0 && ', '}<NameText id={id} /></span>) : 'Just you'}
        </span>
        {others.length === 1 && <CustomStatus id={others[0]} />}
        {others.length === 1 && <InStadium id={others[0]} ctx={ctx} />}
        <CallTag c={c} ctx={ctx} />
      </span>
      {others.length > 1 && <span className="muted small">{others.length + 1}</span>}
      <MentionBadge n={ctx?.mentionOf?.(c)} />
    </button>
  )
}

function NameText({ id }) {
  const p = useProfile(id)
  return p?.display_name || p?.username || '…'
}

function VoiceRoster({ channelId }) {
  const ids = online.use(s => Object.keys(s).filter(id => s[id].voice === channelId).join(','))
  const there = useRef(null) // already seated when the roster appeared: only later joiners rise in
  there.current ??= new Set(ids ? ids.split(',') : [])
  if (!ids) return null
  return (
    <div className="voice-roster">
      {ids.split(',').map(id => <VoiceUser key={id} id={id} joined={!there.current.has(id)} />)}
    </div>
  )
}

function VoiceUser({ id, joined }) {
  const speaking = talking.use(s => !!s['v:' + id])
  return (
    <div className={`voice-user${joined ? ' joined' : ''}${speaking ? ' speaking' : ''}`} {...personMenu(id)}>
      <Avatar id={id} size={22} vbadge mode="voice" /><Name id={id} /><LiveTag id={id} /><CamOn id={id} /><PeerState id={id} />
    </div>
  )
}

// Push-to-talk hint, lit while you're transmitting.
function Ptt() {
  const ptt = prefs.use(s => s.ptt), key = prefs.use(s => s.pttKey), on = pttDown.use()
  if (!ptt) return null
  return <div className={`ptt small${on ? ' on' : ''}`}>{on ? <><Icon name="live" size={14} /> Transmitting</> : <>Hold <kbd>{keyLabel(key)}</kbd> to talk</>}</div>
}

function CamOn({ id }) {
  return online.use(s => !!s[id]?.cam) && <span title="Camera on" aria-label="Camera on" role="img"><Icon name="camera" size={15} /></span>
}

export default function Sidebar({ ctx, channels, current, isUnread, voice, vstate, setVstate, onLeaveVoice }) {
  const { server, role, me, userId, go, setModal } = ctx
  const [menu, setMenu] = useState(false)
  const isAdmin = ctx.can('manage_channels')
  const incoming = useIncomingCount()

  async function leave() {
    setMenu(false)
    if (!await ask({ text: `Leave ${server.name}?`, confirm: 'Leave', danger: true })) return
    const { error } = await supabase.from('members').delete().eq('server_id', server.id).eq('user_id', userId)
    if (error) return toast(error.message)
    await ctx.load()
    go(null)
  }

  function copyInvite() {
    setMenu(false)
    copyServerInvite(server.id)
  }

  // ── categories, drag to reorder ──
  const cats = useCategories(server?.id)
  const groups = server ? groupChannels(channels, cats) : []
  const collapsed = prefs.use(s => s.collapsedCats) || {}
  const [moved, setMoved] = useState(null)
  const drag = useDrag({
    accepts: (t, z) => t === 'cat' ? z === 'catgroup' : z === 'channel' || z === 'cat',
    onDrop: d => {
      let items
      if (d.type === 'cat') {
        const ids = byPosition(cats).map(c => c.id)
        items = moveCategory(cats, d.id, ids.indexOf(d.over) + (d.after ? 1 : 0))
      } else if (d.overType === 'cat') {
        items = moveChannel(groups, d.id, d.over || null, 0)
      } else {
        const g = groups.find(g => g.channels.some(c => c.id === d.over))
        items = moveChannel(groups, d.id, g.cat?.id ?? null, g.channels.findIndex(c => c.id === d.over) + (d.after ? 1 : 0))
      }
      if (!items.length) return
      setMoved(d.id); setTimeout(() => setMoved(m => m === d.id ? null : m), 500)
      const old = new Map([...channels, ...cats].map(r => [r.id, r]))
      const undo = items.map(i => Object.fromEntries(Object.keys(i).map(k => [k, old.get(i.id)[k] ?? null])))
      const apply = list => { ctx.setChannels(cs => applyItems(cs, list)); setCategories(server.id, l => applyItems(l, list)) }
      apply(items)
      supabase.rpc('reorder_channels', { server_id: server.id, items }).then(({ error }) => {
        if (error) { apply(undo); toast(error.message) }
      })
    },
  })

  const [catEdit, setCatEdit] = useState(null) // null | { cat } (cat undefined = new category)
  function newCat() {
    setMenu(false)
    setCatEdit({})
  }
  async function deleteCat(cat) {
    if (!await ask({ text: `Delete the ${cat.name} category? Its rooms stay, without a category.`, confirm: 'Delete', danger: true })) return
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) return toast(error.message)
    setCategories(server.id, l => l.filter(c => c.id !== cat.id))
  }

  // Alt+↑/↓: previous/next channel; with Shift: previous/next unread.
  useEffect(() => {
    const onKey = e => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      const list = server ? groups.flatMap(g => g.channels) : channels
      const id = step(list.map(c => c.id), current?.id, e.key === 'ArrowUp' ? -1 : 1,
        e.shiftKey ? id => isUnread(list.find(c => c.id === id)) : undefined)
      e.preventDefault()
      if (id) go(server?.id || null, id)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  // Clicking a stadium opens it and joins its call, like a voice channel. joinVoice keeps its gates (rules agreement /
  // timeout, "leave your DM call?"), and the mic prompt and errors come from the call itself; if any of that stops it,
  // the stage still offers "Join stadium".
  const open = c => {
    go(server.id, c.id)
    if (c.kind === 'voice' && voice?.id !== c.id) ctx.joinVoice?.(c)
  }

  const chan = c => (
    <div key={c.id} className={`ch-drag${drag.cls('channel', c.id)}${moved === c.id ? ' just-moved' : ''}`} {...drag.item('channel', c.id, isAdmin)}>
      <div className={`ch-item room-row${current?.id === c.id ? ' active' : ''}${isUnread(c) ? ' unread' : ''}${chanMuted(c) ? ' ch-muted' : ''}${ctx.quiet?.(c) ? ' ch-quiet' : ''}`}
        style={roomVars(c)} onContextMenu={e => openMenu(e, () => channelItems(c))} {...drag.zone('channel', c.id)}>
        <RoomTint c={c} />
        <button className="ch-main" onClick={() => open(c)} title={c.topic || undefined}>
          <RoomIcon c={c} />
          <RoomName c={c} className="ch-name" />
          {c.private && <span className="lock" title="Private"><Icon name="lock" size={13} /></span>}
          <MentionBadge n={ctx.mentionOf?.(c)} />
        </button>
        {isAdmin && <button className="ch-gear" onClick={() => setModal({ type: 'channel', channel: c })} aria-label={`Edit ${c.name}`}><Icon name="settings" size={15} /></button>}
      </div>
      {c.kind === 'voice' && <VoiceRoster channelId={c.id} />}
    </div>
  )

  return (
    <aside className="sidebar">
      {server ? (
        <div className="side-head">
          <button className="side-title" onClick={() => setMenu(m => !m)} aria-expanded={menu}
            onContextMenu={e => openMenu(e, () => serverItems(server))}>
            <span>{server.name}</span><span className={`chev${menu ? ' up' : ''}`}><Icon name="chevron-down" size={16} /></span>
          </button>
          {menu && (
            <div className="menu pop" onMouseLeave={() => setMenu(false)}>
              {(server.members_can_invite !== false || ctx.can('manage_invites')) && <button onClick={copyInvite}><Icon name="mail" size={16} /> Copy invite link</button>}
              {isAdmin && <button onClick={() => { setMenu(false); setModal({ type: 'channel' }) }}><Icon name="plus" size={16} /> New room</button>}
              {isAdmin && <button onClick={newCat}><Icon name="folder" size={16} /> New category</button>}
              {SETTINGS_PERMS.some(ctx.can) && <button onClick={() => { setMenu(false); setModal({ type: 'serverSettings' }) }}><Icon name="settings" size={16} /> Server settings</button>}
              {role !== 'owner' && <button className="danger" onClick={leave}><Icon name="door" size={16} /> Leave server</button>}
            </div>
          )}
        </div>
      ) : (
        <div className="side-head">
          <div className="side-title static">Direct messages</div>
        </div>
      )}

      <div className="ch-list">
        {!server && <>
          <button className={`ch-item friends-btn${!current ? ' active' : ''}`} onClick={() => go(null)}>
            <Icon name="friends" size={18} /> <span className="ch-name">Friends</span>{incoming > 0 && <b className="badge inline">{incoming}</b>}
          </button>
          <button className="ch-item new-dm" onClick={() => setModal({ type: 'newDM' })}><Icon name="edit" size={18} /> <span className="ch-name">New message</span></button>
        </>}
        {!server && channels.map(c =>
          <DMItem key={c.id} c={c} meId={userId} active={current?.id === c.id} unread={isUnread(c)} onClick={() => go(null, c.id)} ctx={ctx} />)}
        {server && drag.dragging?.type === 'channel' && !groups[0].channels.length && (
          <div className={`cat-drop-top${drag.cls('cat', '')}`} {...drag.zone('cat', '')}>No category</div>
        )}
        {server && groups.map(g => !g.cat ? g.channels.map(chan) : (
          <div key={g.cat.id} className={`cat-group${drag.cls('catgroup', g.cat.id)}${moved === g.cat.id ? ' just-moved' : ''}`}
            {...drag.zone('catgroup', g.cat.id)}>
            <div className={`cat-head${g.cat.icon || g.cat.accent || g.cat.banner_url ? ' cat-deco' : ''}${drag.cls('cat', g.cat.id)}`} style={roomVars(g.cat)}
              {...drag.zone('cat', g.cat.id)} {...drag.item('cat', g.cat.id, isAdmin)}>
              <RoomTint c={g.cat} />
              <button className="cat-toggle" onClick={() => setPref('collapsedCats', { ...collapsed, [g.cat.id]: !collapsed[g.cat.id] })}
                aria-expanded={!collapsed[g.cat.id]}>
                <span className={`cat-chev${collapsed[g.cat.id] ? ' shut' : ''}`}><Icon name="chevron-down" size={13} /></span>{g.cat.icon && <RoomIcon c={g.cat} />}<span className="cat-name">{g.cat.name}</span>
              </button>
              {isAdmin && <>
                <button className="cat-act" onClick={() => setModal({ type: 'channel', categoryId: g.cat.id })}
                  title="New room here" aria-label={`New room in ${g.cat.name}`}><Icon name="plus" size={15} /></button>
                <button className="cat-act" onClick={() => setCatEdit({ cat: g.cat })} title="Edit category" aria-label={`Edit ${g.cat.name}`}><Icon name="edit" size={14} /></button>
                <button className="cat-act" onClick={() => deleteCat(g.cat)} title="Delete category" aria-label={`Delete ${g.cat.name}`}><Icon name="close" size={14} /></button>
              </>}
            </div>
            {g.channels.filter(c => !collapsed[g.cat.id] || c.id === current?.id).map(chan)}
          </div>
        ))}
        {server && channels.length === 0 && <p className="muted small pad">No rooms yet.{isAdmin && ' Open the server menu above to make one.'}</p>}
      </div>
      {catEdit && server && <CategoryModal ctx={ctx} cat={catEdit.cat} onClose={() => setCatEdit(null)} />}

      {voice && (
        <div className="voice-panel pop">
          {voice.kind === 'dm'
            ? <div><b className="ok">● In a call</b><button className="muted small call-with" onClick={() => go(null, voice.id)} title="Open this call">
              Call with {dmTitle(voice, userId, profiles.get())}</button><Ptt /></div>
            : <div><b className="ok">● Stadium connected</b><div className="muted small">{voice.name}</div><Ptt /></div>}
          <div className="row">
            {canShare && <button className={`icon-btn${vstate.live ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, live: !v.live }))}
              title={vstate.live ? 'Stop sharing' : 'Go live'} aria-label={vstate.live ? 'Stop sharing' : 'Go live'}><Icon name={vstate.live ? 'stop' : 'screen'} /></button>}
            {canCam && <button className={`icon-btn${vstate.cam ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, cam: !v.cam }))}
              title={vstate.cam ? 'Turn camera off' : 'Turn camera on'} aria-label={vstate.cam ? 'Turn camera off' : 'Turn camera on'}><Icon name="camera" /></button>}
            <button className={`icon-btn${vstate.muted ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, muted: !v.muted }))}
              title={vstate.muted ? 'Unmute' : 'Mute'} aria-label={vstate.muted ? 'Unmute' : 'Mute'}><Icon name={vstate.muted ? 'mic-off' : 'mic'} /></button>
            <button className={`icon-btn${vstate.deafened ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, deafened: !v.deafened }))}
              title={vstate.deafened ? 'Undeafen' : 'Deafen'} aria-label={vstate.deafened ? 'Undeafen' : 'Deafen'}><Icon name={vstate.deafened ? 'headphones-off' : 'headphones'} /></button>
            <button className="icon-btn" onClick={() => setModal({ type: 'settings', tab: 'media' })} title="Voice & video settings"
              aria-label="Voice & video settings"><Icon name="settings" /></button>
            <button className="icon-btn danger" onClick={onLeaveVoice} title={voice.kind === 'dm' ? 'Hang up' : 'Leave stadium'} aria-label={voice.kind === 'dm' ? 'Hang up' : 'Leave stadium'}><Icon name="phone-off" /></button>
          </div>
        </div>
      )}

      <div className="me-panel">
        <MeStatus userId={userId} />
        <div className="me-text">
          <Name id={userId} />
          <MeSub userId={userId} username={me.username} />
        </div>
        <AvatarSwitcher userId={userId} onManage={() => setModal({ type: 'settings', tab: 'voice' })} />
        <button className="icon-btn" onClick={() => setModal({ type: 'settings' })} title="Settings" aria-label="Settings"><Icon name="settings" /></button>
      </div>
    </aside>
  )
}
