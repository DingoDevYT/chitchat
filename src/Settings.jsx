import { useState } from 'react'
import { supabase } from './lib/supabase'
import { prefs, primeProfiles, setPref, setTalking, toast } from './lib/store'
import { sayPreview } from './lib/animalese'
import { uploadFile } from './lib/upload'
import Modal from './Modal'
import Avatar, { Critter } from './Avatar'
import VoiceSettings from './VoiceSettings'

const WAVES = [['square', 'Chirpy'], ['triangle', 'Soft'], ['sawtooth', 'Buzzy'], ['sine', 'Gentle']]
const COLORS = ['#ff9f6b', '#f4a261', '#e76f51', '#ff6b8b', '#c77dff', '#7b9cff', '#4cc9f0', '#7ed6b1', '#b5e48c', '#ffd166']

export default function Settings({ me, onClose, tab: firstTab }) {
  const [tab, setTab] = useState(firstTab || 'profile')
  const [form, setForm] = useState({
    username: me.username, display_name: me.display_name || '', bio: me.bio || '', color: me.color,
    avatar_idle: me.avatar_idle, avatar_talk: me.avatar_talk, voice: { pitch: 1, speed: 1, wave: 'square', ...me.voice },
  })
  const [busy, setBusy] = useState(null)
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

  async function upload(key, file) {
    if (!file) return
    setBusy(key)
    try { set(key, (await uploadFile(file, me.id)).url) } catch (e) { toast(e.message) }
    setBusy(null)
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
        {[['profile', 'Profile'], ['voice', 'Avatar & voice'], ['media', 'Voice & video'], ['app', 'App']].map(([k, l]) =>
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
              <div className="slot-img">{form.avatar_idle ? <img src={form.avatar_idle} alt="" /> : <Critter size={80} color={form.color} />}</div>
              <label className="btn ghost small">{busy === 'avatar_idle' ? 'Uploading…' : 'Idle image'}
                <input type="file" accept="image/*" hidden onChange={e => upload('avatar_idle', e.target.files[0])} /></label>
            </div>
            <div className="pngtuber-slot">
              <div className="slot-img">{form.avatar_talk ? <img src={form.avatar_talk} alt="" /> : <Critter size={80} color={form.color} talk />}</div>
              <label className="btn ghost small">{busy === 'avatar_talk' ? 'Uploading…' : 'Talking image'}
                <input type="file" accept="image/*" hidden onChange={e => upload('avatar_talk', e.target.files[0])} /></label>
            </div>
          </div>
          <p className="muted small">PNGtuber style: your idle image swaps to the talking one while your messages type out.
            Leave both empty to be a critter. {(form.avatar_idle || form.avatar_talk) &&
              <button className="link" onClick={() => setForm(f => ({ ...f, avatar_idle: null, avatar_talk: null }))}>Reset to critter</button>}</p>

          <div>Voice
            <div className="tabs small">{WAVES.map(([w, l]) =>
              <button key={w} className={form.voice.wave === w ? 'on' : ''} onClick={() => setVoice('wave', w)}>{l}</button>)}</div>
          </div>
          <label>Pitch <input type="range" min="0.5" max="2" step="0.05" value={form.voice.pitch} onChange={e => setVoice('pitch', +e.target.value)} /></label>
          <label>Speed <input type="range" min="0.5" max="2" step="0.05" value={form.voice.speed} onChange={e => setVoice('speed', +e.target.value)} /></label>
          <button className="btn ghost test-voice" onClick={testTalk}><Avatar id={me.id} size={28} /> Test my voice</button>
        </div>
      )}

      {tab === 'media' && <VoiceSettings />}

      {tab === 'app' && (
        <div className="col">
          <label className="toggle"><input type="checkbox" checked={p.animalese} onChange={e => setPref('animalese', e.target.checked)} />
            <span>Animalese voices on new messages</span></label>
          <label>Typing voice volume <input type="range" min="0" max="1" step="0.05" value={p.volume} onChange={e => setPref('volume', +e.target.value)} /></label>
          {Object.keys(p.muted).length > 0 && (
            <button className="btn ghost" onClick={() => setPref('muted', {})}>Unmute everyone ({Object.keys(p.muted).length})</button>
          )}
          <p className="muted small">Shortcuts: <kbd>Ctrl</kbd>+<kbd>K</kbd> jump anywhere · <kbd>↑</kbd> edit your last message ·
            <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Shift</kbd>-click 🗑️ deletes without asking</p>
          <button className="btn danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      )}

      {(tab === 'profile' || tab === 'voice') && <div className="modal-foot"><button className="btn primary" onClick={save}>Save changes</button></div>}
    </Modal>
  )
}
