// The Chitbots' doodle stash: 15 champions drawn as stroke data on the 256 grid (ink.js), with a little hand wobble
// baked in from a fixed seed so every engine builds exactly the same points. Bots pick the one whose tags best match
// the prompt; a player who never sends a drawing gets one too (marked auto).
// Crayons: 0 ink, 1 berry, 2 peach, 3 butter, 4 leaf, 5 sky, 6 lilac. Sizes: 0 thin, 1 medium, 2 thick.
import { rng } from '../rng.js'
import { packPts } from './ink.js'

const wob = rng(20251112)
const jit = (a = 1.4) => (wob() * 2 - 1) * a
const q = v => Math.max(0, Math.min(255, Math.round(v)))
// An ellipse arc (angles in turns, 0 = right, 0.25 = down), with a slight overshoot so loops close like a crayon.
function E(cx, cy, rx, ry, a0 = 0, a1 = 1.04, n = 22) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (a0 + (a1 - a0) * (i / n)) * Math.PI * 2
    out.push(q(cx + Math.cos(t) * rx + jit()), q(cy + Math.sin(t) * ry + jit()))
  }
  return out
}
// A polyline through the given points, each nudged a touch.
const L = (...xy) => xy.map(v => q(v + jit(0.9)))
// A wavy line from (x0, y0) to (x1, y1): amp px of wobble, k waves.
function W(x0, y0, x1, y1, amp = 6, k = 3, n = 18) {
  const out = [], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI * 2 * k) * amp
    out.push(q(x0 + dx * t + nx * s + jit(0.6)), q(y0 + dy * t + ny * s + jit(0.6)))
  }
  return out
}
const dot = (x, y) => [q(x), q(y), q(x + 1), q(y)]
// Scribble fill: zig-zags across an ellipse, for a patch of colour behind the outline.
function fillE(cx, cy, rx, ry, rows = 7) {
  const out = []
  for (let i = 0; i <= rows; i++) {
    const y = cy - ry * 0.8 + (1.6 * ry * i) / rows, f = Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) * rx * 0.85
    if (i % 2) out.push(q(cx + f + jit()), q(y), q(cx - f + jit()), q(y + jit()))
    else out.push(q(cx - f + jit()), q(y), q(cx + f + jit()), q(y + jit()))
  }
  return out
}
const face = (x, y, s = 1, mood = 'happy') => [
  [0, 1, dot(x - 14 * s, y)], [0, 1, dot(x + 14 * s, y)],
  mood === 'happy' ? [0, 1, E(x, y + 6 * s, 9 * s, 7 * s, 0.05, 0.45, 8)]
    : mood === 'grr' ? [0, 1, E(x, y + 18 * s, 9 * s, 6 * s, 0.55, 0.95, 8)]
      : [0, 1, E(x, y + 10 * s, 4 * s, 5 * s, 0, 1.05, 10)],
  ...(mood === 'grr' ? [[0, 1, L(x - 22 * s, y - 12 * s, x - 8 * s, y - 6 * s)], [0, 1, L(x + 22 * s, y - 12 * s, x + 8 * s, y - 6 * s)]] : []),
]
const blush = (x, y, s = 1) => [[1, 1, L(x - 26 * s, y + 8 * s, x - 18 * s, y + 8 * s)], [1, 1, L(x + 18 * s, y + 8 * s, x + 26 * s, y + 8 * s)]]

const RAW = [
  { name: 'Sir Spudsworth', tags: 'potato knight brave food picnic soup fight sword', strokes: [
    [3, 2, fillE(128, 150, 50, 62)], [0, 1, E(128, 150, 54, 68)], [5, 2, E(126, 98, 48, 30, 0.5, 1.0, 14)], [0, 1, L(78, 98, 176, 98)],
    ...face(128, 140, 1, 'grr'), [0, 1, L(76, 150, 46, 128)], [0, 1, L(180, 150, 212, 118, 214, 60)], [0, 1, E(216, 48, 10, 12)],
    [0, 1, L(110, 214, 104, 240)], [0, 1, L(146, 214, 152, 240)],
  ] },
  { name: 'Nimbus the Damp', tags: 'cloud rain weather sad wet moist sky storm cry', strokes: [
    [5, 2, fillE(128, 112, 70, 26)], [0, 1, E(92, 116, 34, 28, 0.25, 0.85, 12)], [0, 1, E(132, 92, 38, 34, 0.55, 1.0, 14)],
    [0, 1, E(170, 112, 32, 28, 0.7, 1.25, 12)], [0, 1, L(70, 140, 196, 140)], ...face(130, 112, 0.8, 'oh'), ...blush(130, 110, 0.9),
    [5, 1, L(90, 160, 84, 178)], [5, 1, L(118, 162, 112, 182)], [5, 1, L(146, 160, 140, 180)], [5, 1, L(174, 158, 168, 176)],
    [5, 1, L(104, 196, 98, 214)], [5, 1, L(156, 194, 150, 212)],
  ] },
  { name: 'Loaf', tags: 'cat bread nap sleep lazy cozy pet loaf', strokes: [
    [2, 2, fillE(128, 160, 70, 40)], [0, 1, E(128, 160, 76, 46)], [0, 1, L(70, 132, 74, 92, 100, 120)], [0, 1, L(156, 120, 182, 92, 186, 132)],
    [0, 1, L(104, 150, 116, 152)], [0, 1, L(140, 152, 152, 150)], [0, 1, E(128, 168, 6, 4)], [0, 0, L(96, 166, 62, 160)], [0, 0, L(96, 174, 64, 180)],
    [0, 0, L(160, 166, 194, 160)], [0, 0, L(160, 174, 192, 180)], [0, 1, W(200, 186, 236, 150, 4, 1)],
  ] },
  { name: 'Toastmaster', tags: 'toaster toast breakfast kitchen hot morning bread machine', strokes: [
    [6, 2, fillE(128, 150, 64, 44)], [0, 1, L(62, 110, 194, 110, 196, 196, 60, 196, 62, 110)], [0, 1, L(88, 110, 88, 98)], [0, 1, L(120, 110, 120, 98)],
    [3, 2, L(84, 100, 84, 64, 122, 62, 124, 100)], [0, 1, L(84, 100, 84, 64, 122, 62, 124, 100)], [0, 1, L(196, 140, 214, 140)],
    ...face(128, 146, 1, 'happy'), [0, 1, L(84, 196, 78, 236, 66, 236)], [0, 1, L(172, 196, 178, 236, 190, 236)],
  ] },
  { name: 'Sergeant Slowpoke', tags: 'snail slow helmet garden army late shell', strokes: [
    [6, 2, fillE(140, 132, 46, 46)], [0, 1, E(140, 132, 50, 50)], [0, 1, E(142, 134, 32, 32, 0, 0.9, 16)], [0, 1, E(146, 136, 14, 14, 0, 0.8, 10)],
    [4, 2, L(40, 190, 210, 190)], [0, 1, L(36, 190, 60, 150, 92, 150, 96, 180)], [0, 1, L(56, 150, 50, 122)], [0, 1, L(70, 150, 74, 120)],
    [0, 1, dot(50, 118)], [0, 1, dot(74, 116)], [4, 2, E(64, 150, 22, 14, 0.5, 1.0, 10)], [0, 1, E(64, 168, 6, 4, 0.05, 0.45, 6)],
  ] },
  { name: 'King Ribbit', tags: 'frog king royal crown pond green fancy rule', strokes: [
    [4, 2, fillE(128, 160, 70, 50)], [0, 1, E(128, 160, 76, 54)], [0, 1, E(94, 108, 20, 20)], [0, 1, E(162, 108, 20, 20)],
    [0, 2, dot(94, 108)], [0, 2, dot(162, 108)], [3, 2, L(96, 86, 100, 54, 116, 74, 128, 46, 140, 74, 156, 54, 160, 86, 96, 86)],
    [0, 1, E(128, 168, 34, 18, 0.05, 0.45, 12)], [1, 1, L(84, 176, 92, 176)], [1, 1, L(164, 176, 172, 176)],
  ] },
  { name: 'Boo Lou', tags: 'ghost spooky haunted night scary boo midnight sheet', strokes: [
    [7, 2, fillE(128, 130, 50, 70)], [0, 1, L(74, 200, 76, 110)], [0, 1, E(128, 112, 52, 56, 0.5, 1.0, 16)], [0, 1, L(180, 112, 182, 200)],
    [0, 1, W(74, 200, 182, 200, 7, 2.5)], [0, 2, E(110, 120, 6, 9)], [0, 2, E(146, 120, 6, 9)], [0, 1, E(128, 150, 7, 9)], ...blush(128, 128, 1),
  ] },
  { name: 'Duck of Doom', tags: 'duck angry pond bread sword bath yell honk', strokes: [
    [3, 2, fillE(118, 160, 60, 40)], [0, 1, E(118, 162, 66, 44, 0.05, 0.95, 18)], [0, 1, E(150, 96, 36, 34)], [2, 2, L(182, 100, 222, 108, 184, 116)],
    [0, 1, L(182, 100, 222, 108, 184, 116)], [0, 2, dot(158, 88)], [0, 1, L(144, 74, 166, 84)], [0, 1, W(84, 150, 134, 170, 5, 1)],
    [0, 1, L(54, 150, 30, 120)], [5, 1, L(30, 120, 22, 60)], [0, 1, L(18, 120, 42, 118)],
  ] },
  { name: 'Prickly Pete', tags: 'cactus desert prickly hug plant spiky dry pot', strokes: [
    [4, 2, L(128, 190, 128, 70)], [0, 1, E(128, 128, 26, 64)], [0, 1, L(102, 140, 74, 140, 72, 104)], [0, 1, L(154, 120, 184, 120, 186, 88)],
    [2, 2, L(88, 192, 168, 192, 160, 236, 96, 236, 88, 192)], [0, 1, L(88, 192, 168, 192, 160, 236, 96, 236, 88, 192)], ...face(128, 112, 0.7, 'happy'),
    [1, 2, E(128, 60, 8, 8)], [0, 0, L(104, 90, 96, 86)], [0, 0, L(152, 150, 160, 146)], [0, 0, L(104, 160, 96, 164)],
  ] },
  { name: 'Kettle Kraken', tags: 'teapot kettle tea sea monster tentacle hot steam octopus', strokes: [
    [6, 2, fillE(128, 132, 56, 40)], [0, 1, E(128, 132, 60, 44)], [0, 1, L(186, 128, 222, 100, 226, 92)], [0, 1, E(70, 132, 14, 22, 0.25, 0.75, 10)],
    [0, 1, E(128, 86, 30, 8)], [0, 1, E(128, 74, 6, 6)], ...face(128, 128, 0.8, 'grr'),
    [6, 1, W(92, 168, 70, 226, 6, 1.5)], [6, 1, W(116, 174, 108, 236, 6, 1.5)], [6, 1, W(140, 174, 150, 236, 6, 1.5)], [6, 1, W(164, 168, 190, 224, 6, 1.5)],
    [5, 0, W(226, 84, 230, 40, 4, 1.5)],
  ] },
  { name: 'Shroomie', tags: 'mushroom forest spore tiny fungus picnic wood', strokes: [
    [1, 2, fillE(128, 100, 74, 36)], [0, 1, E(128, 112, 80, 56, 0.5, 1.0, 18)], [0, 1, L(48, 112, 208, 112)], [7, 2, E(100, 90, 8, 8)], [7, 2, E(150, 80, 10, 10)],
    [7, 2, E(176, 100, 6, 6)], [0, 1, L(100, 112, 96, 200, 160, 200, 156, 112)], ...face(128, 146, 0.7, 'happy'), ...blush(128, 144, 0.7),
  ] },
  { name: 'Octo Pal', tags: 'octopus sea ocean wiggle hug ink beach swim', strokes: [
    [6, 2, fillE(128, 96, 54, 44)], [0, 1, E(128, 100, 58, 52, 0.5, 1.0, 16)], [0, 1, L(70, 100, 186, 100)], ...face(128, 84, 0.8, 'happy'),
    [0, 1, W(76, 104, 46, 190, 6, 1.5)], [0, 1, W(100, 108, 88, 210, 6, 1.5)], [0, 1, W(124, 108, 122, 220, 6, 1.5)],
    [0, 1, W(146, 108, 158, 214, 6, 1.5)], [0, 1, W(166, 106, 190, 200, 6, 1.5)], [0, 1, W(182, 102, 218, 176, 6, 1.5)],
  ] },
  { name: 'Sandwich Sam', tags: 'sandwich lunch food picnic bread snack hungry', strokes: [
    [3, 2, L(46, 120, 128, 70, 210, 120, 46, 120)], [0, 1, L(46, 120, 128, 70, 210, 120, 46, 120)], [4, 2, W(42, 130, 214, 130, 5, 6, 30)],
    [1, 2, L(56, 144, 200, 144)], [3, 2, L(46, 156, 210, 156, 210, 176, 46, 176, 46, 156)], [0, 1, L(46, 156, 210, 156, 210, 176, 46, 176, 46, 156)],
    ...face(128, 100, 0.6, 'happy'), [0, 1, L(70, 176, 62, 222)], [0, 1, L(186, 176, 194, 222)],
  ] },
  { name: 'Sir Wiggles', tags: 'worm hat fancy garden dirt dance wiggle polite', strokes: [
    [2, 2, W(40, 200, 150, 150, 14, 1.5, 24)], [0, 0, W(40, 200, 150, 150, 14, 1.5, 24)], [2, 2, L(150, 150, 168, 110)], [0, 1, dot(160, 118)], [0, 1, E(170, 126, 5, 4, 0.05, 0.45, 6)],
    [0, 2, L(140, 96, 196, 96)], [0, 2, L(150, 94, 152, 50, 184, 50, 186, 94)], [1, 1, L(152, 84, 186, 84)],
  ] },
  { name: 'Bun Bun', tags: 'bunny rabbit fluffy carrot hop spring cute ears', strokes: [
    [7, 2, fillE(128, 150, 50, 46)], [0, 1, E(128, 150, 54, 50)], [0, 1, E(104, 74, 14, 40)], [0, 1, E(152, 74, 14, 40)], [1, 1, L(104, 50, 104, 98)],
    [1, 1, L(152, 50, 152, 98)], ...face(128, 146, 0.8, 'oh'), ...blush(128, 144, 0.9), [2, 2, L(186, 190, 214, 150)], [4, 1, L(214, 150, 222, 136)],
  ] },
]

export const DOODLES = RAW.map(d => ({ name: d.name, tags: d.tags.split(' '), art: d.strokes.map(([c, w, p]) => ({ c, w, p: packPts(p) })) }))

// The best stash doodle for a prompt: most tag words in the prompt, then unused ones, with a random pick among equals.
export function pickDoodle(prompt, used = [], rand = Math.random) {
  const words = String(prompt).toLowerCase()
  const score = DOODLES.map((d, i) => d.tags.reduce((n, t) => n + (words.includes(t) ? 2 : 0), 0) + (used.includes(i) ? -5 : 0) + rand())
  let best = 0
  score.forEach((s, i) => { if (s > score[best]) best = i })
  return best
}
