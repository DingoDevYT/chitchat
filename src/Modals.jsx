import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { primeProfiles, toast, useProfile } from './lib/store'
import { askText } from './Dialog'
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
import { AuditTab, BansTab, InvitesTab, RulesTab } from './Moderation'
import Icon from './icons/Icon'

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
          <p className="muted">You'll get a general room and a Hangout stadium to start.</p>
          <label>Server name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required autoFocus /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create server'}</button>
        </form>
      ) : (
        <form onSubmit={join} className="col">
          <p className="muted">Paste an invite link or code from a friend.</p>
          <label>Invite<input value={code} onChange={e => setCode(e.target.value)} placeholder="…/#/invite/a1b2c3d4" required autoFocus /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Joining…' : 'Join server'}</button>
        </form>
      )}
    </Modal>
  )
}

const SETTINGS_TABS = [['general', 'General', 'manage_server'], ['appearance', 'Appearance', 'manage_server'], ['emoji', 'Emoji', 'manage_server'],
  ['roles', 'Roles'], ['rules', 'Rules', 'manage_server'], ['invites', 'Invites', 'manage_invites'], ['bans', 'Bans', 'ban_members'], ['audit', 'Audit log', 'view_audit_log']]

export function ServerSettingsModal({ ctx, onClose }) {
  const { server } = ctx
  const [name, setName] = useState(server.name)
  const [busy, setBusy] = useState(false)
  const tabs = SETTINGS_TABS.filter(([, , perm]) => !perm || ctx.can(perm))
  const [tab, setTab] = useState(tabs[0][0])
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
    if (await askText({ text: `Type the server name to delete it forever:\n${server.name}`, placeholder: server.name, confirm: 'Delete forever', danger: true }) !== server.name) return
    const { error } = await supabase.from('servers').delete().eq('id', server.id)
    if (error) return toast(error.message)
    await ctx.load()
    ctx.go(null)
    onClose()
  }

  return (
    <Modal title="Server settings" onClose={onClose} wide>
      {/* each tab shows only with its permission; without it the database ignores the save anyway */}
      {tabs.length > 1 && <div className="tabs settings-tabs">
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </div>}
      {tab === 'appearance' && <AppearanceTab ctx={ctx} />}
      {tab === 'emoji' && <EmojiSettings ctx={ctx} />}
      {tab === 'roles' && <RolesTab ctx={ctx} />}
      {tab === 'rules' && <RulesTab ctx={ctx} />}
      {tab === 'invites' && <InvitesTab ctx={ctx} />}
      {tab === 'bans' && <BansTab ctx={ctx} />}
      {tab === 'audit' && <AuditTab ctx={ctx} />}}
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

// The room/stadium editor lives in RoomEditor.jsx.
export { ChannelModal } from './RoomEditor'

export function NewDMModal({ ctx, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState([])
  const [searched, setSearched] = useState('') // the term `results` belong to, so "Nobody found." waits for the answer
  const term = q.trim().toLowerCase().replace(/^@/, '')

  useEffect(() => {
    if (term.length < 2) return setResults([])
    let on = true // a slow answer for an older term can't overwrite a newer one
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('*')
        .or(`username.ilike.%${term.replace(/[%_,()]/g, '')}%,display_name.ilike.%${term.replace(/[%_,()]/g, '')}%`)
        .neq('id', ctx.userId).limit(8)
      if (data && on) { primeProfiles(data); setResults(data); setSearched(term) }
    }, 200)
    return () => { on = false; clearTimeout(t) }
  }, [term, ctx.userId])

  const toggle = p => setPicked(list => list.some(x => x.id === p.id) ? list.filter(x => x.id !== p.id) : [...list, p].slice(0, 9))

  return (
    <Modal title="New message" onClose={onClose}>
      <div className="col">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by username" aria-label="Search people" />
        {picked.length > 0 && (
          <div className="file-chips">{picked.map(p => (
            <span key={p.id} className="file-chip pop">@{p.username}<button onClick={() => toggle(p)} aria-label={`Remove ${p.username}`}><Icon name="close" size={14} /></button></span>
          ))}</div>
        )}
        <div className="pick-list">
          {results.map(p => (
            <button key={p.id} className={`pick${picked.some(x => x.id === p.id) ? ' on' : ''}`} onClick={() => toggle(p)}>
              <Avatar id={p.id} size={28} /> <b>{p.display_name || p.username}</b> <span className="muted">@{p.username}</span>
            </button>
          ))}
          {term.length >= 2 && results.length === 0 && <p className="muted small">{searched === term ? 'Nobody found.' : 'Searching…'}</p>}
        </div>
        <button className="btn primary" disabled={!picked.length}
          onClick={() => { ctx.openDM(picked.map(p => p.id)); onClose() }}>
          {picked.length > 1 ? `Start group chat (${picked.length + 1})` : 'Start chat'}
        </button>
      </div>
    </Modal>
  )
}
