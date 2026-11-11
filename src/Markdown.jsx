import { Fragment, useEffect, useState } from 'react'
import { tokenize, isJumbo, splitEmoji, emojiUrl, fmtTimestamp, linkMismatch } from './lib/markdown'
import { parseCustom } from './lib/customEmoji'
import { emojiById, ensureEmoji } from './lib/emojiStore'
import { createStore, nicknames, profiles } from './lib/store'
import { openProfileByUsername } from './ProfileCard'
import { app } from './menus'
import { ask } from './Dialog'
import './styles/custom-emoji.css'
import './styles/messaging-plus.css'
import Icon from './icons/Icon'

// Server emoji by id; unknown or deleted ones fall back to :name: text.
export function CustomEmoji({ name, id, lazy }) {
  const e = emojiById.use(s => s[id])
  useEffect(() => { if (e === undefined) ensureEmoji(id) }, [id, e])
  if (!e) return `:${name}:`
  return <img className="emoji custom-emoji" src={e.url} alt={`:${e.name}:`} title={`:${e.name}:`} draggable="false" loading={lazy ? 'lazy' : undefined} />
}

// Noto emoji image; falls back to the native character if the image is missing. Also takes <:name:id>.
export function Emoji({ e, url = emojiUrl(e), lazy }) {
  const [bad, setBad] = useState(false)
  const custom = parseCustom(e)
  if (custom) return <CustomEmoji {...custom} lazy={lazy} />
  if (!url || bad) return e
  return <img className="emoji" src={url} alt={e} draggable="false" loading={lazy ? 'lazy' : undefined} onError={() => setBad(true)} />
}

export function emojify(text) {
  return splitEmoji(text).map((p, i) => typeof p === 'string' ? p : <Emoji key={i} e={p.emoji} url={p.url} />)
}

function Spoiler({ children }) {
  const [shown, setShown] = useState(false)
  return <span className={`spoiler${shown ? ' shown' : ''}`} onClick={() => setShown(true)}>{children}</span>
}

// One shared 1s clock for every relative <t:…:R> on screen; it only runs while one is mounted.
const clock = createStore(Date.now())
let tickers = 0, tickTimer
export function Stamp({ v, f }) {
  useEffect(() => {
    if (f !== 'R') return
    if (!tickers++) tickTimer = setInterval(() => clock.set(Date.now()), 1000)
    return () => { if (!--tickers) clearInterval(tickTimer) }
  }, [f])
  const text = clock.use(now => fmtTimestamp(v, f, now)) // a string, so it re-renders only when the words change
  const d = new Date(v * 1000)
  return <time className="md-time" dateTime={isNaN(d) ? undefined : d.toISOString()} title={fmtTimestamp(v, 'F')}>{text}</time>
}

const plain = ts => ts.map(t => t.c ? plain(t.c) : t.t === 'text' || t.t === 'url' ? t.v : '').join('')
function MaskedLink({ tk, children }) {
  // the real address shows on hover; text that names another site asks first
  const open = async e => {
    const real = linkMismatch(plain(tk.c), tk.v)
    if (!real) return
    e.preventDefault() // the bubble's "Open it" click is a fresh user gesture, so the new tab isn't blocked
    if (await ask({ text: `This link really goes to ${real}:\n\n${tk.v}\n\nOpen it?`, confirm: 'Open it' })) window.open(tk.v, '_blank', 'noopener,noreferrer')
  }
  return <a href={tk.v} title={tk.v} target="_blank" rel="noopener noreferrer" onClick={open}>{children}</a>
}

export const RoomGlyph = () => <Icon name="room" size={13} className="nf-ico" />

// <~name:id> room link: a pill that opens the room; the stored name shows (unlinked) if it's gone or hidden from you.
function RoomLink({ id, name }) {
  const c = app.channels.find(x => x.id === id)
  if (!c) return <span className="room-pill gone"><RoomGlyph />{name}</span>
  return <button className="room-pill" onClick={() => app.ctx?.go(c.server_id || null, c.id)} title={`Open ${c.name}`}><RoomGlyph />{c.name}</button>
}

// @username shows their nickname in the open server, if they have one there.
function MentionName({ v }) {
  const id = profiles.use(s => Object.values(s).find(p => p.username === v)?.id)
  return nicknames.use(s => (id && s.map[id]) || v)
}

function render(tokens, me, inLink) {
  return tokens.map((tk, i) => {
    switch (tk.t) {
      case 'text': return <Fragment key={i}>{emojify(tk.v)}</Fragment>
      case 'code': return <code key={i}>{tk.v}</code>
      case 'codeblock': return <pre key={i}><code>{tk.v}</code></pre>
      case 'b': return <strong key={i}>{render(tk.c, me, inLink)}</strong>
      case 'i': return <em key={i}>{render(tk.c, me, inLink)}</em>
      case 's': return <s key={i}>{render(tk.c, me, inLink)}</s>
      case 'spoiler': return <Spoiler key={i}>{render(tk.c, me, inLink)}</Spoiler>
      case 'url': return inLink ? tk.v : <a key={i} href={tk.v} target="_blank" rel="noopener noreferrer">{tk.v}</a>
      case 'link': return inLink ? render(tk.c, me, true) : <MaskedLink key={i} tk={tk}>{render(tk.c, me, true)}</MaskedLink>
      case 'time': return <Stamp key={i} v={tk.v} f={tk.f} />
      case 'h': { const H = `h${tk.n + 2}`; return <H key={i} className="md-h">{render(tk.c, me)}</H> }
      case 'sub': return <small key={i} className="md-sub">{render(tk.c, me)}</small>
      case 'quote': return <blockquote key={i} className="md-quote">{render(tk.c, me)}</blockquote>
      case 'ul': case 'ol': { const L = tk.t; return <L key={i} className="md-list" start={tk.start}>{render(tk.c, me)}</L> }
      case 'li': return <li key={i} style={tk.d ? { marginLeft: tk.d * 1.25 + 'em' } : undefined}>{render(tk.c, me)}</li>
      case 'mention': return tk.v === 'everyone' || tk.v === 'here' ? <span key={i} className="mention">@{tk.v}</span>
        : <button key={i} data-profile className={`mention${tk.v === me ? ' me' : ''}`}
          onClick={e => openProfileByUsername(tk.v, e.currentTarget)}>@<MentionName v={tk.v} /></button>
      case 'room': return <RoomLink key={i} id={tk.id} name={tk.v} />
      case 'cemoji': return <CustomEmoji key={i} name={tk.name} id={tk.id} />
      default: return null
    }
  })
}

export default function Markdown({ text, me }) {
  if (isJumbo(text)) return <span className="jumbo">{render(tokenize(text), me)}</span>
  return <>{render(tokenize(text), me)}</>
}
