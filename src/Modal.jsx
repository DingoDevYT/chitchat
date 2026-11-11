import { useEffect } from 'react'
import { uiSound } from './lib/animalese'
import Icon from './icons/Icon'
import './styles/modal-size.css'

// A speech-bubble dialog: the title is the tilted name tag, the body scrolls under it.
export default function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => { uiSound('open'); return () => uiSound('close') }, [])
  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal pop${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2 className="name-tag">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
