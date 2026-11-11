// People you've blocked: blockedId -> true. Only you can see your own blocks (RLS).
import { supabase } from './supabase'
import { createStore, toast } from './store'

export const blocks = createStore({})
export const isBlocked = id => !!blocks.get()[id]
export const useBlocked = id => blocks.use(s => !!s[id])

async function load() {
  const { data } = await supabase.from('blocks').select('blocked')
  if (data) blocks.set(Object.fromEntries(data.map(r => [r.blocked, true])))
}
supabase.auth.onAuthStateChange((event, session) => {
  if (!session) blocks.set({})
  else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') load()
})

const put = (id, on) => blocks.set(s => { const n = { ...s }; if (on) n[id] = true; else delete n[id]; return n })

// Blocking also ends any friendship (a DB trigger does that).
export async function block(id) {
  put(id, true)
  const { error } = await supabase.from('blocks').insert({ blocked: id })
  if (error && error.code !== '23505') { put(id, false); toast(error.message) }
}
export async function unblock(id) {
  put(id, false)
  const { error } = await supabase.from('blocks').delete().eq('blocked', id)
  if (error) { put(id, true); toast(error.message) }
}
