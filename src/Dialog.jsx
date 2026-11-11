import { useEffect, useRef, useState } from 'react'
import { createStore } from './lib/store'
import { uiSound } from './lib/animalese'
import { Critter } from './Avatar'

// In-app replacements for window.confirm / prompt / alert, as Chit's speech bubble.
//   if (!await ask('Delete this message?')) return            → true / false
//   await ask({ text, title, confirm: 'Delete', cancel, danger: true })
//   const name = await askText({ text, value, placeholder, type, confirm })   → string, or null when cancelled
//   await tell('Password updated!')
// One at a time; later calls wait their turn.
const queue = createStore([])
let nextId = 0
const open = (kind, opts) => new Promise(resolve => {
  const o = typeof opts === 'string' ? { text: opts } : opts
  queue.set(q => [...q, { ...o, kind, resolve, id: ++nextId }])
})
export const ask = opts => open('ask', opts)
export const askText = opts => open('text', opts)
export const tell = opts => open('tell', opts)

export default function DialogHost() {
  const d = queue.use(q => q[0])
  return d ? <Bubble key={d.id} d={d} /> : null
}

function Bubble({ d }) {
  const [value, setValue] = useState(d.value ?? '')
  const [out, setOut] = useState(false)
  const input = useRef(null)
  const done = result => {
    if (out) return
    setOut(true)
    d.resolve(result)
    uiSound('close')
    setTimeout(() => queue.set(q => q.filter(x => x !== d)), 160) // after the pop-out
  }
  const cancel = () => done(d.kind === 'ask' ? false : d.kind === 'text' ? null : undefined)

  useEffect(() => {
    uiSound('open')
    if (d.kind === 'text') input.current?.select()
    // capture + stop: Escape closes only this bubble, not the modal or menu under it
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancel() } }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const title = d.title || 'Chit'
  return (
    // stopPropagation: clicks in the bubble don't count as "outside" for the popover (profile card…) that asked
    <div className="backdrop dialog-backdrop" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) cancel() }}>
      <form className={`bubble-dialog pop${out ? ' out' : ''}`} role={d.kind === 'tell' ? 'dialog' : 'alertdialog'} aria-modal="true"
        aria-label={title} aria-describedby={`dlg-${d.id}`}
        onSubmit={e => { e.preventDefault(); done(d.kind === 'ask' ? true : d.kind === 'text' ? value : undefined) }}>
        {!d.title && <span className="dialog-chit"><Critter size={46} color="#ff9f6b" /></span>}
        <span className="name-tag" style={d.title ? { left: 20 } : undefined}>{title}</span>
        <p className="bubble-text" id={`dlg-${d.id}`}>{d.text}</p>
        {d.kind === 'text' && <input ref={input} autoFocus type={d.type || 'text'} value={value} placeholder={d.placeholder}
          onChange={e => setValue(e.target.value)} aria-label={d.label || d.text} minLength={d.minLength} required={d.required} />}
        <div className="bubble-choices">
          {d.kind !== 'tell' && <button type="button" className="btn ghost" onClick={cancel}>{d.cancel || 'Cancel'}</button>}
          <button className={`btn ${d.danger ? 'danger' : 'primary'}`} autoFocus={d.kind !== 'text'}>{d.confirm || 'OK'}</button>
        </div>
      </form>
    </div>
  )
}
