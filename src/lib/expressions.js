// Optional extra PNGtuber images, in priority order after talking.
export const EXPRESSIONS = [
  ['typing', 'Typing', '✍️', 'While you type a message'],
  ['deafened', 'Deafened', '🙉', 'In a stadium with sound off'],
  ['muted', 'Muted', '🔇', 'In a stadium with your mic off'],
  ['live', 'Live', '🔴', 'While you share your screen'],
  ['away', 'Away', '🌙', 'When you go idle'],
]

// Advanced: eyes-closed frames flashed briefly at random.
export const BLINKS = [
  ['blink', 'Blink (idle)', '😌', 'Eyes closed, flashed now and then'],
  ['talk_blink', 'Blink (talking)', '😚', 'Eyes closed while talking'],
]

export const hasBlink = p => !!(p?.avatar_states?.blink?.url || p?.avatar_states?.talk_blink?.url)

// Which image an avatar shows right now: talking > typing > deafened > muted > live > away > idle.
// Missing images fall back down the chain; null means draw the critter. s.blink swaps idle/talk for their blink frame.
export function pickExpression(p, s = {}) {
  if (!p) return null
  const st = p.avatar_states || {}
  const img = (k, src, crop) => ({ src, crop: crop || null, key: k })
  const blinkOf = (base, k) => s.blink && st[k]?.url ? img(k, st[k].url, st[k].crop) : base
  const idle = p.avatar_idle ? blinkOf(img('idle', p.avatar_idle, p.avatar_crop), 'blink') : null
  if (s.talk) return p.avatar_talk ? blinkOf(img('talk', p.avatar_talk, p.avatar_talk_crop), 'talk_blink') : idle
  for (const [k] of EXPRESSIONS) {
    if (s[k] && st[k]?.url) return img(k, st[k].url, st[k].crop)
  }
  return idle
}

// Natural-ish blink timing: every 2.5–6.5 s, sometimes a quick double blink.
export function nextBlink(rand = Math.random) {
  return { wait: 2500 + rand() * 4000, double: rand() < 0.2 }
}
