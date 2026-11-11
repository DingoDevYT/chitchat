import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startLook } from './lib/look'
import { uiSound } from './lib/animalese'
import './styles.css'

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
addEventListener('click', e => e.target.closest?.('.tabs button:not(.on)') && uiSound('toggle'))

// Dev-only icon review sheet at #/icons (dropped from production builds).
const IconGallery = import.meta.env.DEV && location.hash === '#/icons' && lazy(() => import('./icons/IconGallery'))
if (import.meta.env.DEV) addEventListener('hashchange', () => { if (!!IconGallery !== (location.hash === '#/icons')) location.reload() })

createRoot(document.getElementById('root')).render(IconGallery ? <Suspense><IconGallery /></Suspense> : <App />)
