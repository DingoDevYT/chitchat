// Pure helpers for the server rail cards (see ServerCards.jsx).
import { statusOf } from './status.js'

// Cozy accent swatches; servers without an accent get one picked from their name.
export const PALETTE = ['#ff9f6b', '#f4a261', '#e9c46a', '#7ed6b1', '#5fb3b3', '#7aa7e8', '#a08ae8', '#e88ac0', '#ff6b8b', '#9bbf6a']
export const MOTD_MAX = 80
export const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function nameAccent(name = '') {
  let h = 2166136261 // FNV-1a: spreads similar names across the palette
  for (const ch of name) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0
  return PALETTE[((h ^ (h >>> 16)) >>> 0) % PALETTE.length]
}
export const cardAccent = s => (isHex(s?.accent) ? s.accent : nameAccent(s?.name))

// MOTD -> plain-text pieces and custom emoji tokens (<:name:id>, <a:name:id>), in order.
export const motdParts = text => (text || '').split(/(<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>)/i).filter(Boolean)

// Live chips for one server: online member count and the busiest stadium.
// memberIds: user ids in the server; presence: online store (id -> meta); stadiums: [{ id, name }] voice channels.
export function serverChips(memberIds = [], presence = {}, stadiums = []) {
  const online = memberIds.filter(id => statusOf(presence[id]) !== 'offline').length
  let stadium = null
  for (const c of stadiums) {
    // everyone in a stadium is visible in it (invisible users too), so count them all
    const n = Object.keys(presence).filter(id => presence[id]?.voice === c.id).length
    if (n && (!stadium || n > stadium.n)) stadium = { n, name: c.name }
  }
  return { online, stadium: stadium && `${stadium.n} in ${stadium.name}` } // the card draws the stadium icon
}

// Cards unless the user picked compact; no choice yet = compact on narrow desktop windows.
export const railCompact = (pref, narrow) => (typeof pref === 'boolean' ? pref : narrow)
