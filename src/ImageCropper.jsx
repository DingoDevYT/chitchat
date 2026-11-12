import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { overlayRoot } from './lib/fullscreen'
import Modal from './Modal'
import { CropImg } from './Avatar'
import { MAX_ZOOM, SHAPES, clampCrop, cropBox, isAnimatedWebp, zoomCrop } from './lib/crop'
import './styles/cropper.css'
import Icon from './icons/Icon'

const PREVIEWS = {
  circle: [[42, 'Chat', '50%'], [116, 'Stadium', '50%']],
  square: [[48, 'Server list', '16px'], [64, 'Settings', '18px']],
  banner: [[200, 'Server card', '14px']],
  roomBanner: [[240, 'Room header', '12px']],
}

// Crop popup for avatar-like images. Calls onApply({ file, crop, preview }):
// static images come back as a cropped 512px square (banner: 1000x400) with crop null; animated ones as the original file plus CSS framing.
export default function ImageCropper({ file, shape = 'circle', title = 'Crop image', onCancel, onApply }) {
  const [fa, outW] = SHAPES[shape] || SHAPES.circle
  const [url] = useState(() => URL.createObjectURL(file))
  const [animated, setAnimated] = useState(file.type === 'image/gif')
  const [crop, setCrop] = useState(null)
  const [busy, setBusy] = useState(false)
  const frame = useRef(null), img = useRef(null), ptrs = useRef(new Map()), applied = useRef(false)

  useEffect(() => () => { if (!applied.current) URL.revokeObjectURL(url) }, [url])
  useEffect(() => {
    if (file.type === 'image/webp') file.slice(0, 32).arrayBuffer().then(b => setAnimated(isAnimatedWebp(new Uint8Array(b))))
  }, [file])
  // Escape closes just the cropper, not the settings modal underneath.
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  }, [onCancel])
  useEffect(() => {
    const el = frame.current
    const wheel = e => { e.preventDefault(); setCrop(c => c && zoomCrop(c, c.zoom * Math.exp(-e.deltaY * 0.002))) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const pan = (dx, dy) => setCrop(c => c && clampCrop({ ...c, x: c.x + dx, y: c.y + dy }))
  const down = e => { frame.current.setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, [e.clientX, e.clientY]) }
  const up = e => ptrs.current.delete(e.pointerId)
  function move(e) {
    const p = ptrs.current, prev = p.get(e.pointerId)
    if (!prev) return
    const S = frame.current.offsetWidth
    if (p.size === 1) pan((e.clientX - prev[0]) / S, (e.clientY - prev[1]) / S)
    else if (p.size === 2) {
      const [a, b] = [...p.values()], d0 = Math.hypot(a[0] - b[0], a[1] - b[1])
      p.set(e.pointerId, [e.clientX, e.clientY])
      const [c2, d2] = [...p.values()], d1 = Math.hypot(c2[0] - d2[0], c2[1] - d2[1])
      if (d0 > 0) setCrop(c => c && zoomCrop(c, c.zoom * d1 / d0))
      return
    }
    p.set(e.pointerId, [e.clientX, e.clientY])
  }
  function key(e) {
    const step = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key]
    if (step) { e.preventDefault(); pan(...step) }
    if (e.key === '+' || e.key === '=') setCrop(c => c && zoomCrop(c, c.zoom * 1.1))
    if (e.key === '-') setCrop(c => c && zoomCrop(c, c.zoom / 1.1))
  }

  async function apply() {
    setBusy(true)
    try {
      if (animated) { applied.current = true; return await onApply({ file, crop, preview: url }) }
      const S = outW, H = S / fa, cv = document.createElement('canvas'), g = cv.getContext('2d'), b = cropBox(crop)
      cv.width = S; cv.height = H
      g.imageSmoothingQuality = 'high'
      g.translate((b.left + b.w / 2) / 100 * S, (b.top + b.h / 2) / 100 * H)
      g.rotate(b.rot * Math.PI / 180)
      g.drawImage(img.current, -b.w / 200 * S, -b.h / 200 * H, b.w / 100 * S, b.h / 100 * H)
      const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.9))
      const out = new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.png', { type: blob.type })
      await onApply({ file: out, crop: null, preview: URL.createObjectURL(out) })
    } finally { setBusy(false) }
  }

  const b = crop && cropBox(crop)
  return createPortal(
    <Modal title={title} onClose={onCancel}>
      <div className="cropper">
        <div ref={frame} className={`crop-frame ${shape}`} tabIndex={0} aria-label="Drag to move, scroll or pinch to zoom, arrow keys to nudge"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
          <img ref={img} src={url} alt="" draggable="false" style={b ? {
            width: b.w + '%', height: b.h + '%', left: b.left + '%', top: b.top + '%', transform: `rotate(${b.rot}deg)`,
          } : { opacity: 0 }} onLoad={e => setCrop(clampCrop({ fa, ar: e.currentTarget.naturalWidth / e.currentTarget.naturalHeight }))} />
          <i className="crop-mask" />
        </div>

        <div className="crop-side">
          <div className="crop-previews">
            {crop && PREVIEWS[shape].map(([s, label, r]) => (
              <figure key={label}>
                <span className="crop-prev" style={{ width: s, height: s / fa, borderRadius: r }}><CropImg src={url} crop={crop} /></span>
                <figcaption className="muted small">{label}</figcaption>
              </figure>
            ))}
          </div>
          <label className="crop-zoom"><Icon name="search" size={18} />
            <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={crop?.zoom || 1} aria-label="Zoom"
              onChange={e => setCrop(c => c && zoomCrop(c, +e.target.value))} /></label>
          <div className="row">
            <button type="button" className="btn ghost small" onClick={() => setCrop(c => c && clampCrop({ ...c, rot: c.rot + 90 }))}><Icon name="rotate" size={15} /> Rotate</button>
            <button type="button" className="btn ghost small" onClick={() => setCrop(c => c && clampCrop({ ar: c.ar, fa }))}>Reset</button>
          </div>
          {animated && <p className="muted small">Animated image: it stays animated, we just remember how it's framed.</p>}
        </div>
      </div>
      <div className="modal-foot row">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={apply} disabled={!crop || busy}>{busy ? 'Uploading…' : 'Apply'}</button>
      </div>
    </Modal>,
    overlayRoot(),
  )
}
