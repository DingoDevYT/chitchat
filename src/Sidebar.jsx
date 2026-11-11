import { useState } from 'react'
import { supabase } from './lib/supabase'
import { online, prefs, pttDown, toast, useProfile } from './lib/store'
import { keyLabel } from './lib/voice'
import Avatar, { Name } from './Avatar'
import { canShare, canCam } from './Voice'
import { useIncomingCount } from './Friends'

export function dmTitle(channel, meId, profileMap) {
  const others = channel.channel_members.map(m => m.user_id).filter(id => id !== meId)
  return others.map(id => profileMap[id]?.display_name || profileMap[id]?.username || '…').join(', ') || 'Just you'
}

function DMItem({ c, meId, active, unread, onClick }) {
  const others = c.channel_members.map(m => m.user_id).filter(id => id !== meId)
  return (
    <button className={`ch-item dm${active ? ' active' : ''}${unread ? ' unread' : ''}`} onClick={onClick}>
      <Avatar id={others[0] || meId} size={32} status={others.length === 1} />
      <span className="ch-name">
        {others.length ? others.map((id, i) => <span key={id}>{i > 0 && ', '}<NameText id={id} /></span>) : 'Just you'}
      </span>
      {others.length > 1 && <span className="muted small">{others.length + 1}</span>}
    </button>
  )
}

function NameText({ id }) {
  const p = useProfile(id)
  return p?.display_name || p?.username || '…'
}

function VoiceRoster({ channelId }) {
  const ids = online.use(s => Object.keys(s).filter(id => s[id].voice === channelId).join(','))
  if (!ids) return null
  return (
    <div className="voice-roster">
      {ids.split(',').map(id => <div key={id} className="voice-user"><Avatar id={id} size={22} /><Name id={id} /><CamOn id={id} /></div>)}
    </div>
  )
}

// Push-to-talk hint, lit while you're transmitting.
function Ptt() {
  const ptt = prefs.use(s => s.ptt), key = prefs.use(s => s.pttKey), on = pttDown.use()
  if (!ptt) return null
  return <div className={`ptt small${on ? ' on' : ''}`}>{on ? '📡 Transmitting' : <>Hold <kbd>{keyLabel(key)}</kbd> to talk</>}</div>
}

function CamOn({ id }) {
  return online.use(s => !!s[id]?.cam) && <span title="Camera on" aria-label="Camera on">📷</span>
}

export default function Sidebar({ ctx, channels, current, isUnread, voice, vstate, setVstate, onLeaveVoice }) {
  const { server, role, me, userId, go, setModal } = ctx
  const [menu, setMenu] = useState(false)
  const isAdmin = role === 'owner' || role === 'admin'
  const incoming = useIncomingCount()

  async function leave() {
    setMenu(false)
    if (!confirm(`Leave ${server.name}?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', server.id).eq('user_id', userId)
    if (error) return toast(error.message)
    await ctx.load()
    go(null)
  }

  function copyInvite() {
    setMenu(false)
    const url = `${location.origin}${location.pathname}#/invite/${server.invite_code}`
    navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'), () => prompt('Copy this invite link:', url))
  }

  return (
    <aside className="sidebar">
      {server ? (
        <div className="side-head">
          <button className="side-title" onClick={() => setMenu(m => !m)} aria-expanded={menu}>
            <span>{server.name}</span><span className={`chev${menu ? ' up' : ''}`}>▾</span>
          </button>
          {menu && (
            <div className="menu pop" onMouseLeave={() => setMenu(false)}>
              <button onClick={copyInvite}>💌 Copy invite link</button>
              {isAdmin && <button onClick={() => { setMenu(false); setModal({ type: 'channel' }) }}>➕ New channel</button>}
              {isAdmin && <button onClick={() => { setMenu(false); setModal({ type: 'serverSettings' }) }}>⚙️ Server settings</button>}
              {role !== 'owner' && <button className="danger" onClick={leave}>🚪 Leave server</button>}
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
            👯 <span className="ch-name">Friends</span>{incoming > 0 && <b className="badge inline">{incoming}</b>}
          </button>
          <button className="ch-item new-dm" onClick={() => setModal({ type: 'newDM' })}>✏️ <span className="ch-name">New message</span></button>
        </>}
        {channels.map(c => c.kind === 'dm'
          ? <DMItem key={c.id} c={c} meId={userId} active={current?.id === c.id} unread={isUnread(c)} onClick={() => go(null, c.id)} />
          : (
            <div key={c.id}>
              <div className={`ch-item${current?.id === c.id ? ' active' : ''}${isUnread(c) ? ' unread' : ''}`}>
                <button className="ch-main" onClick={() => go(server.id, c.id)}>
                  <span className="ch-icon">{c.kind === 'voice' ? '🏟️' : '#'}</span>
                  <span className="ch-name">{c.name}</span>
                  {c.private && <span className="lock" title="Private">🔒</span>}
                </button>
                {isAdmin && <button className="ch-gear" onClick={() => setModal({ type: 'channel', channel: c })} aria-label={`Edit ${c.name}`}>⚙</button>}
              </div>
              {c.kind === 'voice' && <VoiceRoster channelId={c.id} />}
            </div>
          ))}
        {server && channels.length === 0 && <p className="muted small pad">No channels yet.</p>}
      </div>

      {voice && (
        <div className="voice-panel pop">
          <div><b className="ok">● Stadium connected</b><div className="muted small">{voice.name}</div><Ptt /></div>
          <div className="row">
            {canShare && <button className={`icon-btn${vstate.live ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, live: !v.live }))}
              title={vstate.live ? 'Stop sharing' : 'Go live'}>{vstate.live ? '⏹️' : '📺'}</button>}
            {canCam && <button className={`icon-btn${vstate.cam ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, cam: !v.cam }))}
              title={vstate.cam ? 'Turn camera off' : 'Turn camera on'}>📷</button>}
            <button className={`icon-btn${vstate.muted ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, muted: !v.muted }))}
              title={vstate.muted ? 'Unmute' : 'Mute'}>{vstate.muted ? '🔇' : '🎙️'}</button>
            <button className={`icon-btn${vstate.deafened ? ' on' : ''}`} onClick={() => setVstate(v => ({ ...v, deafened: !v.deafened }))}
              title={vstate.deafened ? 'Undeafen' : 'Deafen'}>{vstate.deafened ? '🙉' : '🎧'}</button>
            <button className="icon-btn" onClick={() => setModal({ type: 'settings', tab: 'media' })} title="Voice & video settings"
              aria-label="Voice & video settings">⚙️</button>
            <button className="icon-btn danger" onClick={onLeaveVoice} title="Leave stadium">📞</button>
          </div>
        </div>
      )}

      <div className="me-panel">
        <Avatar id={userId} size={36} status />
        <div className="me-text">
          <Name id={userId} />
          <div className="muted small">@{me.username}</div>
        </div>
        <button className="icon-btn" onClick={() => setModal({ type: 'settings' })} title="Settings" aria-label="Settings">⚙️</button>
      </div>
    </aside>
  )
}
