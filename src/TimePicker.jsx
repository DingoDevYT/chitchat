import { useState } from 'react'
import { fmtTimestamp } from './lib/markdown'
import Modal from './Modal'

const FORMATS = [['f', 'Date and time'], ['F', 'Full'], ['R', 'Relative'], ['t', 'Short time'], ['T', 'Long time'], ['d', 'Short date'], ['D', 'Long date']]
// datetime-local wants local "YYYY-MM-DDTHH:mm"; start at the next 5 minutes
const localNow = () => { const d = new Date(Math.ceil(Date.now() / 300000) * 300000); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }

// Composer helper (+ menu, or typing /time): pick a moment, get a <t:unix:F> that shows in everyone's own time zone.
export function TimePicker({ onInsert, onClose }) {
  const [at, setAt] = useState(localNow)
  const [f, setF] = useState('f')
  const unix = Math.floor(new Date(at).getTime() / 1000)
  const ok = Number.isFinite(unix)
  return (
    <Modal title="Insert a timestamp" onClose={onClose}>
      <form className="col time-picker" onSubmit={e => { e.preventDefault(); if (ok) onInsert(`<t:${unix}:${f}>`) }}>
        <label>When<input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} required autoFocus /></label>
        <fieldset className="tp-formats">
          <legend>Shows as</legend>
          {FORMATS.map(([k, label]) => (
            <label key={k} className={`tp-format${f === k ? ' on' : ''}`}>
              <input type="radio" name="tp-format" value={k} checked={f === k} onChange={() => setF(k)} />
              <span className="tp-label">{label}</span>
              <span className="tp-preview">{ok ? fmtTimestamp(unix, k) : '…'}</span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">Everyone sees it in their own time zone.</p>
        <button className="btn primary" disabled={!ok}>Insert</button>
      </form>
    </Modal>
  )
}
