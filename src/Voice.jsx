import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Boundary } from './App'
import { supabase } from './lib/supabase'
import { online, setVoiceTalking, streams, cams, dropStream, toast, prefs, setPref, micLevel, pttDown, peerState, setPeerState, isDND } from './lib/store'
import { peerStatus, diffMembers, playChime } from './lib/voicecues'
import { PeerState } from './VoiceCues'
import { trackVoice } from './lib/presence'
import { callKey } from './lib/calls'
import { TALK, missingDevice, level, normGain } from './lib/voice'
import { bubbles, speakTTS, stopTTS } from './lib/stadium'
import { emojify } from './Markdown'
import gateUrl from './lib/voice.js?url'
import Avatar, { Name } from './Avatar'
import Icon from './icons/Icon'
import { openMenu } from './ContextMenu'
import { app, personItems, personMenu, streamItems } from './menus'
import { RoomTitle, roomVars } from './Rooms'
import ThemeBackdrop, { useRoomTheme } from './themes/ThemeBackdrop'
import { fitCrowd, ROW } from './lib/crowd'
import { clampPan, zoomAt, toggleAt } from './lib/zoom'
import './styles/stadium-crowd.css'
import { GAMES_ON, GAME_LIST, useTable, create as createGame } from './games/useGame'

const GameScreen = lazy(() => import('./games/GameScreen')) // games (and three.js) load only when a table opens

// shortcut: STUN only, no TURN relay. ~10-20% of strict NAT / mobile networks won't connect; add a TURN server (e.g. Cloudflare Calls TURN) when someone reports it.
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

// Phones have no screen sharing; hide "Go live" there.
export const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
// shortcut: checks the API only, so a desktop with no webcam still sees the button (it toasts on failure); check enumerateDevices if that annoys people.
export const canCam = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

// Webcam bubbles are tiny, so keep them cheap; screen shares stay uncapped.
function addCam(pc, cam) {
  return cam.getTracks().map(t => {
    const sender = pc.addTrack(t, cam)
    try {
      const prm = sender.getParameters()
      // shortcut: some browsers (older Firefox) have no encodings until negotiated, so the cap is skipped there.
      if (prm.encodings?.length) { prm.encodings[0].maxBitrate = 200_000; sender.setParameters(prm).catch(() => {}) }
    } catch {}
    return sender
  })
}

const hasVideo = ms => ms.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)
// Camera and screen are both video: the sender's presence says which stream id is which.
// Until presence names a stream it stays hidden, so a camera never flashes onto the big screen.
function route(id, ms) {
  const m = online.get()[id] || {}
  const to = !hasVideo(ms) ? null : ms.id === m.cam ? cams : ms.id === m.live ? streams : null
  for (const st of [streams, cams]) if (st !== to) dropStream(id, ms, st)
  if (to && to.get()[id] !== ms) to.set(s => ({ ...s, [id]: ms }))
}

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

// "Normalise voices" for one remote mic: input → compressor → slow make-up gain (normGain) → dest.
// With the setting off, input goes straight to dest. Make-up only adapts while they talk, so silence is never boosted.
function makeNorm(ctx, dest) {
  const input = ctx.createGain(), comp = ctx.createDynamicsCompressor(), make = ctx.createGain(), an = ctx.createAnalyser()
  comp.threshold.value = -24; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.3
  an.fftSize = 1024
  comp.connect(make).connect(dest)
  comp.connect(an) // measured before the make-up gain, as normGain expects
  const buf = new Float32Array(an.fftSize)
  let on = null, g = 1
  const sync = () => {
    if (prefs.get().normalise === on) return
    on = prefs.get().normalise
    input.disconnect()
    input.connect(on ? comp : dest)
  }
  sync()
  const unsub = prefs.subscribe(sync)
  const t = setInterval(() => {
    if (!on) return
    an.getFloatTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += v * v
    g = normGain(g, level(Math.sqrt(sum / buf.length)))
    make.gain.setTargetAtTime(g, ctx.currentTime, 0.1)
  }, 100)
  return { input, stop() { clearInterval(t); unsub(); input.disconnect(); make.disconnect(); comp.disconnect() } }
}

// Local per-person levels from the right-click menu: voice (peerVol / callMuted) and their screen share (streamVol / streamMuted).
function peerGains(id, p) {
  const P = prefs.get()
  p.vol.gain.value = P.callMuted[id] ? 0 : P.peerVol[id] ?? 1
  p.svol.gain.value = P.streamMuted[id] ? 0 : P.streamVol[id] ?? 1
}

// Safari can't pick an output device.
export const canPickOut = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

const micAudio = () => {
  const p = prefs.get()
  return { deviceId: p.micId || undefined, echoCancellation: p.ec, noiseSuppression: p.ns, autoGainControl: p.agc }
}
// A bare deviceId is only "ideal", so an unplugged camera/mic falls back to the default instead of failing.
export const camVideo = () => {
  const id = prefs.get().camId
  return { width: 320, height: 320, frameRate: 20, ...(id ? { deviceId: id } : { facingMode: 'user' }) }
}

// Saved device unplugged → back to the default, once (a second caller finds the pref already cleared).
const KINDS = [['micId', 'audioinput', 'microphone'], ['speakerId', 'audiooutput', 'speaker'], ['camId', 'videoinput', 'camera']]
export function checkDevices(ds) {
  for (const [k, kind, name] of KINDS) {
    if (missingDevice(ds, kind, prefs.get()[k])) { setPref(k, ''); toast(`Your ${name} disappeared, so we switched to the default.`) }
  }
}

// Mic send graph: raw mic → "gate" worklet (input volume + voice gate / push-to-talk) → whatever the caller connects.
// Switching mic or processing only swaps the source node, so the outgoing track never changes.
export async function makeMic(ctx, onLevel) {
  await ctx.audioWorklet.addModule(gateUrl)
  const node = new AudioWorkletNode(ctx, 'gate')
  let raw = null, src = null, held = false, stopped = false, key = ''
  const keyOf = () => JSON.stringify(micAudio())
  const sync = () => {
    const p = prefs.get()
    node.port.postMessage({ gain: p.inVol, thr: p.vadAuto ? null : p.vadThreshold, ptt: p.ptt, held })
    if (raw && keyOf() !== key) mic.acquire().catch(() => toast("Couldn't switch your microphone."))
  }
  const hold = down => e => {
    if (e.code !== prefs.get().pttKey || e.repeat) return
    held = down; pttDown.set(down); sync()
  }
  const kd = hold(true), ku = hold(false), blur = () => { held = false; pttDown.set(false); sync() }
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur)
  const unsub = prefs.subscribe(sync)
  node.port.onmessage = e => { micLevel.set(e.data); onLevel?.(e.data) }
  const mic = {
    node,
    async acquire() {
      key = keyOf()
      const s = await navigator.mediaDevices.getUserMedia({ audio: micAudio() })
      if (stopped) return s.getTracks().forEach(t => t.stop())
      src?.disconnect(); raw?.getTracks().forEach(t => t.stop())
      raw = s; src = ctx.createMediaStreamSource(s); src.connect(node)
      s.getAudioTracks()[0].onended = () => mic.acquire().catch(() => {}) // unplugged: picks the default mic
    },
    stop() {
      stopped = true
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur)
      unsub(); src?.disconnect(); node.disconnect()
      raw?.getTracks().forEach(t => t.stop())
      pttDown.set(false); micLevel.set(null)
    },
  }
  sync()
  return mic
}

// Everything you hear is mixed into one gain → one <audio>, so output volume (up to 200%), device and deafen live in one place.
export function makeOut(ctx, deafened = () => false) {
  const master = ctx.createGain(), dest = ctx.createMediaStreamDestination(), el = new Audio()
  master.connect(dest)
  el.autoplay = true
  el.srcObject = dest.stream
  const apply = () => {
    const p = prefs.get()
    master.gain.value = deafened() ? 0 : p.outVol
    if (canPickOut && el.sinkId !== p.speakerId) el.setSinkId(p.speakerId).catch(() => {})
  }
  const unsub = prefs.subscribe(apply)
  apply()
  return { master, apply, stop() { unsub(); el.srcObject = null } }
}

// Headless: full-mesh WebRTC audio + screen shares. Supabase Realtime only carries the handshake.
// Uses "perfect negotiation": either side may (re)offer whenever its tracks change; on a collision
// the polite peer (higher id) rolls back and answers, the impolite one ignores the incoming offer.
// DM calls (channel.kind 'dm') use their own 'call:' topic, since a DM's 'chan:' topic is its chat; onCall gets their 'call' broadcasts (declines).
export function VoiceConnection({ channel, me, vstate, setVstate, onError, onCall }) {
  const where = channel.kind === 'dm' ? 'the call' : 'the stadium'
  const streamRef = useRef(null) // what we send: the mic send graph's output, not the raw mic
  const outRef = useRef(null)
  const shareRef = useRef(null)
  const camRef = useRef(null)
  const peersRef = useRef(new Map())
  const vstateRef = useRef(vstate)
  vstateRef.current = vstate

  useEffect(() => {
    let closed = false
    let ch = null
    let chain = Promise.resolve()
    let seen = null // stadium member ids at the last presence sync, for join/leave chimes
    const audioCtx = new AudioContext()
    const out = outRef.current = makeOut(audioCtx, () => vstateRef.current.deafened)
    const stops = [out.stop]
    const peers = peersRef.current
    const send = (to, data) => ch?.send({ type: 'broadcast', event: 'signal', payload: { from: me.id, to, ...data } })
    // Per-person call volume (profile popover) and unplugged devices, live.
    stops.push(prefs.subscribe(() => { for (const [id, p] of peers) peerGains(id, p) }))
    const onDevices = () => navigator.mediaDevices.enumerateDevices().then(checkDevices, () => {})
    navigator.mediaDevices.addEventListener?.('devicechange', onDevices)
    stops.push(() => navigator.mediaDevices.removeEventListener?.('devicechange', onDevices))

    function close(id) {
      const p = peers.get(id)
      if (!p) return
      p.pc.close(); p.stop?.(); p.norm.stop(); p.vol.disconnect(); p.svol.disconnect()
      for (const a of p.media.values()) { a.remove(); dropStream(id, a.srcObject); dropStream(id, a.srcObject, cams) }
      peers.delete(id)
      if (peerState.get()[id] !== 'failed') setPeerState(id, null) // "couldn't connect" stays until they leave or we retry
    }

    function makePeer(id) {
      const pc = new RTCPeerConnection({ iceServers: ICE })
      const p = { pc, pending: [], media: new Map(), polite: me.id > id, makingOffer: false, ignoreOffer: false, vol: audioCtx.createGain(), svol: audioCtx.createGain() }
      peerGains(id, p)
      p.vol.connect(out.master)
      p.svol.connect(out.master)
      p.norm = makeNorm(audioCtx, p.vol) // mic only; screen-share audio skips leveling
      peers.set(id, p)
      streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current))
      const share = shareRef.current // late joiners get the current screen share too
      p.senders = share ? share.getTracks().map(t => pc.addTrack(t, share)) : []
      p.camSenders = camRef.current ? addCam(pc, camRef.current) : []
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
        // Every remote stream (mic, camera, or screen video+audio) sits on a muted hidden <audio> (Chrome only feeds
        // WebRTC audio into WebAudio while an element holds it); you hear it via p.vol → `out`, so deafen covers all.
        if (!p.media.has(ms.id)) {
          const a = new Audio()
          a.autoplay = true
          a.muted = true
          a.srcObject = ms
          document.body.appendChild(a)
          p.media.set(ms.id, a)
          ms.onremovetrack = () => {
            route(id, ms)
            if (!ms.getTracks().length) { a.remove(); p.media.delete(ms.id) }
          }
        }
        // Screen-share audio (a stream with video, or the one presence names as live) gets its own volume.
        const screen = ms.getVideoTracks().length > 0 || ms.id === online.get()[id]?.live
        if (track.kind === 'audio') audioCtx.createMediaStreamSource(new MediaStream([track])).connect(screen ? p.svol : p.norm.input)
        if (track.kind === 'video') {
          route(id, ms)
          track.onunmute = track.onmute = track.onended = () => route(id, ms)
        } else if (!ms.getVideoTracks().length && !p.stop) p.stop = watchLevel(audioCtx, ms, id) // mic only
      }
      const showState = () => setPeerState(id, peerStatus(pc.connectionState, pc.iceConnectionState))
      showState()
      pc.oniceconnectionstatechange = showState
      pc.onconnectionstatechange = () => { showState(); if (pc.connectionState === 'failed') close(id) }
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
      let mic
      try {
        // Your own avatar follows the raw mic level, but only while it's actually going out (unmuted, gate open).
        mic = await makeMic(audioCtx, ({ lvl, open }) =>
          setVoiceTalking(me.id, open && lvl > TALK && !vstateRef.current.muted && !vstateRef.current.deafened))
      } catch {
        return onError("This browser can't do voice here.")
      }
      if (closed) return mic.stop()
      try {
        await mic.acquire()
      } catch {
        mic.stop()
        return onError(`Microphone access was blocked. Allow it in your browser to join ${where}.`)
      }
      if (closed) return mic.stop()
      stops.push(() => { mic.stop(); setVoiceTalking(me.id, false) })
      audioCtx.resume() // the send graph only flows while the context runs
      const dest = audioCtx.createMediaStreamDestination()
      mic.node.connect(dest)
      streamRef.current = dest.stream
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !vstateRef.current.muted && !vstateRef.current.deafened })
      // Presence and media travel separately; re-sort video whenever someone's cam/live ids change.
      stops.push(online.subscribe(() => { for (const [id, p] of peers) for (const a of p.media.values()) route(id, a.srcObject) }))

      ch = supabase.channel(`${channel.kind === 'dm' ? 'call' : 'chan'}:${channel.id}`, { config: { private: true, presence: { key: me.id } } })
      ch.on('broadcast', { event: 'signal' }, onSignal)
      ch.on('broadcast', { event: 'call' }, ({ payload }) => onCall?.(payload))
      // 🔊 TTS messages in this stadium's chat are read aloud to everyone who joined (lib/stadium.js queues them).
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        ({ new: row }) => { if (row.tts && !vstateRef.current.deafened) speakTTS(row) })
      stops.push(stopTTS)
      ch.on('presence', { event: 'sync' }, () => {
        const ids = Object.keys(ch.presenceState()).filter(id => id !== me.id)
        for (const id of peers.keys()) if (!ids.includes(id)) close(id)
        for (const id of Object.keys(peerState.get())) if (!ids.includes(id)) setPeerState(id, null)
        // Join/leave chimes into the call mix (output volume, device, deafen apply); first snapshot is silent.
        const { joined, left } = diffMembers(seen, ids, me.id)
        seen = ids
        if (prefs.get().joinSounds && !isDND() && !vstateRef.current.deafened && (joined.length || left.length))
          playChime(audioCtx, out.master, joined.length ? 'join' : 'leave')
        // The lower id opens the connection (fewer collisions); the other side creates its peer on the first offer.
        for (const id of ids) if (!peers.has(id) && me.id < id) makePeer(id)
      })
      ch.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          ch.track({})
          trackVoice({ voice: channel.kind === 'dm' ? callKey(channel.id, me.id) : channel.id, live: shareRef.current?.id || false, cam: camRef.current?.id || null })
        }
        if (status === 'CHANNEL_ERROR') onError(`Couldn't connect to ${where}.`)
      })
    }
    start()

    return () => {
      closed = true
      trackVoice({ voice: null, live: false, cam: null })
      for (const id of [...peers.keys()]) close(id)
      peerState.set({})
      stops.forEach(f => f())
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null // tells the share cleanup below we've left
      if (ch) supabase.removeChannel(ch)
      audioCtx.close()
    }
  }, [channel.id, me.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !vstate.muted && !vstate.deafened })
    outRef.current?.apply()
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
      trackVoice({ live: s.id }) // before the tracks, so peers can tell it from a camera
      for (const p of peersRef.current.values()) p.senders = s.getTracks().map(t => p.pc.addTrack(t, s))
      streams.set(st => ({ ...st, [me.id]: s }))
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
      if (streamRef.current) trackVoice({ live: false })
    }
  }, [vstate.live]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camera: its own stream (separate from mic and screen) so peers can route it to a crowd bubble.
  useEffect(() => {
    if (!vstate.cam) return
    let cam = null, stopped = false
    const end = () => setVstate(v => ({ ...v, cam: false }))
    // Camera picked in settings mid-call: swap the track in place on every peer (replaceTrack needs no renegotiation,
    // and the stream id peers route by stays the same).
    let camId = prefs.get().camId
    const unsub = prefs.subscribe(async () => {
      if (!cam || prefs.get().camId === camId) return
      camId = prefs.get().camId
      const s = await navigator.mediaDevices.getUserMedia({ video: camVideo() }).catch(() => null)
      if (!s || stopped) return s?.getTracks().forEach(t => t.stop())
      const [old] = cam.getVideoTracks(), [t] = s.getVideoTracks()
      t.onended = end
      for (const p of peersRef.current.values()) for (const x of p.camSenders) if (x.track === old) x.replaceTrack(t).catch(() => {})
      cam.removeTrack(old); cam.addTrack(t); old.stop()
    })
    navigator.mediaDevices.getUserMedia({ video: camVideo() }).then(s => {
      if (stopped) return s.getTracks().forEach(t => t.stop())
      cam = camRef.current = s
      s.getVideoTracks()[0].onended = end // unplugged
      trackVoice({ cam: s.id }) // before the tracks, so peers can tell it from a screen share
      for (const p of peersRef.current.values()) p.camSenders = addCam(p.pc, s)
      cams.set(c => ({ ...c, [me.id]: s }))
    }, () => { toast("Couldn't turn on your camera."); end() })
    return () => {
      stopped = true
      unsub()
      if (!cam) return
      cam.getTracks().forEach(t => t.stop()) // camera light off
      camRef.current = null
      for (const p of peersRef.current.values()) {
        if (p.pc.signalingState !== 'closed') p.camSenders.forEach(x => p.pc.removeTrack(x))
        p.camSenders = []
      }
      dropStream(me.id, cam, cams)
      if (streamRef.current) trackVoice({ cam: null })
    }
  }, [vstate.cam]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export function Screen({ stream }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.srcObject = stream }, [stream])
  // Always muted: audio plays through VoiceConnection's hidden <audio> elements (so deafen applies).
  return <video ref={ref} autoPlay playsInline muted />
}

// A stream you can zoom (wheel, pinch, double-click/tap, the − % + buttons) and drag around when zoomed.
// Yours only; lives in refs and the video's transform so wheel ticks don't re-render. Remount (key) to reset.
function ZoomScreen({ stream }) {
  const box = useRef(null), pct = useRef(null), z = useRef({ s: 1, x: 0, y: 0 })
  const g = useRef({ pts: new Map(), moved: 0, tap: 0 }) // live pointers, drag distance, last tap time
  const set = (next, ease) => {
    z.current = next
    const v = box.current.querySelector('video')
    v.style.transition = ease ? 'transform .2s ease' : 'none'
    v.style.transform = next.s > 1 ? `translate(${next.x}px, ${next.y}px) scale(${next.s})` : ''
    pct.current.textContent = `${Math.round(next.s * 100)}%`
    box.current.classList.toggle('zoomed', next.s > 1)
  }
  // Pointer position relative to the box centre, plus the box size.
  const at = (cx, cy) => { const r = box.current.getBoundingClientRect(); return [cx - r.left - r.width / 2, cy - r.top - r.height / 2, r.width, r.height] }
  const step = k => { const [, , w, h] = at(0, 0); set(zoomAt(z.current, z.current.s * k, 0, 0, w, h), true) }
  useEffect(() => {
    const el = box.current
    const wheel = e => { // a plain wheel and a trackpad pinch (ctrl+wheel) both zoom; React's onWheel is passive
      e.preventDefault()
      const [px, py, w, h] = at(e.clientX, e.clientY)
      set(zoomAt(z.current, z.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), px, py, w, h))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const down = e => {
    const { pts } = g.current
    if (!pts.size) g.current.moved = 0
    if (e.button !== 0 || e.target.closest('.zoom-ctl')) return
    pts.set(e.pointerId, [e.clientX, e.clientY])
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = e => {
    const { pts } = g.current, p = pts.get(e.pointerId)
    if (!p) return
    const [ox, oy] = p, dx = e.clientX - ox, dy = e.clientY - oy
    if (pts.size === 2) { // pinch: scale by the change in finger distance, about the midpoint, and follow the midpoint
      const q = [...pts].find(([id]) => id !== e.pointerId)[1]
      const d0 = Math.hypot(ox - q[0], oy - q[1]), d1 = Math.hypot(e.clientX - q[0], e.clientY - q[1])
      const [px, py, w, h] = at((e.clientX + q[0]) / 2, (e.clientY + q[1]) / 2)
      const zz = zoomAt(z.current, z.current.s * (d1 / (d0 || 1)), px, py, w, h)
      set(clampPan({ ...zz, x: zz.x + dx / 2, y: zz.y + dy / 2 }, w, h))
    } else if (z.current.s > 1) {
      const [, , w, h] = at(0, 0)
      set(clampPan({ ...z.current, x: z.current.x + dx, y: z.current.y + dy }, w, h))
    }
    g.current.moved += Math.abs(dx) + Math.abs(dy)
    pts.set(e.pointerId, [e.clientX, e.clientY])
  }
  const up = e => {
    const { pts } = g.current
    if (!pts.delete(e.pointerId) || pts.size || g.current.moved > 8) return
    // Our own double-tap/-click detection: touch browsers don't reliably send dblclick.
    if (e.timeStamp - g.current.tap < 300) { const [px, py, w, h] = at(e.clientX, e.clientY); set(toggleAt(z.current, px, py, w, h), true); g.current.tap = 0 }
    else g.current.tap = e.timeStamp
  }
  return (
    <div className="zoom" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onClickCapture={e => { if (g.current.moved > 8) e.stopPropagation() }}>{/* a drag isn't a click on the tile */}
      <Screen stream={stream} />
      <div className="zoom-ctl" onClick={e => e.stopPropagation()}>
        <button onClick={() => step(1 / 1.5)} aria-label="Zoom out"><Icon name="minus" size={16} /></button>
        <span ref={pct}>100%</span>
        <button onClick={() => step(1.5)} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
        <button onClick={() => set({ s: 1, x: 0, y: 0 }, true)} aria-label="Reset zoom"><Icon name="rotate" size={16} /></button>
      </div>
    </div>
  )
}

// Speech bubble over a seat: typing dots, then their latest stadium-chat message for a few seconds.
export function Bubble({ id }) {
  const b = bubbles.use(s => s[id])
  if (!b) return null
  return <div key={b.key || 'typing'} className={`stage-bubble${b.typing ? ' typing' : ''}`} aria-hidden="true">
    {b.typing ? <span className="dots"><i /><i /><i /></span> : <span>{emojify(b.text)}</span>}</div>
}

// How you see a stadium: Voice & video settings, or right-click the stage. Yours only.
export const VIEW_OPTS = {
  stageView: [['crowd', 'Crowd'], ['list', 'List']],
  streamLayout: [['focus', 'One big, the rest on the side'], ['grid', 'Grid'], ['side', 'Side by side']],
}
const choice = (k, icon, label) => ({ label, icon, submenu: VIEW_OPTS[k].map(([v, l]) => ({ label: l, checked: prefs.get()[k] === v, onClick: () => setPref(k, v) })) })
const viewItems = () => [choice('stageView', 'friends', 'People'), choice('streamLayout', 'screen', 'Streams')]

function useSize() {
  const ref = useRef(null), [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

// pin: the "Focus camera" / "Stop focusing" menu item, for a seat showing a live camera (tapping it toggles too).
function Seat({ id, me, size, back, tile, live, face, pin, style }) {
  const menu = pin ? { onClick: pin.onClick, onContextMenu: e => openMenu(e, () => [pin, { separator: true }, ...personItems(id, e.currentTarget)]) } : personMenu(id)
  return (
    <div className={`stage-seat${me ? ' me' : ''}${back ? ' back' : ''}`} style={style} {...menu}>
      {live && <b className="live-badge"><Icon name="live" size="1.25em" /> LIVE</b>}
      <Bubble id={id} />
      <Avatar id={id} size={size} full={!tile} mode="stage" vbadge>{face && <Screen stream={face} />}</Avatar>
      {(!me || tile) && <Name id={id} />}{/* you know your own name */}
      <PeerState id={id} />
    </div>
  )
}

// The main-area view of a stadium: the screen for whoever is live, and the crowd in front of it.
// Crowd: you in the bottom-right corner, everyone else flowing left in rows (lib/crowd.js). List: plain tiles under the screen.
export function VoiceStage({ channel, meId, joined, onJoin, live, onLive, cam, onCam, onMenu }) {
  const ids = online.use(s => Object.keys(s).filter(id => s[id].voice === channel.id).join(','))
  const liveIds = online.use(s => Object.keys(s).filter(id => s[id].voice === channel.id && s[id].live).join(','))
  const all = streams.use()
  const faces = cams.use()
  const view = prefs.use(s => s.stageView), layout = prefs.use(s => s.streamLayout)
  const [boxRef, box] = useSize()
  const [pick, setPick] = useState(null)
  const [hidden, setHidden] = useState([]) // streams hidden from the right-click menu, until you leave this view
  const list = ids ? ids.split(',') : []
  const lives = liveIds ? liveIds.split(',') : []
  const shown = joined ? Object.keys(all).filter(id => !hidden.includes(id)) : []
  // Focus (pick): a stream id, or `cam:<user id>` for someone's camera. It takes the big screen, the other streams go to
  // the thumbnails; null = automatic (first stream, tiles per your layout).
  const camOf = k => k?.startsWith('cam:') && joined && faces[k.slice(4)]
  const focused = pick && (shown.includes(pick) || camOf(pick)) ? pick : null
  useEffect(() => { if (pick && !focused) setPick(null) }, [pick, focused]) // focused stream ended or hidden: back to automatic
  useEffect(() => {
    if (!pick) return
    const esc = e => { if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest?.('input, textarea, [contenteditable="true"]')) setPick(null) }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [pick])
  const main = focused || shown[0], mainId = main?.replace(/^cam:/, '')
  const tiles = !focused && layout !== 'focus' && shown.length > 1
  const unfocus = () => setPick(null)
  const camItem = id => pick === `cam:${id}` ? { label: 'Stop focusing', icon: 'focus', onClick: unfocus } : { label: 'Focus camera', icon: 'focus', onClick: () => setPick(`cam:${id}`) }
  const streamMenu = id => e => openMenu(e, () => [...(id.startsWith('cam:') ? [camItem(id.slice(4))] : streamItems(id, {
    me: id === meId, focused: id === pick, unfocus, video: e.currentTarget.querySelector('video'),
    focus: () => setPick(id), hide: () => setHidden(h => [...h, id]),
  })), { separator: true }, ...viewItems()])
  const gamesOn = GAMES_ON && channel.games_enabled !== false
  const table = useTable(channel.id, meId, gamesOn)
  const g = gamesOn && table.game
  const atTable = new Set(g ? table.seats.map(s => s.user_id) : []) // seated players walk from the crowd to the table
  const others = list.filter(id => id !== meId && !atTable.has(id))
  const crowd = view !== 'list' && box.w ? fitCrowd(others.length, box.w, box.h * 0.5, list.includes(meId) && !atTable.has(meId)) : null
  const seat = id => ({ id, live: lives.includes(id), face: joined && faces[id], pin: joined && faces[id] && camItem(id) })
  const theme = useRoomTheme(channel, app.ctx?.server)
  const gameFull = prefs.use(s => !!g && s.gameView?.[g.game] === 'full') // screen or full view, per person per game
  // Spotlights hold still and only sweep for a few seconds when someone arrives or leaves.
  const [sweep, setSweep] = useState(true)
  useEffect(() => { setSweep(true); const t = setTimeout(() => setSweep(false), 5000); return () => clearTimeout(t) }, [ids])
  const pickGame = e => openMenu(e, GAME_LIST.map(([id, label]) => ({ label, icon: 'cards', onClick: () => createGame(channel.id, id).then(r => r && table.refresh()) })))

  return (
    <div className={`stage view-${view === 'list' ? 'list' : 'crowd'}${gameFull ? ' game-full' : ''}`} onContextMenu={e => openMenu(e, viewItems)}>
      <ThemeBackdrop theme={theme} variant="stadium" />
      <header className="chat-head room-head" style={roomVars(channel, app.ctx?.server)}>
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button>
        <RoomTitle c={channel} />
      </header>
      <div className="stadium" ref={boxRef} style={crowd ? { '--floor': `${crowd.floor}px`, '--s': `${crowd.s}px` } : undefined}>
        <div className={`stage-screen${main || g ? ' on' : ''}${g ? ' game' : ''}${sweep ? ' sweep' : ''}`} onContextMenu={main && !tiles && !g ? streamMenu(main) : undefined}>
          {g ? (
            <>
              <Boundary key={g.id}><Suspense fallback={null}>
                <GameScreen table={table} meId={meId} joined={joined} full={gameFull} onFull={() => setPref('gameView', { ...prefs.get().gameView, [g.game]: gameFull ? 'screen' : 'full' })} />
              </Suspense></Boundary>
              {shown.length > 0 && !gameFull && <div className="stage-thumbs game-thumbs">{shown.map(id => <div key={id} className="stage-thumb" onContextMenu={streamMenu(id)} title="Live"><Screen stream={all[id]} /></div>)}</div>}
            </>
          ) : tiles ? (
            <div className={`stage-tiles ${layout}`}>
              {shown.map(id => (
                <div key={id} className="stage-tile" onClick={() => setPick(id)} onContextMenu={streamMenu(id)} title="Focus this stream">
                  <ZoomScreen stream={all[id]} />
                  <div className="stage-caption"><b className="live-badge"><Icon name="live" size="1.25em" /> LIVE</b> <Name id={id} /></div>
                </div>
              ))}
            </div>
          ) : main ? (
            <>
              <ZoomScreen key={main} stream={camOf(main) || all[main]} />
              <div className="stage-caption"><b className="live-badge"><Icon name="live" size="1.25em" /> LIVE</b> <Name id={mainId} /></div>
              {shown.some(id => id !== main) && (
                <div className="stage-thumbs">
                  {shown.filter(id => id !== main).map(id => (
                    <button key={id} className="stage-thumb" onClick={() => setPick(id)} onContextMenu={streamMenu(id)} title="Watch this stream">
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
        {view === 'list' ? (
          <div className="stage-crowd list">
            {list.length === 0 && <p className="muted">Nobody's here yet.</p>}
            {list.map(id => <Seat key={id} {...seat(id)} me={id === meId} size={64} tile />)}
          </div>
        ) : (
          <div className="stage-crowd crowd" style={{ height: crowd?.height }}>
            {list.length === 0 && <p className="muted">Nobody's here yet.</p>}
            {crowd && others.map((id, i) => {
              const p = crowd.seats[i]
              return <Seat key={id} {...seat(id)} size={crowd.s} back={p.row > 0}
                style={{ right: p.x, bottom: Math.round(p.row * crowd.s * ROW), zIndex: 50 - p.row }} />
            })}
            {crowd?.me > 0 && <Seat {...seat(meId)} me size={crowd.me} style={{ right: 0, bottom: 0, zIndex: 60 }} />}
          </div>
        )}
      </div>
      <div className="stage-actions">
        {!joined && <button className="btn primary big join-voice" onClick={onJoin}>Join stadium</button>}
        {joined && hidden.length > 0 && <button className="btn ghost" onClick={() => setHidden([])}><Icon name="eye" size={18} /> Show {hidden.length} hidden</button>}
        {joined && canShare && <button className={`btn ${live ? 'danger' : 'primary'}`} onClick={onLive}><Icon name={live ? 'stop' : 'screen'} size={18} /> {live ? 'Stop sharing' : 'Go live'}</button>}
        {joined && canCam && <button className={`btn ${cam ? 'danger' : 'primary'}`} onClick={onCam}><Icon name={cam ? 'camera-off' : 'camera'} size={18} /> {cam ? 'Camera off' : 'Camera'}</button>}
        {joined && gamesOn && !g && <button className="btn primary" onClick={pickGame}><Icon name="cards" size={18} /> Games</button>}
      </div>
    </div>
  )
}
