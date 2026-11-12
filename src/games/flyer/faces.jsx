// PNGtuber faces for the canvas: one 128 px sprite per flyer, redrawn only when their expression changes (talk,
// blink, typing… each is a different image), never per frame. Chitbots use their character art.
import { useEffect } from 'react'
import { useFace } from '../../Avatar'
import { botChar, botUrl } from '../bots.js'
import { drawCritter } from './art.js'

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
  return p.user_id ? <HumanFace p={p} faces={faces} /> : <BotFace p={p} faces={faces} />
}

function slot(faces, pid) {
  return (faces.current[pid] ||= { c: canvas(), talk: false, ready: false })
}

function HumanFace({ p, faces }) {
  const f = useFace(p.user_id, 'stage')
  const src = f.expr?.src || null, color = f.p?.color || p.color || '#f4a261'
  useEffect(() => {
    const s = slot(faces, p.pid)
    s.talk = f.talk
    if (!src) { const g = s.c.getContext('2d'); g.clearRect(0, 0, SIZE, SIZE); drawCritter(g, SIZE, color, f.talk); s.ready = true; return }
    let on = true
    load(src).then(img => { if (on && img) { paint(s.c, img); s.ready = true } })
    return () => { on = false }
  }, [src, color, f.talk, faces, p.pid])
  return null
}

function BotFace({ p, faces }) {
  useEffect(() => {
    const s = slot(faces, p.pid)
    let on = true
    load(botUrl(botChar(p.bot, p.seat), false)).then(img => { if (on && img) { paint(s.c, img); s.ready = true } })
    return () => { on = false }
  }, [p.bot, p.seat, p.pid, faces])
  return null
}
