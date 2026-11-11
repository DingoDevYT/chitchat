import { Fragment, useEffect, useState } from 'react'
import { tokenize, isJumbo, splitEmoji, emojiUrl } from './lib/markdown'
import { parseCustom } from './lib/customEmoji'
import { emojiById, ensureEmoji } from './lib/emojiStore'
import { openProfileByUsername } from './ProfileCard'
import './styles/custom-emoji.css'

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

function render(tokens, me) {
  return tokens.map((tk, i) => {
    switch (tk.t) {
      case 'text': return <Fragment key={i}>{emojify(tk.v)}</Fragment>
      case 'code': return <code key={i}>{tk.v}</code>
      case 'codeblock': return <pre key={i}><code>{tk.v}</code></pre>
      case 'b': return <strong key={i}>{render(tk.c, me)}</strong>
      case 'i': return <em key={i}>{render(tk.c, me)}</em>
      case 's': return <s key={i}>{render(tk.c, me)}</s>
      case 'spoiler': return <Spoiler key={i}>{render(tk.c, me)}</Spoiler>
      case 'url': return <a key={i} href={tk.v} target="_blank" rel="noopener noreferrer">{tk.v}</a>
      case 'mention': return <button key={i} data-profile className={`mention${tk.v === me ? ' me' : ''}`}
        onClick={e => openProfileByUsername(tk.v, e.currentTarget)}>@{tk.v}</button>
      case 'cemoji': return <CustomEmoji key={i} name={tk.name} id={tk.id} />
      default: return null
    }
  })
}

export default function Markdown({ text, me }) {
  if (isJumbo(text)) return <span className="jumbo">{render(tokenize(text), me)}</span>
  return <>{render(tokenize(text), me)}</>
}
