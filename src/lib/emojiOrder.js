// Your own order for server sections in the emoji picker (pref `emojiServerOrder`), separate from the server rail.
// Servers you haven't placed keep their natural order after the placed ones.
export const sortByOrder = (items, order = []) =>
  [...items].sort((a, b) => rank(order, a.id, items) - rank(order, b.id, items))
const rank = (order, id, items) => { const i = order.indexOf(id); return i < 0 ? order.length + items.findIndex(x => x.id === id) : i }

// Move `id` to where `to` is (a server id), or by `to` steps (a number). Returns the new full order.
export function moveIn(ids, id, to) {
  const from = ids.indexOf(id)
  const at = typeof to === 'number' ? from + to : ids.indexOf(to)
  if (from < 0 || at < 0 || at >= ids.length || at === from) return ids
  const out = ids.filter(x => x !== id)
  out.splice(at, 0, id)
  return out
}
