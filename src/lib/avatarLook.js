// Avatar setups (039_avatar_setups): pure helpers, no network.
// A "look" uses the same keys as the profile columns it gets copied into when worn:
//   { avatar_idle, avatar_crop, avatar_talk, avatar_talk_crop, avatar_states: { typing: { url, crop }, ... } }
// so pickExpression() can draw a setup straight from its look (previews, thumbnails).
import { SLOTS } from './chitpal.js'

export const MAX_SETUPS = 30
const STATE_SLOTS = SLOTS.filter(s => s !== 'idle' && s !== 'talk')
const isUrl = u => typeof u === 'string' && /^(https?:|blob:|data:image\/)/.test(u)
const cropOrNull = c => (c && typeof c === 'object' && !Array.isArray(c) ? c : null)

// The image in one slot: { url, crop } or null.
export function slotImage(look, slot) {
  if (!look) return null
  if (slot === 'idle') return isUrl(look.avatar_idle) ? { url: look.avatar_idle, crop: cropOrNull(look.avatar_crop) } : null
  if (slot === 'talk') return isUrl(look.avatar_talk) ? { url: look.avatar_talk, crop: cropOrNull(look.avatar_talk_crop) } : null
  const s = look.avatar_states?.[slot]
  return s && isUrl(s.url) ? { url: s.url, crop: cropOrNull(s.crop) } : null
}

// A new look with one slot set (img = { url, crop }) or cleared (img = null).
export function setSlot(look, slot, img) {
  const n = cleanLook(look)
  if (slot === 'idle') { n.avatar_idle = img?.url || null; n.avatar_crop = img?.crop || null }
  else if (slot === 'talk') { n.avatar_talk = img?.url || null; n.avatar_talk_crop = img?.crop || null }
  else if (STATE_SLOTS.includes(slot)) {
    const st = { ...n.avatar_states }
    if (img?.url) st[slot] = img.crop ? { url: img.url, crop: img.crop } : { url: img.url }
    else delete st[slot]
    n.avatar_states = st
  }
  return cleanLook(n)
}

// Known keys only, nulls dropped (looks come from other people's rows and files).
export function cleanLook(look) {
  const n = { avatar_states: {} }
  for (const slot of SLOTS) {
    const img = slotImage(look, slot)
    if (!img) continue
    if (slot === 'idle') { n.avatar_idle = img.url; if (img.crop) n.avatar_crop = img.crop }
    else if (slot === 'talk') { n.avatar_talk = img.url; if (img.crop) n.avatar_talk_crop = img.crop }
    else n.avatar_states[slot] = img.crop ? { url: img.url, crop: img.crop } : { url: img.url }
  }
  return n
}

export const imageCount = look => SLOTS.filter(s => slotImage(look, s)).length

// The look someone is wearing right now (their profile columns).
export const lookOf = p => cleanLook(p)

// Every avatar column, so wearing a look also clears whatever the last one had.
export function columnsFor(look) {
  const l = cleanLook(look)
  return {
    avatar_idle: l.avatar_idle || null, avatar_crop: l.avatar_crop || null,
    avatar_talk: l.avatar_talk || null, avatar_talk_crop: l.avatar_talk_crop || null,
    avatar_states: l.avatar_states,
  }
}

// The plain profile picture ({ url, crop } or null = the critter). With no setup on, it's simply avatar_idle.
export function baseOf(p) {
  if (!p) return null
  if (p.avatar_setup) return p.avatar_base?.url ? { url: p.avatar_base.url, crop: cropOrNull(p.avatar_base.crop) } : null
  return isUrl(p.avatar_idle) ? { url: p.avatar_idle, crop: cropOrNull(p.avatar_crop) } : null
}
const baseJson = b => (b?.url ? (b.crop ? { url: b.url, crop: b.crop } : { url: b.url }) : null)

// Profile patch to wear `setup` (a row with id + look), or to go back to the plain picture (setup = null).
export function switchPatch(p, setup) {
  const base = baseOf(p)
  if (!setup) return { avatar_setup: null, avatar_base: null, ...columnsFor({ avatar_idle: base?.url, avatar_crop: base?.crop }) }
  return { avatar_setup: setup.id, avatar_base: baseJson(base), ...columnsFor(setup.look) }
}

// Profile patch for a new plain profile picture (img = { url, crop } or null). Only shows if no setup is on.
export function basePatch(p, img) {
  if (p?.avatar_setup) return { avatar_base: baseJson(img) }
  return { avatar_base: null, avatar_idle: img?.url || null, avatar_crop: img?.crop || null }
}

// "Sleepy fox" -> "Sleepy fox (copy)", "Sleepy fox (copy 2)"... within 40 characters, avoiding names in use.
export function copyName(name, taken = []) {
  const root = String(name || 'Avatar').replace(/ \(copy(?: \d+)?\)$/, '')
  for (let i = 1; ; i++) {
    const tag = i === 1 ? ' (copy)' : ` (copy ${i})`
    const n = root.slice(0, 40 - tag.length) + tag
    if (!taken.includes(n)) return n
  }
}
