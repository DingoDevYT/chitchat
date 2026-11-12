import { useState } from 'react'
import { online, primeProfiles, setPref } from './lib/store'
import { app } from './menus'
import { VoiceStage } from './Voice'
import { RadioPlayer, radio, radioApi, radioUi } from './Radio'
import ContextMenuHost from './ContextMenu'
import DialogHost from './Dialog'

// Dev-only review sheet at #/radio: a stadium with Chit Radio on a mock state (no database, silent players).
//   #/radio?drawer  queue drawer open · ?idle  nothing playing · ?out  not joined · ?min  card tucked away · ?member  not a mod
const q = new URLSearchParams(location.hash.split('?')[1] || '')
const CID = 'lab-stadium'
const PEOPLE = [['lab-me', 'You', '#ffd166'], ['lab-1', 'Juniper', '#ff9f6b'], ['lab-2', 'Doodle', '#7cc4b0'], ['lab-3', 'Saffron', '#e58fb4'], ['lab-4', 'Pip', '#8fb3e8']]
primeProfiles(PEOPLE.map(([id, n, color]) => ({ id, username: n.toLowerCase(), display_name: n, color })))
online.set(Object.fromEntries(PEOPLE.map(([id]) => [id, { voice: CID }])))
app.ctx = { userId: 'lab-me', can: () => !q.has('member') } // ?member: not a mod, so skipping is a vote
setPref('radioMin', q.has('min'))

const track = (id, title, by, dur, extra = {}) => ({ id, kind: 'yt', src: 'dQw4w9WgXcQ', title, art: null, dur, by, at: 0, ...extra })
const now = Date.now()
radio.set({
  [CID]: q.has('idle') ? { state: {}, queue: [] } : {
    state: { track: track('t0', 'Rainy Window Lo-fi · cozy beats to study and sip cocoa to', 'lab-1', 214), started_at: now - 83_000, paused_at: null, skips: ['lab-3'] },
    queue: [
      track('t1', 'Campfire Ukulele Medley', 'lab-me', 187, { kind: 'audio', src: 'https://example.com/a.mp3' }),
      track('t2', 'Night Market Synthwave (extended mix)', 'lab-2', 402, { kind: 'sc', src: 'https://soundcloud.com/a/b' }),
      track('t3', 'Pancake Sunday', 'lab-4', null),
      track('t4', 'Snowfall in the Library', 'lab-me', 256, { kind: 'audio', src: 'https://example.com/b.mp3' }),
    ],
  },
})
if (q.has('drawer')) radioUi.set({ open: CID })

// A tiny local stand-in for music_do.
radioApi.mock = true
radioApi.act = async (cid, action, arg) => {
  radio.set(s => {
    const r = s[cid], st = { ...r.state }, queue = [...r.queue]
    const next = () => { const t = queue.shift(); return t ? { track: t, started_at: Date.now(), paused_at: null, skips: [] } : {} }
    let out = { state: st, queue }
    if (action === 'add') { const t = { ...arg.track, id: crypto.randomUUID(), by: 'lab-me' }; if (st.track) queue.push(t); else out.state = { track: t, started_at: Date.now(), paused_at: null, skips: [] } }
    if (action === 'remove') out.queue = queue.filter(t => t.id !== arg.id)
    if (action === 'skip' || action === 'ended') out.state = next()
    if (action === 'pause') st.paused_at = Date.now()
    if (action === 'resume') { st.started_at = Date.now() - (st.paused_at - st.started_at); st.paused_at = null }
    if (action === 'clear') out = { state: {}, queue: [] }
    if (action === 'loop') out.state = { ...st, loop: arg.mode }
    if (action === 'disable') out = { state: {}, queue: [], disabled: true }
    if (action === 'enable') out = { ...out, disabled: false }
    return { ...s, [cid]: out }
  })
  return true
}

export default function RadioLab() {
  const [vstate, setVstate] = useState({ muted: false, deafened: false, live: false, cam: false })
  const channel = { id: CID, name: 'The Bandstand', kind: 'voice', games_enabled: false }
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <main className="main" style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <VoiceStage channel={channel} meId="lab-me" joined={!q.has('out')} onJoin={() => {}} vstate={vstate} setVstate={setVstate}
          onLive={() => {}} onCam={() => {}} onMenu={() => {}} onLeave={() => {}} />
      </main>
      {!q.has('out') && <RadioPlayer cid={CID} deafened={vstate.deafened} />}
      <ContextMenuHost />
      <DialogHost />
    </div>
  )
}
