// Webcams inside games. Voice.jsx already keeps every live camera in the stadium (yours too) in the `cams` store
// (userId -> MediaStream); games read it here and show the feed wherever that player's avatar would be.
//   useCamStream(id)  the MediaStream, or null (camera off, or not in the call)
//   useCamVideo(id)   { video, mirror } from a shared hidden <video> per stream (at most MAX at once), or null
//   drawCam(...)      paints the current frame cover-fitted into a 2D canvas (games redraw it ~15 times a second)
//   <CamAvatar>       a DOM <Avatar> that shows the camera instead of the PNGtuber while it's on
// Camera off, too many feeds, or a frame not decoded yet: callers fall back to the avatar exactly as before.
import { useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '../Avatar'
import { cams } from '../lib/store'

export const MAX = 8 // video feeds decoding for games at once; the rest keep their avatars
export const CAM_FPS = 15

export const useCamStream = id => cams.use(s => (id && s[id]) || null)

// Your own camera (a getUserMedia track names its device; tracks from peers don't) shows mirrored, like a mirror.
export const isLocal = ms => ms.getVideoTracks().some(t => !!t.getSettings?.().deviceId)

const pool = new Map() // MediaStream -> { v, n }
let box = null
function acquire(ms) {
  let e = pool.get(ms)
  if (!e) {
    if (pool.size >= MAX || typeof document === 'undefined') return null
    if (!box) {
      // On the page but invisible: iOS only decodes a <video> that is attached (and not display:none).
      box = document.createElement('div')
      box.setAttribute('aria-hidden', 'true')
      box.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1'
      document.body.appendChild(box)
    }
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.autoplay = true
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '')
    v.srcObject = ms
    box.appendChild(v)
    v.play?.()?.catch?.(() => {})
    e = { v, n: 0 }
    pool.set(ms, e)
  }
  e.n++
  return e.v
}
function release(ms) {
  const e = pool.get(ms)
  if (!e || --e.n > 0) return
  pool.delete(ms)
  e.v.pause(); e.v.srcObject = null; e.v.remove()
}

export function useCamVideo(id) {
  const ms = useCamStream(id)
  const [v, setV] = useState(null)
  useEffect(() => {
    if (!ms) return
    setV(acquire(ms))
    return () => { release(ms); setV(null) }
  }, [ms])
  return useMemo(() => (ms && v ? { video: v, mirror: isLocal(ms), stream: ms } : null), [ms, v])
}

// A frame is there to draw (decoded, and the camera hasn't been unplugged or stopped).
export const camReady = c => !!c && c.video.readyState >= 2 && c.video.videoWidth > 0 &&
  c.stream.getVideoTracks().some(t => t.readyState === 'live')

// The current frame, cropped to cover (x, y, w, h). Clip first for a rounded or circular feed.
export function drawCam(g, c, x, y, w, h) {
  const v = c.video, vw = v.videoWidth, vh = v.videoHeight
  const k = Math.max(w / vw, h / vh), sw = w / k, sh = h / k
  g.save()
  if (c.mirror) { g.translate(2 * x + w, 0); g.scale(-1, 1) }
  g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h)
  g.restore()
}

// Calls draw() about CAM_FPS times a second while the camera is on and the tab is visible.
export function useCamTicker(cam, draw) {
  const fn = useRef(draw)
  fn.current = draw
  useEffect(() => {
    if (!cam) return
    const t = setInterval(() => { if (!document.hidden && camReady(cam)) fn.current(cam) }, 1000 / CAM_FPS)
    return () => clearInterval(t)
  }, [cam])
}

function CamVideo({ stream, mirror }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.srcObject = stream; return () => { if (ref.current) ref.current.srcObject = null } }, [stream])
  return <video ref={ref} autoPlay playsInline muted style={mirror ? { transform: 'scaleX(-1)' } : undefined} />
}

// <Avatar> with the camera in place of the face (its usual ring-of-colour cam look) while it's on.
export function CamAvatar({ id, camId = id, ...props }) {
  const ms = useCamStream(camId)
  const mirror = useMemo(() => !!ms && isLocal(ms), [ms])
  return <Avatar id={id} {...props}>{ms ? <CamVideo stream={ms} mirror={mirror} /> : null}</Avatar>
}
