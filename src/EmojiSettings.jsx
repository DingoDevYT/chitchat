import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { toast } from './lib/store'
import { uploadFile } from './lib/upload'
import { emojiName, prepEmoji, MAX_EMOJI, NAME_RX } from './lib/customEmoji'
import { forgetEmoji, loadMyEmoji } from './lib/emojiStore'
import './styles/custom-emoji.css'

// Server settings → Emoji tab (owners/admins).
export default function EmojiSettings({ ctx }) {
  const sid = ctx.server.id
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(0)

  async function refresh() {
    const { data, error } = await supabase.from('server_emoji').select('*').eq('server_id', sid).order('created_at')
    if (error) return toast(error.message)
    setList(data)
    loadMyEmoji(true)
  }
  useEffect(() => { refresh() }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files) {
    const taken = new Set(list.map(e => e.name))
    const todo = [...files].slice(0, MAX_EMOJI - list.length)
    if (todo.length < files.length) toast(`Only ${MAX_EMOJI} emoji per server.`)
    setBusy(todo.length)
    for (const f of todo) {
      try {
        const { file, animated } = await prepEmoji(f)
        const name = emojiName(f.name, taken)
        const { url } = await uploadFile(file, ctx.userId)
        const { error } = await supabase.from('server_emoji').insert({ server_id: sid, name, url, animated, created_by: ctx.userId })
        if (error) throw error
        taken.add(name)
      } catch (e) { toast(e.message) }
      setBusy(n => n - 1)
    }
    refresh()
  }

  async function rename(e, name) {
    name = name.trim().toLowerCase()
    if (name === e.name) return
    if (!NAME_RX.test(name)) { toast('Names are 2–32 letters, numbers or _'); return refresh() }
    const { error } = await supabase.from('server_emoji').update({ name }).eq('id', e.id)
    if (error) toast(error.code === '23505' ? `:${name}: is taken` : error.message)
    refresh()
  }

  async function remove(e) {
    if (!confirm(`Delete :${e.name}:? Messages using it will show its name instead.`)) return
    const { error } = await supabase.from('server_emoji').delete().eq('id', e.id)
    if (error) return toast(error.message)
    forgetEmoji(e.id)
    refresh()
  }

  if (!list) return <p className="muted small">Loading emoji…</p>
  return (
    <div className="col">
      <div className="emoji-admin-top">
        <span className="muted small">{list.length} / {MAX_EMOJI} · PNG, WebP or GIF, up to 512 KB</span>
        <label className={`btn primary small${busy || list.length >= MAX_EMOJI ? ' disabled' : ''}`}>
          {busy ? `Uploading ${busy}…` : 'Upload emoji'}
          <input type="file" accept="image/png,image/webp,image/gif" multiple hidden disabled={!!busy || list.length >= MAX_EMOJI}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      {list.length === 0 && <p className="muted small">No custom emoji yet. Upload a few and use them with :name: anywhere.</p>}
      <div className="emoji-admin-list">
        {list.map(e => (
          <div key={e.id + e.name} className="emoji-admin-row pop">
            <img src={e.url} alt="" />
            <input defaultValue={e.name} maxLength={32} aria-label={`Rename :${e.name}:`}
              onBlur={ev => rename(e, ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') ev.target.blur() }} />
            <button type="button" className="icon-btn" onClick={() => remove(e)} title="Delete" aria-label={`Delete :${e.name}:`}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  )
}
