// Pure helpers for galleries (see Gallery.jsx and 034_galleries.sql). Tested in gallery.test.js.

// Covers keep their real aspect ratio inside these bounds; beyond them (extreme panoramas, very tall strips)
// the box is clamped and the picture is centre-cropped to fit it.
export const MIN_RATIO = 1 / 3
export const MAX_RATIO = 3
export const clampRatio = r => (Number.isFinite(r) && r > 0 ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) : 1)

// Justified rows (a photo wall): items are packed into rows that are scaled to fill `width` exactly, each row as
// close to `target` px tall as the items allow. The last, unfinished row is never stretched past `target`.
// ratios: width/height per item. Returns { rows: [{ top, height, items: [{ index, left, width }] }], height }.
// Widths are whole pixels and every full row's widths + gaps add up to exactly `width`.
export function justify(ratios, width, { target = 220, gap = 6 } = {}) {
  const rows = []
  if (!(width > 0) || !ratios.length) return { rows, height: 0 }
  const rs = ratios.map(clampRatio)
  const fullH = (from, to) => { // row height if items [from, to) filled the width
    let sum = 0
    for (let i = from; i < to; i++) sum += rs[i]
    return (width - gap * (to - from - 1)) / sum
  }
  let top = 0, start = 0
  const place = (from, to, h, stretch) => {
    const height = Math.max(1, Math.round(h))
    const items = []
    let x = 0, acc = 0
    for (let i = from; i < to; i++) {
      acc += rs[i] * h
      // last item of a full row ends exactly on the right edge; positions are rounded cumulatively so sums stay exact
      const right = stretch && i === to - 1 ? width : Math.min(width, Math.round(acc + gap * (i - from)))
      items.push({ index: i, left: x, width: Math.max(1, right - x) })
      x = right + gap
    }
    rows.push({ top, height, items })
    top += height + gap
  }
  for (let end = start + 1; end <= rs.length; end++) {
    const h = fullH(start, end)
    if (h > target) continue
    // the row just dropped below target: keep this item, or close the row without it if that lands closer
    if (end - start > 1 && fullH(start, end - 1) - target < target - h) { place(start, end - 1, fullH(start, end - 1), true); start = end - 1; end-- }
    else { place(start, end, h, true); start = end }
  }
  if (start < rs.length) place(start, rs.length, Math.min(target, fullH(start, rs.length)), false)
  return { rows, height: top - gap }
}

// Row height for the container: smaller on phones.
export const targetHeight = width => (width < 600 ? 140 : 220)

// ── posts ──
export const MAX_ITEMS = 10
export const MAX_BYTES = 25 * 1024 * 1024 // the media bucket's file size limit
export const TITLE_MAX = 120
export const DESC_MAX = 2000
const mb = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0)

// Splits picked/dropped/pasted files into what can be added and friendly reasons for the rest.
export function checkFiles(files, have = 0) {
  const ok = [], errors = []
  for (const f of files) {
    if (!/^(image|video)\//.test(f.type || '')) errors.push(`${f.name || 'That file'} isn't an image or video.`)
    else if (f.size > MAX_BYTES) errors.push(`${f.name} is ${mb(f.size)} MB. The limit is 25 MB.`)
    else if (have + ok.length >= MAX_ITEMS) { errors.push(`A post can hold up to ${MAX_ITEMS} pictures or videos.`); break }
    else ok.push(f)
  }
  return { ok, errors }
}

// The media JSON create_gallery_post() accepts: item 1 is the cover. Drops empty optional fields.
export const mediaItem = ({ url, type, w, h, poster, alt, spoiler }) => ({
  url, type, w: Math.max(1, Math.round(w || 1)), h: Math.max(1, Math.round(h || 1)),
  ...(poster && { poster }), ...(alt?.trim() && { alt: alt.trim().slice(0, 500) }), ...(spoiler && { spoiler: true }),
})

export const SORTS = [['new', 'Newest'], ['active', 'Most active']]
// Same order as the DB queries: newest first, or most comments then most recent activity.
export function comparePosts(sort) {
  const t = s => Date.parse(s) || 0
  return sort === 'active'
    ? (a, b) => b.comment_count - a.comment_count || t(b.last_activity_at) - t(a.last_activity_at) || (a.id < b.id ? 1 : -1)
    : (a, b) => t(b.created_at) - t(a.created_at) || (a.id < b.id ? 1 : -1)
}

// Adds fetched or live rows to the list: replaces by id (keeping fields the row lacks), new ones sorted in.
export function mergePosts(list, rows, sort) {
  const byId = new Map(list.map(p => [p.id, p]))
  for (const r of rows) byId.set(r.id, { ...byId.get(r.id), ...r })
  return [...byId.values()].sort(comparePosts(sort))
}

// New comments since you last read a discussion you've commented in.
export const hasNewComments = (post, lastRead, mine) => !!mine && (post.last_comment_id || 0) > (lastRead ?? 0)

export const comments = n => `${n} ${n === 1 ? 'comment' : 'comments'}`

// "just now", "3m ago", "2h ago", "4d ago", then a date.
export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

// #/s/<server>/<gallery>/p/<post> ↔ { serverId, channelId, postId }
export const postPath = (serverId, galleryId, postId) => `#/s/${serverId}/${galleryId}${postId ? '/p/' + postId : ''}`
export const postIdOf = hash => (String(hash).match(/^#\/s\/[^/]+\/[^/]+\/p\/([0-9a-f-]{36})/i) || [])[1] || null
