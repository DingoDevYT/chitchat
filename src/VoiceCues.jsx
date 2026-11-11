import { online, peerState } from './lib/store'
import { stadiumLabel } from './lib/voicecues'
import './styles/voice-cues.css'

const RELAY_TIP = "Couldn't connect to them. Their network (or yours) may block direct calls and need a relay server."

// Your WebRTC link to someone in the stadium you joined; nothing once connected (or if you aren't joined).
export function PeerState({ id }) {
  const st = peerState.use(s => s[id])
  if (st === 'connecting') return <span className="peer-st connecting" role="status" title="Connecting to them…">connecting…</span>
  if (st === 'failed') return <span className="peer-st failed" role="status" title={RELAY_TIP}>⚠️ couldn't connect</span>
  return null
}

export function LiveTag({ id }) {
  return online.use(s => !!s[id]?.live) && <b className="live-badge live-tag" title="Streaming in a stadium">🔴 LIVE</b>
}

// "🏟️ in Hangout" under a name; opens that stadium (doesn't join). Lives inside row buttons, hence a span.
export function InStadium({ id, ctx }) {
  const tag = stadiumLabel(online.use(s => s[id]?.voice || null), ctx.channels)
  if (!tag) return null
  if (!tag.channelId) return <span className="in-stadium small">{tag.text}</span>
  const open = e => { e.stopPropagation(); e.preventDefault(); ctx.go(tag.serverId, tag.channelId) }
  return <span className="in-stadium small link" role="link" tabIndex={0} title="Open this stadium" onClick={open}
    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && open(e)}>{tag.text}</span>
}
