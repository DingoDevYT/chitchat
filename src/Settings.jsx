import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { prefs, primeProfiles, profiles, setPref, setTalking, toast, useProfile } from './lib/store'
import { sayPreview } from './lib/animalese'
import { uploadFile } from './lib/upload'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import Modal from './Modal'
import Avatar, { Critter, CropImg } from './Avatar'
import { AvatarList, AvatarEditor } from './AvatarSetups'
import { baseOf } from './lib/avatarLook'
import { setBasePicture } from './lib/avatarSetups'
import ImageCropper from './ImageCropper'
import VoiceSettings from './VoiceSettings'
import Privacy from './Privacy'
import { NotificationsTab } from './Notify'
import Icon from './icons/Icon'
import { EntrancePicker } from './Entrances'

const WAVES = [['square', 'Chirpy'], ['triangle', 'Soft'], ['sawtooth', 'Buzzy'], ['sine', 'Gentle']]
const COLORS = ['#ff9f6b', '#f4a261', '#e76f51', '#ff6b8b', '#c77dff', '#7b9cff', '#4cc9f0', '#7ed6b1', '#b5e48c', '#ffd166']

// Browser (Web Speech) voice for TTS. Listeners hear it on their own device; without this exact voice they get one in the same language.
function RealVoicePick({ voice, setVoice }) {
  const ss = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
  const [voices, setVoices] = useState(() => ss?.getVoices() || [])
  useEffect(() => {
    if (!ss) return
    const load = () => setVoices(ss.getVoices())
    ss.addEventListener('voiceschanged', load)
    return () => ss.removeEventListener('voiceschanged', load)
  }, [ss])
  if (!ss) return <p className="muted small">This browser can't speak, but others will still hear you in a voice from their own device.</p>
  const pick = name => { const v = voices.find(x => x.name === name); setVoice('voiceName', v?.name || null); setVoice('voiceLang', v?.lang || null) }
  function test() {
    ss.cancel()
    const u = new SpeechSynthesisUtterance('Hiya! This is how I sound!')
    u.voice = voices.find(x => x.name === voice.voiceName) || null
    u.pitch = voice.pitch ?? 1; u.rate = voice.speed ?? 1
    ss.speak(u)
  }
  return (
    <div className="row">
      <label style={{ flex: 1 }}>Real voice
        <select value={voice.voiceName || ''} onChange={e => pick(e.target.value)}>
          <option value="">Browser default</option>
          {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
        </select>
      </label>
      <button className="btn ghost small" onClick={test}><Icon name="play" size={14} /> Test</button>
    </div>
  )
}

export default function Settings({ me, onClose, tab: firstTab }) {
  const [tab, setTab] = useState(firstTab || 'profile')
  const [form, setForm] = useState({
    username: me.username, display_name: me.display_name || '', bio: me.bio || '', color: me.color,
    voice: { pitch: 1, speed: 1, wave: 'square', ...me.voice },
  })
  const [busy, setBusy] = useState(null)
  const [cropping, setCropping] = useState(null) // { file } for the profile picture
  const [editing, setEditing] = useState(null) // avatar setup open in the editor ({} = new)
  const closeEditor = useCallback(() => setEditing(null), [])
  const live = useProfile(me.id)
  const base = baseOf(live || me)
  const closeCropper = useCallback(() => setCropping(null), [])
  const p = prefs.use()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setVoice = (k, v) => setForm(f => ({ ...f, voice: { ...f.voice, [k]: v } }))

  async function save() {
    if (!/^[a-z0-9_.]{2,32}$/.test(form.username)) return toast('Usernames need 2 to 32 letters, numbers, _ or .')
    const { data, error } = await supabase.from('profiles').update({
      ...form, username: form.username.toLowerCase(), display_name: form.display_name.trim() || null, bio: form.bio.trim() || null,
    }).eq('id', me.id).select().single()
    if (error) return toast(error.code === '23505' ? 'That username is taken.' : error.message)
    primeProfiles([data])
    toast('Saved ✨')
    onClose()
  }

  function pick(input) {
    const file = input.files[0]
    input.value = '' // allow re-picking the same file
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    setCropping({ file })
  }

  // The plain profile picture saves straight away: shown for you at once, then for others via realtime.
  // (PNGtuber images live in avatar setups, edited in their own menu.)
  async function applyCrop({ file, crop, preview }) {
    const prev = profiles.get()[me.id]
    if (!prev?.avatar_setup) primeProfiles([{ ...prev, avatar_idle: preview, avatar_crop: crop }])
    setBusy('base')
    try {
      const { url } = await uploadFile(file, me.id)
      await setBasePicture(me.id, { url, crop })
      setCropping(null)
    } catch (e) { primeProfiles([prev]); toast(e.message) }
    setBusy(null)
  }
  async function clearBase() {
    try { await setBasePicture(me.id, null) } catch (e) { toast(e.message) }
  }

  function testTalk() {
    const prev = profiles.get()[me.id], preview = { ...prev, ...form }
    primeProfiles([preview]) // preview unsaved look on your own avatar
    setTalking(me.id, true)
    sayPreview('Hiya! This is how I sound!', form.voice)
    // only undo the preview if nothing (a save, an upload) replaced it meanwhile
    setTimeout(() => { setTalking(me.id, false); if (profiles.get()[me.id] === preview) primeProfiles([prev]) }, 1600)
  }

  // The avatar editor takes over this dialog (rather than stacking on it); Settings stays mounted underneath.
  if (editing) return <AvatarEditor meId={me.id} setup={editing} onClose={closeEditor} />

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="tabs">
        {[['profile', 'Profile'], ['voice', 'Avatar & voice'], ['media', 'Voice & video'], ['notify', 'Notifications'], ['app', 'App'], ['privacy', 'Privacy']].map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'profile' && (
        <div className="col">
          <div className="pic-row">
            <div className="slot-img">{base ? <CropImg src={base.url} crop={base.crop} /> : <Critter size={80} color={form.color} />}</div>
            <div className="col pic-text">
              <b>Profile picture</b>
              <span className="muted small">{live?.avatar_setup ? 'Shown whenever you switch your PNGtuber avatar off.' : 'Leave it empty to be a critter. Want idle and talking images? Make an avatar on the Avatar & voice tab.'}</span>
              <div className="row">
                <label className="btn ghost small">{busy === 'base' ? 'Uploading…' : base ? 'Change picture' : 'Upload picture'}
                  <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pick(e.target)} /></label>
                {base && <button className="btn ghost small" onClick={clearBase}>Remove</button>}
              </div>
            </div>
          </div>
          <label>Display name<input value={form.display_name} onChange={e => set('display_name', e.target.value)} maxLength={48} /></label>
          <label>Username<input value={form.username} maxLength={32}
            onChange={e => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} /></label>
          <label>About me<textarea value={form.bio} onChange={e => set('bio', e.target.value)} maxLength={300} rows={3} /></label>
          <div>Name colour
            <div className="swatches">
              {COLORS.map(c => <button key={c} className={`swatch${form.color === c ? ' on' : ''}`} style={{ background: c }}
                onClick={() => set('color', c)} aria-label={c} />)}
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)} aria-label="Custom colour" />
            </div>
          </div>
        </div>
      )}

      {tab === 'voice' && (
        <div className="col">
          <AvatarList meId={me.id} onEdit={setEditing} />

          <EntrancePicker me={me} />

          <div>Voice
            <div className="tabs small">{WAVES.map(([w, l]) =>
              <button key={w} className={form.voice.wave === w ? 'on' : ''} onClick={() => setVoice('wave', w)}>{l}</button>)}</div>
          </div>
          <label>Pitch <input type="range" min="0.5" max="2" step="0.05" value={form.voice.pitch} onChange={e => setVoice('pitch', +e.target.value)} /></label>
          <label>Speed <input type="range" min="0.5" max="2" step="0.05" value={form.voice.speed} onChange={e => setVoice('speed', +e.target.value)} /></label>
          <button className="btn ghost test-voice" onClick={testTalk}><Avatar id={me.id} size={28} mode="voice" /> Test my voice</button>
          <div>Speak my TTS messages as
            <div className="tabs small">{[['animalese', 'Animalese'], ['real', 'Real voice']].map(([v, l]) =>
              <button key={v} className={(form.voice.tts || 'animalese') === v ? 'on' : ''} onClick={() => setVoice('tts', v)}>{l}</button>)}</div>
            <span className="muted small">For <Icon name="volume" size={14} /> TTS messages in stadium chats. Pitch and speed above apply to both.</span>
          </div>
          {form.voice.tts === 'real' && <RealVoicePick voice={form.voice} setVoice={setVoice} />}
        </div>
      )}

      {tab === 'media' && <VoiceSettings />}
      {tab === 'privacy' && <Privacy />}
      {tab === 'notify' && <NotificationsTab />}

      {tab === 'app' && (
        <div className="col">
          <div>Look
            <div className="tabs small">{[['night', 'Night'], ['day', 'Day'], ['system', 'Match system']].map(([v, l]) =>
              <button key={v} className={(p.look || 'night') === v ? 'on' : ''} onClick={() => setPref('look', v)}>{l}</button>)}</div>
            <span className="muted small">A calm island evening, or warm paper by day.</span>
          </div>
          <label className="toggle"><input type="checkbox" checked={p.uiSounds} onChange={e => setPref('uiSounds', e.target.checked)} />
            <span>UI sounds <span className="muted small">soft blips for menus, dialogs and sends (quiet in Do Not Disturb)</span></span></label>
          {p.uiSounds && <label>UI sound volume <input type="range" min="0" max="1" step="0.05" value={p.uiVolume} onChange={e => setPref('uiVolume', +e.target.value)} /></label>}
          <label className="toggle"><input type="checkbox" checked={p.animalese} onChange={e => setPref('animalese', e.target.checked)} />
            <span>Animalese voices on new messages</span></label>
          <label>Typing voice volume <input type="range" min="0" max="1" step="0.05" value={p.volume} onChange={e => setPref('volume', +e.target.value)} /></label>
          <div>Animate avatars
            <div className="tabs small">{[['always', 'Always'], ['hover', 'On hover only']].map(([v, l]) =>
              <button key={v} className={p.animateAvatars === v ? 'on' : ''} onClick={() => setPref('animateAvatars', v)}>{l}</button>)}</div>
            <span className="muted small">GIF avatars and server icons. With reduced motion turned on, they only move on hover.</span>
          </div>
          <div>Animated themes
            <div className="tabs small">{[['full', 'Full'], ['subtle', 'Subtle'], ['off', 'Off']].map(([v, l]) =>
              <button key={v} className={(p.animatedThemes || 'full') === v ? 'on' : ''} onClick={() => setPref('animatedThemes', v)}>{l}</button>)}</div>
            <span className="muted small">Room and stadium backgrounds. Subtle is slower and fainter; Off shows a still gradient.</span>
          </div>
          {Object.keys(p.muted).length > 0 && (
            <button className="btn ghost" onClick={() => setPref('muted', {})}>Unmute everyone ({Object.keys(p.muted).length})</button>
          )}
          <p className="muted small">Shortcuts: <kbd>Ctrl</kbd>+<kbd>K</kbd> jump anywhere · <kbd>↑</kbd> edit your last message ·
            <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Shift</kbd>-click <Icon name="trash" size={14} /> deletes without asking</p>
          <button className="btn danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      )}

      {(tab === 'profile' || tab === 'voice') && <div className="modal-foot"><button className="btn primary" onClick={save}>Save changes</button></div>}
      {cropping && <ImageCropper file={cropping.file} title="Crop profile picture" onCancel={closeCropper} onApply={applyCrop} />}
    </Modal>
  )
}
