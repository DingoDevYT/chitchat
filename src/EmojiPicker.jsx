import { useEffect, useMemo, useRef, useState } from 'react'
import { prefs, setPref } from './lib/store'
import { GROUPS, loadEmoji, searchEmoji, withSkin } from './lib/emoji'
import { myEmoji, loadMyEmoji } from './lib/emojiStore'
import { toToken } from './lib/customEmoji'
import { Emoji } from './Markdown'
import Icon from './icons/Icon'
import { moveIn, sortByOrder } from './lib/emojiOrder'

const TONES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿']

// Renders its cells only once scrolled near view; until then a same-height spacer (9 cols, ~37px rows).
function Section({ name, id = name, children, count, tools }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { setSeen(true); io.disconnect() } }, { root: ref.current.closest('.ep-grid'), rootMargin: '300px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={ref} data-g={id}>
      <h4>{name}{tools}</h4>
      {seen ? <div className="ep-cells">{children}</div> : <div style={{ height: Math.ceil(count / 9) * 37 }} />}
    </section>
  )
}

export default function EmojiPicker({ onPick, onClose, className = '' }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState(false)
  const [q, setQ] = useState('')
  const [toneOpen, setToneOpen] = useState(false)
  const { skinTone = 0, recentEmoji = [], emojiServerOrder } = prefs.use()
  const root = useRef(null), grid = useRef(null)

  useEffect(() => { loadEmoji().then(setList, () => setErr(true)) }, [])
  useEffect(() => {
    const down = e => { if (!root.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [onClose])

  const mine = myEmoji.use()
  useEffect(() => { loadMyEmoji() }, [])
  // one section per server you're in, in server-emoji creation order
  const servers = useMemo(() => {
    const m = new Map()
    for (const e of mine || []) {
      if (!m.has(e.server_id)) m.set(e.server_id, { id: 'srv-' + e.server_id, name: e.servers?.name || 'Server', icon: e.servers?.icon_url, list: [] })
      m.get(e.server_id).list.push(toToken(e))
    }
    return sortByOrder([...m.values()], emojiServerOrder)
  }, [mine, emojiServerOrder])
  const move = (id, to) => setPref('emojiServerOrder', moveIn(servers.map(s => s.id), id, to))
  const [drag, setDrag] = useState(null)
  const results = useMemo(() => {
    if (!list || !q.trim()) return null
    const cq = q.trim().toLowerCase().replace(/\s+/g, '_').replace(/:/g, '')
    return [...(mine || []).filter(e => e.name.includes(cq)).map(toToken), ...searchEmoji(list, q).map(e => withSkin(e, skinTone))]
  }, [list, q, skinTone, mine])
  const groups = useMemo(() => list && GROUPS.map(([id, name, icon]) =>
    [name, icon, list.filter(e => e.group === id).map(e => withSkin(e, skinTone))]), [list, skinTone])

  function pick(e) {
    setPref('recentEmoji', [e, ...recentEmoji.filter(x => x !== e)].slice(0, 24))
    onPick(e)
  }
  const cells = arr => arr.map(e => <button key={e} onClick={() => pick(e)} title={e[0] === '<' ? `:${e.split(':')[1]}:` : e}><Emoji e={e} lazy /></button>)

  return (
    <div ref={root} className={`emoji-picker pop ${className}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="ep-top">
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find the perfect emoji" aria-label="Search emoji"
          onKeyDown={e => { if (e.key === 'Enter' && results?.[0]) { e.preventDefault(); pick(results[0]) } }} />
        <div className="ep-tones">
          {(toneOpen ? TONES.map((_, i) => i) : [skinTone]).map(i => (
            <button key={i} className={i === skinTone && toneOpen ? 'on' : ''} title="Skin tone" aria-label={`Skin tone ${i}`}
              onClick={() => { if (toneOpen) setPref('skinTone', i); setToneOpen(o => !o) }}><Emoji e={TONES[i]} /></button>
          ))}
        </div>
      </div>
      {!results && list && (
        <div className="ep-tabs">
          {servers.map(s => (
            <button key={s.id} className={`ep-srv-tab${drag === s.id ? ' dragging' : ''}`} title={`${s.name} (drag to reorder)`} onClick={() => grid.current.querySelector(`[data-g="${s.id}"]`)?.scrollIntoView()}
              draggable onDragStart={e => { setDrag(s.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDrag(null)}
              onDragOver={e => { if (drag) e.preventDefault() }} onDrop={e => { e.preventDefault(); if (drag) move(drag, s.id); setDrag(null) }}
              onKeyDown={e => { if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(s.id, e.key === 'ArrowLeft' ? -1 : 1) } }}>
              {s.icon ? <img src={s.icon} alt="" /> : <span>{s.name[0]}</span>}
            </button>
          ))}
          {groups.map(([name, icon]) => (
            <button key={name} title={name} onClick={() => grid.current.querySelector(`[data-g="${name}"]`)?.scrollIntoView()}><Emoji e={icon} /></button>
          ))}
        </div>
      )}
      <div className="ep-grid" ref={grid}>
        {err ? <p className="muted small">Couldn't load emoji. Close and try again.</p>
          : !list ? <p className="muted small">Loading emoji…</p>
          : results ? (results.length ? <div className="ep-cells">{cells(results)}</div> : <p className="muted small">No emoji match “{q}”.</p>)
          : <>
            {recentEmoji.length > 0 && <section><h4>Recently used</h4><div className="ep-cells">{cells(recentEmoji)}</div></section>}
            {servers.map((s, i) => <Section key={s.id} id={s.id} name={s.name} count={s.list.length} tools={servers.length > 1 && <span className="ep-move">
              <button disabled={i === 0} onClick={() => move(s.id, -1)} aria-label={`Move ${s.name} up`} title="Move up"><Icon name="chevron-up" size={14} /></button>
              <button disabled={i === servers.length - 1} onClick={() => move(s.id, 1)} aria-label={`Move ${s.name} down`} title="Move down"><Icon name="chevron-down" size={14} /></button>
            </span>}>{cells(s.list)}</Section>)}
            {groups.map(([name, , arr]) => <Section key={name} name={name} count={arr.length}>{cells(arr)}</Section>)}
          </>}
      </div>
    </div>
  )
}
