import { useEffect, useRef, useState } from 'react'
import { createStore, isDND, prefs, setPref } from './lib/store'
import { uiSound } from './lib/animalese'
import { Critter } from './Avatar'

// "You got…" pop-ups: Chit celebrates a first-time moment, once per user each (remembered in prefs.gotShown).
// Queued one at a time, ~3.5 s each, click to dismiss. Never in Do Not Disturb (and then not marked shown, so it can come later).
const queue = createStore([])
let me = null

export function youGot(kind, text) {
  const key = `${me}:${kind}`
  if (!me || isDND() || prefs.get().gotShown?.[key] || queue.get().some(g => g.key === key)) return
  setPref('gotShown', { ...prefs.get().gotShown, [key]: 1 })
  queue.set(q => [...q, { key, text }])
}

export default function YouGotHost({ userId }) {
  useEffect(() => { me = userId; return () => { me = null; queue.set([]) } }, [userId])
  const cur = queue.use(q => q[0])
  return <div className="you-got-host" aria-live="polite">{cur && <Pop key={cur.key} g={cur} />}</div>
}

function Pop({ g }) {
  const [out, setOut] = useState(false)
  const gone = useRef(false)
  const dismiss = () => {
    if (gone.current) return
    gone.current = true
    setOut(true)
    setTimeout(() => queue.set(q => q.filter(x => x !== g)), 280)
  }
  useEffect(() => {
    uiSound('got')
    const t = setTimeout(dismiss, 3500)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button className={`you-got${out ? ' out' : ''}`} onClick={dismiss} aria-label={`${g.text} (click to close)`}>
      <span className="you-got-chit"><Critter size={70} color="#ff9f6b" talk={!out} /></span>
      <span className="you-got-bubble"><span className="name-tag">Chit</span>{g.text}</span>
    </button>
  )
}
