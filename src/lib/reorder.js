// Pure ordering helpers for channels, categories and the server rail.

const pos = x => x.position ?? 1e12
export const byPosition = list => [...list].sort((a, b) => pos(a) - pos(b))

// [{ cat: null, channels }, { cat, channels }…]: uncategorised first, then categories in order.
export function groupChannels(channels, categories) {
  const cats = byPosition(categories), known = new Set(cats.map(c => c.id)), sorted = byPosition(channels)
  return [
    { cat: null, channels: sorted.filter(c => !known.has(c.category_id)) },
    ...cats.map(cat => ({ cat, channels: sorted.filter(c => c.category_id === cat.id) })),
  ]
}

// Move id to `index` in ids, where index counts with id still in place (a drop line above item `index`).
export function moveId(ids, id, index) {
  const out = ids.filter(x => x !== id), from = ids.indexOf(id)
  out.splice(from !== -1 && from < index ? index - 1 : index, 0, id)
  return out
}

// Drop channel `id` into category `toCat` (null = uncategorised) at `index`.
// Returns only the rows that changed: [{ id, position, category_id }]. Positions are renumbered server-wide.
export function moveChannel(groups, id, toCat, index) {
  const lists = groups.map(g => ({ cat: g.cat?.id ?? null, ids: g.channels.map(c => c.id).filter(x => x !== id) }))
  const from = groups.find(g => g.channels.some(c => c.id === id))
  const to = lists.find(l => l.cat === (toCat ?? null))
  if (!from || !to) return []
  // index was measured with the item present; correct for its removal when moving down within a group
  const oldIdx = (from.cat?.id ?? null) === to.cat ? from.channels.findIndex(c => c.id === id) : -1
  to.ids.splice(oldIdx !== -1 && oldIdx < index ? index - 1 : index, 0, id)
  const old = new Map(groups.flatMap(g => g.channels).map(c => [c.id, c]))
  const items = []
  let p = 0
  for (const l of lists) for (const cid of l.ids) {
    const c = old.get(cid), position = p++
    if (c.position !== position || (c.category_id ?? null) !== l.cat) items.push({ id: cid, position, category_id: l.cat })
  }
  return items
}

// Reorder categories; returns changed rows [{ id, position }].
export function moveCategory(categories, id, index) {
  const old = new Map(categories.map(c => [c.id, c]))
  return moveId(byPosition(categories).map(c => c.id), id, index)
    .map((cid, position) => ({ id: cid, position }))
    .filter(x => old.get(x.id).position !== x.position)
}

// Merge changed rows into a list (optimistic update).
export function applyItems(rows, items) {
  const m = new Map(items.map(i => [i.id, i]))
  return rows.map(r => m.has(r.id) ? { ...r, ...m.get(r.id) } : r)
}

// Next id from current in direction dir (+1/-1), wrapping, among ids where ok(id). Null if none.
export function step(ids, current, dir, ok = () => true) {
  const n = ids.length, start = ids.indexOf(current)
  for (let k = 1; k <= n; k++) {
    const id = ids[(((start === -1 ? (dir > 0 ? -1 : 0) : start) + dir * k) % n + n) % n]
    if (id !== current && ok(id)) return id
  }
  return null
}
