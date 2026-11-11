import { card as pcard } from './highcard/rules.js'
import { ACTIONS, CARDS, FLAVOURS } from './snack/rules.js'

// Short faces for snack action cards (drawn the same on canvas in the 3D table).
export const SNACK_GLYPH = { nap: 'Zz', uturn: '⇄', plus2: '+2', chef: '★', feast: '+4' }
export const snackFace = id => {
  const c = CARDS[id]
  return { big: typeof c.v === 'number' ? String(c.v) : SNACK_GLYPH[c.v], color: c.f === 4 ? null : FLAVOURS[c.f].color, wild: c.f === 4, word: typeof c.v === 'number' ? '' : ACTIONS[c.v] }
}

// A card in the DOM (your hand, the flat table). kind: 'snack' | 'play' (52-card deck). back: face down.
export function Card({ kind, id, back, small, className = '' }) {
  if (back || id == null) return <span className={`gcard back ${kind}${small ? ' small' : ''} ${className}`} aria-hidden="true"><i /></span>
  if (kind === 'snack') {
    const f = snackFace(id)
    return (
      <span className={`gcard snack${f.wild ? ' wild' : ''}${small ? ' small' : ''} ${className}`} style={{ '--f': f.color || '#3a2f3f' }}>
        <b>{f.big}</b>{f.word && !small && <small>{f.word}</small>}
      </span>
    )
  }
  const c = pcard(id)
  return (
    <span className={`gcard play${c.suit.red ? ' red' : ''}${small ? ' small' : ''} ${className}`}>
      <b>{c.rank}</b><i>{c.suit.glyph}</i>
    </span>
  )
}
export const playName = id => pcard(id).name
