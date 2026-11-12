import { useCallback, useEffect, useRef, useState } from 'react'
import { toast, useProfile } from './lib/store'
import { uploadFile } from './lib/upload'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import { EXPRESSIONS, BLINKS, pickExpression } from './lib/expressions'
import { baseOf, cleanLook, imageCount, setSlot, slotImage } from './lib/avatarLook'
import { CHITPAL_EXT } from './lib/chitpal'
import {
  mySetups, loadSetups, wearSetup, saveSetup, duplicateSetup, deleteSetup, exportSetup, readChitpal, importChitpal,
} from './lib/avatarSetups'
import { ask } from './Dialog'
import Modal from './Modal'
import ImageCropper from './ImageCropper'
import { Critter, CropImg } from './Avatar'
import Icon from './icons/Icon'
import './styles/avatar-setups.css'

// Drawn icons for each image slot (the emoji in expressions.js are for older code).
const SLOT_ICON = { idle: 'user', talk: 'chat', typing: 'keyboard', deafened: 'headphones-off', muted: 'mic-off', live: 'live', away: 'moon', blink: 'eye-off', talk_blink: 'smile' }
const MAIN = [['idle', 'Idle', 'Your everyday face. Needed.'], ['talk', 'Talking', 'While you speak or your message types out']]
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// A setup's face, drawn from its look (a profile-shaped object) with the given state flags.
export function SetupFace({ look, color, size = 48, state = {}, className = '' }) {
  const expr = look ? pickExpression(look, state) : null
  return (
    <span className={`avatar av-face${state.talk ? ' talking' : ''} ${className}`} style={{ width: size, height: size, '--ring': color }}>
      {expr ? <CropImg src={expr.src} crop={expr.crop} /> : <Critter size={size} color={color} talk={!!state.talk} />}
    </span>
  )
}

// The plain profile picture as a look, for drawing it with SetupFace.
const plainLook = p => { const b = baseOf(p); return b ? { avatar_idle: b.url, avatar_crop: b.crop } : null }

export function useMySetups(meId) {
  const s = mySetups.use()
  useEffect(() => {
    if (meId && (s.owner !== meId || !s.loaded)) loadSetups(meId).catch(e => { mySetups.set({ owner: meId, loaded: true, list: [], error: e.message }) })
  }, [meId]) // eslint-disable-line react-hooks/exhaustive-deps
  return s.owner === meId ? s : { loaded: false, list: [] }
}

// Speech-ish mouth flaps for previews: bursts of talking with little gaps.
function useChatter(on) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!on) return setOpen(false)
    if (reducedMotion) return setOpen(true)
    let t, alive = true
    const step = o => {
      if (!alive) return
      setOpen(o)
      const pause = !o && Math.random() < 0.15
      t = setTimeout(() => step(!o), o ? 140 + Math.random() * 260 : pause ? 650 : 70 + Math.random() * 110)
    }
    step(true)
    return () => { alive = false; clearTimeout(t) }
  }, [on])
  return open
}

// ── "My avatars" in Settings ──
export function AvatarList({ meId, onEdit }) {
  const p = useProfile(meId)
  const { loaded, list, error } = useMySetups(meId)
  const [busy, setBusy] = useState(null) // setup id or 'import'
  const [hover, setHover] = useState(null)
  const active = p?.avatar_setup || null
  const color = p?.color

  async function run(key, fn) {
    setBusy(key)
    try { await fn() } catch (e) { toast(e.message) }
    setBusy(null)
  }
  const use = s => run(s?.id || 'plain', () => wearSetup(meId, s))
  async function remove(s) {
    if (!(await ask({ text: `Delete the avatar "${s.name}"?${s.id === active ? ' You\'re wearing it, so you\'ll go back to your profile picture.' : ''}`, confirm: 'Delete', danger: true }))) return
    run(s.id, () => deleteSetup(meId, s))
  }
  function pickImport(input) {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    run('import', async () => {
      const decoded = await readChitpal(file)
      const credit = decoded.creator ? ` by ${decoded.creator}` : ''
      if (!(await ask({ text: `Import "${decoded.name}"${credit}? It has ${Object.keys(decoded.images).length} image${Object.keys(decoded.images).length === 1 ? '' : 's'} and will be added to your avatars.`, confirm: 'Import' }))) return
      const saved = await importChitpal(meId, decoded)
      toast(`Imported ${saved.name}`)
    })
  }
  const creatorName = p?.display_name || (p?.username ? '@' + p.username : null)

  return (
    <section className="av-list" aria-label="My avatars">
      <div className="av-list-head">
        <div>
          <b>My avatars</b>
          <span className="muted small">PNGtuber setups you can swap between, even mid-call. Totally optional.</span>
        </div>
        <div className="row">
          <label className={`btn ghost small${busy === 'import' ? ' busy' : ''}`} title={`Import a ${CHITPAL_EXT} file`}>
            <Icon name="folder" size={15} /> {busy === 'import' ? 'Importing…' : 'Import'}
            <input type="file" accept={`${CHITPAL_EXT},application/json`} hidden disabled={busy === 'import'} onChange={e => pickImport(e.target)} />
          </label>
          <button className="btn primary small" onClick={() => onEdit({})}><Icon name="plus" size={15} /> New</button>
        </div>
      </div>

      <div className={`av-card${!active ? ' on' : ''}`}>
        <SetupFace look={plainLook(p)} color={color} size={56} />
        <div className="av-card-text">
          <b>Just my profile picture</b>
          <span className="muted small">No PNGtuber images. Change the picture on the Profile tab.</span>
        </div>
        <div className="av-card-acts">
          {!active ? <span className="av-badge"><Icon name="check" size={13} /> Active</span>
            : <button className="btn ghost small" disabled={!!busy} onClick={() => use(null)}>{busy === 'plain' ? 'Switching…' : 'Use this'}</button>}
        </div>
      </div>

      {!loaded && <div className="skeleton av-skel" />}
      {error && <p className="muted small">Avatars couldn't load ({error}).</p>}
      {list.map(s => {
        const on = s.id === active, n = imageCount(s.look)
        return (
          <div key={s.id} className={`av-card${on ? ' on' : ''}`} onPointerEnter={() => setHover(s.id)} onPointerLeave={() => setHover(null)}>
            <SetupFace look={s.look} color={color} size={56} state={{ talk: hover === s.id }} />
            <div className="av-card-text">
              <b>{s.name}</b>
              <span className="muted small">{n} image{n === 1 ? '' : 's'}{s.creator ? ` · by ${s.creator}` : ''}</span>
            </div>
            <div className="av-card-acts">
              {on ? <span className="av-badge"><Icon name="check" size={13} /> Active</span>
                : <button className="btn ghost small" disabled={!!busy} onClick={() => use(s)}>{busy === s.id ? 'Switching…' : 'Use this'}</button>}
              <button className="btn ghost small" onClick={() => onEdit(s)}><Icon name="edit" size={14} /> Edit</button>
              <button className="icon-btn" disabled={!!busy} onClick={() => run(s.id, () => duplicateSetup(meId, s))} title="Duplicate" aria-label={`Duplicate ${s.name}`}><Icon name="copy" size={17} /></button>
              <button className="icon-btn" disabled={!!busy} onClick={() => run(s.id, () => exportSetup(s, creatorName))} title={`Export as ${CHITPAL_EXT} file`} aria-label={`Export ${s.name}`}><Icon name="download" size={17} /></button>
              <button className="icon-btn danger" disabled={!!busy} onClick={() => remove(s)} title="Delete" aria-label={`Delete ${s.name}`}><Icon name="trash" size={17} /></button>
            </div>
          </div>
        )
      })}
      {loaded && !list.length && !error && <p className="muted small av-empty">No avatars yet. Make one with an idle and a talking image, or import a {CHITPAL_EXT} file someone shared.</p>}
    </section>
  )
}

// ── Focused editor for one setup ──
// setup: a saved row, or {} for a new one. Images upload as you pick them; nothing is saved until Save.
export function AvatarEditor({ meId, setup, onClose }) {
  const p = useProfile(meId)
  const isNew = !setup.id
  const [name, setName] = useState(setup.name || (isNew ? 'New avatar' : ''))
  const [look, setLook] = useState(() => cleanLook(setup.look))
  const [busy, setBusy] = useState({}) // slot -> true while uploading
  const [saving, setSaving] = useState(false)
  const [cropping, setCropping] = useState(null) // { slot, file }
  const [state, setState] = useState('talk')
  const [blink, setBlink] = useState(false)
  const closeCropper = useCallback(() => setCropping(null), [])
  const chatter = useChatter(state === 'talk')
  const wearing = !isNew && p?.avatar_setup === setup.id
  const uploading = Object.values(busy).some(Boolean)
  const dirty = name !== (setup.name || '') || JSON.stringify(look) !== JSON.stringify(cleanLook(setup.look))

  function pick(slot, input) {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    setCropping({ slot, file })
  }
  async function applyCrop({ file, crop, preview }) {
    const slot = cropping.slot
    setCropping(null)
    setLook(l => setSlot(l, slot, { url: preview, crop }))
    setBusy(b => ({ ...b, [slot]: true }))
    try {
      const { url } = await uploadFile(file, meId)
      setLook(l => slotImage(l, slot)?.url === preview ? setSlot(l, slot, { url, crop }) : l)
    } catch (e) {
      toast(e.message)
      setLook(l => slotImage(l, slot)?.url === preview ? setSlot(l, slot, slotImage(setup.look, slot)) : l)
    }
    setBusy(b => ({ ...b, [slot]: false }))
  }
  async function save(wear) {
    if (!name.trim()) return toast('Give your avatar a name.')
    if (!look.avatar_idle) return toast('An avatar needs at least an idle image.')
    setSaving(true)
    try {
      await saveSetup(meId, { id: setup.id, name, look }, { wear })
      toast(wear ? 'Saved and switched' : 'Avatar saved')
      onClose()
    } catch (e) { toast(e.message); setSaving(false) }
  }
  async function cancel() {
    if (dirty && !(await ask({ text: 'Close without saving your changes?', confirm: 'Discard', danger: true }))) return
    onClose()
  }

  const states = [['idle', 'Idle'], ['talk', 'Talking'], ...EXPRESSIONS.filter(([k]) => slotImage(look, k)).map(([k, l]) => [k, l])]
  const flags = state === 'idle' ? {} : state === 'talk' ? { talk: chatter } : { [state]: true }
  const hasBlink = !!(slotImage(look, 'blink') || slotImage(look, 'talk_blink'))
  const slotLabel = k => [...MAIN, ...EXPRESSIONS, ...BLINKS].find(e => e[0] === k)?.[1] || k

  const slot = (k, label, hint) => {
    const cur = slotImage(look, k)
    return (
      <div key={k} className={`av-slot${cur ? ' set' : ''}`}>
        <div className="slot-img">{cur ? <CropImg src={cur.url} crop={cur.crop} /> : <Icon name={SLOT_ICON[k]} size={28} />}</div>
        <div className="av-slot-text"><b>{label}</b><span className="muted">{hint}</span></div>
        <div className="row">
          <label className="btn ghost small">{busy[k] ? 'Uploading…' : cur ? 'Change' : 'Upload'}
            <input type="file" accept={IMAGE_TYPES} hidden disabled={busy[k]} onChange={e => pick(k, e.target)} /></label>
          {cur && k !== 'idle' && <button className="icon-btn" onClick={() => setLook(l => setSlot(l, k, null))} title="Remove" aria-label={`Remove ${label} image`}><Icon name="close" size={15} /></button>}
        </div>
      </div>
    )
  }

  return (
    <Modal title={isNew ? 'New avatar' : 'Edit avatar'} onClose={cancel} wide>
      <div className="av-editor">
        <div className="av-stage">
          <div className="av-stage-floor">
            <SetupFace look={look} color={p?.color} size={150} state={{ ...flags, blink: blink && hasBlink }} />
          </div>
          <div className="av-chips" role="group" aria-label="Preview">
            {states.map(([k, l]) => <button key={k} className={state === k ? 'on' : ''} aria-pressed={state === k} onClick={() => setState(k)}>{l}</button>)}
            {hasBlink && <button className={blink ? 'on' : ''} aria-pressed={blink} onClick={() => setBlink(b => !b)}>Blink</button>}
          </div>
          <p className="muted small">Live preview{state === 'talk' ? ': chattering like you would in a call' : ''}.</p>
        </div>

        <div className="av-form col">
          <label>Name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Sleepy fox" /></label>
          {setup.creator && <p className="muted small">Made by {setup.creator}</p>}
          <div className="av-slots">{MAIN.map(([k, l, h]) => slot(k, l, h))}</div>
          <details className="expr-more" open={Object.keys(look.avatar_states).length > 0 || undefined}>
            <summary><Icon name="sparkle" size={16} /> More expressions <span className="muted small">optional</span></summary>
            <p className="muted small">Extra images this avatar switches to automatically. Anything left empty uses the idle image.</p>
            {[['Expressions', EXPRESSIONS], ['Blinking (advanced)', BLINKS]].map(([label, list]) => (
              <div key={label}>
                <p className="expr-section-label">{label}</p>
                <div className="av-slots">{list.map(([k, l, , h]) => slot(k, l, h))}</div>
              </div>
            ))}
          </details>
        </div>
      </div>
      <div className="modal-foot av-foot">
        <button className="btn ghost" onClick={cancel}>Cancel</button>
        {!wearing && <button className="btn ghost" disabled={saving || uploading} onClick={() => save(false)}>Save</button>}
        <button className="btn primary" disabled={saving || uploading} onClick={() => save(true)}>
          {uploading ? 'Uploading…' : saving ? 'Saving…' : wearing ? 'Save' : 'Save and use'}</button>
      </div>
      {cropping && <ImageCropper file={cropping.file} title={`Crop ${slotLabel(cropping.slot).toLowerCase()} image`} onCancel={closeCropper} onApply={applyCrop} />}
    </Modal>
  )
}

// ── Quick switcher in the me-panel ──
export function AvatarSwitcher({ userId, onManage }) {
  const [open, setOpen] = useState(false)
  const p = useProfile(userId)
  return (
    <>
      <button className={`icon-btn av-switch-btn${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        title="Switch avatar" aria-label="Switch avatar">
        <SetupFace look={p?.avatar_setup ? p : plainLook(p)} color={p?.color} size={22} />
      </button>
      {open && <SwitcherPop userId={userId} onClose={() => setOpen(false)} onManage={() => { setOpen(false); onManage() }} />}
    </>
  )
}

function SwitcherPop({ userId, onClose, onManage }) {
  const p = useProfile(userId)
  const { loaded, list } = useMySetups(userId)
  const [busy, setBusy] = useState(null)
  const root = useRef(null)
  useEffect(() => {
    const down = e => { if (!root.current?.contains(e.target) && !e.target.closest?.('.av-switch-btn')) onClose() }
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', esc) }
  }, [onClose])
  const active = p?.avatar_setup || null
  async function use(s) {
    if ((s?.id || null) === active) return onClose()
    setBusy(s?.id || 'plain')
    try { await wearSetup(userId, s); onClose() } catch (e) { toast(e.message); setBusy(null) }
  }
  const opt = (s, look, label, sub) => {
    const on = (s?.id || null) === active
    return (
      <button key={s?.id || 'plain'} className={`st-opt av-opt${on ? ' on' : ''}`} aria-pressed={on} disabled={!!busy} onClick={() => use(s)}>
        <SetupFace look={look} color={p?.color} size={36} />
        <span><b>{label}</b><span className="muted small">{busy === (s?.id || 'plain') ? 'Switching…' : sub}</span></span>
        {on && <Icon name="check" size={16} className="av-opt-check" />}
      </button>
    )
  }
  return (
    <div ref={root} className="status-pop av-pop pop" role="dialog" aria-label="Switch avatar">
      <b className="av-pop-title">Avatar</b>
      {opt(null, plainLook(p), 'Profile picture', 'Just your picture')}
      {!loaded && <div className="skeleton av-skel" />}
      <div className="av-pop-list">
        {list.map(s => opt(s, s.look, s.name, `${imageCount(s.look)} image${imageCount(s.look) === 1 ? '' : 's'}`))}
      </div>
      {loaded && !list.length && <p className="muted small av-pop-empty">No PNGtuber avatars yet.</p>}
      <hr />
      <button className="st-opt" onClick={onManage}><Icon name="settings" size={16} /> <b style={{ display: 'inline' }}>{list.length ? 'Manage avatars' : 'Set one up'}</b></button>
    </div>
  )
}
