import { useEffect, useMemo, useRef, useState } from 'react'
import { myEmoji, loadMyEmoji } from './lib/emojiStore'
import { loadEmoji, searchEmoji, withSkin } from './lib/emoji'
import { acQuery, encodeEmoji, parseCustom, toToken } from './lib/customEmoji'
import { prefs } from './lib/store'
import { Emoji } from './Markdown'
import './styles/custom-emoji.css'

// ":name" autocomplete for a textarea. Custom emoji show as :name: in the box and become <:name:id> via encode().
export function useEmojiAutocomplete(ref, text, setText, serverId) {
  const mine = myEmoji.use()
  const skinTone = prefs.use(s => s.skinTone || 0)
  const [caret, setCaret] = useState(0)
  const [std, setStd] = useState(null)
  const [sel, setSel] = useState(0)
  const [closedFor, setClosedFor] = useState(null) // Escape hides it until the query changes
  const picked = useRef(new Map()) // exact emoji chosen in this box win over same-named ones
  const q = acQuery(text.slice(0, caret))

  useEffect(() => { loadMyEmoji() }, [])
  useEffect(() => { if (q && !std) loadEmoji().then(setStd, () => {}) }, [q, std])
  useEffect(() => { setSel(0) }, [q])

  const items = useMemo(() => {
    if (!q || q === closedFor) return []
    const here = e => e.server_id === serverId
    const custom = (mine || []).filter(e => e.name.includes(q))
      .sort((a, b) => here(b) - here(a) || a.name.indexOf(q) - b.name.indexOf(q)).slice(0, 5)
      .map(e => ({ key: e.id, e: toToken(e), label: e.name, hint: e.servers?.name, row: e }))
    const standard = std ? searchEmoji(std, q.replace(/_/g, ' ')).slice(0, 8 - custom.length)
      .map(x => ({ key: x.hexcode, e: withSkin(x, skinTone), label: x.label.toLowerCase().replace(/[^a-z0-9]+/g, '_') })) : []
    return [...custom, ...standard]
  }, [q, closedFor, mine, std, serverId, skinTone])
  const cur = Math.min(sel, items.length - 1)

  function choose(it) {
    const start = caret - q.length - 1
    const ins = it.row ? `:${it.row.name}: ` : it.e + ' '
    if (it.row) picked.current.set(it.row.name, it.row)
    setText(text.slice(0, start) + ins + text.slice(caret))
    const pos = start + ins.length
    setCaret(pos)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos) })
  }

  return {
    track: e => setCaret(e.target.selectionStart),
    // true when the key was used by the popup
    onKeyDown(e) {
      if (!items.length) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSel((cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
      else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) choose(items[cur])
      else if (e.key === 'Escape') { setClosedFor(q); e.stopPropagation() }
      else return false
      e.preventDefault()
      return true
    },
    // picker gives <:name:id>; show :name: in the box like typed ones
    fromPicker(e) {
      const c = parseCustom(e)
      if (!c) return e
      picked.current.set(c.name, c)
      return `:${c.name}:`
    },
    encode(t) {
      const byName = new Map()
      // this server's emoji go last so they win a name clash
      for (const e of [...(mine || [])].sort((a, b) => (a.server_id === serverId) - (b.server_id === serverId))) byName.set(e.name, e)
      for (const [n, e] of picked.current) byName.set(n, e)
      return encodeEmoji(t, byName)
    },
    popup: items.length > 0 && (
      <div className="emoji-ac pop" role="listbox" aria-label="Emoji suggestions">
        <h5>Emoji matching :{q}</h5>
        {items.map((it, i) => (
          <button key={it.key} role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''}
            onMouseDown={ev => ev.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => choose(it)}>
            <Emoji e={it.e} /> :{it.label}:{it.hint && <span className="muted">{it.hint}</span>}
          </button>
        ))}
      </div>
    ),
  }
}
