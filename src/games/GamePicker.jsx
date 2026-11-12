import Modal from '../Modal'
import { GAME_INFO } from './useGame'
import './picker.css'

// The Games panel: a grid of cards, each with a real gameplay banner, the name, what it is, and how many can play.
export default function GamePicker({ onPick, onClose }) {
  return (
    <Modal title="Games" onClose={onClose} wide>
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
    </Modal>
  )
}
