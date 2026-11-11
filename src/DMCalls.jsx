import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { cams, createStore, myStatus, online, prefs, profiles, streams, toast } from './lib/store'
import { ALONE_MS, RING_MS, callLength, dmCalls, newRings } from './lib/calls'
import { playChime } from './lib/voicecues'
import { blocks } from './lib/blocks'
import { blockedDM, channelMuted } from './lib/mute'
import { Screen, canCam, canShare, makeOut } from './Voice'
import { PeerState } from './VoiceCues'
import Avatar, { Name } from './Avatar'
import { openMenu } from './ContextMenu'
import { app, personMenu, streamItems } from './menus'
import './styles/dm-calls.css'
import Icon from './icons/Icon'

// Calls in DMs and group DMs. A call is a VoiceConnection on 'call:<dm id>' (see Voice.jsx); everything here reads who's in
// which call from global presence (lib/calls.js callKey), so ringing needs no extra realtime channels and also reaches
// people who come online mid-call (they see "In a call" with Join).

// DM id -> 'id,id' of members in a call there. Kept by CallHost.
const calls = createStore({})
const useCall = cid => { const s = calls.use(x => x[cid] || ''); return s ? s.split(',') : [] }
// The DM call you're in: { cid, caller, answered, start, aloneSince }. Kept by CallWatch, read by CallPanel.
const callInfo = createStore(null)
// Who declined the call you're in (VoiceConnection's onCall).
const declines = createStore([])
export const onCallSignal = p => { if (p?.type === 'decline' && p.from) declines.set(d => [...d, p.from]) }

const nameOf = id => profiles.get()[id]?.display_name || profiles.get()[id]?.username || 'Someone'
const others = (c, me) => (c.channel_members || []).map(m => m.user_id).filter(id => id !== me)
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// Chitchat doodle icons (no emoji in call UI); .ci / .hang / .up come from dm-calls.css.
const Ci = ({ name, className }) => <Icon name={name} size={18} className={className ? `ci ${className}` : 'ci'} />
export const PhoneIcon = ({ hang }) => <Ci name="phone" className={hang ? 'hang' : ''} />
export const VideoIcon = ({ off }) => <Ci name={off ? 'camera-off' : 'camera'} />
const MicIcon = ({ off }) => <Ci name={off ? 'mic-off' : 'mic'} />
const EarIcon = ({ off }) => <Ci name={off ? 'headphones-off' : 'headphones'} />
const ScreenIcon = () => <Ci name="screen" />
const Chevron = ({ up }) => <Ci name="chevron-down" className={up ? 'up' : ''} />

// Writes "Missed call" / "Call · 12m" into the DM and marks it read for you (you were there).
function writeLine(cid, content, call) {
  const me = app.ctx?.userId
  supabase.from('messages').insert({ channel_id: cid, author_id: me, content, call }).select('id').single()
    .then(({ data, error }) => error ? toast("Couldn't note the call in the chat.") : app.ctx?.markRead([{ id: cid, kind: 'dm', last_message_id: data.id }]))
}

// After you leave an answered call: once nobody's left in it, one "Call · 12m" line. People hanging up together can each
// still see the other in presence for a second or two, so everyone who leaves checks; checks are staggered by member order
// and skip if the line already exists, so it's written once.
// shortcut: a closed tab never checks; if the last two both close their tabs, the call gets no line.
function noteCallEnd(c, me, first, end) {
  const order = (c.channel_members || []).map(m => m.user_id).sort().indexOf(me)
  setTimeout(async () => {
    if ((calls.get()[c.id] || '').split(',').some(id => id && id !== me)) return // still going: a later leaver writes it
    const { data } = await supabase.from('messages').select('id').eq('channel_id', c.id).not('call->secs', 'is', null)
      .gte('created_at', new Date(first - 5000).toISOString()).limit(1) // 5 s of slack for clock skew
    if (data?.length) return
    const secs = Math.round((end - first) / 1000)
    writeLine(c.id, `Call · ${callLength(secs)}`, { secs })
  }, 2000 + 2500 * Math.max(0, order))
}

// Tells the people in a call that you declined. A REST broadcast, so there's no need to join the call's topic.
async function sendDecline(cid, me) {
  if (app.ctx?.voice?.id === cid) return // same topic as our own VoiceConnection: removing it would hang us up
  const ch = supabase.channel(`call:${cid}`, { config: { private: true } })
  try { await ch.httpSend('call', { type: 'decline', from: me }) } catch {} finally { supabase.removeChannel(ch) }
}

// Lives in Shell: tracks calls in your DMs, rings for new ones, and watches the DM call you're in.
export function CallHost({ ctx }) {
  const { channels, userId, voice } = ctx
  const [rings, setRings] = useState([]) // [{ cid, at }]
  const prev = useRef(null)
  useEffect(() => {
    const run = () => {
      const o = online.get(), next = dmCalls(o, channels)
      if (JSON.stringify(next) !== JSON.stringify(calls.get())) calls.set(next)
      if (!Object.keys(o).length) return // presence not synced yet
      // Calls already going on when you arrive don't ring; they show "In a call" with Join.
      const fresh = prev.current ? newRings(prev.current, next, userId, blocks.get()) : []
      prev.current = next
      if (fresh.length) setRings(r => [...r.filter(x => !fresh.includes(x.cid)), ...fresh.map(cid => ({ cid, at: Date.now() }))])
    }
    run()
    return online.subscribe(run)
  }, [channels, userId])

  // A ring stops after RING_MS (missed), when the call ends, or once you're in it (here or in another tab).
  useEffect(() => {
    if (!rings.length) return
    const t = setTimeout(() => setRings(rs => rs.filter(r => Date.now() - r.at < RING_MS)), Math.min(...rings.map(r => r.at)) + RING_MS - Date.now())
    return () => clearTimeout(t)
  }, [rings])
  const all = calls.use()
  const live = rings.map(r => ({ ...r, c: channels.find(c => c.id === r.cid), ids: (all[r.cid] || '').split(',').filter(Boolean) }))
    .filter(r => r.c && r.ids.length && !r.ids.includes(userId) && voice?.id !== r.cid)

  // Soft ringtone through your output device and volume. Never in DND, for muted DMs, or with "Ring for calls" off.
  const dnd = myStatus.use(s => s === 'dnd')
  const ringOn = prefs.use(p => p.ringCalls)
  const mutes = prefs.use(p => p.mutes)
  const loud = !dnd && ringOn && live.some(r => !channelMuted(mutes, r.c))
  useEffect(() => {
    if (!loud) return
    const ac = new AudioContext(), out = makeOut(ac)
    const ring = () => playChime(ac, out.master, 'ring', 0.08)
    ring()
    const t = setInterval(ring, 2500)
    return () => { clearInterval(t); out.stop(); ac.close() }
  }, [loud])

  const decline = cid => { setRings(rs => rs.filter(r => r.cid !== cid)); sendDecline(cid, userId) }
  return <>
    {voice?.kind === 'dm' && <CallWatch key={voice.id} c={voice} me={userId} />}
    {live.length > 0 && (
      <div className="call-rings">
        {live.map(r => <RingCard key={r.cid} c={r.c} ids={r.ids} me={userId} onAccept={video => ctx.startCall(r.c, video)} onDecline={() => decline(r.cid)} />)}
      </div>
    )}
  </>
}

function RingCard({ c, ids, me, onAccept, onDecline }) {
  const from = ids[0]
  const group = others(c, me).length > 1
  return (
    <div className="ring-card pop" role="alertdialog" aria-label={`Incoming call from ${nameOf(from)}`}>
      <div className="ring-who">
        <span className="ring-av"><Avatar id={from} size={52} /></span>
        <div className="ring-text">
          <b><Name id={from} /></b>
          <span className="muted small">{group ? `Group call · ${ids.length} in it` : 'is calling you'}</span>
        </div>
      </div>
      <div className="ring-actions">
        <button className="ring-btn accept" onClick={() => onAccept(false)}><PhoneIcon /> Accept</button>
        {canCam && <button className="ring-btn video" onClick={() => onAccept(true)} aria-label="Accept with video" title="Accept with video"><VideoIcon /> Video</button>}
        <button className="ring-btn decline" onClick={onDecline}><PhoneIcon hang /> Decline</button>
      </div>
    </div>
  )
}

// The DM call you're in: missed-call / call-length lines, declines, and ending a call you've been alone in for ALONE_MS.
function CallWatch({ c, me }) {
  const ids = useCall(c.id)
  const n = ids.filter(id => id !== me).length
  const nRef = useRef(n)
  nRef.current = n
  const s = useRef(null)
  // Nobody else here when you joined: you're the caller (both calling at once just lands in the same call).
  if (!s.current) s.current = { caller: !n, first: 0, last: 0, wrote: false, start: Date.now() }
  const missed = () => {
    const st = s.current
    if (st.wrote || st.first || !st.caller) return
    st.wrote = true
    writeLine(c.id, 'Missed call', { missed: true })
  }

  useEffect(() => {
    const t = setTimeout(missed, RING_MS)
    return () => {
      clearTimeout(t)
      callInfo.set(null)
      declines.set([]) // here, not on mount: the declines effect below would already have seen the old list
      const st = s.current
      if (st.first) noteCallEnd(c, me, st.first, nRef.current ? Date.now() : st.last || Date.now())
      else missed()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const st = s.current
    if (n) st.first ||= Date.now()
    else if (st.first) st.last = Date.now()
    callInfo.set({ cid: c.id, caller: st.caller, answered: !!st.first, start: st.start, aloneSince: n ? null : Date.now() })
    if (n) return
    const t = setTimeout(() => { toast('The call ended: nobody else was in it.'); app.ctx?.joinVoice(null) }, ALONE_MS)
    return () => clearTimeout(t)
  }, [n > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const dec = declines.use()
  useEffect(() => {
    const from = dec[dec.length - 1]
    if (!from || !others(c, me).includes(from)) return
    toast(`${nameOf(from)} declined the call.`)
    if (!s.current.first && others(c, me).every(id => dec.includes(id))) { missed(); app.ctx?.joinVoice(null) }
  }, [dec]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Phone + video buttons in a DM header.
export function CallButtons({ channel, ctx }) {
  const blocked = blocks.use(b => blockedDM(b, channel, ctx.userId))
  const active = useCall(channel.id).length > 0
  if (blocked || !others(channel, ctx.userId).length || ctx.voice?.id === channel.id) return null
  const verb = active ? 'Join the call' : 'Start a call'
  return <>
    <button className="icon-btn call-btn" onClick={() => ctx.startCall(channel)} title={verb} aria-label={verb}><PhoneIcon /></button>
    {canCam && <button className="icon-btn call-btn" onClick={() => ctx.startCall(channel, true)} title={`${verb} with video`} aria-label={`${verb} with video`}><VideoIcon /></button>}
  </>
}

// "In a call · Join" under a DM row. Lives inside the row's button, hence spans.
export function CallTag({ c, ctx }) {
  const n = useCall(c.id).length
  if (!n) return null
  const join = e => { e.stopPropagation(); e.preventDefault(); ctx.startCall(c) }
  return <span className="call-tag small">In a call{ctx.voice?.id !== c.id && <> · <span className="link" role="button" tabIndex={0} onClick={join}
    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && join(e)}>Join</span></>}</span>
}

// System-style line for a call message.
export function CallLine({ m, me }) {
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div id={`msg-${m.id}`} className={`call-line${m.call.missed ? ' missed' : ''}`} role="note">
      <PhoneIcon hang={!!m.call.missed} />
      {m.call.missed
        ? <span>{m.author_id === me ? 'No answer' : <>Missed call from <Name id={m.author_id} /></>} · {time}</span>
        : <span>Call · {callLength(m.call.secs || 0)}</span>}
    </div>
  )
}

// The call at the top of a DM: a compact stadium stage (big screen only while someone shares) and the call controls.
export function CallPanel({ channel, ctx }) {
  const { userId: me, vstate, setVstate } = ctx
  const ids = useCall(channel.id)
  const joined = ctx.voice?.id === channel.id
  const [open, setOpen] = useState(true)
  const info = callInfo.use()
  const nStreams = streams.use(s => Object.keys(s).length)
  const sharing = joined && nStreams > 0
  const [, tick] = useState(0)
  const counting = joined && info && (!info.answered || info.aloneSince)
  useEffect(() => {
    if (!counting) return
    const t = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [counting])
  if (!joined && !ids.length) return null

  const seats = joined && !ids.includes(me) ? [me, ...ids] : ids
  const flip = k => setVstate(v => ({ ...v, [k]: !v[k] }))
  const now = Date.now()
  let note = joined ? 'Connected' : ids.length === 1 ? `${nameOf(ids[0])} is in a call` : `${ids.length} people are in a call`
  if (joined && info?.cid === channel.id) {
    const ends = info.aloneSince != null && mmss(ALONE_MS - (now - info.aloneSince))
    if (!info.answered) note = now - info.start < RING_MS ? 'Ringing…' : `No answer · ends in ${ends}`
    else if (ends) note = `Just you here · ends in ${ends}`
  }
  const ctl = (on, label, onClick, icon, cls = '') => (
    <button className={`icon-btn call-ctl${on ? ' on' : ''}${cls}`} onClick={onClick} title={label} aria-label={label} aria-pressed={cls ? undefined : !!on}>{icon}</button>
  )
  return (
    <section className={`call-panel${open ? '' : ' shut'}${sharing && open ? ' sharing' : ''}`} aria-label="Call">
      {open && <CallStage ids={seats} joined={joined} meId={me} />}
      <div className="call-bar">
        <span className="call-note" role="status">{note}</span>
        <span className="spacer" />
        {joined ? <>
          {ctl(vstate.muted, vstate.muted ? 'Unmute' : 'Mute', () => flip('muted'), <MicIcon off={vstate.muted} />)}
          {ctl(vstate.deafened, vstate.deafened ? 'Undeafen' : 'Deafen', () => flip('deafened'), <EarIcon off={vstate.deafened} />)}
          {canCam && ctl(vstate.cam, vstate.cam ? 'Turn camera off' : 'Turn camera on', () => flip('cam'), <VideoIcon off={!vstate.cam} />)}
          {canShare && ctl(vstate.live, vstate.live ? 'Stop sharing' : 'Go live', () => flip('live'), <ScreenIcon />)}
          {ctl(false, 'Hang up', () => ctx.joinVoice(null), <PhoneIcon hang />, ' hangup')}
        </> : <>
          <button className="btn primary small" onClick={() => ctx.startCall(channel)}><PhoneIcon /> Join</button>
          {canCam && <button className="btn ghost small" onClick={() => ctx.startCall(channel, true)}><VideoIcon /> Video</button>}
        </>}
        <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} title={open ? 'Collapse call' : 'Expand call'}
          aria-label={open ? 'Collapse call' : 'Expand call'}><Chevron up={open} /></button>
      </div>
    </section>
  )
}

function CallStage({ ids, joined, meId }) {
  const all = streams.use()
  const faces = cams.use()
  const [pick, setPick] = useState(null)
  const [hidden, setHidden] = useState([])
  const shown = joined ? Object.keys(all).filter(id => !hidden.includes(id)) : []
  const main = shown.includes(pick) ? pick : shown[0]
  const menu = id => e => openMenu(e, () => streamItems(id, {
    me: id === meId, focused: id === main, focus: () => setPick(id), hide: () => setHidden(h => [...h, id]),
    video: e.currentTarget.querySelector('video'),
  }))
  return (
    <div className="call-stage">
      {main && (
        <div className="stage-screen on call-screen" onContextMenu={menu(main)}>
          <Screen stream={all[main]} />
          <div className="stage-caption"><Name id={main} /> is sharing</div>
          {shown.length > 1 && (
            <div className="stage-thumbs">
              {shown.filter(id => id !== main).map(id => (
                <button key={id} className="stage-thumb" onClick={() => setPick(id)} onContextMenu={menu(id)} title="Watch this stream"><Screen stream={all[id]} /></button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="call-crowd">
        {ids.map(id => (
          <div key={id} className={`stage-seat${id === meId ? ' me' : ''}`} {...personMenu(id)}>
            <Avatar id={id} size={main ? 56 : 84} full vbadge>{joined && faces[id] && <Screen stream={faces[id]} />}</Avatar>
            <Name id={id} />
            <PeerState id={id} />
          </div>
        ))}
        {hidden.length > 0 && <button className="btn ghost small" onClick={() => setHidden([])}>Show {hidden.length} hidden</button>}
      </div>
    </div>
  )
}
