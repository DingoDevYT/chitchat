// Drawing Duel Hall of Fame, the Supabase side (migration 045): saving your own winning champion, reading a server's
// hall, removing entries, the "Don't save my champions" opt-out and sharing a card into a text room.
// Saving happens in the artist's browser because only it has the recorded clip in memory for sure (the table's
// `battle-cries` folder is wiped when it closes) and can draw the PNG thumbnail; save_duel_champion() then checks the
// claim against the referee-written games.pub and takes the drawing, title and record from there, not from us.
import { useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadFile } from '../../lib/upload'
import { app } from '../../menus'
import { audio, cryBlob } from './audio.js'
import { HALL_BUCKET, canSave, hallPaths, renderThumb, shareText } from './hall.js'

export const serverOf = channelId => app.channels?.find(c => c.id === channelId)?.server_id ?? app.ctx?.server?.id ?? null

// ── the opt-out (one row per person; null until loaded) ──
let optOut = null
const subs = new Set()
const emit = () => subs.forEach(f => f())
export async function loadOptOut() {
  const uid = app.ctx?.userId
  if (!uid) return false
  const { data } = await supabase.from('duel_hall_optout').select('user_id').eq('user_id', uid).maybeSingle()
  optOut = !!data; emit()
  return optOut
}
export async function setOptOut(on) {
  const uid = app.ctx?.userId
  const before = optOut
  optOut = on; emit()
  const { error } = on
    ? await supabase.from('duel_hall_optout').upsert({ user_id: uid })
    : await supabase.from('duel_hall_optout').delete().eq('user_id', uid)
  if (error) { optOut = before; emit(); throw error }
}
export function useOptOut() {
  return useSyncExternalStore(f => { subs.add(f); if (optOut === null) loadOptOut().catch(() => {}); return () => subs.delete(f) }, () => optOut)
}

// ── saving ──
const tried = new Set() // game:champ:wins already sent this session
export async function saveChampion(game, v, key, me) {
  if (!game?.id || game.id === 'lab' || !canSave(v, key, me).ok) return null
  const wins = v.log.filter(l => l[l.w] === key).length
  const once = `${game.id}:${key}:${wins}`
  if (tried.has(once)) return null
  tried.add(once)
  if ((optOut ?? (await loadOptOut().catch(() => false))) === true) return null
  const sid = serverOf(game.channel_id)
  if (!sid) return null
  const c = v.champs[key], round = +key.split('#')[1]
  const paths = hallPaths(sid, me, game.id, round, c.cry?.ext)
  const store = supabase.storage.from(HALL_BUCKET)
  let thumb = null, cry = null
  try {
    const png = await renderThumb(c.art)
    if (png && !(await store.upload(paths.thumb, png, { upsert: true, contentType: 'image/png', cacheControl: '3600' })).error) thumb = paths.thumb
  } catch (e) { console.warn('hall thumbnail', e?.message) }
  if (paths.cry) {
    try {
      const blob = await cryBlob(game.id, me, c.cry)
      if (blob && !(await store.upload(paths.cry, blob, { upsert: true, contentType: blob.type || 'audio/wav', cacheControl: '3600' })).error) cry = paths.cry
    } catch (e) { console.warn('hall battle cry', e?.message) }
  }
  const { data, error } = await supabase.rpc('save_duel_champion', { gid: game.id, champ: key, thumb, cry_path: cry })
  if (error) { console.warn('hall save', error.message); if (error.hint !== 'opted_out') tried.delete(once); return null }
  return data
}

// ── reading ──
export async function loadHall(serverId, by = 'new', limit = 60) {
  let q = supabase.from('duel_hall').select('*').eq('server_id', serverId)
  q = by === 'votes' ? q.order('votes', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false })
  const { data, error } = await q.limit(limit)
  if (error) throw error
  return data
}

const urls = new Map() // path → signed URL (an hour; refreshed per page load)
export async function thumbUrls(rows) {
  const need = rows.map(r => r.thumb).filter(p => p && !urls.has(p))
  if (need.length) {
    const { data } = await supabase.storage.from(HALL_BUCKET).createSignedUrls(need, 3600)
    for (const d of data || []) if (d.signedUrl) urls.set(d.path, d.signedUrl)
  }
  return Object.fromEntries(rows.filter(r => urls.has(r.thumb)).map(r => [r.id, urls.get(r.thumb)]))
}

const clips = new Map() // path → Promise<AudioBuffer|null>
export function loadHallCry(row) {
  const path = row.cry?.path
  if (!path) return Promise.resolve(null)
  if (!clips.has(path)) clips.set(path, (async () => {
    try {
      const { data, error } = await supabase.storage.from(HALL_BUCKET).download(path)
      if (error) throw error
      return await audio().decodeAudioData(await data.arrayBuffer())
    } catch (e) { console.warn('hall clip missing', e?.message); clips.delete(path); return null }
  })())
  return clips.get(path)
}

// ── removing (the row first; then its files, which only the Storage API can delete) ──
export async function removeEntry(row) {
  const { error } = await supabase.from('duel_hall').delete().eq('id', row.id)
  if (error) throw error
  const files = [row.thumb, row.cry?.path].filter(Boolean)
  if (files.length) await supabase.storage.from(HALL_BUCKET).remove(files).catch(() => {})
}

// ── sharing: a message with the card text and the thumbnail as an image ──
export async function shareToChat(row, channelId, artist) {
  const uid = app.ctx?.userId
  let attachments = []
  if (row.thumb) {
    const { data } = await supabase.storage.from(HALL_BUCKET).download(row.thumb)
    if (data) {
      attachments = [await uploadFile(new File([data], 'champion.png', { type: 'image/png' }), uid)]
    }
  }
  const { error } = await supabase.from('messages').insert({ channel_id: channelId, author_id: uid, content: shareText(row, artist), attachments })
  if (error) throw error
}
