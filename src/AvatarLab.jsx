// Dev-only review sheet for avatar setups at #/avatars (?view=list|editor|switcher). No network: the stores are
// seeded with a fake profile and setups whose images are drawn on a canvas. Dropped from production builds.
import { useEffect } from 'react'
import { primeProfiles } from './lib/store'
import { mySetups } from './lib/avatarSetups'
import { switchPatch } from './lib/avatarLook'
import Settings from './Settings'
import { AvatarEditor, AvatarSwitcher } from './AvatarSetups'
import Avatar, { Name } from './Avatar'
import DialogHost from './Dialog'
import Icon from './icons/Icon'

const ME = 'dev-me'

// A little round critter face: mouth 'smile' | 'open' | 'flat', eyes open or shut.
function face(color, { mouth = 'smile', shut = false, ears = 'round', hat = null } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = color
  if (ears === 'pointy') { g.beginPath(); g.moveTo(40, 110); g.lineTo(70, 20); g.lineTo(120, 80); g.moveTo(216, 110); g.lineTo(186, 20); g.lineTo(136, 80); g.fill() }
  else { g.beginPath(); g.arc(64, 64, 34, 0, 7); g.arc(192, 64, 34, 0, 7); g.fill() }
  g.beginPath(); g.arc(128, 146, 96, 0, 7); g.fill()
  g.fillStyle = '#ff6b8b55'; g.beginPath(); g.ellipse(72, 168, 16, 10, 0, 0, 7); g.ellipse(184, 168, 16, 10, 0, 0, 7); g.fill()
  g.fillStyle = g.strokeStyle = '#231d2b'; g.lineWidth = 9; g.lineCap = 'round'
  if (shut) { g.beginPath(); g.moveTo(84, 132); g.quadraticCurveTo(98, 144, 112, 132); g.moveTo(144, 132); g.quadraticCurveTo(158, 144, 172, 132); g.stroke() }
  else { g.beginPath(); g.ellipse(98, 130, 11, 15, 0, 0, 7); g.ellipse(158, 130, 11, 15, 0, 0, 7); g.fill() }
  g.beginPath()
  if (mouth === 'open') { g.ellipse(128, 184, 20, 17, 0, 0, 7); g.fill() }
  else if (mouth === 'flat') { g.moveTo(110, 184); g.lineTo(146, 184); g.stroke() }
  else { g.moveTo(108, 176); g.quadraticCurveTo(128, 194, 148, 176); g.stroke() }
  if (hat) { g.fillStyle = hat; g.fillRect(70, 34, 116, 18); g.fillRect(96, 0, 64, 40) }
  return c.toDataURL()
}

function seed() {
  const fox = '#f4a261', frog = '#7ed6b1', ghost = '#c9d6ff'
  const setups = [
    { id: 's1', name: 'Sleepy fox', position: 0, creator: null, look: {
      avatar_idle: face(fox, { ears: 'pointy' }), avatar_talk: face(fox, { ears: 'pointy', mouth: 'open' }),
      avatar_states: { typing: { url: face(fox, { ears: 'pointy', mouth: 'flat' }) }, muted: { url: face(fox, { ears: 'pointy', mouth: 'flat', shut: true }) },
        blink: { url: face(fox, { ears: 'pointy', shut: true }) } } } },
    { id: 's2', name: 'Space frog', position: 1, creator: null, look: {
      avatar_idle: face(frog, { hat: '#7b9cff' }), avatar_talk: face(frog, { hat: '#7b9cff', mouth: 'open' }), avatar_states: {} } },
    { id: 's3', name: 'Lantern ghost', position: 2, creator: 'mossy', look: {
      avatar_idle: face(ghost), avatar_talk: face(ghost, { mouth: 'open' }), avatar_states: { away: { url: face(ghost, { shut: true, mouth: 'flat' }) } } } },
  ]
  const plain = { id: ME, username: 'tester1', display_name: 'Tess', color: '#ff9f6b', bio: '', voice: { pitch: 1, speed: 1, wave: 'square' },
    avatar_idle: face('#ff9f6b'), avatar_crop: null, avatar_talk: null, avatar_talk_crop: null, avatar_states: {}, avatar_setup: null, avatar_base: null }
  primeProfiles([{ ...plain, ...switchPatch(plain, setups[0]) }])
  mySetups.set({ owner: ME, loaded: true, list: setups })
  return setups
}
const setups = seed()

export default function AvatarLab() {
  const view = new URLSearchParams(location.hash.split('?')[1]).get('view') || 'list'
  useEffect(() => { document.title = 'Avatar setups (dev)' }, [])
  const me = { id: ME, username: 'tester1', display_name: 'Tess', color: '#ff9f6b', bio: '', voice: {} }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 280px) 1fr' }}>
      <aside className="sidebar" style={{ justifyContent: 'flex-end', minHeight: 'calc(100vh - 20px)' }}>
        <div className="me-panel">
          <span className="me-av"><Avatar id={ME} size={36} status /></span>
          <div className="me-text"><Name id={ME} /><div className="muted small">@tester1</div></div>
          <AvatarSwitcher userId={ME} onManage={() => {}} />
          <button className="icon-btn" aria-label="Settings"><Icon name="settings" /></button>
        </div>
      </aside>
      <main />
      {view === 'list' && <Settings me={me} tab="voice" onClose={() => {}} />}
      {view === 'editor' && <AvatarEditor meId={ME} setup={setups[0]} onClose={() => {}} />}
      <DialogHost />
    </div>
  )
}
