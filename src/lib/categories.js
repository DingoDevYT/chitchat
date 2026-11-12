import { useEffect } from 'react'
import { freshChannel, supabase } from './supabase'
import { createStore } from './store'

// serverId -> [{ id, server_id, name, position }]
export const categories = createStore({})
const EMPTY = []

export function setCategories(sid, fn) {
  categories.set(s => ({ ...s, [sid]: fn(s[sid] || EMPTY) }))
}

// Loads a server's categories and keeps them live while mounted.
export function useCategories(sid) {
  const list = categories.use(s => s[sid] || EMPTY)
  useEffect(() => {
    if (!sid) return
    let gone = false
    const upsert = ({ new: row }) =>
      setCategories(sid, l => l.some(c => c.id === row.id) ? l.map(c => c.id === row.id ? { ...c, ...row } : c) : [...l, row])
    supabase.from('categories').select('*').eq('server_id', sid).then(({ data }) => { if (data && !gone) setCategories(sid, () => data) })
    const ch = freshChannel('categories:' + sid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories', filter: `server_id=eq.${sid}` }, upsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'categories', filter: `server_id=eq.${sid}` }, upsert)
      // DELETE events can't be filtered and only carry the id
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories' }, ({ old }) =>
        setCategories(sid, l => l.filter(c => c.id !== old.id)))
      .subscribe()
    return () => { gone = true; supabase.removeChannel(ch) }
  }, [sid])
  return list
}
