import { useMemo, useRef, useState } from 'react'
import { online, profiles } from './lib/store'
import { BIG, acTrigger, bigPing, encodeRooms, mentionItems, roomItems } from './lib/notify'
import { app } from './menus'
import { useMemberRoles } from './Roles'
import Avatar from './Avatar'
import { RoomGlyph } from './Markdown'
import './styles/notify.css'

// "@" people / roles / @everyone / @here and "~" room autocomplete for the composer, plus the big-ping note.
// Same shape as useEmojiAutocomplete: track, onKeyDown, popup, encode; guard() holds a send once to warn about a big ping.
export function useMentionAutocomplete(ref, text, setText, channelId) {
  const [caret, setCaret] = useState(0)
  const [sel, setSel] = useState(0)
  const [closedFor, setClosedFor] = useState(null) // Escape hides it until the query changes
  const [warned, setWarned] = useState(null) // the exact text already warned about: Enter again sends it
  const picked = useRef([]) // rooms chosen here: ~name becomes a room link on send
  const pmap = profiles.use()
  const c = app.channels.find(x => x.id === channelId)
  const serverId = c?.server_id || null
  const roleData = useMemberRoles(serverId)
  // the database ignores big pings without the permission (and in stadium chats); this only hides the UI
  const canPing = !!serverId && c?.kind !== 'voice' && !!app.ctx?.can('mention_everyone')

  const trig = acTrigger(text.slice(0, caret))
  const key = trig ? trig.kind + trig.q : null
  const items = useMemo(() => {
    if (!trig || key === closedFor) return []
    if (trig.kind === '~') return serverId ? roomItems(trig.q, app.channels.filter(x => x.server_id === serverId)).map(r => ({ key: r.id, room: r, label: r.name })) : []
    const ids = serverId ? app.members.map(m => m.user_id) : (c?.channel_members || []).map(m => m.user_id)
    const people = ids.filter(id => id !== app.ctx?.userId).map(id => pmap[id]).filter(Boolean)
    return mentionItems(trig.q, { people, roles: roleData.roles, canPing })
  }, [key, closedFor, pmap, roleData, canPing, serverId]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = Math.min(sel, items.length - 1)

  function choose(it) {
    const ins = (it.room ? '~' + it.room.name : it.insert) + ' '
    if (it.room && !picked.current.some(r => r.id === it.room.id)) picked.current.push(it.room)
    setText(text.slice(0, trig.start) + ins + text.slice(caret))
    const pos = trig.start + ins.length
    setCaret(pos)
    setSel(0)
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos) })
  }

  const big = serverId && c?.kind !== 'voice' ? bigPing(text) : null
  const n = !big ? 0 : big === 'here'
    ? app.members.filter(m => m.user_id !== app.ctx?.userId && online.get()[m.user_id]).length
    : (c?.private ? (c.channel_members?.length || 1) - 1 : app.members.length - 1)

  return {
    track: e => { setCaret(e.target.selectionStart); setSel(0) },
    onKeyDown(e) {
      if (!items.length) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setSel((cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
      else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) choose(items[cur])
      else if (e.key === 'Escape') { setClosedFor(key); e.stopPropagation() }
      else return false
      e.preventDefault()
      return true
    },
    encode: t => encodeRooms(t, picked.current),
    // true = don't send yet: first Enter on a big ping to a big room only warns
    guard(t) {
      if (!canPing || !big || n <= BIG || warned === t) return false
      setWarned(t)
      return true
    },
    notice: big && (canPing
      ? <div className={`ping-note${n > BIG ? ' big' : ''}`} role="status">
        {warned === text ? `This pings ${n} people. Press Enter again to send it.` : `@${big} will notify ${n} ${n === 1 ? 'person' : 'people'} here.`}
      </div>
      : <div className="ping-note muted" role="status">You can't ping @{big} here, so it sends without notifying anyone.</div>),
    popup: items.length > 0 && (
      <div className="emoji-ac mention-ac pop" role="listbox" aria-label={trig.kind === '~' ? 'Room suggestions' : 'Mention suggestions'}>
        <h5>{trig.kind === '~' ? 'Rooms' : 'Mentions'}{trig.q && <> matching {trig.kind}{trig.q}</>}</h5>
        {items.map((it, i) => (
          <button key={it.key} role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''}
            onMouseDown={ev => ev.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => choose(it)}>
            {it.room ? <span className="ac-ico"><RoomGlyph /></span>
              : it.kind === 'user' ? <Avatar id={it.id} size={20} />
              : <span className="ac-ico at" style={it.color ? { color: it.color } : undefined}>@</span>}
            <span className="ac-label">{it.label}</span>
            {it.sub && <span className="muted">{it.sub}</span>}
          </button>
        ))}
      </div>
    ),
  }
}
