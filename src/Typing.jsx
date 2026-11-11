import { useProfile } from './lib/store'
import Avatar from './Avatar'
import './styles/typing.css'

// Layers, back to front: avatar → paws → laptop lid seen from behind (tilted away from us, towards them).
function Paws({ color }) {
  return (
    <svg className="tp-paws" viewBox="0 0 34 12" aria-hidden="true">
      <circle className="paw paw-l" cx="11" cy="6" r="4" fill={color} />
      <circle className="paw paw-r" cx="23" cy="6" r="4" fill={color} />
    </svg>
  )
}

function Lid({ color }) {
  return (
    <svg className="tp-lid" viewBox="0 0 36 18" aria-hidden="true">
      {/* back of the lid: narrower at the top because it leans away from us */}
      <path className="lid-back" d="M6.5 1.5h23a1.5 1.5 0 0 1 1.45 1.1L33.6 14H2.4L5.05 2.6A1.5 1.5 0 0 1 6.5 1.5z" />
      <path className="lid-edge" d="M6.5 1.5h23" />
      {/* little critter logo on the lid */}
      <g className="lid-logo" fill={color}>
        <circle cx="15.6" cy="5.6" r="1.3" /><circle cx="20.4" cy="5.6" r="1.3" /><circle cx="18" cy="8.2" r="3" />
      </g>
      {/* the base peeking out under the lid */}
      <rect className="lid-base" x="0.5" y="13.5" width="35" height="3.5" rx="1.75" />
    </svg>
  )
}

function Typer({ id, me }) {
  const p = useProfile(id)
  const color = p?.color || '#f4a261'
  return (
    <span className={`typer${me ? ' me' : ''}`} title={me ? 'You' : p?.display_name || p?.username}>
      <Avatar id={id} size={28} mode="typing" />
      <Paws color={color} />
      <Lid color={color} />
    </span>
  )
}

// Row of everyone typing (you included) with a friendly sentence.
export default function TypingRow({ ids, meId, names }) {
  if (!ids.length) return null
  const others = names.filter((_, i) => ids[i] !== meId)
  const youToo = ids.includes(meId)
  const who = [...others.slice(0, 3), ...(youToo ? ['you'] : [])]
  const more = others.length > 3 ? ` and ${others.length - 3} more` : ''
  const text = who.length === 1 && youToo ? "You're typing…"
    : `${who.slice(0, -1).join(', ')}${who.length > 1 ? ' and ' : ''}${who.at(-1)}${more} ${who.length > 1 || more ? 'are' : 'is'} typing…`
  return (
    <div className="typing-row">
      <div className="typers">{ids.slice(0, 8).map(id => <Typer key={id} id={id} me={id === meId} />)}</div>
      <span className="typing-text">{text}</span>
    </div>
  )
}
