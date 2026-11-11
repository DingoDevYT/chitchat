import { useEffect, useRef, useState } from 'react'
import { micLevel, prefs, setPref, toast } from './lib/store'
import { keyLabel } from './lib/voice'
import { camVideo, canCam, canPickOut, checkDevices, makeMic, makeOut } from './Voice'

const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
const pct = v => `${Math.round(v * 100)}%`

// The "Voice & video" settings tab. Everything saves to prefs as you change it; a call picks it up live.
export default function VoiceSettings() {
  const p = prefs.use()
  const [devices, setDevices] = useState([])
  const [reload, setReload] = useState(0)
  const [camTest, setCamTest] = useState(false)

  useEffect(() => {
    if (!md?.enumerateDevices) return
    const load = () => md.enumerateDevices().then(ds => { setDevices(ds); checkDevices(ds) }, () => {})
    load()
    md.addEventListener?.('devicechange', load)
    return () => md.removeEventListener?.('devicechange', load)
  }, [reload])

  // Labels stay blank until the site has mic permission; ask once, then let go of the mic straight away.
  const allow = () => md.getUserMedia({ audio: true }).then(s => { s.getTracks().forEach(t => t.stop()); setReload(n => n + 1) },
    () => toast('Microphone access was blocked.'))
  const of = kind => devices.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default')
  const picker = (label, k, kind, extra) => (
    <label>{label}
      <select value={p[k]} onChange={e => setPref(k, e.target.value)} {...extra}>
        <option value="">Default</option>
        {of(kind).map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>)}
      </select>
    </label>
  )

  return (
    <div className="col">
      {devices.some(d => d.kind === 'audioinput' && !d.label) &&
        <button className="btn ghost" onClick={allow}>🎙️ Allow microphone to see device names</button>}
      <div className="av-grid">
        {picker('Input device', 'micId', 'audioinput')}
        {picker('Output device', 'speakerId', 'audiooutput', { disabled: !canPickOut })}
        <label>Input volume {pct(p.inVol)}<input type="range" min="0" max="2" step="0.05" value={p.inVol} onChange={e => setPref('inVol', +e.target.value)} /></label>
        <label>Output volume {pct(p.outVol)}<input type="range" min="0" max="2" step="0.05" value={p.outVol} onChange={e => setPref('outVol', +e.target.value)} /></label>
      </div>
      {!canPickOut && <p className="muted small">This browser always plays through your system's output device.</p>}

      <div>Input mode
        <div className="tabs small">
          <button className={!p.ptt ? 'on' : ''} onClick={() => setPref('ptt', false)}>Voice activity</button>
          <button className={p.ptt ? 'on' : ''} onClick={() => setPref('ptt', true)}>Push to talk</button>
        </div>
      </div>
      {p.ptt ? (
        <div className="row">
          <span className="small">Talk while holding</span><KeyRecorder value={p.pttKey} />
          <span className="muted small">Only works while Chitchat is the focused tab.</span>
        </div>
      ) : (
        <div className="col">
          <label className="toggle"><input type="checkbox" checked={p.vadAuto} onChange={e => setPref('vadAuto', e.target.checked)} />
            <span>Automatically set sensitivity</span></label>
          <Meter auto={p.vadAuto} threshold={p.vadThreshold} />
        </div>
      )}
      <MicTest />

      <div className="col tight">
        <label className="toggle"><input type="checkbox" checked={p.ns} onChange={e => setPref('ns', e.target.checked)} /><span>Noise suppression</span></label>
        <label className="toggle"><input type="checkbox" checked={p.ec} onChange={e => setPref('ec', e.target.checked)} /><span>Echo cancellation</span></label>
        <label className="toggle"><input type="checkbox" checked={p.agc} onChange={e => setPref('agc', e.target.checked)} /><span>Automatic gain control</span></label>
      </div>

      <div className="col tight">
        <label className="toggle"><input type="checkbox" checked={p.normalise} onChange={e => setPref('normalise', e.target.checked)} />
          <span>Normalise voices <span className="muted small">· evens out quiet and loud people in stadiums</span></span></label>
        <label className="toggle"><input type="checkbox" checked={p.ttsHear} onChange={e => setPref('ttsHear', e.target.checked)} />
          <span>Read 🔊 TTS messages aloud in stadiums I've joined</span></label>
      </div>

      {canCam && (
        <div className="cam-setup">
          {picker('Camera', 'camId', 'videoinput')}
          {camTest && <CamPreview camId={p.camId} />}
          <button className="btn ghost small" onClick={() => setCamTest(t => !t)}>{camTest ? 'Stop preview' : '📷 Preview camera'}</button>
        </div>
      )}
    </div>
  )
}

// Level bar with the sensitivity threshold on it; drag (or arrow keys) to move it. Live while your mic is open.
function Meter({ auto, threshold }) {
  const m = micLevel.use()
  const ref = useRef(null)
  const thr = auto ? m?.thr ?? threshold : threshold
  const set = v => setPref('vadThreshold', Math.round(Math.max(0, Math.min(100, v))))
  const drag = e => { const r = ref.current.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100) }
  const keys = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2 }
  return (
    <div>
      <div ref={ref} className={`meter${m?.open ? ' open' : ''}${auto ? ' auto' : ''}`} role="slider" tabIndex={auto ? -1 : 0}
        aria-label="Voice sensitivity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(thr)} aria-valuetext={`${Math.round(thr - 100)} dB`}
        aria-disabled={auto}
        onPointerDown={e => { if (auto) return; e.currentTarget.setPointerCapture(e.pointerId); drag(e) }}
        onPointerMove={e => !auto && e.buttons && drag(e)}
        onKeyDown={e => { if (!auto && keys[e.key]) { e.preventDefault(); set(threshold + keys[e.key]) } }}>
        <i style={{ width: `${m?.lvl ?? 0}%` }} />
        <b style={{ left: `${thr}%` }} />
      </div>
      <p className="muted small">{m ? (auto ? 'Sensitivity follows your background noise.' : `You're heard above ${Math.round(thr - 100)} dB; quieter sound is cut.`)
        : "Join a stadium or press Let's check to see your level."}</p>
    </div>
  )
}

// "Press any key" recorder. Esc cancels (and doesn't close the modal: we catch it first).
function KeyRecorder({ value }) {
  const [rec, setRec] = useState(false)
  useEffect(() => {
    if (!rec) return
    const on = e => { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape') setPref('pttKey', e.code); setRec(false) }
    addEventListener('keydown', on, true)
    return () => removeEventListener('keydown', on, true)
  }, [rec])
  return <button className={`btn small ${rec ? 'primary' : 'ghost'}`} onClick={() => setRec(true)} aria-label="Change push-to-talk key">
    {rec ? 'Press any key…' : <kbd>{keyLabel(value)}</kbd>}</button>
}

// Plays your mic back through the same send graph and output, so you hear volume, gate and device as others would.
function MicTest() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const ctx = new AudioContext()
    let mic = null, out = null, off = false
    ;(async () => {
      try {
        mic = await makeMic(ctx)
        if (off) return mic.stop()
        await mic.acquire()
        if (off) return
        out = makeOut(ctx)
        mic.node.connect(out.master)
      } catch { toast("Couldn't open your microphone."); setOn(false) }
    })()
    return () => { off = true; mic?.stop(); out?.stop(); ctx.close() }
  }, [on])
  return (
    <div className="row">
      <button className={`btn small ${on ? 'danger' : 'primary'}`} onClick={() => setOn(o => !o)}>{on ? '⏹️ Stop checking' : "🎧 Let's check"}</button>
      <span className="muted small">{on ? 'Say something, you should hear yourself.' : 'Hear yourself as others do. Headphones help.'}</span>
    </div>
  )
}

function CamPreview({ camId }) {
  const ref = useRef(null)
  useEffect(() => {
    let s = null, off = false
    md.getUserMedia({ video: camVideo() }).then(x => {
      if (off) return x.getTracks().forEach(t => t.stop())
      s = x
      ref.current.srcObject = x
    }, () => toast("Couldn't turn on your camera."))
    return () => { off = true; s?.getTracks().forEach(t => t.stop()) } // camera light off when the tab or modal closes
  }, [camId])
  return <video ref={ref} className="cam-preview" autoPlay playsInline muted />
}
