// Pure helpers for room/stadium customisation (see Rooms.jsx, RoomEditor.jsx and 026_rooms.sql).

// Curated name fonts; the list must match the channels.font CHECK in 026_rooms.sql.
export const FONTS = [
  { name: 'Nunito', wght: '800' },
  { name: 'Fredoka', wght: '600' },
  { name: 'Baloo 2', wght: '700' },
  { name: 'Comfortaa', wght: '700' },
  { name: 'Patrick Hand', wght: '400' },
  { name: 'Caveat', wght: '700' },
  { name: 'Pacifico', wght: '400' },
  { name: 'Lobster', wght: '400' },
  { name: 'Righteous', wght: '400' },
  { name: 'Bungee', wght: '400' },
  { name: 'Press Start 2P', wght: '400', small: true },
  { name: 'Silkscreen', wght: '400' },
  { name: 'Space Grotesk', wght: '700' },
  { name: 'Playfair Display', wght: '800' },
]
export const DEFAULT_FONT = 'Nunito'
export const fontOf = name => FONTS.find(f => f.name === name) || null

// Google Fonts stylesheet for one font (Nunito is already loaded by index.html).
export const fontHref = f => `https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, '+')}:wght@${f.wght}&display=swap`

// Names keep case, emoji and punctuation: just trim, collapse whitespace/newlines and cap at 64 characters.
export const MAX_NAME = 64
export const cleanRoomName = s => [...String(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME).join('').trim()

// Same rule as public.is_media_url(): only images from this project's public media bucket.
const MEDIA_RX = /^https:\/\/nilludyavkfqwastghmw\.supabase\.co\/storage\/v1\/object\/public\/media\/[^\s"'()<>]+$/
export const isMediaUrl = u => typeof u === 'string' && u.length <= 500 && MEDIA_RX.test(u)

// 'image' | 'custom' | 'emoji' | null, mirroring public.valid_room_icon().
export function iconKind(i) {
  if (!i || typeof i !== 'string') return null
  if (/^<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>$/i.test(i)) return 'custom'
  if (isMediaUrl(i)) return 'image'
  if ([...i].length <= 16 && !/[\s<>:/]/.test(i)) return 'emoji'
  return null
}

export const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
// The room's accent, else its server's, else null (CSS falls back to the app accent).
export const roomAccent = (room, server) => (isHex(room?.accent) ? room.accent : isHex(server?.accent) ? server.accent : null)

// Dark or light text for a solid accent background (WCAG relative luminance).
export function inkFor(hex) {
  if (!isHex(hex)) return null
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#2a1a10' : '#ffffff'
}

export const SLOWMODE = [0, 5, 10, 30, 60, 300, 900, 3600]
export function fmtSlow(sec) {
  if (!sec) return 'Off'
  if (sec % 3600 === 0) return sec / 3600 + 'h'
  if (sec % 60 === 0) return sec / 60 + 'm'
  return sec + 's'
}
// Countdown text: 0:09, 4:59, 1:00:00.
export function fmtLeft(sec) {
  const s = Math.max(0, Math.ceil(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

// When you can send next: your latest message here + slowmode (null = no wait). msgs: chat rows, oldest first.
export function slowUntil(msgs, meId, sec) {
  if (!sec || !msgs) return null
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.author_id === meId && !m.failed && !m.queued) return new Date(m.created_at).getTime() + sec * 1000
  }
  return null
}

// Header banner: 0 = full banner (at the latest messages), 1 = slim bar, after scrolling up `range` px.
// The chat scroller is column-reverse, so scrollTop goes negative going up.
export const shrinkOf = (scrollTop, range = 140) => Math.min(1, Math.max(0, -scrollTop / range))
