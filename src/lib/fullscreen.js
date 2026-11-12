import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// The browser's real fullscreen (no tabs, no address bar, no app chrome), with the webkit prefix for older Safari.
// iPhone Safari has no element fullscreen at all: canFullscreen is false there and callers keep their in-page view.
const doc = typeof document !== 'undefined' ? document : null
export const canFullscreen = !!doc && !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
export const fullscreenEl = () => (doc && (doc.fullscreenElement || doc.webkitFullscreenElement)) || null

export function enterFullscreen(el, { landscape } = {}) {
  const req = el?.requestFullscreen || el?.webkitRequestFullscreen
  if (!req) return Promise.resolve(false)
  return new Promise(r => r(req.call(el, { navigationUI: 'hide' }))).then(() => {
    // Android Chrome can lock a fullscreen page sideways; everyone else refuses, which is fine.
    if (landscape) screen.orientation?.lock?.('landscape').catch(() => {})
    return true
  }, () => false)
}
export function exitFullscreen() {
  if (!fullscreenEl()) return Promise.resolve()
  try { screen.orientation?.unlock?.() } catch { /* not locked */ }
  return new Promise(r => r((doc.exitFullscreen || doc.webkitExitFullscreen).call(doc))).catch(() => {})
}

const subscribe = cb => {
  if (!doc) return () => {}
  doc.addEventListener('fullscreenchange', cb)
  doc.addEventListener('webkitfullscreenchange', cb)
  return () => { doc.removeEventListener('fullscreenchange', cb); doc.removeEventListener('webkitfullscreenchange', cb) }
}
// The element that's fullscreen right now, or null; follows Esc and the browser's own exit.
export const useFullscreenEl = () => useSyncExternalStore(subscribe, fullscreenEl, () => null)

// Where popups go: only the fullscreen element (and what's inside it) is drawn while one is active, so anything
// meant for document.body has to go in there instead.
export const overlayRoot = () => fullscreenEl() || doc?.body
export function useOverlayRoot() { return useFullscreenEl() || doc?.body }

// Overlay hosts that normally render in place (dialogs, toasts) move into the fullscreen element while it's on.
export function FullscreenLayer({ children }) {
  const el = useFullscreenEl()
  return el ? createPortal(children, el) : children
}
