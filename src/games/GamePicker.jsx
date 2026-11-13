import { lazy, Suspense, useState } from 'react'
import Modal from '../Modal'
import { app } from '../menus'
import { GAME_INFO } from './useGame'
import './picker.css'

const Leaderboards = lazy(() => import('./Leaderboards'))

// The Games panel: a grid of cards, each with a real gameplay banner, the name, what it is, and how many can play.
// The Leaderboards tab shows this server's top players and records (migration 043).
export default function GamePicker({ onPick, onClose, serverId = app.ctx?.server?.id, tab: tab0 = 'games', load }) {
  const [tab, setTab] = useState(tab0)
  return (
    <Modal title="Games" onClose={onClose} wide>
      <div className="tabs gpk-tabs" role="tablist" aria-label="Games panel">
        <button type="button" role="tab" aria-selected={tab === 'games'} className={tab === 'games' ? 'on' : ''} onClick={() => setTab('games')}>Play</button>
        <button type="button" role="tab" aria-selected={tab === 'leaders'} className={tab === 'leaders' ? 'on' : ''} onClick={() => setTab('leaders')}>Leaderboards</button>
      </div>
      {tab === 'games' ? (
        <div className="gpk-grid" role="list">
          {GAME_INFO.map(g => (
            <button key={g.id} type="button" role="listitem" className="gpk-card" onClick={() => onPick(g.id)} aria-label={`${g.name}: ${g.blurb}`}>
              <span className="gpk-banner"><img src={`${import.meta.env.BASE_URL}games/${g.id}.jpg`} alt="" loading="lazy" /></span>
              <span className="gpk-body">
                <b>{g.name}</b>
                <small className="gpk-meta">{g.kind} · {g.players} players</small>
                <span className="gpk-blurb">{g.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Suspense fallback={<p className="muted">Opening the leaderboards…</p>}>
          <Leaderboards serverId={serverId} {...(load ? { load } : {})} />
        </Suspense>
      )}
    </Modal>
  )
}
