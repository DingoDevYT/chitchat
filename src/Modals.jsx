import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { primeProfiles, toast, useProfile } from './lib/store'
import { uploadFile } from './lib/upload'
import { categories } from './lib/categories'
import { byPosition } from './lib/reorder'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import Modal from './Modal'
import Avatar, { CropImg } from './Avatar'
import ImageCropper from './ImageCropper'
import EmojiSettings from './EmojiSettings'
import { RolesTab } from './Roles'
import { AppearanceTab } from './ServerCards'

export function CreateJoinModal({ ctx, onClose, joinInvite }) {
  const [tab, setTab] = useState('create')
  const [name, setName] = useState(`${ctx.me.display_name || ctx.me.username}'s place`)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e) {
    e.preventDefault()
    if (!name.trim()) return toast('Give your server a name.')
    setBusy(true)
    const { data, error } = await supabase.from('servers').insert({ name: name.trim(), owner_id: ctx.userId }).select().single()
    setBusy(false)
    if (error) return toast(error.message)
    await ctx.load()
    ctx.go(data.id)
    onClose()
  }

  async function join(e) {
    e.preventDefault()
    const c = code.trim().split('/').pop()
    if (!c) return
    setBusy(true)
    await joinInvite(c)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Add a server" onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'create' ? 'on' : ''} onClick={() => setTab('create')}>Create</button>
        <button className={tab === 'join' ? 'on' : ''} onClick={() => setTab('join')}>Join</button>
      </div>
      {tab === 'create' ? (
        <form onSubmit={create} className="col">
          <p className="muted">You'll get a #general text channel and a Hangout stadium to start.</p>
          <label>Server name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required autoFocus /></label>
          <button className="btn primary" disabled={busy}>Create server</button>
        </form>
      ) : (
        <form onSubmit={join} className="col">
          <p className="muted">Paste an invite link or code from a friend.</p>
          <label>Invite<input value={code} onChange={e => setCode(e.target.value)} placeholder="…/#/invite/a1b2c3d4" required autoFocus /></label>
          <button className="btn primary" disabled={busy}>Join server</button>
        </form>
      )}
    </Modal>
  )
}

export function ServerSettingsModal({ ctx, onClose }) {
  const { server } = ctx
  const [name, setName] = useState(server.name)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(ctx.can('manage_server') ? 'general' : 'roles')
  const [cropFile, setCropFile] = useState(null)
  const closeCropper = useCallback(() => setCropFile(null), [])

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return toast('Give your server a name.')
    const { error } = await supabase.from('servers').update({ name: name.trim() }).eq('id', server.id)
    if (error) return toast(error.message)
    await ctx.load()
    onClose()
  }
  function pickIcon(input) {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    setCropFile(file)
  }
  async function setIcon({ file, crop }) {
    setBusy(true)
    try {
      const { url } = await uploadFile(file, ctx.userId)
      const { error } = await supabase.from('servers').update({ icon_url: url, icon_crop: crop }).eq('id', server.id)
      if (error) throw error
      await ctx.load()
      setCropFile(null)
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  async function destroy() {
    if (prompt(`Type the server name to delete it forever:\n${server.name}`) !== server.name) return
    const { error } = await supabase.from('servers').delete().eq('id', server.id)
    if (error) return toast(error.message)
    await ctx.load()
    ctx.go(null)
    onClose()
  }

  return (
    <Modal title="Server settings" onClose={onClose}>
      {/* General and Emoji need manage_server; without it the database silently ignores the save */}
      {ctx.can('manage_server') && <div className="tabs">
        <button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>General</button>
        <button className={tab === 'appearance' ? 'on' : ''} onClick={() => setTab('appearance')}>Appearance</button>
        <button className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>Emoji</button>
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Roles</button>
      </div>}
      {tab === 'appearance' && <AppearanceTab ctx={ctx} />}
      {tab === 'emoji' && <EmojiSettings ctx={ctx} />}
      {tab === 'roles' && <RolesTab ctx={ctx} />}
      <form onSubmit={save} className="col" style={tab !== 'general' ? { display: 'none' } : undefined}>
        <div className="row">
          <div className="server-icon-preview">{server.icon_url ? <CropImg src={server.icon_url} crop={server.icon_crop} /> : server.name[0]}</div>
          <label className="btn ghost">{busy ? 'Uploading…' : 'Change icon'}
            <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pickIcon(e.target)} />
          </label>
        </div>
        <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required /></label>
        <button className="btn primary">Save</button>
        {ctx.role === 'owner' && <button type="button" className="btn danger" onClick={destroy}>Delete server</button>}
      </form>
      {cropFile && <ImageCropper file={cropFile} shape="square" title="Crop server icon" onCancel={closeCropper} onApply={setIcon} />}
    </Modal>
  )
}

export function ChannelModal({ ctx, members, channel, categoryId, onClose }) {
  const editing = !!channel
  const cats = byPosition(categories.use(s => s[ctx.server.id]) || []) // loaded + kept live by the Sidebar
  const [cat, setCat] = useState(channel ? channel.category_id || '' : categoryId || '')
  const [name, setName] = useState(channel?.name || '')
  const [kind, setKind] = useState(channel?.kind || 'text')
  const [priv, setPriv] = useState(channel?.private || false)
  const [allowed, setAllowed] = useState(new Set(channel?.channel_members?.map(m => m.user_id) || []))
  const [busy, setBusy] = useState(false)

  const cleanName = n => kind === 'text' ? n.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '') : n

  async function save(e) {
    e.preventDefault()
    const n = cleanName(name.trim())
    if (!n) return toast('Use at least one letter or number in the name.')
    if (busy) return
    setBusy(true)
    const fail = msg => { setBusy(false); toast(msg) }
    let id = channel?.id
    if (!editing) {
      const { data, error } = await supabase.from('channels')
        .insert({ server_id: ctx.server.id, name: n, kind, private: priv, position: Date.now() % 1e9, category_id: cat || null }).select().single()
      if (error) return fail(error.message)
      id = data.id
    }
    if (priv) {
      const before = new Set(channel?.channel_members?.map(m => m.user_id) || [])
      const add = [...allowed].filter(u => !before.has(u)), drop = [...before].filter(u => !allowed.has(u))
      const r1 = add.length ? await supabase.from('channel_members').insert(add.map(user_id => ({ channel_id: id, user_id }))) : {}
      const r2 = drop.length ? await supabase.from('channel_members').delete().eq('channel_id', id).in('user_id', drop) : {}
      if (r1.error || r2.error) return fail((r1.error || r2.error).message)
    }
    // Update after access changes: the UPDATE event is what tells newly added people the channel exists (see Shell).
    if (editing || (priv && allowed.size)) {
      const { error } = await supabase.from('channels').update({ name: n, private: priv, category_id: cat || null }).eq('id', id)
      if (error) return fail(error.message)
    }
    await ctx.load()
    if (!editing) ctx.go(ctx.server.id, id)
    onClose()
  }

  async function destroy() {
    if (!confirm(`Delete #${channel.name} and all its messages?`)) return
    const { error } = await supabase.from('channels').delete().eq('id', channel.id)
    if (error) return toast(error.message)
    await ctx.load()
    onClose()
  }

  const nonAdmins = members.filter(m => m.role === 'member')
  return (
    <Modal title={editing ? `Edit ${channel.kind === 'voice' ? '🏟️' : '#'}${channel.name}` : 'New channel'} onClose={onClose}>
      <form onSubmit={save} className="col">
        {!editing && (
          <div className="tabs">
            <button type="button" className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}># Text</button>
            <button type="button" className={kind === 'voice' ? 'on' : ''} onClick={() => setKind('voice')}>🏟️ Stadium</button>
          </div>
        )}
        <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required autoFocus
          placeholder={kind === 'text' ? 'memes' : 'Gaming'} /></label>
        {cats.length > 0 && (
          <label>Category<select value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">No category</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        )}
        <label className="toggle"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} />
          <span>🔒 Private: only admins and the people you pick can see it</span></label>
        {priv && (
          <div className="pick-list">
            {nonAdmins.length === 0 && <p className="muted small">No regular members yet. Admins always have access.</p>}
            {nonAdmins.map(m => (
              <label key={m.user_id} className="pick">
                <input type="checkbox" checked={allowed.has(m.user_id)} onChange={e => {
                  const n = new Set(allowed); e.target.checked ? n.add(m.user_id) : n.delete(m.user_id); setAllowed(n)
                }} />
                <Avatar id={m.user_id} size={24} /> <PName id={m.user_id} />
              </label>
            ))}
          </div>
        )}
        <button className="btn primary" disabled={busy}>{editing ? 'Save' : 'Create channel'}</button>
        {editing && <button type="button" className="btn danger" onClick={destroy}>Delete channel</button>}
      </form>
    </Modal>
  )
}

function PName({ id }) {
  const p = useProfile(id)
  return <span>{p?.display_name || p?.username || '…'}</span>
}

export function NewDMModal({ ctx, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState([])

  useEffect(() => {
    const term = q.trim().toLowerCase().replace(/^@/, '')
    if (term.length < 2) return setResults([])
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('*')
        .or(`username.ilike.%${term.replace(/[%_,()]/g, '')}%,display_name.ilike.%${term.replace(/[%_,()]/g, '')}%`)
        .neq('id', ctx.userId).limit(8)
      if (data) { primeProfiles(data); setResults(data) }
    }, 200)
    return () => clearTimeout(t)
  }, [q, ctx.userId])

  const toggle = p => setPicked(list => list.some(x => x.id === p.id) ? list.filter(x => x.id !== p.id) : [...list, p].slice(0, 9))

  return (
    <Modal title="New message" onClose={onClose}>
      <div className="col">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by username" aria-label="Search people" />
        {picked.length > 0 && (
          <div className="file-chips">{picked.map(p => (
            <span key={p.id} className="file-chip pop">@{p.username}<button onClick={() => toggle(p)} aria-label={`Remove ${p.username}`}>✕</button></span>
          ))}</div>
        )}
        <div className="pick-list">
          {results.map(p => (
            <button key={p.id} className={`pick${picked.some(x => x.id === p.id) ? ' on' : ''}`} onClick={() => toggle(p)}>
              <Avatar id={p.id} size={28} /> <b>{p.display_name || p.username}</b> <span className="muted">@{p.username}</span>
            </button>
          ))}
          {q.trim().length >= 2 && results.length === 0 && <p className="muted small">Nobody found.</p>}
        </div>
        <button className="btn primary" disabled={!picked.length}
          onClick={() => { ctx.openDM(picked.map(p => p.id)); onClose() }}>
          {picked.length > 1 ? `Start group chat (${picked.length + 1})` : 'Start chat'}
        </button>
      </div>
    </Modal>
  )
}
