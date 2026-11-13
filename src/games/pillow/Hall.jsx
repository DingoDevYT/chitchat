// The Drawing Duel Hall of Fame: a server's winning champions as cards (thumbnail, name, artist, title, record).
// Opening one replays its drawing stroke by stroke; its battle cry plays on a tap. Share it to a text room, remove your
// own (mods: any). Opened from the Games panel, the stadium and the Drawing Duel lobby and podium.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '../../Modal'
import { ask } from '../../Dialog'
import { toast, useProfile } from '../../lib/store'
import { app } from '../../menus'
import Icon from '../../icons/Icon'
import { Doodle } from './Doodle.jsx'
import { playCry } from './audio.js'
import { cryMs } from './rules.js'
import { entryChamp, record, sortEntries } from './hall.js'
import * as real from './hallApi.js'
import './pillow.css'
import './hall.css'

const artistName = p => p?.display_name || p?.username || 'Someone'

export default function Hall({ serverId, onClose, api = real }) {
  const me = app.ctx?.userId
  const mod = !!app.ctx?.can?.('manage_messages') && app.ctx?.server?.id === serverId
  const [by, setBy] = useState('new')
  const [rows, setRows] = useState(null)
  const [thumbs, setThumbs] = useState({})
  const [open, setOpen] = useState(null)
  const [err, setErr] = useState('')
  const optOut = api.useOptOut()

  useEffect(() => {
    let on = true
    setErr('')
    api.loadHall(serverId, by).then(async list => {
      if (!on) return
      setRows(list)
      const t = await api.thumbUrls(list).catch(() => ({}))
      if (on) setThumbs(t)
    }).catch(e => on && (setRows([]), setErr(e.message || "Couldn't open the Hall of Fame.")))
    return () => { on = false }
  }, [serverId, by, api])

  const remove = async row => {
    const mine = row.artist_id === me
    if (!(await ask({ text: mine ? 'Take your champion out of the Hall of Fame? Its drawing and battle cry are deleted.' : 'Remove this champion from the Hall of Fame? Its drawing and battle cry are deleted for everyone.', confirm: 'Remove', danger: true }))) return
    try { await api.removeEntry(row); setRows(l => l.filter(x => x.id !== row.id)); setOpen(null); toast('Removed from the Hall of Fame.') }
    catch (e) { toast(e.message || "Couldn't remove it.") }
  }
  const toggleOpt = async on => { try { await api.setOptOut(on) } catch (e) { toast(e.message || "Couldn't save that.") } }
  const list = rows ? sortEntries(rows, by) : []

  // A portal, so a Drawing Duel table's own styles (it covers the stadium) don't leak into the dialog.
  return createPortal(
    <Modal title="Drawing Duel Hall of Fame" onClose={onClose} wide>
      <div className="dh">
        {open ? (
          <Detail row={open} api={api} canRemove={open.artist_id === me || mod} onRemove={() => remove(open)} onBack={() => setOpen(null)} serverId={serverId} />
        ) : (
          <>
            <div className="dh-bar">
              <span className="tabs dh-sort" role="radiogroup" aria-label="Sort">
                {[['new', 'Newest'], ['votes', 'Most votes']].map(([k, l]) => <button key={k} role="radio" aria-checked={by === k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}
              </span>
              <label className="toggle dh-opt"><input type="checkbox" checked={!!optOut} disabled={optOut === null} onChange={e => toggleOpt(e.target.checked)} /> <span>Don't save my champions</span></label>
            </div>
            {rows === null && <p className="muted dh-empty" role="status">Dusting off the trophies…</p>}
            {err && <p className="muted dh-empty">{err}</p>}
            {rows?.length === 0 && !err && <div className="dh-empty"><Icon name="crown" size={28} /><p>No champions yet. Win a Drawing Duel bout and yours lands here.</p></div>}
            <ul className="dh-grid">
              {list.map(r => <li key={r.id}><Card row={r} thumb={thumbs[r.id]} onOpen={() => setOpen(r)} /></li>)}
            </ul>
          </>
        )}
      </div>
    </Modal>,
    document.body,
  )
}

function Card({ row, thumb, onOpen }) {
  const artist = useProfile(row.artist_id)
  return (
    <button className="dh-card" onClick={onOpen} aria-label={`${row.name || 'A champion'} by ${artistName(artist)}: ${row.prompt}`}>
      <span className="dh-art">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Doodle art={entryChamp(row).art} />}</span>
      {row.streak > 1 && <span className="pcf-belt dh-belt"><Icon name="crown" size={12} /> {row.streak}</span>}
      <b className="dh-name">{row.name || 'A nameless champion'}</b>
      <small className="dh-by">{artistName(artist)}</small>
      <small className="dh-prompt">{row.prompt}</small>
      <small className="dh-rec">{record(row)}</small>
    </button>
  )
}

function Detail({ row, api, canRemove, onRemove, onBack, serverId }) {
  const artist = useProfile(row.artist_id)
  const champ = entryChamp(row)
  const [replay, setReplay] = useState(0)
  const [talking, setTalking] = useState(false)
  const [sharing, setSharing] = useState(false)
  const artRef = useRef(null)
  const stop = useRef(null)
  useEffect(() => () => stop.current?.(), [])
  const cry = () => {
    stop.current?.()
    setTalking(true)
    const el = artRef.current
    const end = playCry(null, champ, a => el?.style.setProperty('--amp', a.toFixed(3)), () => api.loadHallCry(row))
    const t = setTimeout(() => { end(); setTalking(false) }, cryMs(champ.cry) + 400)
    stop.current = () => { clearTimeout(t); end(); setTalking(false) }
  }
  const date = new Date(row.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="dh-detail">
      <button className="btn ghost dh-back" onClick={onBack}><Icon name="chevron-left" size={16} /> All champions</button>
      <div className="dh-stage">
        <button ref={artRef} className={`dh-big${talking ? ' talking' : ''}`} onClick={cry} aria-label={`Play ${row.name || 'the champion'}'s battle cry`}>
          <Doodle key={replay} art={champ.art} replay dur={2200} label={row.name || 'A champion'} />
          {talking && champ.cry?.text && <span className="pcf-bubble words dh-words">{champ.cry.text}</span>}
        </button>
        <div className="dh-info">
          <h3>{row.name || 'A nameless champion'}</h3>
          <p className="dh-prompt-big">“{row.prompt}”</p>
          <p className="small">by <b>{artistName(artist)}</b> · round {row.round}{row.channel_name ? ` in ${row.channel_name}` : ''} · {date}</p>
          <p className="dh-stats">
            <span><b>{row.votes}</b> {row.votes === 1 ? 'vote' : 'votes'}</span>
            <span><b>{row.wins}</b> {row.wins === 1 ? 'win' : 'wins'}</span>
            <span><b>{row.streak}</b> best streak</span>
          </p>
          <div className="dh-actions">
            <button className="btn primary" onClick={cry}><Icon name="volume" size={16} /> Battle cry</button>
            <button className="btn ghost" onClick={() => setReplay(k => k + 1)}><Icon name="rotate" size={16} /> Replay drawing</button>
            <button className="btn ghost" onClick={() => setSharing(s => !s)} aria-expanded={sharing}><Icon name="forward" size={16} /> Share to chat</button>
            {canRemove && <button className="btn ghost danger" onClick={onRemove}><Icon name="trash" size={16} /> Remove</button>}
          </div>
          {sharing && <SharePicker row={row} api={api} serverId={serverId} artist={artistName(artist)} onDone={() => setSharing(false)} />}
        </div>
      </div>
    </div>
  )
}

function SharePicker({ row, api, serverId, artist, onDone }) {
  const rooms = (app.channels || []).filter(c => c.kind === 'text' && c.server_id === serverId)
  const [busy, setBusy] = useState(false)
  const send = async c => {
    setBusy(true)
    try { await api.shareToChat(row, c.id, artist); toast(`Shared to ${c.name}.`); onDone() }
    catch (e) { toast(e.message || "Couldn't share it.") }
    setBusy(false)
  }
  if (!rooms.length) return <p className="muted small">No text rooms to share to here.</p>
  return (
    <div className="dh-share" role="listbox" aria-label="Share to which room">
      {rooms.map(c => <button key={c.id} role="option" aria-selected={false} className="fwd-item" disabled={busy} onClick={() => send(c)}><Icon name="chat" size={14} /> <b>{c.name}</b></button>)}
    </div>
  )
}
