// Pure SSRF guards and meta parsing for the link-preview edge function (tested in src/lib/linkpreview.test.js).

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

// Blocks private, loopback, link-local (incl. 169.254.169.254 metadata), CGNAT, benchmark, doc, multicast and reserved ranges.
export function isPublicIPv4(ip) {
  const m = V4.exec(ip)
  if (!m) return false
  const [a, b, c, d] = m.slice(1).map(Number)
  if ([a, b, c, d].some(x => x > 255)) return false
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113))
}

// Expands an IPv6 string to 8 numbers, or null if malformed.
function expand6(ip) {
  let s = ip.toLowerCase().split('%')[0]
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const p = v4[1].split('.').map(Number)
    if (p.some(x => x > 255)) return null
    s = s.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16)
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null
  const parts = [...head, ...Array(fill).fill('0'), ...tail]
  if (parts.length !== 8 || parts.some(h => !/^[0-9a-f]{1,4}$/.test(h))) return null
  return parts.map(h => parseInt(h, 16))
}

// Only global unicast 2000::/3 passes, which already excludes ::, ::1, ::ffff:0:0/96, 64:ff9b::/96, fc00::/7, fe80::/10, ff00::/8.
// Teredo, 6to4 (they embed IPv4 we can't vouch for) and documentation ranges are refused too.
export function isPublicIPv6(ip) {
  const h = expand6(ip)
  if (!h) return false
  if ((h[0] & 0xe000) !== 0x2000) return false
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0x0db8)) return false
  return h[0] !== 0x2002
}

export const isIPLiteral = h => V4.test(h) || h.includes(':')
export const isPublicIP = ip => (ip.includes(':') ? isPublicIPv6(ip) : isPublicIPv4(ip))

// Parses and normalises a user URL. Throws unless http(s) on port 80/443 with no credentials.
export function checkUrl(s) {
  if (typeof s !== 'string' || s.length > 2048) throw new Error('bad url')
  const u = new URL(s)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad scheme')
  if (u.username || u.password) throw new Error('credentials in url')
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('bad port')
  u.hash = ''
  return u
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©' }
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return ENT[e.toLowerCase()] ?? all
  })
}

// Plain text only: no tags, no control characters, collapsed whitespace, length-capped.
export function clean(s, max) {
  if (!s) return null
  const t = decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

export function safeUrl(href, base) {
  if (!href) return null
  try {
    const u = new URL(decode(href.trim()), base)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.href.length <= 2048 ? u.href : null
  } catch { return null }
}

const attrs = tag => {
  const o = {}
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4]
  return o
}

// OpenGraph / Twitter / plain HTML meta → preview fields. Never returns markup.
export function parseMeta(html, base) {
  const end = html.search(/<\/head>/i)
  const head = end > 0 ? html.slice(0, end) : html
  const meta = {}
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag), k = (a.property || a.name || '').toLowerCase()
    if (k && a.content != null && !(k in meta)) meta[k] = a.content
  }
  let favicon = null
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(tag)
    if (/(^|\s)icon(\s|$)/i.test(a.rel || '') && a.href) { favicon = safeUrl(a.href, base); break }
  }
  const color = (meta['theme-color'] || '').trim()
  const host = new URL(base).hostname.replace(/^www\./, '')
  return {
    url: base,
    title: clean(meta['og:title'] || meta['twitter:title'] || head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200),
    description: clean(meta['og:description'] || meta['twitter:description'] || meta.description, 400),
    image: safeUrl(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'], base),
    site_name: clean(meta['og:site_name'], 80) || host,
    favicon: favicon || safeUrl('/favicon.ico', base),
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : null,
  }
}

// Sites with nicer oEmbed data: [endpoint prefix, brand colour, site name].
export function oembedFor(u) {
  const h = u.hostname.replace(/^(www|m)\./, '')
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'music.youtube.com') return ['https://www.youtube.com/oembed?format=json&url=', '#ff0000', 'YouTube']
  if (h === 'open.spotify.com') return ['https://open.spotify.com/oembed?url=', '#1db954', 'Spotify']
  if (h === 'twitter.com' || h === 'x.com') return ['https://publish.twitter.com/oembed?omit_script=1&url=', '#1d9bf0', 'X']
  return null
}

export function fromOembed(j, url, color, site) {
  const tweet = site === 'X'
  return {
    url,
    title: clean(tweet ? j.author_name : j.title, 200),
    description: clean(tweet ? j.html : j.author_name, 400),
    image: safeUrl(j.thumbnail_url, url),
    site_name: site,
    favicon: null,
    color,
  }
}
