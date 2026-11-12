import { createStore, useProfile } from './lib/store'
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
      <circle className="paw paw-l" cx="18.6" cy="28.9" r="2.3" fill={color} />
      <circle className="paw paw-r" cx="24.2" cy="29.6" r="2.3" fill={color} />
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

// On a phone: same angle, but they hold a phone up in both paws (we see its back, with the logo blob) and tap away.
function Phone({ color }) {
  return (
    <svg className="tp-layer" viewBox={VB} aria-hidden="true">
      <g transform="rotate(-14 16 25)">
        <rect className="ph-body" x="11.4" y="18" width="9.4" height="14.6" rx="2.1" />
        <circle className="ph-cam" cx="13.8" cy="20.6" r=".8" />
        <ellipse className="lt-logo" cx="16.1" cy="26" rx="1.9" ry="1.5" fill={color} />
      </g>
      <circle className="paw paw-l" cx="12" cy="28.8" r="2.3" fill={color} />
      <circle className="paw paw-r" cx="20.6" cy="26.9" r="2.3" fill={color} />
    </svg>
  )
}

// Who's typing from a phone (sent with their typing ping); you: from this device.
export const onPhone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const typingPhones = createStore({})

function Typer({ id, me }) {
  const p = useProfile(id)
  const color = p?.color || '#f4a261'
  const phone = typingPhones.use(s => (me ? onPhone : !!s[id]))
  return (
    <span className={`typer${me ? ' me' : ''}`} title={me ? 'You' : p?.display_name || p?.username}>
      <Avatar id={id} size={29} mode="typing" />
      {phone ? <Phone color={color} /> : <><Deck /><Paws color={color} /><Lid color={color} /></>}
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
