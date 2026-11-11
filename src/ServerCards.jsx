import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from './lib/supabase'
import { online, prefs, setPref, toast } from './lib/store'
import { uploadFile } from './lib/upload'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import { parseCustom } from './lib/customEmoji'
import { MOTD_MAX, PALETTE, cardAccent, isHex, motdParts, nameAccent, railCompact, serverChips } from './lib/servercards'
import { CropImg } from './Avatar'
import { Emoji, emojify } from './Markdown'
import EmojiPicker from './EmojiPicker'
import ImageCropper from './ImageCropper'
import { openMenu } from './ContextMenu'
import { app, serverItems } from './menus'
import './styles/server-cards.css'
import { DMCards } from './ChatCues'
import ThemePicker from './themes/ThemePicker'

const useMedia = q => useSyncExternalStore(
  cb => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
  () => matchMedia(q).matches)

// Member ids of every server you're in (one query, kept live), for the online chip.
function useMemberIds(key) {
  const [map, setMap] = useState({})
  useEffect(() => {
    let on = true
    supabase.from('members').select('server_id, user_id').then(({ data }) => {
      if (!on || !data) return
      const m = {}
      for (const r of data) (m[r.server_id] ||= []).push(r.user_id)
      setMap(m)
    })
    const ch = supabase.channel('rail-members:' + key)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members' }, ({ new: r }) =>
        setMap(m => m[r.server_id] && !m[r.server_id].includes(r.user_id) ? { ...m, [r.server_id]: [...m[r.server_id], r.user_id] } : m))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, ({ old: r }) =>
        setMap(m => m[r.server_id] ? { ...m, [r.server_id]: m[r.server_id].filter(id => id !== r.user_id) } : m))
      .subscribe()
    return () => { on = false; supabase.removeChannel(ch) }
  }, [key])
  return map
}

const initials = name => name.split(/\s+/).map(w => [...w][0] || '').slice(0, 3).join('') // [...w]: keep emoji whole
const cardStyle = s => ({ '--acc': cardAccent(s) })

function Motd({ text }) {
  return motdParts(text).map((p, i) => parseCustom(p) ? <Emoji key={i} e={p} /> : <Fragment key={i}>{emojify(p)}</Fragment>)
}

// Inside of a server card: banner (or accent gradient), icon, name, MOTD and live chips.
export function CardBody({ s, chips }) {
  return <>
    <span className={`srv-bg${s.banner_url ? ' has-banner' : ''}`} aria-hidden="true">{s.banner_url && <CropImg src={s.banner_url} crop={s.banner_crop} />}</span>
    <span className="srv-icon">{s.icon_url ? <CropImg src={s.icon_url} crop={s.icon_crop} /> : initials(s.name)}</span>
    <span className="srv-text">
      <b className="srv-name">{s.name}</b>
      {/* one line under the name, so the card stays icon-height: the MOTD, else who's in a stadium */}
      {s.motd ? <span className="srv-motd" title={s.motd}><Motd text={s.motd} /></span>
        : chips.stadium && <span className="srv-motd">{chips.stadium}</span>}
    </span>
  </>
}

export default function ServerRail({ servers, serverId, go, dms, dmBadge, unread, railDrag, onAdd, channels, mentions = new Map(), dmCards = [], userId }) {
  const pref = prefs.use(s => s.railCompact)
  const narrow = useMedia('(max-width: 1099px)')
  const mobile = useMedia('(max-width: 720px)')
  const compact = railCompact(pref, narrow)
  const cards = mobile || !compact // the mobile drawer always shows cards
  const presence = online.use()
  const memberIds = useMemberIds(servers.map(s => s.id).join())
  const stadiums = useMemo(() => {
    const m = {}
    for (const c of channels) if (c.kind === 'voice' && c.server_id) (m[c.server_id] ||= []).push(c)
    return m
  }, [channels])

  return (
    <nav className={`rail${cards ? ' cards' : ''}`} aria-label="Servers">
      <button className={`rail-btn home${!serverId ? ' active' : ''}`} onClick={() => go(null, dms[0]?.id)} title="Direct messages">
        <span>💬</span>{cards && <span className="pill-label">Direct messages</span>}
        {dmBadge > 0 && <b className="badge">{dmBadge}</b>}
      </button>
      <DMCards list={dmCards} cards={cards} userId={userId} go={go} />
      <hr />
      {servers.map(s => {
        const n = unread.get(s.id) || 0
        const at = mentions.get(s.id) || 0 // @mentions win the badge (chat-cues.css styles .badge.at-badge)
        const badge = at > 0 ? <b className="badge at-badge">{at}</b> : n > 0 && cards && <b className="badge">{n}</b>
        return (
          <button key={s.id} className={`rail-btn${cards ? ' srv' : ''}${s.id === serverId ? ' active' : ''}${n ? ' unread' : ''}${railDrag.cls('server', s.id)}`}
            {...railDrag.item('server', s.id)} {...railDrag.zone('server', s.id)} style={cards ? cardStyle(s) : undefined}
            onClick={() => go(s.id)} onContextMenu={e => openMenu(e, () => serverItems(s))} title={s.name}
            aria-label={[s.name, n && `${n} unread`, at && `${at} mention${at === 1 ? '' : 's'}`].filter(Boolean).join(', ')}>
            {cards
              ? <CardBody s={s} chips={serverChips(memberIds[s.id], presence, stadiums[s.id])} />
              : s.icon_url ? <CropImg src={s.icon_url} crop={s.icon_crop} /> : <span>{initials(s.name)}</span>}
            {badge}
          </button>
        )
      })}
      <button className="rail-btn add" onClick={onAdd} title="Create or join a server">
        ＋{cards && <span className="pill-label">Add a server</span>}
      </button>
      {!mobile && <button className="rail-toggle" onClick={() => setPref('railCompact', !compact)}
        title={compact ? 'Show server cards' : 'Compact server list'} aria-label={compact ? 'Show server cards' : 'Compact server list'}>
        {compact ? '»' : '«'}
      </button>}
    </nav>
  )
}

// Server settings → Appearance: banner, accent colour and message of the day, with a live card preview.
export function AppearanceTab({ ctx }) {
  const { server } = ctx
  const [accent, setAccent] = useState(isHex(server.accent) ? server.accent : '')
  const [motd, setMotd] = useState(server.motd || '')
  const [cropFile, setCropFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ep, setEp] = useState(false)
  const closeCropper = useCallback(() => setCropFile(null), [])
  const presence = online.use()
  const draft = { ...server, accent: accent || null, motd: motd.trim() || null }
  const chips = serverChips((app.members || []).map(m => m.user_id), presence, ctx.channels.filter(c => c.kind === 'voice' && c.server_id === server.id))

  async function update(patch) {
    const { error } = await supabase.from('servers').update(patch).eq('id', server.id)
    if (error) { toast(error.message); return false }
    await ctx.load()
    return true
  }
  function pick(input) {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    setCropFile(file)
  }
  async function setBanner({ file, crop }) {
    setBusy(true)
    try {
      const { url } = await uploadFile(file, ctx.userId)
      if (await update({ banner_url: url, banner_crop: crop })) setCropFile(null)
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  function addEmoji(e) {
    setEp(false)
    if ((motd + e).length > MOTD_MAX) return toast(`That would go over ${MOTD_MAX} characters.`)
    setMotd(motd + e)
  }
  async function save() {
    if (await update({ accent: accent || null, motd: motd.trim() || null })) toast('Looking lovely ✨')
  }

  return (
    <div className="col srv-appearance">
      <div className="cards srv-preview">
        <div className="rail-btn srv active" style={cardStyle(draft)}><CardBody s={draft} chips={chips} /></div>
      </div>
      <div className="row">
        <label className="btn ghost">{busy ? 'Uploading…' : server.banner_url ? 'Change banner' : 'Upload banner'}
          <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pick(e.target)} />
        </label>
        {server.banner_url && <button type="button" className="btn ghost" onClick={() => update({ banner_url: null, banner_crop: null })}>Remove banner</button>}
        <span className="muted small">GIFs stay animated.</span>
      </div>
      {/* not a <form>: the emoji picker's buttons would submit it */}
      <div className="col">
        <div className="srv-field">
          <span className="srv-label">Accent colour</span>
          <div className="srv-swatches" role="group" aria-label="Accent colour">
            <button type="button" className={`srv-swatch auto${!accent ? ' on' : ''}`} style={{ '--sw': nameAccent(server.name) }}
              aria-pressed={!accent} title="Automatic (from the name)" onClick={() => setAccent('')}>A</button>
            {PALETTE.map(c => <button type="button" key={c} className={`srv-swatch${accent.toLowerCase() === c ? ' on' : ''}`} style={{ '--sw': c }}
              aria-pressed={accent.toLowerCase() === c} aria-label={c} title={c} onClick={() => setAccent(c)} />)}
            <input type="color" value={accent || nameAccent(server.name)} onChange={e => setAccent(e.target.value)} aria-label="Custom colour" title="Custom colour" />
          </div>
        </div>
        <div className="srv-field">
          <span className="srv-label">Theme</span>
          <ThemePicker value={server.theme} onChange={t => update({ theme: t === 'none' ? null : t })} />
          <span className="muted small">Animated background for rooms and stadiums, unless a category or room picks its own. Saves right away.</span>
        </div>
        <div className="srv-field">
          <span className="srv-label">Message of the day<span className={`srv-count${motd.length > MOTD_MAX - 10 ? ' near' : ''}`}>{motd.length}/{MOTD_MAX}</span></span>
          <div className="srv-motd-row">
            <input value={motd} maxLength={MOTD_MAX} onChange={e => setMotd(e.target.value)} placeholder="Movie night Friday 🍿" aria-label="Message of the day" />
            <button type="button" className="icon-btn" title="Add emoji" aria-label="Add emoji"
              onMouseDown={e => e.stopPropagation()} onClick={() => setEp(o => !o)}>🙂</button>
            {ep && <EmojiPicker className="up" onPick={addEmoji} onClose={() => setEp(false)} />}
          </div>
        </div>
        <button type="button" className="btn primary" onClick={save}>Save</button>
      </div>
      {cropFile && <ImageCropper file={cropFile} shape="banner" title="Crop server banner" onCancel={closeCropper} onApply={setBanner} />}
    </div>
  )
}
