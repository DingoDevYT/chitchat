import { useEffect, useRef, useState } from 'react'

// Drag-to-reorder with HTML5 drag events, plus a long-press pointer fallback for touch.
// item(type, id) goes on draggable elements, zone(type, id) on drop targets.
// accepts(dragType, zoneType) filters targets; onDrop({ type, id, overType, over, after }) runs on release.
export function useDrag({ accepts, onDrop }) {
  const [st, setSt] = useState(null) // { type, id, overType?, over?, after? }
  const ref = useRef(null)
  ref.current = st
  const cb = useRef(); cb.current = { accepts, onDrop }

  function hover(el, y) {
    const d = ref.current
    if (!d || !el || !cb.current.accepts(d.type, el.dataset.zoneType)) return false
    const r = el.getBoundingClientRect(), after = y > r.top + r.height / 2
    const over = el.dataset.zoneId, overType = el.dataset.zoneType
    if (d.over !== over || d.overType !== overType || d.after !== after) setSt({ ...d, over, overType, after })
    return true
  }
  function finish() {
    const d = ref.current
    setSt(null)
    if (d?.over != null && !(d.overType === d.type && d.over === d.id)) cb.current.onDrop(d)
  }

  // Touch: hold still ~350ms to pick up, then drag; blocks scrolling only while dragging.
  const touch = useRef(null)
  useEffect(() => () => touch.current?.stop(), [])
  function onPointerDown(e, type, id) {
    if (e.pointerType === 'mouse') return
    const x0 = e.clientX, y0 = e.clientY
    let live = false
    const timer = setTimeout(() => { live = true; setSt({ type, id }); navigator.vibrate?.(10) }, 350)
    const move = ev => {
      if (!live) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) stop(); return }
      // walk out through nested zones like DOM event bubbling would
      let el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-zone-type]')
      while (el && !hover(el, ev.clientY)) el = el.parentElement?.closest('[data-zone-type]')
    }
    const block = ev => live && ev.cancelable && ev.preventDefault()
    const eatClick = ev => { ev.stopPropagation(); ev.preventDefault() }
    const up = () => { if (live) { finish(); addEventListener('click', eatClick, { capture: true, once: true }); setTimeout(() => removeEventListener('click', eatClick, true), 50) } stop() }
    const cancel = () => { if (live) setSt(null); stop() }
    function stop() {
      clearTimeout(timer)
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel)
      removeEventListener('touchmove', block); removeEventListener('contextmenu', eatClick, true)
      touch.current = null
    }
    touch.current?.stop()
    touch.current = { stop }
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel)
    addEventListener('touchmove', block, { passive: false }); addEventListener('contextmenu', eatClick, true)
  }

  const item = (type, id, on = true) => !on ? {} : {
    draggable: true,
    onDragStart: e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setSt({ type, id }) },
    onDragEnd: () => setSt(null),
    onPointerDown: e => onPointerDown(e, type, id),
  }
  const zone = (type, id) => ({
    'data-zone-type': type, 'data-zone-id': id,
    onDragOver: e => { if (hover(e.currentTarget, e.clientY)) { e.preventDefault(); e.stopPropagation() } },
    onDrop: e => { if (ref.current) { e.preventDefault(); e.stopPropagation(); finish() } },
  })
  // CSS hooks: ' dragging' on the picked-up element, ' drop-before'/' drop-after' on the target.
  const cls = (type, id) => (st?.type === type && st.id === id ? ' dragging' : '') +
    (st?.overType === type && st.over === id ? (st.after ? ' drop-after' : ' drop-before') : '')
  return { dragging: st, item, zone, cls }
}
