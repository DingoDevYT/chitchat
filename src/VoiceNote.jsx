import { useEffect, useRef, useState } from 'react'
import { toast } from './lib/store'
import { MAX_SEC, fmtDur, peaks } from './lib/voicenote'
import { SendIcon, TrashIcon } from './icons'

const MIME = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || ''

// Real waveform + duration from the recording itself (MediaRecorder's webm has no duration header).
async function analyse(blob) {
  const ctx = new OfflineAudioContext(1, 1, 48000)
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
  return { duration: Math.round(buf.duration * 10) / 10, waveform: peaks(buf.getChannelData(0)) }
}

// Records a voice message. Asks for the mic only now (the user just pressed the mic button).
// holdStart: when the button was pressed; letting go after a moment sends (hold-to-talk), a quick click keeps recording.
export default function VoiceRecorder({ holdStart, onDone }) {
  const [sec, setSec] = useState(0)
  const [levels, setLevels] = useState([])
  const [live, setLive] = useState(false)
  const r = useRef({})
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const s = r.current
    let dead = false
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(stream => {
      if (dead) return stream.getTracks().forEach(t => t.stop())
      s.stream = stream
      s.rec = new MediaRecorder(stream, { ...(MIME && { mimeType: MIME }), audioBitsPerSecond: 48000 })
      s.chunks = []
      s.rec.ondataavailable = e => e.data.size && s.chunks.push(e.data)
      s.rec.start(250)
      s.t0 = Date.now()
      s.ctx = new AudioContext()
      const an = s.ctx.createAnalyser()
      an.fftSize = 512
      s.ctx.createMediaStreamSource(stream).connect(an)
      const data = new Uint8Array(an.fftSize)
      s.tick = setInterval(() => {
        an.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += (v - 128) ** 2
        const lvl = Math.min(100, Math.max(6, Math.sqrt(sum / data.length) * 4))
        setLevels(l => [...l.slice(-47), lvl])
        const t = (Date.now() - s.t0) / 1000
        setSec(t)
        if (t >= MAX_SEC) { toast('Voice messages can be up to 5 minutes, so that one is on its way.'); finish(true) }
      }, 80)
      setLive(true)
    }, () => { toast('Chitchat needs your mic to record a voice message.'); done.current(null) })
    return () => { dead = true; stop() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hold-to-talk: releasing after half a second sends.
  useEffect(() => {
    if (!holdStart) return
    const up = () => { if (Date.now() - holdStart > 500 && r.current.rec) finish(true) }
    addEventListener('pointerup', up, { once: true })
    return () => removeEventListener('pointerup', up)
  }, [holdStart]) // eslint-disable-line react-hooks/exhaustive-deps

  function stop() {
    const s = r.current
    clearInterval(s.tick)
    s.stream?.getTracks().forEach(t => t.stop())
    s.ctx?.close().catch(() => {})
  }

  function finish(send) {
    const s = r.current
    if (s.finished) return
    s.finished = true
    clearInterval(s.tick)
    if (!send || !s.rec) { stop(); s.rec?.state === 'recording' && s.rec.stop(); return done.current(null) }
    s.rec.onstop = async () => {
      stop()
      const type = (s.rec.mimeType || MIME || 'audio/webm').split(';')[0]
      const blob = new Blob(s.chunks, { type })
      if ((Date.now() - s.t0) < 600 || !blob.size) { toast('Hold a little longer to record.'); return done.current(null) }
      const meta = await analyse(blob).catch(() => ({ duration: Math.round((Date.now() - s.t0) / 100) / 10, waveform: null }))
      const file = new File([blob], `voice-message.${type.split('/')[1] === 'mp4' ? 'm4a' : type.split('/')[1]}`, { type })
      file.meta = { voice: true, ...meta } // shortcut: expando read by Chat's deliver(); a File can't carry custom fields otherwise
      done.current(file)
    }
    s.rec.stop()
  }

  return (
    <div className="voice-rec" role="group" aria-label="Recording a voice message">
      <button className="icon-btn danger" onClick={() => finish(false)} aria-label="Cancel voice message" title="Cancel"><TrashIcon /></button>
      <span className={`rec-dot${live ? ' on' : ''}`} aria-hidden="true" />
      <div className="rec-bars" aria-hidden="true">{levels.map((v, i) => <i key={i} style={{ height: v + '%' }} />)}</div>
      <span className="rec-time" aria-live="off">{live ? fmtDur(sec) : 'Mic…'}</span>
      <button className="send-btn" onClick={() => finish(true)} disabled={!live} aria-label="Send voice message" title="Send"><SendIcon /></button>
    </div>
  )
}
