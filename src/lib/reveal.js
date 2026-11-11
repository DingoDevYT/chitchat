// Splits text into words and spaces, each word into graphemes (so emoji and accents stay whole),
// with the string index each piece ends at, matching the typewriter's character count.
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const graphemes = s => seg ? [...seg.segment(s)].map(x => x.segment) : [...s]
const isEmoji = g => /\p{Extended_Pictographic}|\p{RI}/u.test(g)

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
    const chars = graphemes(part).map(g => {
      pos += g.length
      return { text: g, end: pos, emoji: isEmoji(g) }
    })
    out.push({ space: false, start, end: pos, chars })
  }
  return out
}
