import { supabase } from './supabase'
import { createStore } from './store'

// Emoji from the servers you're in (null until loaded), and id -> row | null (gone) for rendering any emoji.
export const myEmoji = createStore(null)
export const emojiById = createStore({})

let loading
export function loadMyEmoji(force) {
  if (loading && !force) return loading
  loading = supabase.from('server_emoji').select('*, servers(name, icon_url)').order('created_at').then(({ data, error }) => {
    if (error) { loading = null; return }
    myEmoji.set(data)
    emojiById.set(s => ({ ...s, ...Object.fromEntries(data.map(e => [e.id, e])) }))
  })
  return loading
}

export function forgetEmoji(id) {
  emojiById.set(s => ({ ...s, [id]: null }))
  myEmoji.set(l => l && l.filter(e => e.id !== id))
}

// Batches lookups of emoji seen in messages (possibly from servers you're not in).
const queue = new Set(), asked = new Set()
let timer = null
export function ensureEmoji(id) {
  if (id in emojiById.get() || asked.has(id)) return
  asked.add(id)
  queue.add(id)
  timer ??= setTimeout(async () => {
    const ids = [...queue].slice(0, 200)
    ids.forEach(i => queue.delete(i))
    timer = null
    const { data, error } = await supabase.rpc('emoji_lookup', { ids })
    if (error) return ids.forEach(i => asked.delete(i))
    emojiById.set(s => {
      const n = { ...s }
      for (const i of ids) n[i] ??= null
      for (const e of data) n[e.id] = { ...n[e.id], ...e }
      return n
    })
    if (queue.size) { const [next] = queue; queue.delete(next); asked.delete(next); ensureEmoji(next) }
  }, 30)
}
