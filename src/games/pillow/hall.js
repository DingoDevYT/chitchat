// Drawing Duel Hall of Fame: the pure parts (no Supabase), shared by the save flow, the gallery and the tests.
// The server-side check is save_duel_champion() in supabase/migrations/045_duel_hall.sql; canSave/hallRecord mirror it
// so the client only tries saves the database will take, and so the rule is tested.
import { COLORS, GRID, SIZES, unpackPts } from './ink.js'

export const HALL_BUCKET = 'duel-hall'
export const THUMB_SIZE = 320
export const PAPER = '#fffdf8'

// Every bout in the log that a champion fought in, oldest first.
const boutsOf = (pub, key) => (pub?.log || []).filter(l => l.a === key || l.b === key || l.c === key)
const votesIn = (l, key) => (l.a === key ? l.va : l.b === key ? l.vb : l.c === key ? l.vc : 0) || 0

// May `uid` save champion `key` from this game state? { ok: true } or { ok: false, why }.
// Only your own champion (key <uid>#<round>, owner uid), with a drawing, that won at least one bout.
export function canSave(pub, key, uid) {
  if (!uid || typeof key !== 'string' || !new RegExp(`^${uid.replace(/[^\w-]/g, '')}#\\d{1,2}$`).test(key) || uid.startsWith('bot:')) return { ok: false, why: 'not yours' }
  const c = pub?.champs?.[key]
  if (!c || c.owner !== uid) return { ok: false, why: 'not yours' }
  if (!Array.isArray(c.art)) return { ok: false, why: 'no drawing' }
  if (!boutsOf(pub, key).some(l => l[l.w] === key)) return { ok: false, why: 'not a winner' }
  return { ok: true }
}

// The champion as the hall stores it (the RPC builds the same thing from games.pub).
export function hallRecord(pub, key) {
  const c = pub.champs[key], bouts = boutsOf(pub, key)
  return {
    champ: key,
    name: (c.name || '').slice(0, 40),
    prompt: (bouts[0]?.prompt || 'A mystery title').slice(0, 300),
    art: c.art,
    round: +key.split('#')[1],
    votes: bouts.reduce((n, l) => n + votesIn(l, key), 0),
    wins: bouts.filter(l => l[l.w] === key).length,
    streak: Math.max(1, c.best || 0),
    cry: c.cry?.ext ? { ext: c.cry.ext, ms: c.cry.ms } : c.cry ? { ...(c.cry.text ? { text: c.cry.text.slice(0, 200) } : {}), synth: c.cry.synth || 0 } : null,
  }
}

// The bout that just ended, if the champion that won it is mine: its key, else null. (Called on the win stage.)
export function myWinner(v, me) {
  if (v?.phase !== 'battle' || v.stage !== 'win') return null
  const b = v.bouts?.[v.bi], w = b?.res?.w
  const key = w && b[w]
  return key && v.champs[key]?.owner === me ? key : null
}

// Where a saved champion's files live: <server>/<artist>/<game>_<round>.png, and the clip copy next to it.
export function hallPaths(serverId, uid, gameId, round, ext) {
  const base = `${serverId}/${uid}/${gameId}_${round}`
  return { thumb: `${base}.png`, cry: ext ? `${base}.${ext}` : null }
}

// A drawing as canvas draw operations at `size` px: the paper, then each stroke (colour, width, points scaled from the
// 256 grid). Same curve as pathOf: quadratics through the midpoints.
export function thumbOps(art, size = THUMB_SIZE) {
  const k = size / GRID
  const strokes = []
  for (const st of art || []) {
    const pts = unpackPts(st?.p)
    if (!pts || pts.length < 2 || COLORS[st.c] == null || SIZES[st.w] == null) continue
    strokes.push({ color: COLORS[st.c], width: SIZES[st.w] * k, alpha: st.c === 7 ? 1 : 0.94, pts: pts.map(x => x * k) })
  }
  return { size, bg: PAPER, strokes }
}

// Plays thumbOps onto a 2D context.
export function drawOps(g, ops) {
  g.fillStyle = ops.bg
  g.fillRect(0, 0, ops.size, ops.size)
  g.lineCap = g.lineJoin = 'round'
  for (const s of ops.strokes) {
    const p = s.pts, n = p.length / 2
    g.globalAlpha = s.alpha
    g.strokeStyle = s.color
    g.lineWidth = s.width
    g.beginPath()
    g.moveTo(p[0], p[1])
    if (n === 1) g.lineTo(p[0] + 0.01, p[1])
    for (let i = 1; i < n - 1; i++) g.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2)
    if (n > 1) g.lineTo(p[2 * n - 2], p[2 * n - 1])
    g.stroke()
  }
  g.globalAlpha = 1
}

// The PNG thumbnail (browser only). Resolves to a Blob, or null if there's no canvas.
export async function renderThumb(art, size = THUMB_SIZE) {
  let canvas
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(size, size)
  else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = canvas.height = size }
  else return null
  drawOps(canvas.getContext('2d'), thumbOps(art, size))
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise(res => canvas.toBlob(res, 'image/png'))
}

// A saved row → the champion shape the Doodle and playCry take.
export const entryChamp = row => ({ owner: row.artist_id, name: row.name, art: Array.isArray(row.art) ? row.art : [], cry: row.cry || null, round: row.round })

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const record = row => [plural(row.votes, 'vote'), plural(row.wins, 'win'), ...(row.streak > 1 ? [`best streak ${row.streak}`] : [])].join(' · ')

export function sortEntries(list, by = 'new') {
  const t = r => Date.parse(r.created_at) || 0
  return [...list].sort(by === 'votes' ? (x, y) => y.votes - x.votes || y.wins - x.wins || t(y) - t(x) : (x, y) => t(y) - t(x))
}

// The chat message for "Share to chat" (the thumbnail goes with it as an image).
export function shareText(row, artist) {
  const name = (row.name || '').replace(/[*_`~|\\]/g, '') || 'A nameless champion'
  return `**${name}** by ${artist || 'someone'}, from the Drawing Duel Hall of Fame\n"${row.prompt}" · ${record(row)} · round ${row.round}${row.channel_name ? ` in ${row.channel_name}` : ''}`
}
