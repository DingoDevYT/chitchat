// The drawing pad: a square canvas on the 256 grid, crayons, three sizes, eraser, undo and clear. Pointer events with
// touch-action: none, so a finger draws instead of scrolling. Strokes are packed (ink.js) as they finish, and the
// ink meter shows how much of the referee's point budget is used.
import { useEffect, useRef, useState } from 'react'
import { COLORS, COLOR_NAMES, ERASER, MAX_NAME, MAX_POINTS, MAX_STROKES, SIZES, artPoints, makeStroke, pathOf, unpackPts } from './ink.js'
import Icon from '../../icons/Icon'

const SIZE_NAMES = ['Thin', 'Medium', 'Thick']

export default function DrawPad({ prompt, left, onSubmit, sending }) {
  const [strokes, setStrokes] = useState([])
  const [trash, setTrash] = useState(null) // the drawing before "clear", so undo can bring it back
  const [color, setColor] = useState(0)
  const [size, setSize] = useState(1)
  const [name, setName] = useState('')
  const [full, setFull] = useState(false)
  const cv = useRef(null), live = useRef(null), sent = useRef(false)
  const used = artPoints(strokes), pct = Math.min(1, used / MAX_POINTS)

  // Size the canvas to its box (crisp on high-DPI screens) and repaint.
  const paint = list => {
    const c = cv.current
    if (!c) return
    const g = c.getContext('2d'), k = c.width / 256
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = COLORS[ERASER]; g.fillRect(0, 0, c.width, c.height)
    g.setTransform(k, 0, 0, k, 0, 0)
    g.lineCap = 'round'; g.lineJoin = 'round'
    for (const s of list) { const pts = unpackPts(s.p); if (!pts) continue; g.strokeStyle = COLORS[s.c]; g.lineWidth = SIZES[s.w]; g.stroke(new Path2D(pathOf(pts))) }
  }
  const latest = useRef(strokes)
  latest.current = strokes
  useEffect(() => {
    const c = cv.current
    const fit = () => { const r = c.getBoundingClientRect(), d = Math.min(3, devicePixelRatio || 1); c.width = Math.max(64, Math.round(r.width * d)); c.height = c.width; paint(latest.current) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])
  useEffect(() => paint(strokes), [strokes])

  const at = e => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 256, ((e.clientY - r.top) / r.height) * 256] }
  const down = e => {
    if (sending || e.button > 0) return
    if (strokes.length >= MAX_STROKES || used >= MAX_POINTS) { setFull(true); return }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const [x, y] = at(e)
    live.current = { id: e.pointerId, pts: [x, y] }
    const g = cv.current.getContext('2d')
    g.strokeStyle = COLORS[color]; g.lineWidth = SIZES[size]
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.01, y); g.stroke()
  }
  const moveTo = e => {
    const l = live.current
    if (!l || l.id !== e.pointerId) return
    const g = cv.current.getContext('2d')
    for (const ev of e.nativeEvent.getCoalescedEvents?.() || [e]) {
      const [x, y] = at(ev), n = l.pts.length
      g.beginPath(); g.moveTo(l.pts[n - 2], l.pts[n - 1]); g.lineTo(x, y); g.stroke()
      l.pts.push(x, y)
    }
  }
  const up = e => {
    const l = live.current
    if (!l || l.id !== e.pointerId) return
    live.current = null
    const st = makeStroke(color, size, l.pts)
    if (artPoints([st]) + used > MAX_POINTS) { setFull(true); paint(strokes); return }
    setTrash(null)
    setStrokes(s => [...s, st])
  }
  const undo = () => {
    if (strokes.length) setStrokes(s => s.slice(0, -1))
    else if (trash) { setStrokes(trash); setTrash(null) }
    setFull(false)
  }
  const clear = () => { if (!strokes.length) return; setTrash(strokes); setStrokes([]); setFull(false) }

  useEffect(() => {
    const kd = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); undo() } }
    addEventListener('keydown', kd)
    return () => removeEventListener('keydown', kd)
  })
  const send = () => { if (sent.current) return; sent.current = true; onSubmit(latest.current, name) }
  // The clock is nearly out: hand in whatever is on the page.
  useEffect(() => { if (left != null && left <= 3 && !sent.current) send() }, [left]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pcf-drawpad">
      <div className="pcf-brief"><small>Draw a champion for</small><b>{prompt}</b></div>
      <div className="pcf-pad">
        <canvas ref={cv} onPointerDown={down} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} aria-label={`Drawing canvas: ${prompt}`} role="img" />
        {!strokes.length && <span className="pcf-pad-hint" aria-hidden="true">Draw here</span>}
        <span className={`pcf-ink${pct > 0.85 ? ' low' : ''}`} title="Crayon left" aria-label={`${Math.round((1 - pct) * 100)}% crayon left`}><i style={{ width: `${(1 - pct) * 100}%` }} /></span>
      </div>
      {full && <p className="pcf-note" role="status">Out of crayon! Undo a stroke, or send it as it is.</p>}
      <div className="pcf-tools">
        <div className="pcf-crayons" role="radiogroup" aria-label="Crayon">
          {COLORS.map((c, i) => (
            <button key={i} role="radio" aria-checked={color === i} className={`pcf-crayon${color === i ? ' on' : ''}${i === ERASER ? ' eraser' : ''}`} style={{ '--c': c }} onClick={() => setColor(i)} title={COLOR_NAMES[i]} aria-label={COLOR_NAMES[i]}>
              {i === ERASER && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l8-8 6 6-6 6H9z M9 19h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>}
            </button>
          ))}
        </div>
        <div className="pcf-row">
          <span className="pcf-sizes" role="radiogroup" aria-label="Size">
            {SIZES.map((w, i) => <button key={i} role="radio" aria-checked={size === i} className={size === i ? 'on' : ''} onClick={() => setSize(i)} title={SIZE_NAMES[i]} aria-label={SIZE_NAMES[i]}><i style={{ width: 4 + w * 1.3, height: 4 + w * 1.3, background: color === ERASER ? '#c9b89c' : COLORS[color] }} /></button>)}
          </span>
          <button className="pcf-tool" onClick={undo} disabled={!strokes.length && !trash} title="Undo (Ctrl+Z)" aria-label="Undo">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 7L4 11l5 4 M4.5 11H14a5 5 0 010 10h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="pcf-tool" onClick={clear} disabled={!strokes.length} title="Clear the page" aria-label="Clear the page"><Icon name="trash" size={18} /></button>
          <input className="pcf-name" value={name} maxLength={MAX_NAME} onChange={e => setName(e.target.value)} placeholder="Name your champion" aria-label="Champion name" />
        </div>
      </div>
      <button className="pcf-go" onClick={send} disabled={sending || sent.current}>{sending || sent.current ? 'Off to the locker room…' : 'Send to the locker room'}</button>
    </div>
  )
}
