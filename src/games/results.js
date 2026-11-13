// Game results for the leaderboards (supabase/migrations/043_game_results.sql). Pure JS, shared by the referee
// (supabase/functions/_shared/record.ts, which writes one game_results row per person when a round ends) and the
// browser (labels for the Leaderboards tab and the profile card). No imports, so every game-<id> bundle stays small.

const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')

// Which stats key is a game's `score` column, and whether lower is better. Games without one (Impostor) are teams.
export const SCORE = {
  snack: { key: 'cards', low: true },
  property: { key: 'worth' },
  poker: { key: 'chips' },
  isle: { key: 'points' },
  flyer: { key: 'distance' },
  pillow: { key: 'points' },
  starchat: { key: 'stars' },
}

// The unique key that stops a round being recorded twice: the table plus the version its `done` save landed on.
// A round reaches `done` in exactly one successful game_save (game_save refuses a racing write at the same version,
// and nothing moves a finished round on until `start`), so (game, version) names the round. The table's unique index
// (game_id, round, user_id) backs it up if a save is ever retried.
export const roundKey = (gameId, version) => `${gameId}:${version}`

// Drops repeat rows for the same round and person (keeps the first), the in-memory twin of the unique index.
export function dedupe(rows) {
  const seen = new Set()
  return rows.filter(r => {
    const k = `${roundKey(r.game_id, r.round)}:${r.user_id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Placings (1 = best) for everyone in `order` (best first). Winners from over() always place 1. The rest follow in
// order, sharing a placing while `same(a, b)` says they're level (competition ranking: 1, 2, 2, 4). With no way to
// tell the rest apart (a team game), everyone who didn't win places 2.
export function placings(order, winners = [], same = null) {
  const out = {}
  const won = new Set(winners || [])
  for (const pid of won) out[pid] = 1
  const rest = order.filter(pid => !won.has(pid))
  if (!same) { for (const pid of rest) out[pid] = won.size ? 2 : 1; return out }
  let place = won.size + 1
  rest.forEach((pid, i) => {
    if (i > 0 && !same(rest[i - 1], pid)) place = won.size + 1 + i
    out[pid] = place
  })
  return out
}

// A rules module's stats(state, pid), never throwing; numbers rounded so the jsonb stays small.
export function statsOf(R, state, pid) {
  if (typeof R?.stats !== 'function') return {}
  try {
    const s = R.stats(state, pid)
    if (!s || typeof s !== 'object') return {}
    const clean = {}
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.round(v * 100) / 100
      else if (typeof v === 'string' || typeof v === 'boolean') clean[k] = v
    }
    return clean
  } catch { return {} }
}

// The order a finished round ranks its players in: the game's own ranking where it has one (Jetpack Dash, Star Party,
// Drawing Duel), else by score, else seat order.
export function orderOf(kind, R, state, stats) {
  const pub = state.pub || {}
  const players = [...(pub.players || [])]
  const own = R?.ranking?.(pub) || R?.standings?.(pub)
  if (Array.isArray(own) && own.length === players.length) return own
  const sc = SCORE[kind]
  if (!sc) return players
  const v = pid => stats[pid]?.[sc.key]
  return players.sort((a, b) => {
    const x = v(a), y = v(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return sc.low ? x - y : y - x
  })
}

// The rows to record for a finished round: one per person (Chitbots are never recorded).
// [{ user_id, placing, won, score, stats }]
export function resultRows(kind, R, state) {
  const players = state?.pub?.players || []
  const winners = (R.over(state) || []).filter(Boolean)
  const stats = Object.fromEntries(players.map(pid => [pid, statsOf(R, state, pid)]))
  const order = orderOf(kind, R, state, stats)
  const sc = SCORE[kind]
  const same = sc ? (a, b) => JSON.stringify(stats[a]) === JSON.stringify(stats[b]) : null
  const place = placings(order, winners, same)
  return players.filter(pid => !isBot(pid)).map(pid => ({
    user_id: pid,
    placing: place[pid] ?? players.length,
    won: winners.includes(pid),
    score: sc && typeof stats[pid][sc.key] === 'number' ? stats[pid][sc.key] : null,
    stats: stats[pid],
  }))
}

// ── display (browser) ──

// Records shown on the Leaderboards tab: [game, stats key, label, unit]. The RPC game_records returns the top value of
// every numeric stats key per game; only these are shown, in this order. `low` records keep the smallest value.
export const RECORDS = [
  ['flyer', 'distance', 'Longest Jetpack Dash run', 'm'],
  ['flyer', 'sprinkles', 'Most sprinkles in one run', ''],
  ['starchat', 'stars', 'Most stars in a Star Party', ''],
  ['starchat', 'coins', 'Most coins at the end of a Star Party', ''],
  ['pillow', 'streak', 'Longest Drawing Duel title streak', 'wins'],
  ['pillow', 'votes', 'Most votes in a Drawing Duel', ''],
  ['poker', 'chips', 'Biggest Poker stack', 'acorns'],
  ['property', 'worth', 'Richest Property Tycoon', ''],
  ['isle', 'points', 'Most Island Builders points', ''],
]
export const recordLabel = (game, key) => RECORDS.find(r => r[0] === game && r[1] === key)

export const fmtNum = n => (typeof n === 'number' ? Math.round(n).toLocaleString('en-US') : String(n ?? ''))
// "3,105 m", "12 stars" style value text for a record.
export function fmtRecord(game, key, value) {
  const r = recordLabel(game, key)
  const unit = r?.[3]
  return unit ? `${fmtNum(value)} ${unit}` : fmtNum(value)
}

// Best score column text per game (the leaderboard's "best" cell).
export function fmtScore(game, score) {
  if (score == null) return ''
  switch (game) {
    case 'flyer': return `${fmtNum(score)} m`
    case 'snack': return `${fmtNum(score)} left`
    case 'starchat': return `${fmtNum(score)} stars`
    case 'poker': return `${fmtNum(score)} acorns`
    case 'property': return fmtNum(score)
    default: return `${fmtNum(score)} pts`
  }
}

// Profile card line from game_player_stats rows ([{ game, played, wins, best_score }]) and the server's records
// ([{ game, key, user_id, value }]): { wins, played, favourite, standout } or null with nothing played.
export function profileLine(rows, records, uid, nameOf = g => g) {
  if (!rows?.length) return null
  const wins = rows.reduce((a, r) => a + (r.wins || 0), 0)
  const played = rows.reduce((a, r) => a + (r.played || 0), 0)
  if (!played) return null
  const fav = [...rows].sort((a, b) => b.played - a.played || b.wins - a.wins)[0]
  // A server record they hold beats a personal best.
  const held = RECORDS.map(([g, k, label]) => {
    const rec = (records || []).find(x => x.game === g && x.key === k && x.user_id === uid)
    return rec ? `${label}: ${fmtRecord(g, k, rec.value)}` : null
  }).find(Boolean)
  let standout = held
  if (!standout) {
    const best = rows.find(r => r.best_score != null && SCORE[r.game] && !SCORE[r.game].low && r.game === fav.game)
      || rows.find(r => r.best_score != null && SCORE[r.game] && !SCORE[r.game].low)
    if (best) standout = `Best ${nameOf(best.game)}: ${fmtScore(best.game, Number(best.best_score))}`
  }
  return { wins, played, favourite: fav.game, standout: standout || null }
}
