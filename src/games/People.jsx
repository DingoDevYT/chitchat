import Avatar, { Critter, Name } from '../Avatar'
import { Bubble } from '../Voice'
import { profiles } from '../lib/store'

// Seat colours: tokens, chips and nameplate accents (gouache palette).
export const SEAT_COLORS = ['#ff9f6b', '#7cc4b0', '#e58fb4', '#8fb3e8', '#f2c14e', '#a98bd6', '#9bd17a', '#e8857a', '#6fc3d6', '#d9a066']
export const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }
export const BASE = 150 // px: people are drawn at this size, then scaled to their seat

export const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
// Plain-text name for announcements and banners.
export function nameOf(pid, seats) {
  if (isBot(pid)) return `Chitbot (${LEVEL_NAMES[seats.find(s => `bot:${s.seat}` === pid)?.bot] || 'Normal'})`
  const p = profiles.get()[pid]
  return p?.display_name || p?.username || 'Someone'
}
// Everyone at the table in seat order: { pid, seat, user_id, bot, color }. During a round, the round's players.
export function seatList(seats, pub) {
  const all = seats.map(s => ({ pid: s.user_id || `bot:${s.seat}`, seat: s.seat, user_id: s.user_id, bot: s.bot, color: SEAT_COLORS[s.seat % 10] }))
  if (!pub?.players) return all
  return pub.players.map((pid, i) => all.find(x => x.pid === pid) || { pid, seat: i, user_id: isBot(pid) ? null : pid, bot: isBot(pid) ? 'normal' : null, color: SEAT_COLORS[i % 10], gone: true })
}

// A Chitbot: Chit the critter in its orange coat, chattering while it thinks.
function BotStandee({ size, thinking, level }) {
  return (
    <span className={`avatar gp-bot lv-${level}`} style={{ width: size, height: size }}>
      <Critter size={size} color="#ff9f6b" talk={thinking} blink />
      <i className="gp-bot-tag" aria-hidden="true">BOT</i>
    </span>
  )
}

// One person at the table: their live PNGtuber avatar (talking, expressions, blinking, webcam), speech bubble and nameplate.
// elRef lets the 3D table move it every frame; style places it in the flat table.
// head: the 3D table draws the body itself (a cut-out behind the table); this is just the speech bubble and nameplate over the head.
export function Person({ p, turn, info, me, elRef, style, won, head }) {
  const plate = (
    <div className="gp-plate">
      <span className="gp-name">{p.user_id ? <Name id={p.user_id} /> : <span className="name">Chitbot ({LEVEL_NAMES[p.bot]})</span>}</span>
      {info != null && <span className="gp-info">{info}</span>}
    </div>
  )
  if (head) return (
    <div ref={elRef} className={`gp head${turn ? ' turn' : ''}${me ? ' me' : ''}${p.gone ? ' gone' : ''}`} style={{ '--seat': p.color, ...style }}>
      <div className="gp-top">{p.user_id && <Bubble id={p.user_id} />}{plate}</div>
    </div>
  )
  return (
    <div ref={elRef} className={`gp${turn ? ' turn' : ''}${me ? ' me' : ''}${won ? ' won' : ''}${p.gone ? ' gone' : ''}`} style={{ '--seat': p.color, ...style }}>
      <div className="gp-body">
        {p.user_id && <Bubble id={p.user_id} />}
        {p.user_id ? <Avatar id={p.user_id} size={BASE} full mode="stage" vbadge /> : <BotStandee size={BASE} thinking={turn} level={p.bot} />}
      </div>
      <div className="gp-plate">
        <span className="gp-name">{p.user_id ? <Name id={p.user_id} /> : <span className="name">Chitbot ({LEVEL_NAMES[p.bot]})</span>}</span>
        {info != null && <span className="gp-info">{info}</span>}
      </div>
    </div>
  )
}
