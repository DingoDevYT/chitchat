import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { online, setVoiceTalking, streams, dropStream } from './lib/store'
import { trackVoice } from './lib/presence'
import Avatar, { Name } from './Avatar'

// shortcut: STUN only, no TURN relay. ~10-20% of strict NAT / mobile networks won't connect; add a TURN server (e.g. Cloudflare Calls TURN) when someone reports it.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

// Phones have no screen sharing; hide "Go live" there.
export const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

// Watches a stream's loudness and flips the owner's avatar into talking mode.
function watchLevel(audioCtx, stream, id) {
  const src = audioCtx.createMediaStreamSource(stream)
  const an = audioCtx.createAnalyser()
  an.fftSize = 512
  src.connect(an)
  const buf = new Uint8Array(an.fftSize)
  const t = setInterval(() => {
    an.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += (v - 128) ** 2
    setVoiceTalking(id, Math.sqrt(sum / buf.length) > 6)
  }, 80)
  return () => { clearInterval(t); src.disconnect(); setVoiceTalking(id, false) }
}

// Headless: full-mesh WebRTC audio + screen shares. Supabase Realtime only carries the handshake.
// Uses "perfect negotiation": either side may (re)offer whenever its tracks change; on a collision
// the polite peer (higher id) rolls back and answers, the impolite one ignores the incoming offer.
export function VoiceConnection({ channel, me, vstate, setVstate, onError }) {
  const streamRef = useRef(null)
  const shareRef = useRef(null)
  const peersRef = useRef(new Map())
  const vstateRef = useRef(vstate)
  vstateRef.current = vstate

  useEffect(() => {
    let closed = false
    let ch = null
    let chain = Promise.resolve()
    const audioCtx = new AudioContext()
    const stops = []
    const peers = peersRef.current
    const send = (to, data) => ch?.send({ type: 'broadcast', event: 'signal', payload: { from: me.id, to, ...data } })

    function close(id) {
      const p = peers.get(id)
      if (!p) return
      p.pc.close(); p.stop?.()
      for (const a of p.media.values()) a.remove()
      dropStream(id, streams.get()[id])
      peers.delete(id)
    }

    function makePeer(id) {
      const pc = new RTCPeerConnection({ iceServers: ICE })
      const p = { pc, pending: [], media: new Map(), polite: me.id > id, makingOffer: false, ignoreOffer: false }
      peers.set(id, p)
      streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current))
      const share = shareRef.current // late joiners get the current screen share too
      p.senders = share ? share.getTracks().map(t => pc.addTrack(t, share)) : []
      pc.onnegotiationneeded = async () => {
        try {
          p.makingOffer = true
          await pc.setLocalDescription()
          send(id, { sdp: pc.localDescription.toJSON() })
        } catch {} finally { p.makingOffer = false }
      }
      pc.onicecandidate = e => e.candidate && send(id, { candidate: e.candidate.toJSON() })
      pc.ontrack = ({ track, streams: [ms] }) => {
        if (!ms) return
        // Every remote stream (mic, or screen video+audio) plays through a hidden <audio> so deafen covers both.
        if (!p.media.has(ms.id)) {
          const a = new Audio()
          a.autoplay = true
          a.srcObject = ms
          a.muted = vstateRef.current.deafened
          document.body.appendChild(a)
          p.media.set(ms.id, a)
          ms.onremovetrack = () => {
            if (!ms.getVideoTracks().length) dropStream(id, ms)
            if (!ms.getTracks().length) { a.remove(); p.media.delete(ms.id) }
          }
        }
        if (track.kind === 'video') {
          const show = () => streams.set(s => ({ ...s, [id]: ms }))
          show()
          track.onunmute = show
          track.onmute = track.onended = () => dropStream(id, ms)
        } else if (!ms.getVideoTracks().length && !p.stop) p.stop = watchLevel(audioCtx, ms, id) // mic only
      }
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') close(id) }
      return p
    }

    async function handle(s) {
      if (s.to !== me.id || closed) return
      let p = peers.get(s.from)
      if (s.sdp) {
        p ||= makePeer(s.from)
        const collision = s.sdp.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable')
        p.ignoreOffer = !p.polite && collision
        if (p.ignoreOffer) return
        await p.pc.setRemoteDescription(s.sdp) // polite side: implicit rollback of our own offer
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {})
        if (s.sdp.type === 'offer') {
          await p.pc.setLocalDescription()
          send(s.from, { sdp: p.pc.localDescription.toJSON() })
        }
      } else if (s.candidate && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.candidate).catch(() => {})
        else p.pending.push(s.candidate)
      }
    }
    // One signal at a time, so an answer can't race the offer it answers.
    const onSignal = ({ payload }) => { chain = chain.then(() => handle(payload)).catch(() => {}) }

    async function start() {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        return onError('Microphone access was blocked. Allow it in your browser to join a stadium.')
      }
      if (closed) return streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !vstateRef.current.muted })
      stops.push(watchLevel(audioCtx, streamRef.current, me.id))

      ch = supabase.channel(`chan:${channel.id}`, { config: { private: true, presence: { key: me.id } } })
      ch.on('broadcast', { event: 'signal' }, onSignal)
      ch.on('presence', { event: 'sync' }, () => {
        const ids = Object.keys(ch.presenceState()).filter(id => id !== me.id)
        for (const id of peers.keys()) if (!ids.includes(id)) close(id)
        // The lower id opens the connection (fewer collisions); the other side creates its peer on the first offer.
        for (const id of ids) if (!peers.has(id) && me.id < id) makePeer(id)
      })
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') { ch.track({}); trackVoice(channel.id, !!shareRef.current) }
        if (status === 'CHANNEL_ERROR') onError("Couldn't connect to the stadium.")
      })
    }
    start()

    return () => {
      closed = true
      trackVoice(null)
      for (const id of [...peers.keys()]) close(id)
      stops.forEach(f => f())
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null // tells the share cleanup below we've left
      if (ch) supabase.removeChannel(ch)
      audioCtx.close()
    }
  }, [channel.id, me.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !vstate.muted && !vstate.deafened })
    for (const p of peersRef.current.values()) for (const a of p.media.values()) a.muted = vstate.deafened
  }, [vstate])

  // Go live: share a screen/tab to everyone in the stadium; adding/removing tracks triggers renegotiation.
  useEffect(() => {
    if (!vstate.live) return
    let share = null, stopped = false
    const end = () => setVstate(v => ({ ...v, live: false }))
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(s => {
      if (stopped) return s.getTracks().forEach(t => t.stop())
      share = shareRef.current = s
      s.getVideoTracks()[0].onended = end // the browser's own "Stop sharing" bar
      for (const p of peersRef.current.values()) p.senders = s.getTracks().map(t => p.pc.addTrack(t, s))
      streams.set(st => ({ ...st, [me.id]: s }))
      trackVoice(channel.id, true)
    }, end)
    return () => {
      stopped = true
      if (!share) return
      share.getTracks().forEach(t => t.stop())
      shareRef.current = null
      for (const p of peersRef.current.values()) {
        if (p.pc.signalingState !== 'closed') p.senders.forEach(x => p.pc.removeTrack(x))
        p.senders = []
      }
      dropStream(me.id, share)
      if (streamRef.current) trackVoice(channel.id, false)
    }
  }, [vstate.live]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

function Screen({ stream }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.srcObject = stream }, [stream])
  // Always muted: audio plays through VoiceConnection's hidden <audio> elements (so deafen applies).
  return <video ref={ref} autoPlay playsInline muted />
}

// The main-area view of a stadium: a big screen for whoever is live, with everyone standing in the crowd below.
export function VoiceStage({ channel, joined, onJoin, live, onLive, onMenu }) {
  const ids = online.use(s => Object.keys(s).filter(id => s[id].voice === channel.id).join(','))
  const liveIds = online.use(s => Object.keys(s).filter(id => s[id].voice === channel.id && s[id].live).join(','))
  const all = streams.use()
  const [pick, setPick] = useState(null)
  const list = ids ? ids.split(',') : []
  const lives = liveIds ? liveIds.split(',') : []
  const shown = joined ? Object.keys(all) : []
  const main = shown.includes(pick) ? pick : shown[0]
  const size = list.length > 8 ? 88 : 116

  return (
    <div className="stage">
      <header className="chat-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
        <span className="ch-icon">🏟️</span><h2>{channel.name}</h2>
      </header>
      <div className="stadium">
        <div className={`stage-screen${main ? ' on' : ''}`}>
          {main ? (
            <>
              <Screen stream={all[main]} />
              <div className="stage-caption"><b className="live-badge">🔴 LIVE</b> <Name id={main} /></div>
              {shown.length > 1 && (
                <div className="stage-thumbs">
                  {shown.filter(id => id !== main).map(id => (
                    <button key={id} className="stage-thumb" onClick={() => setPick(id)} title="Watch this stream">
                      <Screen stream={all[id]} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="stage-idle">
              <h1>{channel.name}</h1>
              {!joined && lives.length
                ? <p><Name id={lives[0]} /> {lives.length > 1 ? `+${lives.length - 1} are` : 'is'} live, join to watch</p>
                : <p className="muted">Nobody's live</p>}
            </div>
          )}
        </div>
        <div className="stage-crowd">
          {list.length === 0 && <p className="muted">Nobody's here yet.</p>}
          {list.map(id => (
            <div key={id} className="stage-seat">
              {lives.includes(id) && <b className="live-badge">🔴 LIVE</b>}
              <Avatar id={id} size={size} />
              <Name id={id} />
            </div>
          ))}
        </div>
      </div>
      <div className="stage-actions">
        {!joined && <button className="btn primary big join-voice" onClick={onJoin}>Join stadium</button>}
        {joined && canShare && <button className={`btn ${live ? 'danger' : 'primary'}`} onClick={onLive}>{live ? '⏹️ Stop sharing' : '📺 Go live'}</button>}
      </div>
    </div>
  )
}
