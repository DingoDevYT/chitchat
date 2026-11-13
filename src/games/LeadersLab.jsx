// Dev only (#/leaders, `?card=1` adds a profile card): the Games panel's Leaderboards tab and the profile card's game
// line with mock data, no server.
import { primeProfiles } from '../lib/store'
import GamePicker from './GamePicker'
import { GamesLine } from './ProfileGames'
import { profileLine } from './results.js'
import Avatar from '../Avatar'

const NAMES = ['pip', 'Maple', 'Biscuit', 'Juniper', 'Toast', 'Wren', 'Clover', 'Mochi', 'Pebble', 'Fern']
const COLORS = ['#f4a261', '#8ab17d', '#e76f51', '#7aa6c2', '#c08bd8', '#e9c46a', '#5fb49c', '#f28fad', '#a0a4b8', '#b5838d']
const id = i => `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`
primeProfiles(NAMES.map((n, i) => ({ id: id(i), username: n.toLowerCase(), display_name: n, color: COLORS[i] })))

const RECS = [
  ['flyer', 'distance', 0, 3105], ['flyer', 'sprinkles', 3, 48], ['starchat', 'stars', 1, 9], ['starchat', 'coins', 4, 62],
  ['pillow', 'streak', 2, 4], ['pillow', 'votes', 5, 17], ['poker', 'chips', 6, 8400], ['property', 'worth', 1, 6120], ['isle', 'points', 7, 11],
]
async function load(sid, game, period) {
  const k = period === 'week' ? 0.4 : 1
  const rows = NAMES.map((_, i) => {
    const played = Math.round((40 - i * 3) * k) + (game ? -2 : 4)
    const wins = Math.max(0, Math.round((18 - i * 1.7) * k) - (game ? 3 : 0))
    return { user_id: id(i), wins, played, win_rate: wins / Math.max(1, played), best_score: game === 'flyer' ? 3105 - i * 240 : game ? 900 - i * 60 : null, best_streak: Math.max(1, 5 - (i >> 1)) }
  })
  return { rows, records: RECS.map(([g, key, u, value]) => ({ game: g, key, user_id: id(u), value: Math.round(value * (period === 'week' ? 0.8 : 1)) })) }
}

export default function LeadersLab() {
  const card = new URLSearchParams(location.hash.split('?')[1] || '').has('card')
  const line = profileLine([{ game: 'flyer', played: 21, wins: 9, best_score: 3105 }, { game: 'poker', played: 6, wins: 2, best_score: 4000 }],
    [{ game: 'flyer', key: 'distance', user_id: id(0), value: 3105 }], id(0), g => ({ flyer: 'Jetpack Dash', poker: 'Poker' })[g])
  return (
    <>
      {!card && <GamePicker serverId="lab" tab="leaders" load={load} onPick={() => {}} onClose={() => {}} />}
      {card && (
        <div style={{ padding: 16, background: 'var(--bg)', minHeight: '100vh' }}>
          <div className="profile-card" style={{ position: 'static', maxWidth: 320 }}>
            <div className="profile-banner" style={{ background: COLORS[0] }} />
            <div className="profile-av"><Avatar id={id(0)} size={72} /></div>
            <h3>pip</h3>
            <div className="muted small">@pip</div>
            <GamesLine line={line} />
          </div>
        </div>
      )}
    </>
  )
}
