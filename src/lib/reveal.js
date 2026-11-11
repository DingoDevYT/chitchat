// Splits text into words and spaces, each word into graphemes (so emoji and accents stay whole),
// with the string index each piece ends at, matching the typewriter's character count.
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const graphemes = s => seg ? [...seg.segment(s)].map(x => x.segment) : [...s]
const isEmoji = g => /\p{Extended_Pictographic}|\p{RI}/u.test(g)
const CODE = /(<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>)/i // same shape as CUSTOM_RX in markdown.js, one capture group for split

export function revealTokens(text) {
  const out = []
  let pos = 0
  for (const part of (text || '').match(/\s+|\S+/g) || []) {
    const start = pos
    if (/^\s/.test(part)) {
      pos += part.length
      out.push({ space: true, text: part, start, end: pos })
      continue
    }
    // custom emoji codes (odd pieces of the split) reveal as one piece instead of typing out their id
    const chars = part.split(CODE).flatMap((piece, k) => k % 2
      ? [{ text: piece, end: pos += piece.length, emoji: true }]
      : graphemes(piece).map(g => ({ text: g, end: pos += g.length, emoji: isEmoji(g) })))
    out.push({ space: false, start, end: pos, chars })
  }
  return out
}
