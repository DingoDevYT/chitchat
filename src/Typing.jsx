import { useProfile } from './lib/store'
import Avatar from './Avatar'
import './styles/typing.css'

// A little laptop with two paws tapping the keys, in the typer's colour.
function Laptop({ color }) {
  return (
    <svg className="laptop" viewBox="0 0 48 30" aria-hidden="true">
      <path className="lt-screen" d="M9 2h30a2 2 0 0 1 2 2v17H7V4a2 2 0 0 1 2-2z" />
      <rect className="lt-glow" x="10" y="5" width="28" height="13" rx="1.5" />
      <path className="lt-base" d="M2 21h44l-3 6a2 2 0 0 1-1.8 1H6.8A2 2 0 0 1 5 27z" />
      <rect className="lt-keys" x="11" y="22.5" width="26" height="2.5" rx="1" />
      <circle className="paw paw-l" cx="17" cy="22" r="3.6" fill={color} />
      <circle className="paw paw-r" cx="31" cy="22" r="3.6" fill={color} />
    </svg>
  )
}

function Typer({ id, me }) {
  const p = useProfile(id)
  return (
    <span className={`typer pop${me ? ' me' : ''}`} title={me ? 'You' : p?.display_name || p?.username}>
      <Avatar id={id} size={48} mode="typing" />
      <Laptop color={p?.color || '#f4a261'} />
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
