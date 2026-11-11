// Discord-flavoured markdown → token tree. Rendering lives in Markdown.jsx so this stays testable in plain node.
const RX = new RegExp([
  /```(?:[\w-]*\n)?([\s\S]+?)```/.source,            // 1 code block
  /`([^`\n]+)`/.source,                               // 2 inline code
  /\*\*([\s\S]+?)\*\*/.source,                        // 3 bold
  /\|\|([\s\S]+?)\|\|/.source,                        // 4 spoiler
  /~~([\s\S]+?)~~/.source,                            // 5 strike
  /\*([^*\n]+)\*/.source,                             // 6 italic
  /(?<!\w)_([^_\n]+)_(?!\w)/.source,                  // 7 italic, not inside snake_case
  /(https?:\/\/[^\s<>]*[^\s<>().,!?:;'"])/.source,    // 8 url
  /(?<![\w@])@([a-z0-9_.]{2,32})/.source,             // 9 mention, not inside emails
].join('|'), 'gi')

export function tokenize(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(RX)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    const [, block, code, bold, spoiler, strike, it1, it2, url, mention] = m
    if (block != null) out.push({ t: 'codeblock', v: block.replace(/\n$/, '') })
    else if (code != null) out.push({ t: 'code', v: code })
    else if (bold != null) out.push({ t: 'b', c: tokenize(bold) })
    else if (spoiler != null) out.push({ t: 'spoiler', c: tokenize(spoiler) })
    else if (strike != null) out.push({ t: 's', c: tokenize(strike) })
    else if ((it1 ?? it2) != null) out.push({ t: 'i', c: tokenize(it1 ?? it2) })
    else if (url != null) out.push({ t: 'url', v: url })
    else out.push({ t: 'mention', v: mention.toLowerCase() })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

// A message that is only a few emoji renders big.
export function isJumbo(text) {
  const t = text.trim()
  if (!t || !/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(t)) return false
  return [...t.matchAll(/\p{Extended_Pictographic}/gu)].length <= 6
}
