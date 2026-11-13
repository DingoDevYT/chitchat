// Drawing Duel Hall of Fame: who may save (mirrors save_duel_champion in migration 045), what gets saved, the file
// paths, the thumbnail draw ops and the share text.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import { COLORS, GRID, SIZES, packPts } from './ink.js'
import { DOODLES } from './doodles.js'
import { canSave, drawOps, entryChamp, hallPaths, hallRecord, myWinner, record, shareText, sortEntries, thumbOps } from './hall.js'

const U = n => `0000000${n}-0000-4000-8000-00000000000${n}`
const P = [U(1), U(2), U(3), U(4)]
const tick = s => R.move(s, R.turn(s), R.timeout())
const until = (s, pred) => { for (let k = 0; k < 500 && !pred(s.pub); k++) s = tick(s); return s }

// Four people, two bouts; everyone draws (no mic), then the first bout's crowd votes for side a.
function firstWin(cryMove = { type: 'cry', ext: 'wav', ms: 1500 }) {
  let s = R.setup(P, 7)
  for (const m of P) s = R.move(s, m, { type: 'draw', art: DOODLES[0].art, name: `champ ${m.slice(7, 8)}` })
  for (const m of P) s = R.move(s, m, cryMove)
  s = until(s, p => p.stage === 'vote')
  const b = s.pub.bouts[s.pub.bi]
  for (const v of b.voters) s = R.move(s, v, { type: 'vote', side: 'a' })
  s = until(s, p => p.stage === 'win')
  return { s, b: s.pub.bouts[s.pub.bi] }
}

test('canSave: only the artist of a champion that won a bout', () => {
  const { s, b } = firstWin()
  const p = s.pub, win = b.a, lose = b.b
  const artist = p.champs[win].owner, loser = p.champs[lose].owner
  assert.deepEqual(canSave(p, win, artist), { ok: true })
  assert.equal(canSave(p, win, loser).why, 'not yours')           // someone else's winner
  assert.equal(canSave(p, lose, loser).why, 'not a winner')       // your own loser
  assert.equal(canSave(p, `${artist}#2`, artist).why, 'not yours') // a champion that doesn't exist
  assert.equal(canSave(p, win, null).why, 'not yours')
  assert.equal(canSave(p, 'bot:1#1', 'bot:1').why, 'not yours')
  const noArt = JSON.parse(JSON.stringify(p)); noArt.champs[win].art = null
  assert.equal(canSave(noArt, win, artist).why, 'no drawing')
  // a forged key that names the artist but belongs to another champion
  const forged = JSON.parse(JSON.stringify(p)); forged.champs[`${artist}#1`].owner = loser
  assert.equal(canSave(forged, win, artist).why, 'not yours')
})

test('myWinner: the key on the win stage, only for the winning artist', () => {
  const { s, b } = firstWin()
  const p = s.pub, artist = p.champs[b.a].owner
  assert.equal(myWinner(p, artist), b.a)
  assert.equal(myWinner(p, p.champs[b.b].owner), null)
  assert.equal(myWinner({ ...p, stage: 'vote' }, artist), null)
  assert.equal(myWinner(null, artist), null)
})

test('hallRecord: drawing, first title, votes, wins, streak and the cry', () => {
  const { s, b } = firstWin()
  const p = s.pub, rec = hallRecord(p, b.a)
  assert.equal(rec.champ, b.a)
  assert.equal(rec.prompt, b.prompt)
  assert.equal(rec.round, 1)
  assert.equal(rec.votes, b.voters.length)
  assert.equal(rec.wins, 1)
  assert.equal(rec.streak, 1)
  assert.deepEqual(rec.art, DOODLES[0].art)
  assert.deepEqual(rec.cry, { ext: 'wav', ms: 1500 })
  assert.match(rec.name, /^champ /)
  // a typed line is kept as text
  const t = firstWin({ type: 'cry', none: true, text: 'Feathers for everyone!' })
  assert.deepEqual(hallRecord(t.s.pub, t.b.a).cry, { text: 'Feathers for everyone!', synth: t.s.pub.makers.indexOf(t.s.pub.champs[t.b.a].owner) % R.SQUEAKS })
})

test('hallRecord: a defender adds up wins and votes across rounds, title stays the one it was drawn for', () => {
  const { s: s0, b } = firstWin()
  let s = s0
  const key = b.a, first = b.prompt
  s = until(s, p => p.round === 2 && p.phase === 'draw')
  for (const m of s.pub.makers) s = R.move(s, m, { type: 'draw', art: DOODLES[1].art, name: 'new' })
  for (const m of s.pub.makers) s = R.move(s, m, { type: 'cry', none: true })
  // find the defender's bout and vote it through
  for (let k = 0; k < 10 && s.pub.phase === 'battle'; k++) {
    s = until(s, p => p.stage === 'vote')
    const bb = s.pub.bouts[s.pub.bi], side = R.sidesOf(bb).find(x => bb[x] === key)
    for (const v of bb.voters) s = R.move(s, v, { type: 'vote', side: side || 'a' })
    s = until(s, p => p.stage === 'win')
    if (side) break
    s = tick(s)
  }
  const rec = hallRecord(s.pub, key)
  assert.equal(rec.wins, 2)
  assert.equal(rec.streak, 2)
  assert.equal(rec.prompt, first)
  assert.equal(rec.votes, s.pub.log.filter(l => l.a === key || l.b === key).reduce((n, l) => n + (l.a === key ? l.va : l.vb), 0))
})

test('hallPaths: <server>/<artist>/<game>_<round>, clip next to the thumbnail', () => {
  assert.deepEqual(hallPaths('S', 'U', 'G', 3, 'webm'), { thumb: 'S/U/G_3.png', cry: 'S/U/G_3.webm' })
  assert.deepEqual(hallPaths('S', 'U', 'G', 1), { thumb: 'S/U/G_1.png', cry: null })
  // the path the migration's regex expects
  const { thumb } = hallPaths(U(1), U(2), U(3), 12, null)
  assert.match(thumb, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}_[0-9]{1,2}\.png$/)
})

test('thumbOps: scales points and widths from the 256 grid, keeps colours, skips junk', () => {
  const art = [{ c: 1, w: 2, p: packPts([0, 0, 128, 64, 255, 255]) }, { c: 7, w: 0, p: packPts([10, 10]) }, { c: 99, w: 0, p: packPts([1, 1]) }, { c: 0, w: 0, p: '!' }]
  const ops = thumbOps(art, 512)
  assert.equal(ops.size, 512)
  assert.equal(ops.strokes.length, 2)
  const [a, e] = ops.strokes
  assert.equal(a.color, COLORS[1])
  assert.equal(a.width, SIZES[2] * 2)
  assert.deepEqual(a.pts, [0, 0, 256, 128, 510, 510])
  assert.equal(a.alpha, 0.94)
  assert.equal(e.alpha, 1) // the eraser paints solid paper
  assert.deepEqual(thumbOps(null).strokes, [])
  assert.equal(thumbOps([], GRID).size, GRID)
})

test('drawOps: paper first, then one path per stroke with quadratic curves', () => {
  const calls = []
  const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => { t[k] = v; calls.push(['set', k, v]); return true } })
  drawOps(g, thumbOps([{ c: 0, w: 1, p: packPts([0, 0, 64, 64, 128, 0, 192, 64]) }], 256))
  const names = calls.map(c => c[0])
  assert.deepEqual(calls.find(c => c[0] === 'fillRect'), ['fillRect', 0, 0, 256, 256])
  assert.equal(names.filter(n => n === 'quadraticCurveTo').length, 2)
  assert.equal(names.filter(n => n === 'stroke').length, 1)
  assert.ok(names.indexOf('fillRect') < names.indexOf('beginPath'))
})

test('saved rows: champion shape, record line, sorting and share text', () => {
  const row = { id: 'x', artist_id: 'A', name: 'Sir *Bonk*', prompt: 'The sleepiest knight', art: DOODLES[2].art, cry: { text: 'zzz' }, round: 2, votes: 5, wins: 2, streak: 2, channel_name: 'Stadium', created_at: '2026-11-01T10:00:00Z' }
  assert.deepEqual(entryChamp(row), { owner: 'A', name: 'Sir *Bonk*', art: DOODLES[2].art, cry: { text: 'zzz' }, round: 2 })
  assert.deepEqual(entryChamp({ ...row, art: null, cry: null }).art, [])
  assert.equal(record(row), '5 votes · 2 wins · best streak 2')
  assert.equal(record({ votes: 1, wins: 1, streak: 1 }), '1 vote · 1 win')
  const old = { ...row, id: 'o', votes: 9, created_at: '2026-10-01T10:00:00Z' }
  assert.deepEqual(sortEntries([old, row]).map(r => r.id), ['x', 'o'])
  assert.deepEqual(sortEntries([row, old], 'votes').map(r => r.id), ['o', 'x'])
  const text = shareText(row, 'Pip')
  assert.match(text, /^\*\*Sir Bonk\*\* by Pip/) // markdown in the name can't break the bold
  assert.match(text, /"The sleepiest knight" · 5 votes · 2 wins · best streak 2 · round 2 in Stadium$/)
  assert.match(shareText({ ...row, name: '' }, null), /^\*\*A nameless champion\*\* by someone/)
})
