// Message search query parsing: "from:pip in:#general has:image before:2026-01-31 hello"
const DATE = /^\d{4}-\d{2}-\d{2}$/
const HAS = ['image', 'file', 'link']

// Local midnight of a YYYY-MM-DD, or null if it isn't a real date.
function day(s, plusDays = 0) {
  if (!DATE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  if (new Date(y, m - 1, d).getDate() !== d) return null // e.g. 2026-02-30
  return new Date(y, m - 1, d + plusDays)
}

export function parseSearch(input) {
  const out = { text: '', from: null, in: null, has: null, before: null, after: null }
  const words = []
  for (const w of input.trim().split(/\s+/).filter(Boolean)) {
    const m = w.match(/^(from|in|has|before|after):(.+)$/i)
    const k = m?.[1].toLowerCase(), v = m?.[2]
    if (k === 'from') out.from = v.replace(/^@/, '')
    else if (k === 'in') out.in = v.replace(/^#/, '')
    else if (k === 'has' && HAS.includes(v.toLowerCase())) out.has = v.toLowerCase()
    else if (k === 'before' && day(v)) out.before = day(v).toISOString()
    else if (k === 'after' && day(v)) out.after = day(v, 1).toISOString() // after a day = from the next midnight
    else words.push(w)
  }
  out.text = words.join(' ')
  return out
}

export const hasFilters = q => !!(q.text || q.from || q.in || q.has || q.before || q.after)

// Split text into [{ t, hit }] parts where hit = an occurrence of a search word (case-insensitive).
export function highlightParts(text, terms) {
  const words = (terms || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
  if (!words.length) return [{ t: text, hit: false }]
  const esc = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
  return text.split(new RegExp(`(${esc.join('|')})`, 'giu')).filter(Boolean)
    .map(t => ({ t, hit: words.includes(t.toLowerCase()) }))
}
