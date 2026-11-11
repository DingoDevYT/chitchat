// Discord-flavoured markdown → token tree. Rendering lives in Markdown.jsx so this stays testable in plain node.
const RX = new RegExp([
  /```(?:[\w-]*\n)?([\s\S]+?)```/.source,            // 1 code block
  /`([^`\n]+)`/.source,                               // 2 inline code
  /\*\*([\s\S]+?)\*\*/.source,                        // 3 bold
  /\|\|([\s\S]+?)\|\|/.source,                        // 4 spoiler
  /~~([\s\S]+?)~~/.source,                            // 5 strike
  /\*([^*\n]+)\*/.source,                             // 6 italic
  /(?<!\w)_([^_\n]+)_(?!\w)/.source,                  // 7 italic, not inside snake_case
  /\[([^[\]\n]+)\]\((https?:\/\/[^\s()<>]+(?:\([^\s()<>]*\)[^\s()<>]*)*)\)/.source, // 8-9 masked link [text](https://…)
  /(https?:\/\/(?:\([^\s<>()]*\)|[^\s<>()])*(?:\([^\s<>()]*\)|[^\s<>().,!?:;'"()]))/.source, // 10 url; balanced (…) kept, as in wiki links
  /(?<![\w@])@([a-z0-9_.]{2,32})/.source,             // 11 mention, not inside emails
  /<(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})>/.source,  // 12-14 custom emoji <:name:id> / <a:name:id>
  /<t:(-?\d{1,13})(?::([tdfr]))?>/.source,            // 15-16 timestamp <t:unix:format>
  /<~([^<>\n]{1,64}?):([0-9a-f-]{36})>/.source,       // 17-18 room link <~name:id> (lib/notify.js roomToken)
].join('|'), 'gi')
export const CUSTOM_RX = /<(a?):([a-z0-9_]{2,32}):([0-9a-f-]{36})>/gi

function inline(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(RX)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    const [, block, code, bold, spoiler, strike, it1, it2, ltext, lurl, url, mention, anim, ename, eid, unix, fmt, rname, rid] = m
    if (block != null) out.push({ t: 'codeblock', v: block.replace(/\n$/, '') })
    else if (code != null) out.push({ t: 'code', v: code })
    else if (bold != null) out.push({ t: 'b', c: inline(bold) })
    else if (spoiler != null) out.push({ t: 'spoiler', c: inline(spoiler) })
    else if (strike != null) out.push({ t: 's', c: inline(strike) })
    else if ((it1 ?? it2) != null) out.push({ t: 'i', c: inline(it1 ?? it2) })
    else if (lurl != null) out.push({ t: 'link', v: lurl, c: inline(ltext) })
    else if (url != null) out.push({ t: 'url', v: url })
    else if (mention != null) out.push({ t: 'mention', v: mention.toLowerCase() })
    else if (unix != null) out.push({ t: 'time', v: +unix, f: 'tTdDfFR'.includes(fmt) ? fmt : 'f' })
    else if (rid != null) out.push({ t: 'room', v: rname, id: rid.toLowerCase() }) // v: the name, so plain-text previews read well
    else out.push({ t: 'cemoji', name: ename.toLowerCase(), id: eid.toLowerCase(), animated: !!anim })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

// Line-level blocks: # headers, -# subtext, > and >>> quotes, - / * / 1. lists. Lines inside ``` fences stay as text.
const HINT = /^(?:#{1,3} +\S|-# +\S|>>?>? |\s*(?:[-*]|\d{1,9}\.) +\S)/m
const LIST = /^( *)([-*]|\d{1,9}\.) +(\S.*)$/
export function tokenize(text, inQuote = false) {
  if (!HINT.test(text)) return inline(text) // most messages: exactly the inline tokens, as before
  const lines = text.split('\n'), out = []
  let prose = [], code = false
  const flush = () => { if (prose.length) out.push(...inline(prose.join('\n'))); prose = [] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], odd = (line.match(/```/g) || []).length % 2
    if (code || odd) { if (odd) code = !code; prose.push(line); continue }
    let m
    if (!inQuote && line.startsWith('>>> ')) {
      flush()
      out.push({ t: 'quote', c: tokenize([line.slice(4), ...lines.slice(i + 1)].join('\n'), true) })
      return out
    } else if (!inQuote && line.startsWith('> ')) {
      const q = []
      for (; i < lines.length && lines[i].startsWith('> ') && !lines[i].startsWith('>>> '); i++) q.push(lines[i].slice(2))
      i--
      flush()
      out.push({ t: 'quote', c: tokenize(q.join('\n'), true) })
    } else if ((m = line.match(/^(#{1,3}) +(\S.*)$/))) {
      flush()
      out.push({ t: 'h', n: m[1].length, c: inline(m[2]) })
    } else if ((m = line.match(/^-# +(\S.*)$/))) {
      flush()
      out.push({ t: 'sub', c: inline(m[1]) })
    } else if ((m = line.match(LIST))) {
      flush()
      const ordered = m[2] !== '-' && m[2] !== '*', start = parseInt(m[2]), items = []
      for (; i < lines.length && (m = lines[i].match(LIST)) && (m[2] !== '-' && m[2] !== '*') === ordered; i++)
        items.push({ t: 'li', d: Math.min(3, m[1].length >> 1), c: inline(m[3]) })
      i--
      out.push(ordered ? { t: 'ol', start, c: items } : { t: 'ul', c: items })
    } else prose.push(line)
  }
  flush()
  return out
}

// <t:unix:F> → local text. R is relative ("in 5 minutes", "2 hours ago") from `now`.
const STAMP = {
  t: { timeStyle: 'short' }, T: { timeStyle: 'medium' }, d: { dateStyle: 'short' }, D: { dateStyle: 'long' },
  f: { dateStyle: 'long', timeStyle: 'short' }, F: { dateStyle: 'full', timeStyle: 'short' },
}
const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]
export function fmtTimestamp(unix, f = 'f', now = Date.now(), locale) {
  const d = new Date(unix * 1000)
  if (isNaN(d)) return String(unix)
  if (f !== 'R') return d.toLocaleString(locale, STAMP[f] || STAMP.f)
  const diff = unix - now / 1000, abs = Math.abs(diff)
  const [unit, sec] = UNITS.find(([, s]) => abs >= s) || UNITS.at(-1)
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(diff / sec), unit)
}

// A masked link whose text names a different site than where it really goes: returns the real host, else null.
export function linkMismatch(text, url) {
  const shown = text.match(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})/i)?.[1]
  if (!shown) return null
  try {
    const real = new URL(url).hostname
    const bare = h => h.toLowerCase().replace(/^www\./, '')
    return bare(real) === bare(shown) ? null : real
  } catch { return null }
}

// A message that is only a few emoji renders big.
export function isJumbo(text) {
  const custom = text.match(CUSTOM_RX)?.length || 0
  const t = text.replace(CUSTOM_RX, ' ').trim()
  if (!t) return custom > 0 && custom <= 6
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(t)) return false
  return [...t.matchAll(/\p{Extended_Pictographic}/gu)].length + custom <= 6
}

// ── Noto emoji ──
const NOTO = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/svg'
// keycaps | flags | pictographic (+ skin tone / variation selector / tag sequence), joined by ZWJ
export const EMOJI_RX = /[#*0-9]️?⃣|\p{RI}\p{RI}|\p{Extended_Pictographic}(?:\p{EMod}|️|[\u{E0020}-\u{E007E}]+\u{E007F})*(?:‍\p{Extended_Pictographic}(?:\p{EMod}|️)*)*/gu

// These Noto flag files are git symlinks, which jsDelivr serves as plain text; point at their targets instead.
const FLAG_ALIAS = { BV: 'NO', CP: 'FR', DG: 'IO', EA: 'ES', HM: 'AU', MF: 'FR', SJ: 'NO', UM: 'US' }
const RI = 0x1f1e6 - 65

export function emojiUrl(seq) {
  let cps = [...seq].map(c => c.codePointAt(0))
  const alias = cps.length === 2 && FLAG_ALIAS[String.fromCharCode(cps[0] - RI, cps[1] - RI)]
  if (alias) cps = [...alias].map(c => c.charCodeAt(0) + RI)
  if (cps.length === 1 && cps[0] < 0x2300) return null // ©, ®, ™, arrows: keep as text
  // country and subdivision (🏴 + tag) flags live in Noto's waved region-flags folder, not svg/
  const flag = (cps[0] >= 0x1f1e6 && cps[0] <= 0x1f1ff) || (cps[0] === 0x1f3f4 && cps[1] >= 0xe0020)
  const dir = flag ? NOTO.replace(/svg$/, 'third_party/region-flags/waved-svg') : NOTO
  return `${dir}/emoji_u${cps.filter(c => c !== 0xfe0f).map(c => c.toString(16).padStart(4, '0')).join('_')}.svg`
}

// Splits text into strings and { emoji, url } pieces.
export function splitEmoji(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(EMOJI_RX)) {
    const url = emojiUrl(m[0])
    if (!url) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ emoji: m[0], url })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
