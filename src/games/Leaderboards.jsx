import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureProfiles } from '../lib/store'
import Avatar, { Name } from '../Avatar'
import Icon from '../icons/Icon'
import { GAME_INFO, gameName } from './useGame'
import { RECORDS, fmtNum, fmtRecord, fmtScore } from './results.js'
import './leaders.css'

// Leaderboards for one server (migration 043): top 10 per game or overall, this week or all time, plus the records.
// `load` swaps the data source (the dev preview passes mock data); by default it asks the server.
export async function loadBoard(sid, game, period) {
  const [b, r] = await Promise.all([
    supabase.rpc('game_leaderboard', { sid, gkind: game, period, lim: 10 }),
    supabase.rpc('game_records', { sid, period }),
  ])
  if (b.error || r.error) throw b.error || r.error
  return { rows: b.data || [], records: r.data || [] }
}

const PERIODS = [['week', 'This week'], ['all', 'All time']]

export default function Leaderboards({ serverId, load = loadBoard }) {
  const [game, setGame] = useState(null) // null = every game
  const [period, setPeriod] = useState('week')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!serverId) return
    let live = true
    setErr(false)
    load(serverId, game, period).then(d => {
      if (!live) return
      setData(d)
      const ids = [...new Set([...d.rows.map(r => r.user_id), ...d.records.map(r => r.user_id)])]
      if (ids.length && load === loadBoard) ensureProfiles(ids)
    }).catch(() => live && (setErr(true), setData({ rows: [], records: [] })))
    return () => { live = false }
  }, [serverId, game, period, load])

  if (!serverId) return <p className="muted lb-empty">Leaderboards live in servers. Play in a server stadium to get on the board.</p>

  const recs = RECORDS.filter(([g]) => !game || g === game)
    .map(([g, k, label]) => ({ g, k, label, rec: data?.records.find(x => x.game === g && x.key === k) }))
    .filter(x => x.rec)
  const when = period === 'week' ? 'this week' : 'yet'

  return (
    <div className="lb">
      <div className="lb-filters">
        <div className="lb-games" role="radiogroup" aria-label="Game">
          <button type="button" role="radio" aria-checked={!game} className={`lb-chip${!game ? ' on' : ''}`} onClick={() => setGame(null)}>All games</button>
          {GAME_INFO.map(g => (
            <button key={g.id} type="button" role="radio" aria-checked={game === g.id} className={`lb-chip${game === g.id ? ' on' : ''}`} onClick={() => setGame(g.id)}>
              <img src={`${import.meta.env.BASE_URL}games/${g.id}.jpg`} alt="" loading="lazy" />{g.name}
            </button>
          ))}
        </div>
        <div className="tabs small lb-period" role="radiogroup" aria-label="Period">
          {PERIODS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={period === k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
      </div>

      <section className="lb-board" aria-label={`Top players${game ? `, ${gameName(game)}` : ''}`}>
        <h3><Icon name="crown" size={18} /> {game ? gameName(game) : 'All games'}</h3>
        {!data && <p className="muted lb-empty">Counting the wins…</p>}
        {data && err && <p className="muted lb-empty">The leaderboards aren't open yet. Check back soon.</p>}
        {data && !err && !data.rows.length && <p className="muted lb-empty">Nobody has finished a game {when}. Start one in a stadium!</p>}
        {data && data.rows.length > 0 && (
          <ol className="lb-list">
            {data.rows.map((r, i) => (
              <li key={r.user_id} className={`lb-row${i < 3 ? ` top top${i + 1}` : ''}`}>
                <span className="lb-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                <Avatar id={r.user_id} size={34} />
                <span className="lb-who">
                  <Name id={r.user_id} serverId={serverId} />
                  <small className="muted">
                    {r.played} played · {Math.round(Number(r.win_rate) * 100)}% wins
                    {r.best_streak > 1 ? ` · best streak ${r.best_streak}` : ''}
                    {game && r.best_score != null ? ` · best ${fmtScore(game, Number(r.best_score))}` : ''}
                  </small>
                </span>
                <span className="lb-wins"><b>{fmtNum(r.wins)}</b><small>{r.wins === 1 ? 'win' : 'wins'}</small></span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {recs.length > 0 && (
        <section className="lb-records" aria-label="Records">
          <h3><Icon name="sparkle" size={18} /> Records</h3>
          <ul>
            {recs.map(({ g, k, label, rec }) => (
              <li key={`${g}.${k}`} className="lb-rec">
                <Avatar id={rec.user_id} size={28} />
                <span><span className="lb-rec-label">{label}:</span> <b>{fmtRecord(g, k, Number(rec.value))}</b> by <Name id={rec.user_id} serverId={serverId} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
