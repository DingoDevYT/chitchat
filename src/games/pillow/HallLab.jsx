// Dev only (#/hall, `?empty` for an empty hall, `?mod` to be a mod): the Drawing Duel Hall of Fame with
// made-up champions from the doodle stash, no server.
import { useState } from 'react'
import { primeProfiles } from '../../lib/store'
import { app } from '../../menus'
import Hall from './Hall.jsx'
import { DOODLES } from './doodles.js'
import { PROMPTS } from './prompts.js'

const q = new URLSearchParams(location.hash.split('?')[1] || '')
const SID = 'lab-server'
const PEOPLE = [['lab-me', 'Pip'], ['lab-2', 'Marlo'], ['lab-3', 'Juniper'], ['lab-4', 'Okra']]
primeProfiles(PEOPLE.map(([id, n]) => ({ id, username: n.toLowerCase(), display_name: n })))
app.ctx = { userId: 'lab-me', server: { id: SID }, can: () => q.has('mod') }
app.channels = [{ id: 'c1', kind: 'text', server_id: SID, name: 'general' }, { id: 'c2', kind: 'text', server_id: SID, name: 'art-corner' }]

const ROWS = q.has('empty') ? [] : DOODLES.slice(0, 10).map((d, i) => ({
  id: `r${i}`, server_id: SID, artist_id: PEOPLE[i % 4][0], name: d.name, prompt: PROMPTS[(i * 7) % PROMPTS.length], art: d.art,
  cry: i % 2 ? { text: 'Pillows at dawn!', synth: i % 6 } : { synth: i % 6 }, round: 1 + (i % 3), votes: (i * 5) % 11, wins: 1 + (i % 3),
  streak: 1 + (i % 3), channel_name: 'Stadium', thumb: null, created_at: new Date(Date.now() - i * 86400000).toISOString(),
}))

let off = false
const api = {
  useOptOut: () => off,
  setOptOut: async on => { off = on },
  loadHall: async () => ROWS,
  thumbUrls: async () => ({}),
  loadHallCry: async () => null,
  removeEntry: async row => { ROWS.splice(ROWS.indexOf(row), 1) },
  shareToChat: async () => {},
}

export default function HallLab() {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {!open && <button className="btn primary" style={{ margin: 16 }} onClick={() => setOpen(true)}>Open the Hall of Fame</button>}
      {open && <Hall serverId={SID} api={api} onClose={() => setOpen(false)} />}
    </div>
  )
}
