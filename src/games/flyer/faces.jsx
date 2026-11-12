// PNGtuber faces for the canvas: one 128 px sprite per flyer, redrawn only when their expression changes (talk,
// blink, typing… each is a different image), never per frame. Chitbots use their character art.
// Camera on: the sprite becomes their live feed in a ring of their colour, redrawn ~15 fps (paused in a hidden tab).
import { useEffect } from 'react'
import { useFace } from '../../Avatar'
import { botChar, botUrl } from '../bots.js'
import { drawCritter } from './art.js'
import { drawCam, useCamTicker, useCamVideo } from '../cams'

const SIZE = 128
const imgs = new Map()
const load = src => {
  if (!imgs.has(src)) imgs.set(src, new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src }))
  return imgs.get(src)
}
const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c }
// The whole image, contained (PNGtuber style: no crop circle). A GIF draws its current frame.
function paint(c, img) {
  const g = c.getContext('2d'), k = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
  const w = img.naturalWidth * k, h = img.naturalHeight * k
  g.clearRect(0, 0, SIZE, SIZE)
  g.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
}

// Renders nothing: keeps faces.current[pid] = { c: canvas, talk } up to date.
export function FaceFeed({ p, faces }) {
  const cam = useCamVideo(p.user_id || p.pid) // (only people have cameras; the lab hands Chitbots one to preview it)
  useCamTicker(cam, c => {
    const s = slot(faces, p.pid), g = s.c.getContext('2d'), r = SIZE / 2
    g.clearRect(0, 0, SIZE, SIZE)
    g.fillStyle = s.ring || p.color || '#f4a261'; g.beginPath(); g.arc(r, r, r - 2, 0, 7); g.fill()
    g.save(); g.beginPath(); g.arc(r, r, r - 9, 0, 7); g.clip(); drawCam(g, c, 9, 9, SIZE - 18, SIZE - 18); g.restore()
    s.ready = true
  })
  return p.user_id ? <HumanFace p={p} faces={faces} cam={!!cam} /> : <BotFace p={p} faces={faces} cam={!!cam} />
}

function slot(faces, pid) {
  return (faces.current[pid] ||= { c: canvas(), talk: false, ready: false })
}

function HumanFace({ p, faces, cam }) {
  const f = useFace(p.user_id, 'stage')
  const src = f.expr?.src || null, color = f.p?.color || p.color || '#f4a261'
  useEffect(() => {
    const s = slot(faces, p.pid)
    s.talk = f.talk; s.ring = color
    if (cam) return // the camera ticker draws this sprite; when it stops, this runs again and puts the avatar back
    if (!src) { const g = s.c.getContext('2d'); g.clearRect(0, 0, SIZE, SIZE); drawCritter(g, SIZE, color, f.talk); s.ready = true; return }
    let on = true
    load(src).then(img => { if (on && img) { paint(s.c, img); s.ready = true } })
    return () => { on = false }
  }, [src, color, f.talk, faces, p.pid, cam])
  return null
}

function BotFace({ p, faces, cam }) {
  useEffect(() => {
    if (cam) return
    const s = slot(faces, p.pid)
    let on = true
    load(botUrl(botChar(p.bot, p.seat), false)).then(img => { if (on && img) { paint(s.c, img); s.ready = true } })
    return () => { on = false }
  }, [p.bot, p.seat, p.pid, faces, cam])
  return null
}
