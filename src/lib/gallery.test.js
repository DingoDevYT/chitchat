import test from 'node:test'
import assert from 'node:assert/strict'
import { justify, clampRatio, MIN_RATIO, MAX_RATIO, targetHeight, checkFiles, mediaItem, comparePosts, mergePosts, hasNewComments, comments, timeAgo, postPath, postIdOf } from './gallery.js'

const GAP = 6
const rowWidth = row => row.items.reduce((s, it) => s + it.width, 0) + GAP * (row.items.length - 1)
// every item laid out once, in order, with the gap between neighbours and no overlap
function checkShape(layout, n, width) {
  assert.deepEqual(layout.rows.flatMap(r => r.items.map(it => it.index)), [...Array(n).keys()])
  let top = 0
  for (const row of layout.rows) {
    assert.equal(row.top, top)
    top += row.height + GAP
    row.items.forEach((it, i) => {
      assert.ok(it.width >= 1 && it.left >= 0 && it.left + it.width <= width, `item ${it.index} inside the row`)
      if (i) assert.equal(it.left, row.items[i - 1].left + row.items[i - 1].width + GAP)
    })
  }
  assert.equal(layout.height, top - GAP)
}

const MIX = [16 / 9, 4 / 5, 1, 21 / 9, 9 / 16, 3 / 2, 2 / 3, 1, 16 / 9, 4 / 3, 9 / 16, 21 / 9, 1, 4 / 5, 16 / 9]

test('full rows fill the width exactly, at about the target height', () => {
  for (const width of [1100, 940, 343, 777]) {
    const target = targetHeight(width)
    const l = justify(MIX, width, { target, gap: GAP })
    checkShape(l, MIX.length, width)
    for (const row of l.rows.slice(0, -1)) {
      assert.equal(rowWidth(row), width, `row fills ${width}px exactly`)
      assert.ok(row.height > target * 0.5 && row.height < target * 1.6, `row height ${row.height} near ${target}`)
    }
  }
})

test('covers keep their aspect ratio (to the pixel)', () => {
  const l = justify(MIX, 1000, { target: 220, gap: GAP })
  for (const row of l.rows) for (const it of row.items) {
    assert.ok(Math.abs(it.width - MIX[it.index] * row.height) <= 1.5, `item ${it.index}: ${it.width}x${row.height} vs ${MIX[it.index]}`)
  }
})

test('last row is not stretched past the target and is left-aligned', () => {
  const l = justify([1, 1, 1, 1, 1], 1000, { target: 220, gap: GAP }) // 4 squares fill at 245px (x1.12, vs 5 at 195px, /1.13): one left over
  assert.equal(l.rows.length, 2)
  assert.equal(l.rows[0].height, 246)
  const last = l.rows.at(-1)
  assert.equal(last.height, 220)
  assert.equal(last.items[0].left, 0)
  assert.equal(last.items[0].width, 220)
  assert.ok(rowWidth(last) < 1000)
})

test('a single item: target height, real ratio, never wider than the container', () => {
  assert.deepEqual(justify([16 / 9], 1000, { target: 220 }).rows, [{ top: 0, height: 220, items: [{ index: 0, left: 0, width: 391 }] }])
  const narrow = justify([16 / 9], 300, { target: 220 }) // full width would be only 169px tall: it fits the width instead
  assert.equal(narrow.rows[0].items[0].width, 300)
  assert.equal(narrow.rows[0].height, 169)
  assert.equal(narrow.height, 169)
})

test('extreme panoramas and tall strips are clamped to sane boxes', () => {
  assert.equal(clampRatio(20), MAX_RATIO)
  assert.equal(clampRatio(0.01), MIN_RATIO)
  assert.equal(clampRatio(0), 1)
  assert.equal(clampRatio(NaN), 1)
  assert.equal(clampRatio(undefined), 1)
  assert.equal(clampRatio(-2), 1)
  const l = justify([50, 0.02, 50, 0.02, 1], 900, { target: 220, gap: GAP })
  checkShape(l, 5, 900)
  for (const row of l.rows) for (const it of row.items) {
    const r = it.width / row.height
    assert.ok(r <= MAX_RATIO + 0.02 && r >= MIN_RATIO - 0.02, `box ratio ${r} clamped`)
  }
  const pano = justify([50], 343, { target: 140 }) // one panorama on a phone: full width, 3:1
  assert.equal(pano.rows[0].items[0].width, 343)
  assert.equal(pano.rows[0].height, 114)
})

test('empty, zero width and bad ratios', () => {
  assert.deepEqual(justify([], 800), { rows: [], height: 0 })
  assert.deepEqual(justify([1, 2], 0), { rows: [], height: 0 })
  const l = justify([null, 'x', 1.5], 600, { target: 200, gap: GAP })
  checkShape(l, 3, 600)
})

test('row breaks pick the height closest to the target (by ratio)', () => {
  // phone: a 16:9 alone is 202px (x1.44 of 140), with a 21:9 beside it only 85px (/1.65) → it stays alone
  const p = justify([16 / 9, 21 / 9], 359, { target: 140, gap: 8 })
  assert.deepEqual(p.rows.map(r => r.items.length), [1, 1])
  assert.equal(p.rows[0].height, 202)
  // two 3:1 panoramas at 1000px: alone each is 333px tall (x1.51), together 166px (/1.33) → together
  const l = justify([3, 3], 1000, { target: 220, gap: GAP })
  assert.equal(l.rows.length, 1)
  assert.equal(rowWidth(l.rows[0]), 1000)
  // a tall cover joins the next row instead of standing alone at full width
  const t = justify([0.5, 1, 1, 1], 600, { target: 220, gap: GAP })
  assert.ok(t.rows.every(r => r.height <= 330))
})

test('targetHeight: ~220 on desktop, ~140 on phones', () => {
  assert.equal(targetHeight(1200), 220)
  assert.equal(targetHeight(343), 140)
})

test('checkFiles: images and videos only, 25 MB, 10 per post', () => {
  const f = (name, type, size = 1000) => ({ name, type, size })
  const { ok, errors } = checkFiles([f('a.png', 'image/png'), f('b.pdf', 'application/pdf'), f('c.mp4', 'video/mp4', 30 * 1048576), f('d.webm', 'video/webm')])
  assert.deepEqual(ok.map(x => x.name), ['a.png', 'd.webm'])
  assert.deepEqual(errors, ["b.pdf isn't an image or video.", 'c.mp4 is 30 MB. The limit is 25 MB.'])
  const many = checkFiles(Array.from({ length: 5 }, (_, i) => f(i + '.jpg', 'image/jpeg')), 8)
  assert.equal(many.ok.length, 2)
  assert.deepEqual(many.errors, ['A post can hold up to 10 pictures or videos.'])
})

test('mediaItem: the shape create_gallery_post accepts', () => {
  assert.deepEqual(mediaItem({ url: 'u', type: 'image/webp', w: 1599.6, h: 900, alt: '  a fox ', spoiler: false, poster: null }),
    { url: 'u', type: 'image/webp', w: 1600, h: 900, alt: 'a fox' })
  assert.deepEqual(mediaItem({ url: 'v', type: 'video/webm', w: 0, h: undefined, poster: 'p', spoiler: true, alt: ' ' }),
    { url: 'v', type: 'video/webm', w: 1, h: 1, poster: 'p', spoiler: true })
})

test('sorting and merging posts', () => {
  const a = { id: 'a', created_at: '2026-01-01T00:00:00Z', comment_count: 5, last_activity_at: '2026-01-02T00:00:00Z' }
  const b = { id: 'b', created_at: '2026-01-03T00:00:00Z', comment_count: 0, last_activity_at: '2026-01-03T00:00:00Z' }
  const c = { id: 'c', created_at: '2026-01-02T00:00:00Z', comment_count: 5, last_activity_at: '2026-01-04T00:00:00Z' }
  assert.deepEqual([a, b, c].sort(comparePosts('new')).map(p => p.id), ['b', 'c', 'a'])
  assert.deepEqual([a, b, c].sort(comparePosts('active')).map(p => p.id), ['c', 'a', 'b'])
  const merged = mergePosts([{ ...a, mine: true }, b], [{ id: 'a', comment_count: 6 }, c], 'new')
  assert.deepEqual(merged.map(p => p.id), ['b', 'c', 'a'])
  assert.equal(merged[2].comment_count, 6)
  assert.equal(merged[2].mine, true) // live rows don't carry it; the old value stays
})

test('new-comment dots only on posts you commented on', () => {
  assert.equal(hasNewComments({ last_comment_id: 10 }, 5, true), true)
  assert.equal(hasNewComments({ last_comment_id: 10 }, 10, true), false)
  assert.equal(hasNewComments({ last_comment_id: 10 }, undefined, true), true)
  assert.equal(hasNewComments({ last_comment_id: 10 }, 5, false), false)
  assert.equal(hasNewComments({ last_comment_id: null }, undefined, true), false)
  assert.equal(comments(1), '1 comment')
  assert.equal(comments(0), '0 comments')
})

test('timeAgo', () => {
  const now = Date.parse('2026-01-02T12:00:00Z')
  assert.equal(timeAgo('2026-01-02T11:59:50Z', now), 'just now')
  assert.equal(timeAgo('2026-01-02T11:57:00Z', now), '3m ago')
  assert.equal(timeAgo('2026-01-02T10:00:00Z', now), '2h ago')
  assert.equal(timeAgo('2025-12-30T12:00:00Z', now), '3d ago')
  assert.equal(timeAgo('2026-01-02T12:00:10Z', now), 'just now') // clock skew
})

test('post routes', () => {
  const id = '0f6c8a52-1b9e-4c3d-9a7e-2d4b5c6e7f80'
  assert.equal(postPath('s1', 'g1', id), `#/s/s1/g1/p/${id}`)
  assert.equal(postPath('s1', 'g1'), '#/s/s1/g1')
  assert.equal(postIdOf(`#/s/s1/g1/p/${id}`), id)
  assert.equal(postIdOf('#/s/s1/g1'), null)
  assert.equal(postIdOf('#/s/s1/g1/123'), null)
})
