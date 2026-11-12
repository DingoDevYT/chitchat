import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App, { Boundary } from './App'
import { startLook } from './lib/look'
import { uiSound } from './lib/animalese'
import './styles.css'
import './styles/responsive.css' // last: window-size fixes override component and base styles

// Stash invite codes so they survive sign-up / OAuth redirects.
const invite = location.hash.match(/^#\/invite\/([\w-]+)/)
if (invite) {
  try { localStorage.setItem('chitchat:invite', invite[1]) } catch {}
  history.replaceState(null, '', location.pathname + location.search)
}

// A file dropped outside the composer would otherwise make the browser navigate away to open it.
for (const t of ['dragover', 'drop']) addEventListener(t, e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() })

// Night/Day look, and a soft blip for every switch and segmented choice (no per-feature wiring).
startLook()
addEventListener('change', e => e.target.type === 'checkbox' && uiSound('toggle'))
addEventListener('click', e => e.target.closest?.('.tabs button:not(.on)') && uiSound('toggle'), true) // capture: before React marks it .on

// Dev-only review sheets: icons, theme redos, the game lab, avatar setups, join/leave animations (dropped from production builds).
const devPages = import.meta.env.DEV ? { '#/icons': () => import('./icons/IconGallery'), '#/themes': () => import('./themes/ThemeLab'), '#/table': () => import('./games/GameLab'), '#/avatars': () => import('./AvatarLab'), '#/entrances': () => import('./EntranceLab') } : {}
const devKey = () => devPages[location.hash.split('?')[0]] ? location.hash.split('?')[0] : null
const dev = devKey()
const DevPage = dev && lazy(devPages[dev])
if (import.meta.env.DEV) addEventListener('hashchange', () => { if (devKey() !== dev) location.reload() })

createRoot(document.getElementById('root')).render(DevPage ? <Suspense><DevPage /></Suspense> : <Boundary root><App /></Boundary>)
