import { Fragment, useState } from 'react'
import { tokenize, isJumbo, splitEmoji, emojiUrl } from './lib/markdown'

// Noto emoji image; falls back to the native character if the image is missing.
export function Emoji({ e, url = emojiUrl(e) }) {
  const [bad, setBad] = useState(false)
  if (!url || bad) return e
  return <img className="emoji" src={url} alt={e} draggable="false" onError={() => setBad(true)} />
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
      case 'mention': return <span key={i} className={`mention${tk.v === me ? ' me' : ''}`}>@{tk.v}</span>
      default: return null
    }
  })
}

export default function Markdown({ text, me }) {
  if (isJumbo(text)) return <span className="jumbo">{emojify(text)}</span>
  return <>{render(tokenize(text), me)}</>
}
