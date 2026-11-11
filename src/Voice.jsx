import { useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { online, setVoiceTalking } from './lib/store'
import { trackVoice } from './lib/presence'
import Avatar, { Name } from './Avatar'

// shortcut: STUN only, no TURN relay. ~10-20% of strict NAT / mobile networks won't connect; add a TURN server (e.g. Cloudflare Calls TURN) when someone reports it.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

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

// Headless: full-mesh WebRTC audio. Supabase Realtime only carries the handshake.
export function VoiceConnection({ channel, me, vstate, onError }) {
  const streamRef = useRef(null)
  const peersRef = useRef(new Map())
  const vstateRef = useRef(vstate)
  vstateRef.current = vstate

  useEffect(() => {
    let closed = false
    let ch = null
    const audioCtx = new AudioContext()
    const stops = []
    const peers = peersRef.current
    const send = (to, data) => ch?.send({ type: 'broadcast', event: 'signal', payload: { from: me.id, to, ...data } })

    function close(id) {
      const p = peers.get(id)
      if (!p) return
      p.pc.close(); p.audio?.remove(); p.stop?.()
      peers.delete(id)
    }

    function makePeer(id) {
      close(id)
      const pc = new RTCPeerConnection({ iceServers: ICE })
      const p = { pc, pending: [] }
      peers.set(id, p)
      streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current))
      pc.onicecandidate = e => e.candidate && send(id, { candidate: e.candidate.toJSON() })
      pc.ontrack = e => {
        if (p.audio) return
        p.audio = new Audio()
        p.audio.autoplay = true
        p.audio.srcObject = e.streams[0]
        p.audio.muted = vstateRef.current.deafened
        document.body.appendChild(p.audio)
        p.stop = watchLevel(audioCtx, e.streams[0], id)
      }
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') close(id) }
      return p
    }

    async function onSignal({ payload: s }) {
      if (s.to !== me.id || closed) return
      let p = peers.get(s.from)
      if (s.sdp) {
        if (s.sdp.type === 'offer') p = makePeer(s.from)
        if (!p) return
        await p.pc.setRemoteDescription(s.sdp)
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {})
        if (s.sdp.type === 'offer') {
          await p.pc.setLocalDescription(await p.pc.createAnswer())
          send(s.from, { sdp: p.pc.localDescription.toJSON() })
        }
      } else if (s.candidate && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.candidate).catch(() => {})
        else p.pending.push(s.candidate)
      }
    }

    async function start() {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch {
        return onError('Microphone access was blocked. Allow it in your browser to use voice.')
      }
      if (closed) return streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !vstateRef.current.muted })
      stops.push(watchLevel(audioCtx, streamRef.current, me.id))

      ch = supabase.channel(`chan:${channel.id}`, { config: { private: true, presence: { key: me.id } } })
      ch.on('broadcast', { event: 'signal' }, onSignal)
      ch.on('presence', { event: 'sync' }, async () => {
        const ids = Object.keys(ch.presenceState()).filter(id => id !== me.id)
        for (const id of peers.keys()) if (!ids.includes(id)) close(id)
        for (const id of ids) {
          if (peers.has(id) || me.id > id) continue // the lower id makes the offer; avoids both sides offering
          const p = makePeer(id)
          await p.pc.setLocalDescription(await p.pc.createOffer())
          send(id, { sdp: p.pc.localDescription.toJSON() })
        }
      })
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') { ch.track({}); trackVoice(channel.id) }
        if (status === 'CHANNEL_ERROR') onError("Couldn't connect to voice.")
      })
    }
    start()

    return () => {
      closed = true
      trackVoice(null)
      for (const id of [...peers.keys()]) close(id)
      stops.forEach(f => f())
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (ch) supabase.removeChannel(ch)
      audioCtx.close()
    }
  }, [channel.id, me.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !vstate.muted && !vstate.deafened })
    for (const p of peersRef.current.values()) if (p.audio) p.audio.muted = vstate.deafened
  }, [vstate])

  return null
}

// The main-area view of a voice channel: a stage of PNGtuber avatars that talk when people speak.
export function VoiceStage({ channel, joined, onJoin, onMenu }) {
  const ids = online.use(s => Object.keys(s).filter(id => s[id].voice === channel.id).join(','))
  const list = ids ? ids.split(',') : []
  return (
    <div className="stage">
      <header className="chat-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
        <span className="ch-icon">🔊</span><h2>{channel.name}</h2>
      </header>
      <div className="stage-floor">
        {list.length === 0 && <p className="muted">Nobody's here yet.</p>}
        {list.map(id => (
          <div key={id} className="stage-seat pop"><Avatar id={id} size={120} /><Name id={id} /></div>
        ))}
      </div>
      {!joined && <button className="btn primary big join-voice" onClick={onJoin}>Join voice</button>}
    </div>
  )
}
