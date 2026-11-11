import { useMemo } from 'react'
import { revealTokens } from './lib/reveal'
import { Emoji } from './Markdown'
import './styles/reveal.css'

// New messages appear letter by letter, each one fading in and floating up into place.
// Letters are grouped per word so lines still wrap between words, never mid-word.
export default function Reveal({ text, n }) {
  const tokens = useMemo(() => revealTokens(text), [text])
  let shown = 0
  return tokens.map((tk, w) => {
    if (tk.space) { const vis = tk.end <= n; return vis ? tk.text : null }
    if (tk.start >= n) return null
    return (
      <span key={w} className="rv-word">
        {tk.chars.map((c, i) => c.end <= n
          ? <span key={i} className="rv-ch" style={{ animationDelay: `${(shown++ % 3) * 12}ms` }}>{c.emoji ? <Emoji e={c.text} /> : c.text}</span>
          : null)}
      </span>
    )
  })
}
