// Game results (supabase/migrations/043_game_results.sql): when a round's `done` save lands, the referee calls
// recordResults once, and one game_results row per person (never Chitbots) is written with the service role.
// The rows themselves come from src/games/results.js (placings from over() and the game's ranking, plus each rules
// module's optional stats(state, pid)). A failure here is only logged: the game itself has already moved on.
import { resultRows } from '../../../src/games/results.js'

// db: the service-role client. g: the games row. row: what game_load returned. p: the done payload. version: the
// version that save landed on (with g.id, the round's unique key, see roundKey in results.js).
export async function recordResults(db: any, R: any, g: any, row: any, p: any, version: number) {
  try {
    const state = {
      pub: p.pub,
      priv: { ...(row.priv || {}), ...(p.privs || {}), ...(p.secret?.bots || {}) },
      secret: p.secret?.secret,
    }
    const rows = resultRows(g.game, R, state)
    if (!rows.length) return
    const { data: ch } = await db.from('channels').select('server_id').eq('id', g.channel_id).maybeSingle()
    const finished_at = new Date().toISOString()
    const { error } = await db.from('game_results').upsert(
      rows.map((r: any) => ({ ...r, game_id: g.id, round: version, server_id: ch?.server_id ?? null, channel_id: g.channel_id, game: g.game, finished_at })),
      { onConflict: 'game_id,round,user_id', ignoreDuplicates: true },
    )
    if (error) console.warn('game results', error)
  } catch (e) {
    console.warn('game results', e)
  }
}
