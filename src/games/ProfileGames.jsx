import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../icons/Icon'
import { GAMES_ON, gameName } from './useGame'
import { fmtNum, profileLine } from './results.js'
import './leaders.css'

// The profile card's game line for one server (migration 043): wins, favourite game, one standout record.
// Draws nothing until they've finished a game there (or before the migration is applied).
const recCache = new Map() // sid -> { at, p }
function serverRecords(sid) {
  const hit = recCache.get(sid)
  if (hit && Date.now() - hit.at < 60_000) return hit.p
  const p = supabase.rpc('game_records', { sid, period: 'all' }).then(r => r.data || [])
  recCache.set(sid, { at: Date.now(), p })
  return p
}

export async function loadProfileGames(sid, uid) {
  const [{ data, error }, records] = await Promise.all([supabase.rpc('game_player_stats', { sid, uid }), serverRecords(sid)])
  if (error) return null
  return profileLine(data || [], records, uid, g => gameName(g, g))
}

export function GamesLine({ line }) {
  if (!line) return null
  return (
    <div className="pc-games">
      <Icon name="cards" size={16} />
      <span>
        {fmtNum(line.wins)} {line.wins === 1 ? 'win' : 'wins'} in {fmtNum(line.played)} {line.played === 1 ? 'game' : 'games'} · loves {gameName(line.favourite, line.favourite)}
        {line.standout && <small>{line.standout}</small>}
      </span>
    </div>
  )
}

export default function ProfileGames({ uid, serverId, load = loadProfileGames }) {
  const [line, setLine] = useState(null)
  useEffect(() => {
    setLine(null)
    if (!GAMES_ON || !serverId || !uid) return
    let live = true
    load(serverId, uid).then(l => live && setLine(l)).catch(() => {})
    return () => { live = false }
  }, [uid, serverId, load])
  return <GamesLine line={line} />
}
