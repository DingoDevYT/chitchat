import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { primeProfiles, profiles, toast, useProfile } from './lib/store'
import { STATUSES, CLEAR_AFTER, expiryFor } from './lib/status'
import Avatar, { CustomStatus, useCustomStatus } from './Avatar'
import { Emoji } from './Markdown'
import EmojiPicker from './EmojiPicker'
import Icon from './icons/Icon'

async function save(id, patch) {
  const prev = profiles.get()[id]
  primeProfiles([{ ...prev, ...patch }]) // optimistic; presence.js picks it up from the profiles store
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) { primeProfiles([prev]); toast(error.message) }
}

function Swatch({ k }) {
  const st = k === 'invisible' ? 'offline' : k
  return <span className="avatar status-swatch" aria-hidden="true"><i className={`dot st-${st}${st === 'online' ? ' on' : ''}`} /></span>
}

// Me-panel avatar: click to pick a status or set a custom one.
export default function MeStatus({ userId }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="me-av" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" title="Set status" aria-label="Set status">
        <Avatar id={userId} size={36} status />
      </button>
      {open && <Picker userId={userId} onClose={() => setOpen(false)} />}
    </>
  )
}

// Under your name: custom status if set, else @username.
export function MeSub({ userId, username }) {
  return useCustomStatus(userId) ? <CustomStatus id={userId} /> : <div className="muted small">@{username}</div>
}

function Picker({ userId, onClose }) {
  const p = useProfile(userId)
  const cs = useCustomStatus(userId)
  const [edit, setEdit] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    const down = e => { if (!root.current?.contains(e.target) && !e.target.closest?.('.me-av')) onClose() }
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc) }
  }, [onClose])

  const chosen = p?.status || 'online'
  return (
    <div ref={root} className="status-pop pop" role="dialog" aria-label="Set status">
      {edit ? <CustomEditor cs={cs} onCancel={() => setEdit(false)}
        onSave={v => { save(userId, { custom_status: v }); onClose() }} /> : <>
        <button className="st-opt" onClick={() => setEdit(true)}>
          {cs ? <CustomStatus id={userId} /> : <span><Icon name="chat" size={16} /> <b style={{ display: 'inline' }}>Set custom status</b></span>}
        </button>
        {cs && <button className="st-opt small muted" onClick={() => save(userId, { custom_status: null })}><Icon name="close" size={14} /> Clear custom status</button>}
        <hr />
        {STATUSES.map(([k, label, desc]) => (
          <button key={k} className={`st-opt${chosen === k ? ' on' : ''}`} aria-pressed={chosen === k}
            onClick={() => { if (k !== chosen) save(userId, { status: k }); onClose() }}>
            <Swatch k={k} />
            <span><b>{label}</b><span className="muted small">{desc}</span></span>
          </button>
        ))}
      </>}
    </div>
  )
}

function CustomEditor({ cs, onSave, onCancel }) {
  const [emoji, setEmoji] = useState(cs?.emoji || '')
  const [text, setText] = useState(cs?.text || '')
  const [after, setAfter] = useState('today')
  const [ep, setEp] = useState(false)
  const ok = text.trim() || emoji

  return (<>
    <form className="cs-edit" onSubmit={e => { e.preventDefault(); if (ok) onSave({ emoji, text: text.trim(), expires_at: expiryFor(after) }) }}>
      <b>Set a custom status</b>
      <div className="row">
        <button type="button" className="cs-emoji" title="Pick an emoji" aria-label="Pick an emoji"
          onMouseDown={e => e.stopPropagation()} onClick={() => setEp(o => !o)}>{emoji ? <Emoji e={emoji} /> : <Icon name="smile" />}</button>
        <input autoFocus value={text} maxLength={128} onChange={e => setText(e.target.value)} placeholder="What's happening?" aria-label="Custom status" />
      </div>
      <label className="small">Clear after{' '}
        <select value={after} onChange={e => setAfter(e.target.value)}>
          {CLEAR_AFTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {emoji && <button type="button" className="btn ghost small" onClick={() => setEmoji('')}>No emoji</button>}
        <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button className="btn primary small" disabled={!ok}>Save</button>
      </div>
    </form>
    {/* outside the form: the picker's buttons would otherwise submit it */}
    {ep && <EmojiPicker className="up" onPick={e => { setEmoji(e); setEp(false) }} onClose={() => setEp(false)} />}
    </>
  )
}
