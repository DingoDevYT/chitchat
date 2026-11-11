import { useProfile } from './lib/store'
import Avatar from './Avatar'
import './styles/typing.css'

// Three-quarter view, like a cat at a laptop: the avatar sits behind; the laptop is angled in the foreground with
// the BACK of its lid nearest us (left), the keyboard deck running away towards the avatar, and paws on the keys.
// Layers back to front: avatar → deck → paws → lid.
const VB = '0 0 44 38'

function Deck() {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      {/* keyboard deck, receding to the right */}
      <path className="lt-deck" d="M7 30.5 24.5 24.6l14.8 4.8-17.2 7.1z" />
      <path className="lt-keys" d="M13.2 30.4l10.6-3.7 8.8 2.9-10.6 4.1z" />
      <path className="lt-keyline" d="M15.6 31.3l10.5-3.8M18.2 32.3l10.5-3.9" />
    </svg>
  )
}

function Paws({ color }) {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      <ellipse className="paw paw-l" cx="24.6" cy="28.6" rx="3.3" ry="2.6" fill={color} />
      <ellipse className="paw paw-r" cx="31.2" cy="30.4" rx="3.3" ry="2.6" fill={color} />
    </svg>
  )
}

function Lid({ color }) {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      {/* back of the lid, standing on the hinge and leaning back towards the avatar */}
      <path className="lt-lid" d="M7 30.5 24.5 24.6 22.4 7.6a1.4 1.4 0 0 0-1.8-1.1L4.6 12.1a1.4 1.4 0 0 0-.9 1.5z" />
      <path className="lt-rim" d="M24.5 24.6 22.4 7.6" />
      {/* little Chit logo on the lid, skewed with it */}
      <g className="lt-logo" fill={color} transform="matrix(.95 -.32 .06 .95 0 0)">
        <circle cx="9.6" cy="22.1" r="1.1" /><circle cx="13.4" cy="22.1" r="1.1" /><circle cx="11.5" cy="24.3" r="2.5" />
      </g>
    </svg>
  )
}

function Typer({ id, me }) {
  const p = useProfile(id)
  const color = p?.color || '#f4a261'
  return (
    <span className={`typer${me ? ' me' : ''}`} title={me ? 'You' : p?.display_name || p?.username}>
      <Avatar id={id} size={27} mode="typing" />
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
