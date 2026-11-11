// Small Markdown → HTML for the in-app docs (docs/*.md). The files are ours, but everything is escaped anyway.
// Supports: # headings (with ids), paragraphs, - / 1. lists, ```code``` (with a copy button), tables, ---,
// "> **Tip:** …" callouts (Tip / Note / Warning), `code`, **bold**, *italic*, [links](other-page.md#heading). Tested in plugins.test.js.

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const slugify = s => s.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Doc links become hash routes: "bot-api.md#errors" → "#/docs/bot-api/errors", "#errors" → this page's heading.
export function docHref(href, page) {
  const md = href.match(/^([a-z0-9-]+)\.md(?:#([a-z0-9-]+))?$/i)
  if (md) return `#/docs/${md[1]}${md[2] ? '/' + md[2] : ''}`
  if (/^#[a-z0-9-]+$/i.test(href)) return `#/docs/${page}/${href.slice(1)}`
  return /^(https?:|mailto:|#\/)/i.test(href) ? href : '#'
}

export function inline(s, page = '') {
  const codes = []
  let h = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const to = docHref(href.replace(/&amp;/g, '&'), page)
    return `<a href="${esc(to)}"${/^https?:/i.test(to) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`
  })
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`)
}

const LIST = /^\s*([-*]|\d+\.)\s+/
const plain = s => s.replace(/`|\*\*|\[|\]\([^)]*\)/g, '')

// → { title, html, toc: [{ id, text, level }], text } (text = plain words, for search)
export function renderMarkdown(md, page = '') {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out = [], toc = [], para = [], words = []
  let title = '', i = 0
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), page)}</p>`); para.length = 0 } }
  while (i < lines.length) {
    const l = lines[i]
    let m
    if ((m = l.match(/^```([\w-]*)\s*$/))) {
      flush()
      const code = []
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) code.push(lines[i])
      i++
      out.push(`<div class="docs-code"><div class="docs-code-bar"><span>${esc(m[1] || 'text')}</span><button type="button" class="docs-copy">Copy</button></div><pre><code>${esc(code.join('\n'))}</code></pre></div>`)
      words.push(code.join(' '))
    } else if ((m = l.match(/^(#{1,4})\s+(.+?)\s*#*$/))) {
      flush()
      const level = m[1].length, text = m[2], id = slugify(text)
      if (level === 1 && !title) title = plain(text)
      else toc.push({ id, text: plain(text), level })
      out.push(`<h${level} id="${id}">${inline(text, page)}</h${level}>`)
      words.push(plain(text))
      i++
    } else if (!l.trim()) { flush(); i++ }
    else if (/^-{3,}\s*$/.test(l)) { flush(); out.push('<hr>'); i++ }
    else if (l.startsWith('>')) {
      flush()
      const q = []
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''))
      const kind = q[0].match(/^\*\*(tip|note|warning)[:.]?\*\*:?\s*/i)
      if (kind) q[0] = q[0].slice(kind[0].length)
      const paras = q.join('\n').split(/\n\s*\n/).map(p => `<p>${inline(p.replace(/\n/g, ' '), page)}</p>`).join('')
      out.push(`<aside class="docs-callout ${kind ? kind[1].toLowerCase() : 'note'}">${kind ? `<b>${kind[1][0].toUpperCase() + kind[1].slice(1).toLowerCase()}</b>` : ''}${paras}</aside>`)
      words.push(plain(q.join(' ')))
    } else if (LIST.test(l)) {
      flush()
      const ordered = /^\s*\d+\./.test(l), items = []
      while (i < lines.length && LIST.test(lines[i])) {
        let item = lines[i++].replace(LIST, '')
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST.test(lines[i])) item += ' ' + lines[i++].trim()
        items.push(`<li>${inline(item, page)}</li>`)
        words.push(plain(item))
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
    } else if (l.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      flush()
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = cells(l)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push(`<div class="docs-table"><table><thead><tr>${head.map(c => `<th>${inline(c, page)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${inline(c, page)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      words.push(plain([head, ...rows].flat().join(' ')))
    } else { para.push(l.trim()); words.push(plain(l)); i++ }
  }
  flush()
  return { title, html: out.join('\n'), toc, text: words.join(' ').replace(/\s+/g, ' ') }
}

// Search across pages: title and heading hits first, then body text. → [{ slug, title, heading?, snippet }]
export function searchDocs(pages, q) {
  const t = q.trim().toLowerCase()
  if (t.length < 2) return []
  const hits = []
  for (const p of pages) {
    if (p.title.toLowerCase().includes(t)) hits.push({ slug: p.slug, title: p.title, score: 3 })
    for (const h of p.toc) if (h.text.toLowerCase().includes(t)) hits.push({ slug: p.slug, title: p.title, heading: h, score: 2 })
    const at = p.text.toLowerCase().indexOf(t)
    if (at >= 0 && !hits.some(x => x.slug === p.slug)) {
      hits.push({ slug: p.slug, title: p.title, score: 1, snippet: (at > 40 ? '…' : '') + p.text.slice(Math.max(0, at - 40), at + t.length + 60).trim() + '…' })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12)
}
