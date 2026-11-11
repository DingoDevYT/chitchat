import { useProfile } from './lib/store'
import Avatar from './Avatar'
import './styles/typing.css'

// Framed like a cat at a laptop: the avatar fills the frame, a small laptop sits in the bottom-left corner.
// We see the BACK of its lid (with a logo blob), leaning away from us towards the avatar; the deck runs right under
// their paws. Layers back to front: avatar → deck → paws → lid.
const VB = '0 0 40 34'

function Deck() {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      <path className="lt-deck" d="M2.2 31.6 13.4 30l16.4 1.3-9.6 2.4z" />
      <path className="lt-keyline" d="M14.6 31.1l9.8.8M15.8 32.2l8.2.7" />
    </svg>
  )
}

function Paws({ color }) {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      <ellipse className="paw paw-l" cx="18.6" cy="28.9" rx="2.7" ry="2.1" fill={color} />
      <ellipse className="paw paw-r" cx="24.2" cy="29.6" rx="2.7" ry="2.1" fill={color} />
    </svg>
  )
}

function Lid({ color }) {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      <path className="lt-lid" d="M2.2 31.6 13.4 30l2.1-12.6a1 1 0 0 0-1.1-1.2L4.9 15.4a1 1 0 0 0-.9.9z" />
      <path className="lt-rim" d="M13.4 30l2.1-12.6" />
      <ellipse className="lt-logo" cx="9" cy="23.4" rx="2.5" ry="1.8" transform="rotate(-8 9 23.4)" fill={color} />
    </svg>
  )
}

function Typer({ id, me }) {
  const p = useProfile(id)
  const color = p?.color || '#f4a261'
  return (
    <span className={`typer${me ? ' me' : ''}`} title={me ? 'You' : p?.display_name || p?.username}>
      <Avatar id={id} size={29} mode="typing" />
      <Deck />
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
