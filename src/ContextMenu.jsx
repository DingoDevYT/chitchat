import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createStore } from './lib/store'
import './styles/context-menu.css'

// Right-click menus for the whole app. Call openMenu(event, items) from any onContextMenu handler.
// items (an array, or a function returning one): [{ label, icon, onClick, danger, disabled, checked, hint, submenu: items, slider: { value, min, max, step, onChange, format }, separator }]
// Falsy entries are skipped, so `cond && { ... }` works. The innermost handler wins (outer handlers see defaultPrevented).
// Shift+right-click, text fields, links and selected text keep the browser's own menu.
const state = createStore(null) // { x, y, items, key }
let openedAt = 0

export function openMenu(e, items) {
  if (e.defaultPrevented || e.shiftKey) return
  const t = e.target
  if (t.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], a[href], video[controls], [data-native-menu]')) return
  const sel = getSelection()
  if (sel && !sel.isCollapsed && String(sel).trim() && e.currentTarget?.contains?.(sel.anchorNode)) return
  const list = clean(typeof items === 'function' ? items() : items) // a function is only built when the menu really opens
  if (!list.length) return
  e.preventDefault()
  if (Date.now() - openedAt < 400 && state.get()) return // Android fires its own contextmenu after our long-press one
  openedAt = Date.now()
  state.set({ x: e.clientX, y: e.clientY, items: list, key: openedAt })
}
export const closeMenu = () => state.set(null)

const clean = items => (items || []).filter(Boolean).filter((it, i, a) =>
  !it.separator || (i > 0 && i < a.length - 1 && !a[i - 1].separator))

// iOS never fires contextmenu on long-press; synthesize one (Android's own one is de-duplicated above).
let installed = false
function installLongPress() {
  if (installed) return
  installed = true
  let timer = null, start = null, fired = false
  addEventListener('touchstart', e => {
    fired = false
    if (e.touches.length !== 1) return clearTimeout(timer)
    const { clientX, clientY, target } = e.touches[0]
    start = { clientX, clientY }
    clearTimeout(timer)
    timer = setTimeout(() => {
      fired = true
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }))
    }, 520)
  }, { passive: true })
  addEventListener('touchmove', e => {
    const p = e.touches[0]
    if (start && Math.hypot(p.clientX - start.clientX, p.clientY - start.clientY) > 10) clearTimeout(timer)
  }, { passive: true })
  addEventListener('touchend', e => { clearTimeout(timer); if (fired && state.get() && e.cancelable) e.preventDefault() }) // no click after a long-press
  addEventListener('touchcancel', () => clearTimeout(timer))
}

export default function ContextMenuHost() {
  const s = state.use()
  useEffect(installLongPress, [])
  useEffect(() => {
    if (!s) return
    const inside = e => e.target.closest?.('.ctx-menu')
    const down = e => { if (!inside(e)) closeMenu() }
    const scroll = e => { if (!e.target.closest?.('.ctx-menu')) closeMenu() }
    const esc = e => { if (e.key === 'Escape') closeMenu() }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('touchstart', down, true)
    document.addEventListener('scroll', scroll, true)
    addEventListener('keydown', esc)
    addEventListener('resize', closeMenu)
    addEventListener('blur', closeMenu)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('touchstart', down, true)
      document.removeEventListener('scroll', scroll, true)
      removeEventListener('keydown', esc)
      removeEventListener('resize', closeMenu)
      removeEventListener('blur', closeMenu)
    }
  }, [s])
  if (!s) return null
  return <Menu key={s.key} items={s.items} at={{ x: s.x, y: s.y }} focus />
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

// One menu panel. Submenus are separate panels anchored to their row.
function Menu({ items, at, anchor, focus, onBack }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  const [sub, setSub] = useState(null) // { i, rect, focus }
  const typed = useRef({ s: '', t: 0 })

  useLayoutEffect(() => {
    const el = ref.current, w = el.offsetWidth, h = el.offsetHeight, m = 8
    let left, top, origin
    if (anchor) {
      left = anchor.right - 4
      if (left + w > innerWidth - m) left = anchor.left - w + 4
      top = anchor.top - 6
    } else {
      left = at.x + w > innerWidth - m ? at.x - w : at.x
      top = at.y + h > innerHeight - m ? at.y - h : at.y
    }
    origin = `${left < (anchor ? anchor.left : at.x) ? 'right' : 'left'} ${top < (anchor ? anchor.top - 6 : at.y) ? 'bottom' : 'top'}`
    setPos({ left: clamp(left, m, innerWidth - w - m), top: clamp(top, m, Math.max(m, innerHeight - h - m)), transformOrigin: origin })
    if (focus) rows()[0]?.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = () => [...ref.current.querySelectorAll(':scope > .ctx-row > [data-item]:not([disabled])')]
  const move = (d, abs) => {
    const r = rows(), i = r.indexOf(document.activeElement)
    r[abs != null ? abs : (i + d + r.length) % r.length]?.focus()
  }
  const openSub = (i, el, kb) => setSub({ i, rect: el.getBoundingClientRect(), focus: kb })

  function onKey(e) {
    e.stopPropagation() // a submenu's keys never reach its parent
    const k = e.key, range = e.target.type === 'range'
    if (k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(1) }
    else if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); move(-1) }
    else if (k === 'Home') { e.preventDefault(); move(0, 0) }
    else if (k === 'End') { e.preventDefault(); move(0, rows().length - 1) }
    else if (k === 'ArrowRight' && !range && e.target.dataset.sub != null) { e.preventDefault(); openSub(+e.target.dataset.sub, e.target, true) }
    else if ((k === 'ArrowLeft' && !range) || k === 'Escape') { e.preventDefault(); onBack ? onBack() : closeMenu() }
    else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = typed.current, now = Date.now()
      t.s = (now - t.t > 700 ? '' : t.s) + k.toLowerCase(); t.t = now
      const r = rows(), from = r.indexOf(document.activeElement)
      const order = [...r.slice(from + (t.s.length === 1 ? 1 : 0)), ...r.slice(0, from + 1)]
      order.find(el => (el.dataset.label || '').toLowerCase().startsWith(t.s))?.focus()
    }
  }

  function pick(it, i, e) {
    if (it.disabled) return
    if (it.submenu) return openSub(i, e.currentTarget, e.detail === 0) // detail 0 = Enter/Space
    closeMenu()
    it.onClick?.()
  }

  return createPortal(
    <div ref={ref} className="ctx-menu" role="menu" onKeyDown={onKey} onContextMenu={e => e.preventDefault()}
      style={pos || { left: -9999, top: 0 }}>
      {items.map((it, i) => it.separator ? <div key={i} className="ctx-sep" role="separator" />
        : it.slider ? <div key={i} className="ctx-row"><Slider it={it} /></div>
        : (
          <div key={i} className="ctx-row">
            <button data-item data-label={it.label} aria-label={it.hint ? `${it.label} (${it.hint})` : it.label} data-sub={it.submenu ? i : undefined} disabled={it.disabled}
              className={`ctx-item${it.danger ? ' danger' : ''}${sub?.i === i ? ' open' : ''}`}
              role={it.checked != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.checked != null ? !!it.checked : undefined}
              aria-haspopup={it.submenu ? 'menu' : undefined} aria-expanded={it.submenu ? sub?.i === i : undefined}
              onMouseEnter={e => { e.currentTarget.focus({ preventScroll: true }); if (it.submenu) openSub(i, e.currentTarget); else setSub(null) }}
              onClick={e => pick(it, i, e)}>
              <span className="ctx-icon" aria-hidden="true">{it.checked != null ? (it.checked ? '✓' : '') : it.icon}</span>
              <span className="ctx-label">{it.label}</span>
              {it.hint && <kbd className="ctx-hint">{it.hint}</kbd>}
              {it.submenu && <span className="ctx-chev" aria-hidden="true">›</span>}
            </button>
            {sub?.i === i && <Menu key={i} items={clean(it.submenu)} anchor={sub.rect} focus={sub.focus}
              onBack={() => { setSub(null); ref.current.querySelectorAll(':scope > .ctx-row')[i]?.querySelector('[data-item]')?.focus() }} />}
          </div>
        ))}
    </div>,
    document.body,
  )
}

// Changes apply live; the menu stays open while dragging.
function Slider({ it }) {
  const { min = 0, max = 1, step = 0.01, format = v => v, onChange } = it.slider
  const [v, setV] = useState(it.slider.value)
  return (
    <label className="ctx-slider">
      <span className="ctx-slider-top"><span>{it.icon} {it.label}</span><b>{format(v)}</b></span>
      <input data-item data-label={it.label} aria-label={it.label} aria-valuetext={String(format(v))} type="range" min={min} max={max} step={step} value={v} disabled={it.disabled}
        onChange={e => { setV(+e.target.value); onChange?.(+e.target.value) }} />
    </label>
  )
}
