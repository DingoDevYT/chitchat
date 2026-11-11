// Chitchat's doodle icons: clean single-stroke drawings on a 24×24 grid (absolute M/L/Q/C/Z only).
// The hand-drawn wobble is added once per icon by lib/sketch.js, so keep these tidy.
const R = n => Math.round(n * 100) / 100
const xy = (x, y) => `${R(x)} ${R(y)}`
const rad = a => a * Math.PI / 180
const map = (d, f) => d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => xy(...f(+x, +y)))
const rot = (d, deg, cx = 12, cy = 12) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg))
  return map(d, (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
}
const flip = d => map(d, (x, y) => [24 - x, y])

// Arc in degrees (0 = right, 90 = down) as cubic curves; move=false continues the current subpath.
function arc(cx, cy, rx, ry, a0, a1, move = true) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-6)), step = rad(a1 - a0) / n, t = 4 / 3 * Math.tan(step / 4)
  let a = rad(a0), s = move ? `M${xy(cx + rx * Math.cos(a), cy + ry * Math.sin(a))}` : ''
  for (let i = 0; i < n; i++, a += step) {
    const b = a + step
    s += `C${xy(cx + rx * (Math.cos(a) - t * Math.sin(a)), cy + ry * (Math.sin(a) + t * Math.cos(a)))} ` +
      `${xy(cx + rx * (Math.cos(b) + t * Math.sin(b)), cy + ry * (Math.sin(b) - t * Math.cos(b)))} ${xy(cx + rx * Math.cos(b), cy + ry * Math.sin(b))}`
  }
  return s
}
const oval = (cx, cy, rx, ry, from = -110) => arc(cx, cy, rx, ry, from, from + 360) + 'Z'
const ring = (cx, cy, r, from) => oval(cx, cy, r, r, from)
const dot = (x, y) => `M${xy(x, y)}L${xy(x + 0.05, y)}`
const rr = (x, y, w, h, r) => `M${xy(x + r, y)}L${xy(x + w - r, y)}Q${xy(x + w, y)} ${xy(x + w, y + r)}L${xy(x + w, y + h - r)}` +
  `Q${xy(x + w, y + h)} ${xy(x + w - r, y + h)}L${xy(x + r, y + h)}Q${xy(x, y + h)} ${xy(x, y + h - r)}L${xy(x, y + r)}Q${xy(x, y)} ${xy(x + r, y)}Z`
const poly = (pts, close = true) => pts.map(([x, y], i) => (i ? 'L' : 'M') + xy(x, y)).join('') + (close ? 'Z' : '')
const polar = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))]
const starPts = (cx, cy, r1, r2, n = 5) => Array.from({ length: n * 2 }, (_, i) => polar(cx, cy, i % 2 ? r2 : r1, -90 + i * 180 / n))
const cog = (cx, cy, n, r1, r2) => poly(Array.from({ length: n }, (_, i) => {
  const a = -90 + i * 360 / n, w = 360 / n
  return [polar(cx, cy, r2, a - w * 0.3), polar(cx, cy, r1, a - w * 0.17), polar(cx, cy, r1, a + w * 0.17), polar(cx, cy, r2, a + w * 0.3)]
}).flat())
const slash = 'M4.5 4.5L19.5 19.5'

// Shared bodies
const bubble = 'M8 4.5L16 4.5Q20 4.5 20 8.5L20 12Q20 16 16 16L11.5 16L7.5 19.5L7.8 15.9Q4 15.6 4 12L4 8.5Q4 4.5 8 4.5Z'
const user = (x = 12, s = 1) => ring(x, 8.5, 3.6 * s) + `M${xy(x - 7 * s, 20)}Q${xy(x - 7 * s, 14)} ${xy(x, 14)}Q${xy(x + 7 * s, 14)} ${xy(x + 7 * s, 20)}`
const userL = ring(9.5, 8.5, 3.3) + 'M3.5 19.5Q3.5 14 9.5 14Q15.5 14 15.5 19.5'
const speaker = 'M4 9.5L7.5 9.5L12 5.5L12 18.5L7.5 14.5L4 14.5Z'
const page = 'M14 3.5L7.5 3.5Q5.5 3.5 5.5 5.5L5.5 18.5Q5.5 20.5 7.5 20.5L16.5 20.5Q18.5 20.5 18.5 18.5L18.5 8ZM14 3.5L14 8L18.5 8'
const mic = rr(9, 3.5, 6, 11, 3) + 'M5.5 11Q5.5 17.5 12 17.5Q18.5 17.5 18.5 11M12 17.5L12 20.5M9 20.5L15 20.5'
const phones = 'M4 16L4 12.5Q4 4.5 12 4.5Q20 4.5 20 12.5L20 16' + rr(3.5, 13, 4.5, 7, 2) + rr(16, 13, 4.5, 7, 2)
const cam = rr(3, 7, 12.5, 10, 2.5) + 'M15.5 10.5L20.5 7.8L20.5 16.2L15.5 13.5'
const bell = 'M6.5 16L6.5 11.5C6.5 8 8.8 5.5 12 5.5C15.2 5.5 17.5 8 17.5 11.5L17.5 16L19 17.5L5 17.5Z M10 20Q12 21.5 14 20M12 3.5L12 5.5'
const phone = 'M7.6 3.9L9.7 8.4L7.9 10.2Q9.7 14.2 13.8 16.1L15.6 14.3L20.1 16.4L19.7 19Q19.4 20.3 17.9 20.2Q5.6 19 3.8 6.1Q3.7 4.6 5 4.3Z'
const eye = 'M2.8 12Q12 3 21.2 12Q12 21 2.8 12Z' + ring(12, 12, 2.7)
const star = poly(starPts(12, 12.8, 9, 4.1))
const box = rr(3.5, 4.5, 17, 4.5, 1.5) + 'M5 9L5 18Q5 19.5 6.5 19.5L17.5 19.5Q19 19.5 19 18L19 9'
const reply = 'M9.5 6L4 11L9.5 16M4.5 11L13 11Q20 11 20 18.5'
const arrowUp = 'M12 19.5L12 5M6 11L12 5L18 11'
const pin = rot('M8 3.5L16 3.5M9.6 3.5L9.2 9.5Q6 11 6 14L18 14Q18 11 14.8 9.5L14.4 3.5M12 14L12 21', 40)

export const ICONS = {
  // ── basics ──
  menu: 'M4 6.5L20 6.5M4 12L20 12M4 17.5L20 17.5',
  close: 'M6 6L18 18M18 6L6 18',
  plus: 'M12 4.5L12 19.5M4.5 12L19.5 12',
  minus: 'M5 12L19 12',
  check: 'M4.5 12.5L9.5 17.5L19.5 6.5',
  'chevron-down': 'M6 9.5L12 15.5L18 9.5',
  'chevron-up': 'M6 14.5L12 8.5L18 14.5',
  'chevron-right': 'M9.5 6L15.5 12L9.5 18',
  'chevron-left': 'M14.5 6L8.5 12L14.5 18',
  'arrow-up': arrowUp,
  'arrow-down': rot(arrowUp, 180),
  more: ring(5.5, 12, 1.1) + ring(12, 12, 1.1) + ring(18.5, 12, 1.1),
  search: ring(10.5, 10.5, 6.3) + 'M15.3 15.3L20 20',
  settings: cog(12, 12, 8, 9.6, 7.1) + ring(12, 12, 2.8),
  edit: 'M4.5 19.5L5.5 15L15.4 5.1Q17 3.5 18.6 5.1L18.9 5.4Q20.5 7 18.9 8.6L9 18.5ZM13.6 6.9L17.1 10.4',
  trash: 'M4 7L20 7M9.5 7L9.5 5Q9.5 4 10.5 4L13.5 4Q14.5 4 14.5 5L14.5 7M6 7L7 19Q7.1 20 8.1 20L15.9 20Q16.9 20 17 19L18 7M10 10.5L10.3 16.5M14 10.5L13.7 16.5',
  copy: rr(8.5, 8.5, 11.5, 11.5, 2.5) + 'M15.5 5.5Q15.5 3.5 13.5 3.5L6 3.5Q4 3.5 4 5.5L4 13Q4 15 6 15',
  link: rot('M10 8.8L7.2 8.8Q4 8.8 4 12Q4 15.2 7.2 15.2L10 15.2M14 8.8L16.8 8.8Q20 8.8 20 12Q20 15.2 16.8 15.2L14 15.2M8.5 12L15.5 12', -45),
  download: 'M12 4L12 15M7.5 10.5L12 15L16.5 10.5M5 19.5L19 19.5',
  fullscreen: 'M4 9L4 5.5Q4 4 5.5 4L9 4M15 4L18.5 4Q20 4 20 5.5L20 9M20 15L20 18.5Q20 20 18.5 20L15 20M9 20L5.5 20Q4 20 4 18.5L4 15',
  rotate: arc(12, 12.5, 7.5, 7.5, 160, 330) + 'M19.3 3.9L18.6 8.3L14.2 7.6',
  lock: rr(5, 10.5, 14, 10, 2.5) + 'M8 10.5L8 7.5Q8 3.5 12 3.5Q16 3.5 16 7.5L16 10.5M12 14.5L12 16.5',
  clock: ring(12, 12, 8.6) + 'M12 7.5L12 12L15 14',
  calendar: rr(4, 5.5, 16, 14.5, 3) + 'M4.5 10.5L19.5 10.5M8.5 3.5L8.5 7.2M15.5 3.5L15.5 7.2',
  keyboard: rr(2.5, 6, 19, 12, 2.5) + dot(6.5, 9.8) + dot(10, 9.8) + dot(13.5, 9.8) + dot(17, 9.8) + 'M8 14.3L16 14.3',
  warning: 'M12 4L21 19.5L3 19.5ZM12 9.5L12 13.5' + dot(12, 16.6),
  // ── people & places ──
  home: 'M3.5 11.5L12 4L20.5 11.5M6 9.5L6 18.5Q6 20 7.5 20L16.5 20Q18 20 18 18.5L18 9.5M10 20L10 15.5Q10 14 11.5 14L12.5 14Q14 14 14 15.5L14 20',
  room: 'M5 10.5L12 4.5L19 10.5L19 18.5Q19 19.5 18 19.5L6 19.5Q5 19.5 5 18.5ZM9 13L15 13M9 16L13 16',
  door: 'M6 20.5L6 5Q6 3.5 7.5 3.5L16.5 3.5Q18 3.5 18 5L18 20.5M3.5 20.5L20.5 20.5M6.2 3.8L13 6.2L13 20.5' + dot(11.2, 13.6),
  leave: 'M13 4.5L7 4.5Q5.5 4.5 5.5 6L5.5 18Q5.5 19.5 7 19.5L13 19.5M10 12L20 12M16.5 8.5L20 12L16.5 15.5',
  stadium: oval(12, 11.5, 9, 5, -150) + 'M3 11.5L3 14M21 11.5L21 14' + arc(12, 14, 9, 5, 180, 0) + oval(12, 11.9, 4.4, 2.1, 20) + 'M12 6.5L12 2.6L15.5 3.8L12 5',
  compass: ring(12, 12, 8.6) + 'M15 9L13.1 13.1L9 15L10.9 10.9Z',
  user: user(),
  friends: userL + ring(16.5, 7.8, 2.7, -40) + 'M17 13Q20.5 13.3 20.5 18.5',
  'user-plus': userL + 'M18.5 7.5L18.5 13.5M15.5 10.5L21.5 10.5',
  'user-check': userL + 'M15.8 10.8L17.8 12.8L21.2 8.8',
  'user-minus': userL + 'M15.5 10.5L21.5 10.5',
  id: rr(3, 5.5, 18, 13, 2.5) + ring(8.5, 10.5, 1.9) + 'M5.8 15.6Q6.2 13.6 8.5 13.6Q10.8 13.6 11.2 15.6M14 10L18 10M14 13.5L17 13.5',
  crown: poly([[4.5, 18], [3.5, 8], [8.5, 12], [12, 5.5], [15.5, 12], [20.5, 8], [19.5, 18]]),
  shield: 'M12 3.5L19 6.5L19 11.5Q19 17.5 12 20.5Q5 17.5 5 11.5L5 6.5Z',
  star,
  'star-off': star + slash,
  heart: 'M12 19.5C6 15.5 3.8 12.2 3.8 9C3.8 6.5 5.8 4.8 8 4.8C9.8 4.8 11.2 5.9 12 7.5C12.8 5.9 14.2 4.8 16 4.8C18.2 4.8 20.2 6.5 20.2 9C20.2 12.2 18 15.5 12 19.5Z',
  block: ring(12, 12, 8.4) + 'M6.2 6.2L17.8 17.8',
  eye,
  'eye-off': eye + slash,
  flag: 'M5.5 20.5L5.5 4M5.5 4.5Q9 3 12 4.5Q15 6 18.5 4.5L18.5 12.5Q15 14 12 12.5Q9 11 5.5 12.5',
  focus: ring(12, 12, 8.4) + ring(12, 12, 4.3, 60) + ring(12, 12, 0.6),
  party: 'M4 20L8.6 8.8L15.2 15.4ZM10.5 6.5Q12.6 5 11.5 3M15.2 9L19.8 4.6M17.5 13.5Q19.5 12.3 21 13.5' + dot(15.5, 4) + dot(20, 9.3),
  sparkle: 'M10 6Q10.7 12.3 17 13Q10.7 13.7 10 20Q9.3 13.7 3 13Q9.3 12.3 10 6ZM18 3.5L18 7.5M16 5.5L20 5.5',
  moon: rot(arc(12, 12, 8, 8, -70, -290) + arc(19.5, 12, 8.9, 8.9, 122.6, 237.4, false) + 'Z', -15),
  snail: arc(11, 12.5, 6, 6, 0, -270) + arc(11, 14.5, 4, 4, 90, -180, false) + arc(9, 14.5, 2, 2, 180, 0, false) +
    'M3 18.5L17 18.5Q20.5 18.5 20 14.5L19.5 11.5M19.5 11.5L18.6 8M19.8 11.6L21.4 8.6',
  // ── chat ──
  chat: bubble,
  unread: map(bubble, (x, y) => [3 + (x - 3) * 0.8, 21 + (y - 21) * 0.8]) + ring(19, 5, 2.3),
  send: 'M3.5 11L20 4L13.5 20.5L10.8 13.2ZM10.8 13.2L20 4',
  reply,
  forward: flip(reply),
  pin,
  gallery: rr(3, 4, 10, 7, 1.8) + rr(15, 4, 6, 7, 1.8) + rr(3, 13, 6, 7, 1.8) + rr(11, 13, 10, 7, 1.8), // a freeform grid of covers
  stack: rr(3.5, 8, 12.5, 12.5, 2.5) + 'M7.5 5L16.5 5Q19.5 5 19.5 8L19.5 17', // more than one picture
  smile: ring(12, 12, 8.6) + dot(9, 10) + dot(15, 10) + 'M8.3 14Q12 17.8 15.7 14',
  at: ring(12, 12, 3.3) + 'M15.3 8.8L15.3 13.3Q15.3 16 17.7 16Q20.3 16 20.3 12' + arc(12, 12, 8.3, 8.3, 360, 62, false),
  gif: rr(3, 5.5, 18, 13, 3.5) + arc(8.5, 12, 2.3, 2.9, -45, -360) + 'L8.9 12M13.3 9.2L13.3 14.8M16.2 14.8L16.2 9.2L18.6 9.2M16.2 12L18.1 12',
  paperclip: 'M16 8L9 15Q8 16 9 17Q10 18 11 17L18 10Q20 8 18 6Q16 4 14 6L6.5 13.5Q3.8 16.2 6.5 18.9Q9.2 21.6 11.9 18.9L18.5 12.3',
  image: rr(3.5, 4.5, 17, 15, 2.5) + 'M3.8 16.5L9 11.5L13 15.5L15.5 13L20.2 17.5' + ring(15.5, 8.8, 1.6),
  file: page,
  'file-text': page + 'M8.5 12L15.5 12M8.5 15.5L13.5 15.5',
  'file-zip': page + 'M10.5 5.5L12 5.5M11.5 7.8L13 7.8M10.5 10L12 10' + rr(10.3, 12.5, 3.4, 3.6, 0.8),
  'file-chart': page + 'M9 17L9 14.5M12 17L12 11.5M15 17L15 13.5',
  'file-slides': page + 'M10.3 11.3L14.8 14L10.3 16.7Z',
  inbox: 'M3.5 13L6.5 5.8Q7 4.5 8.3 4.5L15.7 4.5Q17 4.5 17.5 5.8L20.5 13L20.5 17.5Q20.5 19.5 18.5 19.5L5.5 19.5Q3.5 19.5 3.5 17.5ZM3.5 13L8.5 13Q9 15.5 12 15.5Q15 15.5 15.5 13L20.5 13',
  archive: box + 'M10 12.5L14 12.5',
  unarchive: box + 'M12 17L12 11.8M9.8 14L12 11.8L14.2 14',
  bell,
  'bell-off': bell + slash,
  poll: 'M6 20L6 13M12 20L12 5M18 20L18 10',
  mail: rr(3.5, 5.5, 17, 13, 2.5) + 'M4.5 7L12 12.5L19.5 7',
  folder: 'M3.5 7Q3.5 5 5.5 5L9.5 5L11.5 7.5L18.5 7.5Q20.5 7.5 20.5 9.5L20.5 17Q20.5 19 18.5 19L5.5 19Q3.5 19 3.5 17Z',
  // ── voice & media ──
  mic,
  'mic-off': mic + slash,
  headphones: phones,
  'headphones-off': phones + slash,
  phone,
  'phone-off': rot(phone, 135, 12, 12.5),
  camera: cam,
  'camera-off': cam + slash,
  screen: rr(3, 4, 18, 12.5, 2.5) + 'M9 20L15 20M12 16.5L12 20M12 13.5L12 7.8M9.6 10.2L12 7.8L14.4 10.2',
  live: ring(12, 12, 2.2) + arc(12, 12, 5.8, 5.8, -40, 40) + arc(12, 12, 5.8, 5.8, 140, 220) + arc(12, 12, 9.2, 9.2, -38, 38) + arc(12, 12, 9.2, 9.2, 142, 218),
  volume: speaker + arc(12, 12, 3.8, 3.8, -50, 50) + arc(12, 12, 7.3, 7.3, -50, 50),
  'volume-low': speaker + arc(12, 12, 3.8, 3.8, -50, 50),
  'volume-mute': speaker + 'M15.5 9.5L20.5 14.5M20.5 9.5L15.5 14.5',
  play: 'M7.5 5L19 12L7.5 19Z',
  pause: 'M8.5 5.5L8.5 18.5M15.5 5.5L15.5 18.5',
  stop: rr(6, 6, 12, 12, 2.5),
}

// Same drawing, other names people reach for.
Object.assign(ICONS, { call: ICONS.phone, video: ICONS.camera, 'video-off': ICONS['camera-off'], timestamp: ICONS.calendar })
