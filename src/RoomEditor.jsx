import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { toast, useProfile } from './lib/store'
import { ask } from './Dialog'
import { youGot } from './YouGot'
import { uploadFile } from './lib/upload'
import { categories, setCategories } from './lib/categories'
import { applyItems, byPosition } from './lib/reorder'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import { PALETTE } from './lib/servercards'
import { DEFAULT_FONT, FONTS, SLOWMODE, cleanRoomName, fmtSlow, isHex, roomAccent } from './lib/rooms'
import Modal from './Modal'
import Avatar from './Avatar'
import Markdown from './Markdown'
import EmojiPicker from './EmojiPicker'
import ImageCropper from './ImageCropper'
import ThemePicker from './themes/ThemePicker'
import { RoomIcon, RoomName, RoomTint, RoomTitle, ensureFont, fontFamily, roomVars } from './Rooms'
import Icon from './icons/Icon'
import { GAMES_ON } from './games/useGame'

const TOPIC_MAX = 200, WELCOME_MAX = 500

// Uploads go through the cropper; resolves to the public URL in the media bucket.
function useImagePick(userId) {
  const [crop, setCrop] = useState(null) // { file, shape, title, done }
  const [busy, setBusy] = useState(false)
  const close = useCallback(() => setCrop(null), [])
  const pick = (input, shape, title, done) => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    if (!shape) return upload(file, null, done)
    setCrop({ file, shape, title, done })
  }
  async function upload(file, cropData, done) {
    setBusy(true)
    try {
      const { url } = await uploadFile(file, userId)
      done(url, cropData)
      setCrop(null)
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const cropper = crop && <ImageCropper file={crop.file} shape={crop.shape} title={crop.title} onCancel={close}
    onApply={({ file, crop: c }) => upload(file, c, crop.done)} />
  return { pick, busy, cropper }
}

function IconPicker({ value, onChange, img }) {
  const [ep, setEp] = useState(false)
  return (
    <div className="srv-field">
      <span className="srv-label">Icon</span>
      <div className="re-icon-row">
        <span className="re-icon-big"><RoomIcon c={{ icon: value, kind: 'text' }} /></span>
        <button type="button" className="btn ghost small" onMouseDown={e => e.stopPropagation()} onClick={() => setEp(o => !o)}><Icon name="smile" size={16} /> Emoji</button>
        <label className="btn ghost small">{img.busy ? 'Uploading…' : <><Icon name="image" size={16} /> Image</>}
          <input type="file" accept={IMAGE_TYPES} hidden onChange={e => img.pick(e.target, 'square', 'Crop icon', url => onChange(url))} />
        </label>
        {value && <button type="button" className="btn ghost small" onClick={() => onChange(null)}>Remove</button>}
        {ep && <EmojiPicker className="down re-ep" onPick={e => { onChange(e); setEp(false) }} onClose={() => setEp(false)} />}
      </div>
    </div>
  )
}

function AccentPicker({ value, onChange, auto }) {
  return (
    <div className="srv-field">
      <span className="srv-label">Accent colour</span>
      <div className="srv-swatches" role="group" aria-label="Accent colour">
        <button type="button" className={`srv-swatch auto${!value ? ' on' : ''}`} style={{ '--sw': auto }} aria-pressed={!value}
          title="Same as the server" onClick={() => onChange('')}>A</button>
        {PALETTE.map(c => <button type="button" key={c} className={`srv-swatch${value.toLowerCase() === c ? ' on' : ''}`} style={{ '--sw': c }}
          aria-pressed={value.toLowerCase() === c} aria-label={c} title={c} onClick={() => onChange(c)} />)}
        <input type="color" value={value || auto} onChange={e => onChange(e.target.value)} aria-label="Custom colour" title="Custom colour" />
      </div>
    </div>
  )
}

function BannerPicker({ url, onChange, img, label = 'Banner' }) {
  return (
    <div className="srv-field">
      <span className="srv-label">{label} <span className="muted small">4:1, GIFs stay animated</span></span>
      <div className="row">
        <label className="btn ghost small">{img.busy ? 'Uploading…' : url ? 'Change banner' : 'Upload banner'}
          <input type="file" accept={IMAGE_TYPES} hidden onChange={e => img.pick(e.target, 'roomBanner', 'Crop banner', onChange)} />
        </label>
        {url && <button type="button" className="btn ghost small" onClick={() => onChange(null, null)}>Remove</button>}
      </div>
    </div>
  )
}

const hasTheme = rows => rows?.some(r => r && 'theme' in r) // the themes migration (027) adds channels/categories.theme

export function ChannelModal({ ctx, members, channel, categoryId, onClose }) {
  const editing = !!channel
  const c0 = channel || {}
  const cats = byPosition(categories.use(s => s[ctx.server.id]) || []) // loaded + kept live by the Sidebar
  const [tab, setTab] = useState('general')
  const [kind, setKind] = useState(c0.kind || 'text')
  const [name, setName] = useState(c0.name || '')
  const [cat, setCat] = useState(channel ? channel.category_id || '' : categoryId || '')
  const [icon, setIcon] = useState(c0.icon || null)
  const [topic, setTopic] = useState(c0.topic || '')
  const [font, setFont] = useState(c0.font || DEFAULT_FONT)
  const [accent, setAccent] = useState(isHex(c0.accent) ? c0.accent : '')
  const [banner, setBanner] = useState({ url: c0.banner_url || null, crop: c0.banner_crop || null })
  const [bg, setBg] = useState(c0.background_url || null)
  const [dim, setDim] = useState(c0.background_dim ?? 70)
  const [welcome, setWelcome] = useState(c0.welcome || '')
  const [slow, setSlow] = useState(c0.slowmode_sec || 0)
  const [theme, setTheme] = useState(c0.theme ?? null)
  const [priv, setPriv] = useState(c0.private || false)
  const [games, setGames] = useState(c0.games_enabled ?? true)
  const [allowed, setAllowed] = useState(new Set(c0.channel_members?.map(m => m.user_id) || []))
  const [busy, setBusy] = useState(false)
  const img = useImagePick(ctx.userId)
  const themes = hasTheme(ctx.channels)
  useEffect(() => { if (tab === 'look') FONTS.forEach(f => ensureFont(f.name)) }, [tab])

  const n = cleanRoomName(name)
  const draft = {
    ...c0, kind, name: n || (kind === 'voice' ? 'Stadium' : kind === 'gallery' ? 'New gallery' : 'New room'), icon, topic: topic.trim() || null, font: font === DEFAULT_FONT ? null : font,
    accent: accent || null, banner_url: banner.url, banner_crop: banner.crop, background_url: bg, background_dim: dim,
  }
  const word = kind === 'voice' ? 'stadium' : kind === 'gallery' ? 'gallery' : 'room'

  async function save(e) {
    e?.preventDefault()
    if (!n) { setTab('general'); return toast('Give it a name.') }
    if (busy) return
    setBusy(true)
    const fail = msg => { setBusy(false); toast(msg) }
    const look = {
      icon, topic: draft.topic, font: draft.font, accent: draft.accent, banner_url: banner.url, banner_crop: banner.url ? banner.crop : null,
      background_url: bg, background_dim: dim, welcome: welcome.trim() || null, slowmode_sec: slow, ...(themes && { theme }),
      ...(GAMES_ON && kind === 'voice' && { games_enabled: games }),
    }
    let id = channel?.id
    if (!editing) {
      const { data, error } = await supabase.from('channels')
        .insert({ server_id: ctx.server.id, name: n, kind, private: priv, position: Date.now() % 1e9, category_id: cat || null, ...look }).select().single()
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
      const { error } = await supabase.from('channels').update({ name: n, private: priv, category_id: cat || null, ...look }).eq('id', id)
      if (error) return fail(error.message)
    }
    await ctx.load()
    if (!editing) ctx.go(ctx.server.id, id)
    if (!editing && kind === 'voice') youGot('stadium', 'You started your first stadium!')
    onClose()
  }

  async function destroy() {
    if (!await ask({ text: `Delete ${channel.name} and all its messages?`, confirm: 'Delete', danger: true })) return
    const { error } = await supabase.from('channels').delete().eq('id', channel.id)
    if (error) return toast(error.message)
    await ctx.load()
    onClose()
  }

  const nonAdmins = members.filter(m => m.role === 'member')
  const TABS = [['general', 'General'], ['look', 'Look'], ['welcome', 'Welcome'], ['slowmode', 'Slowmode'], ['privacy', 'Privacy']]
    .filter(([k]) => kind !== 'gallery' || k !== 'welcome') // a gallery is a wall of posts: no chat top to welcome people at
  return (
    <Modal title={editing ? `Edit ${channel.name}` : `New ${word}`} onClose={onClose} wide>
      <div className="col room-editor">{/* not a <form>: the emoji picker's buttons would submit it */}
        {!editing && (
          <div className="tabs">
            <button type="button" className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}><Icon name="chat" size={16} /> Room</button>
            <button type="button" className={kind === 'voice' ? 'on' : ''} onClick={() => setKind('voice')}><Icon name="stadium" size={16} /> Stadium</button>
            <button type="button" className={kind === 'gallery' ? 'on' : ''} onClick={() => { setKind('gallery'); if (tab === 'welcome') setTab('general') }}><Icon name="gallery" size={16} /> Gallery</button>
          </div>
        )}

        <div className="re-preview" style={roomVars(draft, ctx.server)} aria-label="Preview">
          <div className="re-prev-side">
            <div className="ch-item room-row active"><RoomTint c={draft} />
              <span className="ch-main"><RoomIcon c={draft} /><RoomName c={draft} className="ch-name" />{priv && <span className="lock"><Icon name="lock" size={13} /></span>}</span>
            </div>
          </div>
          <div className="chat-head room-head re-prev-head"><RoomTitle c={draft} /></div>
        </div>

        <div className="tabs small re-tabs" role="tablist">
          {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </div>

        {tab === 'general' && <div className="col">
          <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoFocus
            placeholder={kind === 'text' ? 'General Chat 🍵' : kind === 'gallery' ? 'Art wall' : 'Movie Night'} /></label>
          <IconPicker value={icon} onChange={setIcon} img={img} />
          <label><span className="srv-label">Topic <span className="srv-count">{topic.length}/{TOPIC_MAX}</span></span>
            <input value={topic} maxLength={TOPIC_MAX} onChange={e => setTopic(e.target.value)} placeholder="What's this room about?" /></label>
          {cats.length > 0 && (
            <label>Category<select value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">No category</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          )}
          {GAMES_ON && kind === 'voice' && <label className="toggle"><input type="checkbox" checked={games} onChange={e => setGames(e.target.checked)} />
            <span><Icon name="cards" size={14} /> Games: anyone here can open a game table</span></label>}
        </div>}

        {tab === 'look' && <div className="col">
          <div className="srv-field">
            <span className="srv-label">Name font</span>
            <div className="re-fonts" role="radiogroup" aria-label="Name font">
              {FONTS.map(f => (
                <button key={f.name} type="button" role="radio" aria-checked={font === f.name} className={`re-font${font === f.name ? ' on' : ''}`} onClick={() => setFont(f.name)}>
                  <span className={`re-font-sample${f.small ? ' font-small' : ''}`} style={{ fontFamily: fontFamily(f.name) }}>{n || 'Room name'}</span>
                  <span className="muted small">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
          <AccentPicker value={accent} onChange={setAccent} auto={roomAccent({}, ctx.server) || '#ff9f6b'} />
          <BannerPicker url={banner.url} img={img} onChange={(url, crop) => setBanner({ url, crop })} />
          <div className="srv-field">
            <span className="srv-label">Background <span className="muted small">behind the messages</span></span>
            <div className="row">
              <label className="btn ghost small">{img.busy ? 'Uploading…' : bg ? 'Change background' : 'Upload background'}
                <input type="file" accept={IMAGE_TYPES} hidden onChange={e => img.pick(e.target, null, null, setBg)} />
              </label>
              {bg && <button type="button" className="btn ghost small" onClick={() => setBg(null)}>Remove</button>}
            </div>
            {bg && <label className="re-dim">Dim <input type="range" min="0" max="90" step="5" value={dim} onChange={e => setDim(+e.target.value)} aria-label="Background dim" />
              <span className="re-dim-prev" style={{ '--dim': dim / 100 }}><span style={{ backgroundImage: `url("${bg}")` }} /><b>Aa</b></span></label>}
          </div>
          <div className="srv-field">
            <span className="srv-label">Theme</span>
            {themes ? <ThemePicker value={theme} onChange={setTheme} allowInherit inheritLabel="from the category or server" />
              : <p className="muted small">Themes are on their way.</p>}
          </div>
        </div>}

        {tab === 'welcome' && <div className="col">
          <label><span className="srv-label">Welcome message <span className="srv-count">{welcome.length}/{WELCOME_MAX}</span></span>
            <textarea rows={4} value={welcome} maxLength={WELCOME_MAX} onChange={e => setWelcome(e.target.value)}
              placeholder={`Welcome to ${draft.name}! **Be kind**, share snacks 🍪`} /></label>
          <div className="re-welcome-prev chat-start">
            <h1>Welcome to {draft.name}{/[!?.]$/.test(draft.name) ? "" : "!"}</h1>
            {welcome.trim() ? <div className="room-welcome"><Markdown text={welcome} /></div> : <p className="muted">Shown at the very top of the {word}. Markdown and emoji work.</p>}
          </div>
        </div>}

        {tab === 'slowmode' && <div className="col">
          <p className="muted small">How long each person waits between {kind === 'gallery' ? 'posts, and between comments on a post' : 'messages'}. People who can manage messages or rooms aren't slowed down.</p>
          <div className="re-slow" role="radiogroup" aria-label="Slowmode">
            {SLOWMODE.map(s => <button key={s} type="button" role="radio" aria-checked={slow === s} className={`btn small ${slow === s ? 'primary' : 'ghost'}`} onClick={() => setSlow(s)}>{fmtSlow(s)}</button>)}
          </div>
        </div>}

        {tab === 'privacy' && <div className="col">
          <label className="toggle"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} />
            <span><Icon name="lock" size={14} /> Private: only admins and the people you pick can see it</span></label>
          {priv && (
            <div className="pick-list">
              {nonAdmins.length === 0 && <p className="muted small">No regular members yet. Admins always have access.</p>}
              {nonAdmins.map(m => (
                <label key={m.user_id} className="pick">
                  <input type="checkbox" checked={allowed.has(m.user_id)} onChange={e => {
                    const s = new Set(allowed); e.target.checked ? s.add(m.user_id) : s.delete(m.user_id); setAllowed(s)
                  }} />
                  <Avatar id={m.user_id} size={24} /> <PName id={m.user_id} />
                </label>
              ))}
            </div>
          )}
        </div>}

        <div className="re-foot">
          {editing && <button type="button" className="btn danger" onClick={destroy}>Delete {word}</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || img.busy}>{editing ? 'Save' : `Create ${word}`}</button>
        </div>
      </div>
      {img.cropper}
    </Modal>
  )
}

function PName({ id }) {
  const p = useProfile(id)
  return <span>{p?.display_name || p?.username || '…'}</span>
}

// New / edit category: name, icon, accent, banner (+ theme once the themes migration is in).
export function CategoryModal({ ctx, cat, onClose }) {
  const sid = ctx.server.id
  const cats = categories.use(s => s[sid])
  const c0 = cat || {}
  const [name, setName] = useState(c0.name || '')
  const [icon, setIcon] = useState(c0.icon || null)
  const [accent, setAccent] = useState(isHex(c0.accent) ? c0.accent : '')
  const [banner, setBanner] = useState({ url: c0.banner_url || null, crop: c0.banner_crop || null })
  const [theme, setTheme] = useState(c0.theme ?? null)
  const [busy, setBusy] = useState(false)
  const img = useImagePick(ctx.userId)
  const themes = hasTheme(cats) || hasTheme(ctx.channels)
  const n = cleanRoomName(name)
  const draft = { name: n || 'Category', icon, accent: accent || null, banner_url: banner.url, banner_crop: banner.crop }

  async function save(e) {
    if (!n) return toast('Give the category a name.')
    setBusy(true)
    const row = { name: n, icon, accent: accent || null, banner_url: banner.url, banner_crop: banner.url ? banner.crop : null, ...(themes && { theme }) }
    const { data, error } = cat
      ? await supabase.from('categories').update(row).eq('id', cat.id).select().single()
      : await supabase.from('categories').insert({ ...row, server_id: sid, position: Math.max(-1, ...(cats || []).map(c => c.position)) + 1 }).select().single()
    setBusy(false)
    if (error) return toast(error.message)
    setCategories(sid, l => l.some(c => c.id === data.id) ? applyItems(l, [data]) : [...l, data])
    onClose()
  }

  return (
    <Modal title={cat ? `Edit ${cat.name}` : 'New category'} onClose={onClose}>
      <div className="col room-editor">{/* not a <form>: the emoji picker's buttons would submit it */}
        <div className="re-preview cat" style={roomVars(draft, ctx.server)}>
          <div className="cat-head cat-deco"><RoomTint c={draft} />
            <span className="cat-toggle"><span className="cat-chev"><Icon name="chevron-down" size={13} /></span><RoomIcon c={draft} /><span className="cat-name">{draft.name}</span></span>
          </div>
        </div>
        <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoFocus placeholder="Hangout spots" /></label>
        <IconPicker value={icon} onChange={setIcon} img={img} />
        <AccentPicker value={accent} onChange={setAccent} auto={roomAccent({}, ctx.server) || '#ff9f6b'} />
        <BannerPicker url={banner.url} img={img} label="Banner strip" onChange={(url, crop) => setBanner({ url, crop })} />
        <div className="srv-field">
          <span className="srv-label">Theme</span>
          {themes ? <ThemePicker value={theme} onChange={setTheme} allowInherit inheritLabel="from the server" />
            : <p className="muted small">Themes are on their way.</p>}
        </div>
        <div className="re-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || img.busy}>{cat ? 'Save' : 'Create category'}</button>
        </div>
      </div>
      {img.cropper}
    </Modal>
  )
}
