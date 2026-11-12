// The voice booth: record one battle cry (up to 5 s, re-record as often as you like), drop up to three filters into
// the rack, preview it live, then bake and send. The rack works with a mouse or a finger: tap a chip to fill the next
// slot, drag a chip onto a slot, drag between slots to swap, tap a slot to clear it. No mic (or no permission) means
// your champion squeaks instead.
import { useEffect, useRef, useState } from 'react'
import { FILTERS, emptyRack, rackAdd, rackClear, rackIds, rackMove, rackPut } from './filters.js'
import { REC_MS, audio, bake, preview, record, speak } from './audio.js'
import { CRIES, MAX_CRY_TEXT } from './cries.js'
import { squeak } from './filters.js'
import { Doodle } from './Doodle.jsx'
import Icon from '../../icons/Icon'

const byId = Object.fromEntries(FILTERS.map(f => [f.id, f]))

// Pointer drag shared by chips and slots: a short press is a tap, a move past 6 px picks it up.
function useDrag(onDrop) {
  const [drag, setDrag] = useState(null) // { id, from, x, y }
  const st = useRef(null)
  const start = (e, id, from) => {
    if (e.button > 0) return
    st.current = { id, from, x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId, el: e.currentTarget }
  }
  useEffect(() => {
    const mv = e => {
      const s = st.current
      if (!s || s.pid !== e.pointerId) return
      if (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 6) { s.moved = true; s.el.setPointerCapture?.(e.pointerId) }
      if (s.moved) { e.preventDefault(); setDrag({ id: s.id, from: s.from, x: e.clientX, y: e.clientY }) }
    }
    const up = e => {
      const s = st.current
      if (!s || s.pid !== e.pointerId) return
      st.current = null
      setDrag(null)
      if (!s.moved) return onDrop(s, null, true)
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]')
      onDrop(s, hit ? +hit.dataset.slot : null, false)
    }
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up)
    return () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up) }
  })
  return [drag, start]
}

export function Rack({ slots, setSlots }) {
  const [drag, start] = useDrag((s, to, tap) => {
    if (tap) return setSlots(x => s.from != null ? rackClear(x, s.from) : x.includes(s.id) ? rackClear(x, x.indexOf(s.id)) : rackAdd(x, s.id))
    if (to == null) return s.from != null && setSlots(x => rackClear(x, s.from)) // dragged off the rack: out it goes
    setSlots(x => s.from == null ? rackPut(x, s.id, to) : rackMove(x, s.from, to))
  })
  const over = drag && document.elementFromPoint(drag.x, drag.y)?.closest('[data-slot]')?.dataset.slot
  return (
    <div className="pcf-rackbox">
      <div className="pcf-rack" aria-label="Filter rack, three slots">
        {slots.map((id, i) => (
          <button key={i} data-slot={i} className={`pcf-slot${id ? ' full' : ''}${over == i ? ' over' : ''}${drag?.from === i ? ' lifted' : ''}`} style={id ? { '--hue': byId[id].hue } : undefined} // eslint-disable-line eqeqeq
            onPointerDown={id ? e => start(e, id, i) : undefined} onKeyDown={e => { if (id && (e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); setSlots(x => rackClear(x, i)) } }}
            aria-label={id ? `Slot ${i + 1}: ${byId[id].name}. Press to clear.` : `Slot ${i + 1}: empty`}>
            <span className="n">{i + 1}</span>{id ? <><FilterGlyph id={id} /><b>{byId[id].name}</b></> : <small>Drop a filter</small>}
          </button>
        ))}
      </div>
      <div className="pcf-chips" aria-label="Filters">
        {FILTERS.map(f => {
          const on = slots.includes(f.id)
          return (
            <button key={f.id} className={`pcf-chip${on ? ' on' : ''}`} style={{ '--hue': f.hue }} onPointerDown={e => start(e, f.id, null)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSlots(x => on ? rackClear(x, x.indexOf(f.id)) : rackAdd(x, f.id)) } }} aria-pressed={on}>
              <FilterGlyph id={f.id} />{f.name}
            </button>
          )
        })}
      </div>
      {drag && <span className="pcf-chip ghost" style={{ left: drag.x, top: drag.y, '--hue': byId[drag.id].hue }} aria-hidden="true"><FilterGlyph id={drag.id} />{byId[drag.id].name}</span>}
    </div>
  )
}

// Tiny doodled glyph per filter (no emoji).
const GLYPHS = {
  high: 'M4 16l5-5 4 3 7-8 M16 6h4v4', low: 'M4 8l5 5 4-3 7 8 M16 18h4v-4', chipmunk: 'M7 10a3 3 0 116 0 3 3 0 11-6 0 M12 10a3 3 0 116 0 M9 15q3 3 6 0',
  slowmo: 'M5 17q4-10 8-6t6-3 M4 19h16', reverb: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0 M7 7a7 7 0 000 10 M17 7a7 7 0 010 10 M4 4a11 11 0 000 16 M20 4a11 11 0 010 16',
  echo: 'M4 12h3 M9 9v6 M13 7v10 M17 10v4 M21 11v2', wah: 'M3 13q3-8 6 0t6 0 6 0', robot: 'M6 8h12v10H6z M9 12h1 M14 12h1 M10 15h4 M12 8V5',
  crunchy: 'M4 16h4v-4h4v-4h4v4h4', distort: 'M3 12l3-6 3 12 3-12 3 12 3-6 3 0', phone: 'M6 4h4l1 4-2 2a10 10 0 005 5l2-2 4 1v4c-8 1-15-6-14-14z',
  alien: 'M12 4c5 0 7 4 7 7 0 4-4 9-7 9s-7-5-7-9c0-3 2-7 7-7z M8 11l3 2 M16 11l-3 2', underwater: 'M3 9q3-3 6 0t6 0 6 0 M3 15q3-3 6 0t6 0 6 0 M8 4h1 M15 4h1',
}
export const FilterGlyph = ({ id }) => <svg className="pcf-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={GLYPHS[id]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>

export default function Booth({ champ, prompt, left, onSend, onNone, demo }) {
  const [buf, setBuf] = useState(demo?.buf ?? null)
  const [recOn, setRecOn] = useState(false)
  const [lvl, setLvl] = useState(0)
  const [slots, setSlots] = useState(demo?.slots ?? emptyRack())
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState('') // 'baking' | 'sending'
  const [noMic, setNoMic] = useState(demo?.noMic ?? false)
  const [t0, setT0] = useState(0)
  const [typed, setTyped] = useState('') // no mic: a line for the speech voice to shout
  const rec = useRef(null), stopPrev = useRef(null), sent = useRef(false)
  const now = useTick(recOn)

  useEffect(() => () => { rec.current?.cancel(); stopPrev.current?.() }, [])
  const startRec = async () => {
    stopPrev.current?.()
    try {
      rec.current = await record({ maxMs: REC_MS, onLevel: setLvl, onAuto: () => stopRec() })
      setRecOn(true); setT0(Date.now())
    } catch (e) {
      console.warn('mic', e)
      setNoMic(true)
    }
  }
  const stopRec = async () => {
    const r = rec.current
    if (!r) return
    rec.current = null
    setRecOn(false)
    try { setBuf(await r.stop()) } catch { setNoMic(true) }
  }
  const play = () => {
    if (playing) { stopPrev.current?.(); return }
    if (!buf) return
    setPlaying(true)
    stopPrev.current = preview(buf, rackIds(slots), () => { setPlaying(false); stopPrev.current = null })
  }
  const send = async () => {
    if (sent.current) return
    sent.current = true
    stopPrev.current?.(); if (rec.current) await stopRec()
    if (!buf) return onNone(typed)
    setBusy('baking')
    try {
      const baked = await bake(buf, rackIds(slots))
      if (!baked) { setBusy(''); return onNone(typed) }
      setBusy('sending')
      if (!(await onSend(baked))) { sent.current = false; setBusy('') }
    } catch (e) { console.warn('bake failed', e); onNone(typed) }
  }
  // Time's nearly up: send what there is (or squeak).
  useEffect(() => { if (left != null && left <= 2 && !sent.current) send() }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  const recLeft = recOn ? Math.max(0, REC_MS - (now - t0)) : 0

  return (
    <div className="pcf-booth">
      <div className="pcf-booth-head">
        <span className="pcf-mini"><Doodle art={champ.art} /></span>
        <div><small>Give a battle cry to</small><b>{champ.name || 'your champion'}</b><small className="muted">{prompt}</small></div>
      </div>
      {noMic ? (
        <div className="pcf-nomic" role="status">
          <b>No microphone today</b>
          <p>That's fine: type a battle cry and a silly robot voice will shout it (leave it empty for a random one).</p>
          <input className="pcf-crytext" value={typed} maxLength={MAX_CRY_TEXT} onChange={e => setTyped(e.target.value)} placeholder={CRIES[(champ.name || '').length % CRIES.length]} aria-label="Battle cry to shout" />
          <div className="pcf-row"><button className="pcf-tool wide" onClick={() => { if (!speak(typed || CRIES[(champ.name || '').length % CRIES.length], 2)) squeak(audio(), audio().destination, 2, audio().currentTime + 0.02) }}><Icon name="play" size={16} /> Hear it</button>
            <button className="pcf-tool wide" onClick={() => { setNoMic(false); startRec() }}><Icon name="mic" size={16} /> Try the mic again</button></div>
        </div>
      ) : (
        <div className="pcf-recorder">
          <button className={`pcf-rec${recOn ? ' on' : ''}`} onClick={recOn ? stopRec : startRec} disabled={!!busy} style={{ '--lvl': lvl, '--p': recOn ? 1 - recLeft / REC_MS : 0 }} aria-label={recOn ? 'Stop recording' : buf ? 'Record again' : 'Record your battle cry'}>
            <span className="ring" /><Icon name={recOn ? 'stop' : 'mic'} size={30} />
          </button>
          <div className="pcf-rec-text">
            <b>{recOn ? `Recording… ${Math.ceil(recLeft / 1000)}` : buf ? `Got it: ${buf.duration.toFixed(1)} s` : 'Tap to record'}</b>
            <small>{recOn ? 'Tap to stop' : buf ? 'Tap the mic to record it again' : 'Up to 5 seconds. Shout something heroic!'}</small>
          </div>
          <button className="pcf-tool round" onClick={play} disabled={!buf || recOn || !!busy} aria-label={playing ? 'Stop preview' : 'Preview with filters'} title="Preview with filters"><Icon name={playing ? 'stop' : 'play'} size={20} /></button>
        </div>
      )}
      <Rack slots={slots} setSlots={setSlots} />
      <button className="pcf-go" onClick={send} disabled={!!busy || recOn}>{busy === 'baking' ? 'Baking your battle cry…' : busy === 'sending' ? 'Sending…' : buf ? 'Bake it and send' : noMic ? 'Shout it' : 'Skip: just squeak'}</button>
    </div>
  )
}

function useTick(on) {
  const [n, setN] = useState(Date.now())
  useEffect(() => { if (!on) return; const t = setInterval(() => setN(Date.now()), 100); return () => clearInterval(t) }, [on])
  return n
}
