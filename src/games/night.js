// Between rounds and game nights. Pure, so the referee, the browser and the tests share it (night.test.js).
//
// Play again: when a round ends, away people (src/games/away.js) give up their seats and watchers who pressed "Join next
// round" mid-round (`games.opts.queue`) take the free ones. The host's Play again starts a short ready-up countdown
// (`games.deadline` while the table isn't playing); once it runs out any seated person may `start` with the same rules.
//
// Game night (`games.night`, migration 046): the host queues games, the table switches kind in place between them, and
// everyone collects night points per game: 1st = 3, 2nd = 2, 3rd = 1.
//   { list: ['snack', 'pillow', ...], at: index of the game on the table, scores: { pid: points },
//     played: [{ game, places: [[pid, place, points]] }], who: { 'bot:3': 'easy' } (Chitbots' levels, for names),
//     votes: { uid: 'next' | 'again' | 'skip' }, ended?: true }
import { awayOf, withoutAway } from './away.js'
import { QUEUEABLE } from './meta.js'

export const READY_MS = 20000
export const POINTS = [3, 2, 1]
export const CHOICES = ['next', 'again', 'skip']
export const MAX_LIST = 8
const bySeat = (a, b) => a.seat - b.seat

// ── Join next round ──
export const queueOf = opts => (Array.isArray(opts?.queue) ? opts.queue.filter(x => typeof x === 'string') : [])
export const joinQueue = (opts, uid) => (queueOf(opts).includes(uid) ? opts || {} : { ...(opts || {}), queue: [...queueOf(opts), uid].slice(0, 10) })
export const leaveQueue = (opts, uid) => ({ ...(opts || {}), queue: queueOf(opts).filter(x => x !== uid) })

// The round is over: away people give up their seats, then queued watchers take free seats in the order they asked;
// both lists are cleared. `max`: the game's seat count.
export function settleRound(seats, opts, max) {
  const away = awayOf(opts)
  const out = seats.filter(s => !away.includes(s.user_id)).map(s => ({ seat: s.seat, user_id: s.user_id, bot: s.bot }))
  for (const uid of queueOf(opts)) {
    if (out.some(s => s.user_id === uid)) continue
    const seat = [...Array(max).keys()].find(i => !out.some(s => s.seat === i))
    if (seat == null) break
    out.push({ seat, user_id: uid, bot: null })
  }
  return { seats: out.sort(bySeat), opts: withoutAway(opts) }
}

// Seated people who count for a vote: humans who haven't left.
export const votersOf = (seats, opts) => seats.filter(s => s.user_id && !awayOf(opts).includes(s.user_id)).map(s => s.user_id)

// ── The vote after each game ──
// win: the choice a strict majority of voters picked (votes from people no longer seated don't count), else null.
export function tally(votes, voters) {
  const counts = Object.fromEntries(CHOICES.map(c => [c, 0]))
  for (const v of voters) if (CHOICES.includes(votes?.[v])) counts[votes[v]]++
  const win = voters.length ? CHOICES.find(c => counts[c] * 2 > voters.length) ?? null : null
  return { counts, win, cast: CHOICES.reduce((n, c) => n + counts[c], 0) }
}

// What a choice does: play the same game again, switch to the next one (skip jumps one further), or end the night
// when the list runs out.
export function planNext(night, choice) {
  if (choice === 'again') return { kind: 'again' }
  const at = night.at + (choice === 'skip' ? 2 : 1)
  if (at >= night.list.length) return { kind: 'end' }
  return { kind: 'switch', at, game: night.list[at] }
}
export const upcoming = night => (night && !night.ended ? night.list[night.at + 1] ?? null : null)

// Seats for the next game: Chitbots stay only if it has them, people first if there are too many (the rest stand up
// and can sit again if someone leaves), original order kept, renumbered from 0.
export function seatsFor(seats, meta) {
  const humans = seats.filter(s => s.user_id).sort(bySeat)
  const bots = meta.noBots ? [] : seats.filter(s => !s.user_id).sort(bySeat)
  const keep = [...humans, ...bots].slice(0, meta.max).sort(bySeat)
  return {
    seats: keep.map((s, i) => ({ seat: i, user_id: s.user_id, bot: s.bot })),
    stood: humans.filter(h => !keep.includes(h)).map(h => h.user_id),
  }
}

// ── Night points ──
// How each game ranks the players who didn't win (higher is better; null: no place). Games without one (Impostor's
// teams, High Card) place only their winners.
const SCORES = {
  snack: p => pid => -(p.counts?.[pid] ?? 99),
  poker: p => pid => (p.out?.[pid] ? null : p.stacks?.[pid] ?? null),
  property: p => pid => (p.broke?.[pid] ? null : p.cash?.[pid] ?? null),
  isle: (p, R) => pid => (R?.score ? R.score(p, pid) : null),
  flyer: p => pid => (p.results?.[pid] ? (p.results[pid].m || 0) * 1e6 + (p.results[pid].spr || 0) : null),
  pillow: p => pid => p.scores?.[pid] || 0,
  starchat: p => pid => (p.stars?.[pid] || 0) * 1e6 + (p.coins?.[pid] || 0),
}
export const scorerFor = (game, pub, R) => SCORES[game]?.(pub, R) ?? null

// Places for one finished game: the winners share 1st, everyone else by score (ties share a place), competition
// ranking (two 1sts, then a 3rd). Returns [[pid, place]] for places 1 to 3 only.
export function placings(players, winners, score) {
  const won = (winners || []).filter(Boolean)
  const out = won.map(pid => [pid, 1])
  const rest = players.filter(p => !won.includes(p)).map(p => [p, score ? score(p) : null]).filter(([, s]) => s != null && Number.isFinite(s))
  rest.sort((a, b) => b[1] - a[1])
  let ahead = won.length, prev = null, place = 0
  rest.forEach(([pid, s], i) => {
    if (s !== prev) { place = ahead + i + 1; prev = s }
    out.push([pid, place])
  })
  return out.filter(([, pl]) => pl <= POINTS.length)
}
export const pointsFor = place => POINTS[place - 1] ?? 0

// A game of the night just ended: add its points. seats give the Chitbots' levels so the scoreboard can name them.
export function scoreGame(night, game, pub, winners, R, seats = []) {
  const places = placings(pub?.players || [], winners, scorerFor(game, pub, R)).map(([pid, pl]) => [pid, pl, pointsFor(pl)])
  const scores = { ...(night.scores || {}) }, who = { ...(night.who || {}) }
  for (const [pid, , pts] of places) scores[pid] = (scores[pid] || 0) + pts
  for (const s of seats) if (s.bot) who[`bot:${s.seat}`] = s.bot
  return { ...night, scores, who, votes: {}, played: [...(night.played || []), { game, places }].slice(-30) }
}

// The scoreboard: [[pid, points]], most first.
export const standings = night => Object.entries(night?.scores || {}).sort((a, b) => b[1] - a[1])

// The host queues the games after the one on the table (a fresh night starts with it). An empty queue with nothing
// played yet means no night at all.
export function setRest(night, current, rest) {
  const r = (Array.isArray(rest) ? rest : []).filter(id => QUEUEABLE.includes(id)).slice(0, MAX_LIST)
  const n = night?.list ? night : { list: [current], at: 0, scores: {}, played: [] }
  if (!r.length && !n.played?.length) return null
  return { ...n, list: [...n.list.slice(0, n.at + 1), ...r], ended: false, votes: {} }
}
