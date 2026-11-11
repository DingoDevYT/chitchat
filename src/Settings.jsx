import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { prefs, primeProfiles, profiles, setPref, setTalking, toast } from './lib/store'
import { sayPreview } from './lib/animalese'
import { uploadFile } from './lib/upload'
import { IMAGE_TYPES, checkImage } from './lib/crop'
import Modal from './Modal'
import Avatar, { Critter, CropImg } from './Avatar'
import ImageCropper from './ImageCropper'
import { EXPRESSIONS, BLINKS } from './lib/expressions'
import VoiceSettings from './VoiceSettings'
import Privacy from './Privacy'

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
      <button className="btn ghost small" onClick={test}>▶ Test</button>
    </div>
  )
}

export default function Settings({ me, onClose, tab: firstTab }) {
  const [tab, setTab] = useState(firstTab || 'profile')
  const [form, setForm] = useState({
    username: me.username, display_name: me.display_name || '', bio: me.bio || '', color: me.color,
    avatar_idle: me.avatar_idle, avatar_talk: me.avatar_talk, avatar_crop: me.avatar_crop || null, avatar_talk_crop: me.avatar_talk_crop || null,
    avatar_states: me.avatar_states || {},
    voice: { pitch: 1, speed: 1, wave: 'square', ...me.voice },
  })
  const [busy, setBusy] = useState(null)
  const [cropping, setCropping] = useState(null) // { key, file }
  const closeCropper = useCallback(() => setCropping(null), [])
  const p = prefs.use()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setVoice = (k, v) => setForm(f => ({ ...f, voice: { ...f.voice, [k]: v } }))

  async function save() {
    const { data, error } = await supabase.from('profiles').update({
      ...form, username: form.username.toLowerCase(), display_name: form.display_name.trim() || null, bio: form.bio.trim() || null,
    }).eq('id', me.id).select().single()
    if (error) return toast(error.code === '23505' ? 'That username is taken.' : error.message)
    primeProfiles([data])
    toast('Saved ✨')
    onClose()
  }

  function pick(key, input) {
    const file = input.files[0]
    input.value = '' // allow re-picking the same file
    if (!file) return
    const err = checkImage(file)
    if (err) return toast(err)
    setCropping({ key, file })
  }

  // Avatar images save straight away: shown everywhere for you at once, then for others via realtime.
  async function applyCrop({ file, crop, preview }) {
    const key = cropping.key
    if (key.startsWith('state:')) return applyState(key.slice(6), { file, crop, preview })
    const cropKey = key === 'avatar_idle' ? 'avatar_crop' : 'avatar_talk_crop'
    const prev = profiles.get()[me.id]
    primeProfiles([{ ...prev, [key]: preview, [cropKey]: crop }])
    setBusy(key)
    try {
      const { url } = await uploadFile(file, me.id)
      const { data, error } = await supabase.from('profiles').update({ [key]: url, [cropKey]: crop }).eq('id', me.id).select().single()
      if (error) throw error
      primeProfiles([data])
      setForm(f => ({ ...f, [key]: url, [cropKey]: crop }))
      setCropping(null)
    } catch (e) { primeProfiles([prev]); toast(e.message) }
    setBusy(null)
  }

  // Extra expressions (typing, muted, blink…) live in profiles.avatar_states and save straight away too.
  async function saveStates(states, optimistic) {
    const prev = profiles.get()[me.id]
    primeProfiles([{ ...prev, avatar_states: optimistic || states }])
    const { data, error } = await supabase.from('profiles').update({ avatar_states: states }).eq('id', me.id).select().single()
    if (error) { primeProfiles([prev]); toast(error.message); return false }
    primeProfiles([data])
    setForm(f => ({ ...f, avatar_states: data.avatar_states }))
    return true
  }
  async function applyState(k, { file, crop, preview }) {
    const base = profiles.get()[me.id]?.avatar_states || {}
    setBusy('state:' + k)
    try {
      const shown = { ...base, [k]: { url: preview, crop } }
      primeProfiles([{ ...profiles.get()[me.id], avatar_states: shown }])
      const { url } = await uploadFile(file, me.id)
      if (await saveStates({ ...base, [k]: { url, crop } }, shown)) setCropping(null)
    } catch (e) { toast(e.message) }
    setBusy(null)
  }
  function clearState(k) {
    const { [k]: _, ...rest } = form.avatar_states
    saveStates(rest)
  }

  function testTalk() {
    primeProfiles([{ ...me, ...form }]) // preview unsaved look on your own avatar
    setTalking(me.id, true)
    sayPreview('Hiya! This is how I sound!', form.voice)
    setTimeout(() => { setTalking(me.id, false); primeProfiles([me]) }, 1600)
  }

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="tabs">
        {[['profile', 'Profile'], ['voice', 'Avatar & voice'], ['media', 'Voice & video'], ['app', 'App'], ['privacy', 'Privacy']].map(([k, l]) =>
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'profile' && (
        <div className="col">
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
          <div className="pngtuber-setup">
            <div className="pngtuber-slot">
              <div className="slot-img">{form.avatar_idle ? <CropImg src={form.avatar_idle} crop={form.avatar_crop} /> : <Critter size={80} color={form.color} />}</div>
              <label className="btn ghost small">{busy === 'avatar_idle' ? 'Uploading…' : 'Idle image'}
                <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pick('avatar_idle', e.target)} /></label>
            </div>
            <div className="pngtuber-slot">
              <div className="slot-img">{form.avatar_talk ? <CropImg src={form.avatar_talk} crop={form.avatar_talk_crop} /> : <Critter size={80} color={form.color} talk />}</div>
              <label className="btn ghost small">{busy === 'avatar_talk' ? 'Uploading…' : 'Talking image'}
                <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pick('avatar_talk', e.target)} /></label>
            </div>
          </div>
          <p className="muted small">PNGtuber style: your idle image swaps to the talking one while your messages type out.
            Leave both empty to be a critter. {(form.avatar_idle || form.avatar_talk) &&
              <button className="link" onClick={() => setForm(f => ({ ...f, avatar_idle: null, avatar_talk: null, avatar_crop: null, avatar_talk_crop: null }))}>Reset to critter</button>}</p>

          <details className="expr-more" open={Object.keys(form.avatar_states).length > 0 || undefined}>
            <summary>✨ More expressions <span className="muted small">optional{Object.keys(form.avatar_states).length ? ` · ${Object.keys(form.avatar_states).length} set` : ''}</span></summary>
            <p className="muted small">Extra images your avatar switches to automatically. Transparent PNGs and GIFs work, and anything left empty just uses your idle image.</p>
            {[['Expressions', EXPRESSIONS], ['Blinking (advanced)', BLINKS]].map(([label, list]) => (
              <div key={label}>
                <p className="expr-section-label">{label}</p>
                <div className="expr-grid">
                  {list.map(([k, name, icon, hint]) => {
                    const cur = form.avatar_states[k]
                    return (
                      <div key={k} className="expr-slot">
                        <div className="slot-img">{cur?.url ? <CropImg src={cur.url} crop={cur.crop} /> : <span aria-hidden="true">{icon}</span>}</div>
                        <b>{name}</b>
                        <span className="muted">{hint}</span>
                        <div className="row">
                          <label className="btn ghost small">{busy === 'state:' + k ? 'Uploading…' : cur?.url ? 'Change' : 'Upload'}
                            <input type="file" accept={IMAGE_TYPES} hidden onChange={e => pick('state:' + k, e.target)} /></label>
                          {cur?.url && <button className="btn ghost small" onClick={() => clearState(k)} aria-label={`Remove ${name} image`}>✕</button>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </details>

          <div>Voice
            <div className="tabs small">{WAVES.map(([w, l]) =>
              <button key={w} className={form.voice.wave === w ? 'on' : ''} onClick={() => setVoice('wave', w)}>{l}</button>)}</div>
          </div>
          <label>Pitch <input type="range" min="0.5" max="2" step="0.05" value={form.voice.pitch} onChange={e => setVoice('pitch', +e.target.value)} /></label>
          <label>Speed <input type="range" min="0.5" max="2" step="0.05" value={form.voice.speed} onChange={e => setVoice('speed', +e.target.value)} /></label>
          <button className="btn ghost test-voice" onClick={testTalk}><Avatar id={me.id} size={28} /> Test my voice</button>
          <div>Speak my TTS messages as
            <div className="tabs small">{[['animalese', 'Animalese'], ['real', 'Real voice']].map(([v, l]) =>
              <button key={v} className={(form.voice.tts || 'animalese') === v ? 'on' : ''} onClick={() => setVoice('tts', v)}>{l}</button>)}</div>
            <span className="muted small">For 🔊 TTS messages in stadium chats. Pitch and speed above apply to both.</span>
          </div>
          {form.voice.tts === 'real' && <RealVoicePick voice={form.voice} setVoice={setVoice} />}
        </div>
      )}

      {tab === 'media' && <VoiceSettings />}
      {tab === 'privacy' && <Privacy />}

      {tab === 'app' && (
        <div className="col">
          <label className="toggle"><input type="checkbox" checked={p.animalese} onChange={e => setPref('animalese', e.target.checked)} />
            <span>Animalese voices on new messages</span></label>
          <label>Typing voice volume <input type="range" min="0" max="1" step="0.05" value={p.volume} onChange={e => setPref('volume', +e.target.value)} /></label>
          <div>Animate avatars
            <div className="tabs small">{[['always', 'Always'], ['hover', 'On hover only']].map(([v, l]) =>
              <button key={v} className={p.animateAvatars === v ? 'on' : ''} onClick={() => setPref('animateAvatars', v)}>{l}</button>)}</div>
            <span className="muted small">GIF avatars and server icons. With reduced motion turned on, they only move on hover.</span>
          </div>
          {Object.keys(p.muted).length > 0 && (
            <button className="btn ghost" onClick={() => setPref('muted', {})}>Unmute everyone ({Object.keys(p.muted).length})</button>
          )}
          <p className="muted small">Shortcuts: <kbd>Ctrl</kbd>+<kbd>K</kbd> jump anywhere · <kbd>↑</kbd> edit your last message ·
            <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Shift</kbd>-click 🗑️ deletes without asking</p>
          <button className="btn danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      )}

      {(tab === 'profile' || tab === 'voice') && <div className="modal-foot"><button className="btn primary" onClick={save}>Save changes</button></div>}
      {cropping && <ImageCropper file={cropping.file} title={cropping.key === 'avatar_idle' ? 'Crop idle image' : cropping.key === 'avatar_talk' ? 'Crop talking image'
          : `Crop ${[...EXPRESSIONS, ...BLINKS].find(([k]) => 'state:' + k === cropping.key)?.[1].toLowerCase() || 'expression'} image`}
        onCancel={closeCropper} onApply={applyCrop} />}
    </Modal>
  )
}
