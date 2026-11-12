// Avatar setups (039_avatar_setups): your saved PNGtuber looks, wearing one, and .chitpal import/export.
// Wearing copies the look into your profile's avatar columns, so everyone sees it through the usual profile feed;
// pingProfile() nudges them to refetch at once instead of waiting on realtime.
import { supabase } from './supabase'
import { createStore, pingProfile, primeProfiles, profiles } from './store'
import { uploadFile } from './upload'
import { isAnimatedWebp } from './crop'
import { cleanLook, copyName, switchPatch, basePatch, slotImage, MAX_SETUPS } from './avatarLook'
import { decodeChitpal, encodeChitpal, chitpalFilename, ChitpalError, MAX_FILE_BYTES, SLOTS } from './chitpal'

// { owner, loaded, list } for the signed-in person
export const mySetups = createStore({ owner: null, loaded: false, list: [] })
const setList = (owner, f) => mySetups.set(s => ({ owner, loaded: true, list: f(s.owner === owner ? s.list : []) }))

export async function loadSetups(meId) {
  const { data, error } = await supabase.from('avatar_setups').select('*').eq('owner_id', meId).order('position').order('created_at')
  if (error) throw error
  mySetups.set({ owner: meId, loaded: true, list: data })
  return data
}

async function patchProfile(meId, patch) {
  const prev = profiles.get()[meId]
  primeProfiles([{ ...prev, ...patch }]) // you see it at once
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', meId).select().single()
  if (error) { primeProfiles([prev]); throw error }
  primeProfiles([data])
  pingProfile(meId)
  return data
}

// setup = a row, or null for the plain profile picture.
export const wearSetup = (meId, setup) => patchProfile(meId, switchPatch(profiles.get()[meId], setup))
export const setBasePicture = (meId, img) => patchProfile(meId, basePatch(profiles.get()[meId], img))

// Insert (no id) or update. Saving the one you're wearing re-wears it so the change shows.
export async function saveSetup(meId, { id, name, look, creator }, { wear = false } = {}) {
  const row = { name: String(name).trim().slice(0, 40) || 'Avatar', look: cleanLook(look) }
  if (creator !== undefined) row.creator = creator
  let res
  if (id) res = await supabase.from('avatar_setups').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  else {
    if (mySetups.get().owner === meId && mySetups.get().list.length >= MAX_SETUPS) throw new Error(`You can keep up to ${MAX_SETUPS} avatars. Delete one to make room.`)
    const position = Math.max(0, ...mySetups.get().list.map(s => s.position + 1))
    res = await supabase.from('avatar_setups').insert({ ...row, owner_id: meId, position }).select().single()
  }
  if (res.error) throw res.error
  const saved = res.data
  setList(meId, l => id ? l.map(s => s.id === id ? saved : s) : [...l, saved])
  if (wear || profiles.get()[meId]?.avatar_setup === saved.id) await wearSetup(meId, saved)
  return saved
}

export function duplicateSetup(meId, setup) {
  return saveSetup(meId, { name: copyName(setup.name, mySetups.get().list.map(s => s.name)), look: setup.look, creator: setup.creator ?? null })
}

// Images stay in storage (a duplicate may share them).
export async function deleteSetup(meId, setup) {
  if (profiles.get()[meId]?.avatar_setup === setup.id) await wearSetup(meId, null)
  const { error } = await supabase.from('avatar_setups').delete().eq('id', setup.id)
  if (error) throw error
  setList(meId, l => l.filter(s => s.id !== setup.id))
}

// ── .chitpal export ──
async function bytesOf(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error("Couldn't fetch one of this avatar's images.")
  return new Uint8Array(await r.arrayBuffer())
}

export async function exportSetup(setup, creator) {
  const images = {}
  for (const slot of SLOTS) {
    const img = slotImage(setup.look, slot)
    if (img) images[slot] = { bytes: await bytesOf(img.url), crop: img.crop }
  }
  const text = encodeChitpal({ name: setup.name, creator: setup.creator || creator, images })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = chitpalFilename(setup.name)
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

// ── .chitpal import ──
// The format checks already passed; now the browser has to actually decode each image at the size it claimed.
// Stills are redrawn through a canvas into a fresh PNG (drops metadata and anything smuggled after the image data);
// animated GIF/WebP keep their original bytes, since a canvas would flatten them to one frame.
async function reencode(slot, e) {
  const blob = new Blob([e.bytes], { type: e.type })
  let bmp
  try { bmp = await createImageBitmap(blob) } catch { throw new ChitpalError(`The ${slot.replace('_', ' ')} image couldn't be opened.`) }
  if (bmp.width !== e.w || bmp.height !== e.h) { bmp.close?.(); throw new ChitpalError(`The ${slot.replace('_', ' ')} image isn't the size it says.`) }
  const animated = e.type === 'image/gif' || (e.type === 'image/webp' && isAnimatedWebp(e.bytes.subarray(0, 32)))
  if (animated) { bmp.close?.(); return new File([blob], `${slot}.${e.type === 'image/gif' ? 'gif' : 'webp'}`, { type: e.type }) }
  const c = document.createElement('canvas')
  c.width = bmp.width; c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close?.()
  const png = await new Promise(res => c.toBlob(res, 'image/png'))
  if (!png) throw new ChitpalError(`The ${slot.replace('_', ' ')} image couldn't be redrawn.`)
  return new File([png], `${slot}.png`, { type: 'image/png' })
}

// Reads a picked file and returns the decoded avatar (nothing uploaded yet): { name, creator, images }.
export async function readChitpal(file) {
  if (!file) throw new ChitpalError('No file picked.')
  if (file.size > MAX_FILE_BYTES) throw new ChitpalError(`That file is ${(file.size / 1048576).toFixed(1)} MB. Avatar files can be up to ${MAX_FILE_BYTES / 1048576} MB.`)
  return decodeChitpal(new Uint8Array(await file.arrayBuffer()))
}

// Re-encodes and uploads every image to your storage, then saves it as a new setup. onStep(done, total) for progress.
export async function importChitpal(meId, decoded, onStep) {
  const slots = Object.keys(decoded.images)
  const files = []
  for (const s of slots) files.push(await reencode(s, decoded.images[s])) // all checked before anything uploads
  let look = { avatar_states: {} }, done = 0
  for (let i = 0; i < slots.length; i++) {
    const { url } = await uploadFile(files[i], meId)
    const crop = decoded.images[slots[i]].crop // usually null for stills (they come pre-cropped); already clamped
    if (slots[i] === 'idle') Object.assign(look, { avatar_idle: url, avatar_crop: crop })
    else if (slots[i] === 'talk') Object.assign(look, { avatar_talk: url, avatar_talk_crop: crop })
    else look.avatar_states[slots[i]] = crop ? { url, crop } : { url }
    onStep?.(++done, slots.length)
  }
  const taken = mySetups.get().list.map(s => s.name)
  const name = taken.includes(decoded.name) ? copyName(decoded.name, taken) : decoded.name
  return saveSetup(meId, { name, look, creator: decoded.creator })
}
