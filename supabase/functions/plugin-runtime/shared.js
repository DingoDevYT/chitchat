// Pure plugin helpers shared by the plugin-runtime and bot-api edge functions and the app
// (tested in src/lib/plugins.test.js). Only WebCrypto, which Deno, browsers and Node all have.

export const EVENTS = ['message_created', 'bot_mentioned', 'member_joined', 'reaction_added']
export const SCOPES = ['send_messages', 'read_messages', 'add_reactions', 'manage_roles', 'timeout_members']
export const OPTION_TYPES = ['string', 'integer', 'number', 'boolean', 'user', 'room']
export const MAX_CONTENT = 4000

// ── templates: {user} {mention} {server} {room} {args} and {random:a|b|c} ──
// Variables first, so {random:hi {user}|yo} works. Unknown {words} stay as they are.
export function renderTemplate(tpl, vars, rng = Math.random) {
  const withVars = String(tpl ?? '').replace(/\{([a-z]+)\}/gi, (all, k) => (vars[k.toLowerCase()] == null ? all : String(vars[k.toLowerCase()])))
  return withVars.replace(/\{random:([^{}]*)\}/gi, (all, opts) => {
    const list = opts.split('|')
    return list[Math.floor(rng() * list.length)] ?? ''
  }).slice(0, MAX_CONTENT)
}

// ── embeds: { title, url, description, color, fields[{name,value,inline}], image{url}, thumbnail{url}, footer{text} } ──
const httpsUrl = u => {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && x.href.length <= 2048 ? x.href : undefined } catch { return undefined }
}
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)
const colour = c => typeof c === 'number' && c >= 0 ? '#' + (c & 0xffffff).toString(16).padStart(6, '0')
  : typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c) ? '#' + c.replace('#', '').toLowerCase() : undefined

// Throws a friendly Error for the wrong shape; quietly trims long text and drops non-https links.
export function cleanEmbeds(list) {
  if (list == null) return []
  if (!Array.isArray(list)) throw new Error('embeds must be a list')
  if (list.length > 5) throw new Error('up to 5 embeds per message')
  return list.map((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error(`embed ${i + 1} must be an object`)
    if (e.fields != null && !Array.isArray(e.fields)) throw new Error(`embed ${i + 1}: fields must be a list`)
    const out = {
      title: str(e.title, 256),
      url: e.url ? httpsUrl(e.url) : undefined,
      description: str(e.description, 4000),
      color: colour(e.color),
      fields: e.fields?.length ? e.fields.slice(0, 25).map(f => ({
        name: str(f?.name, 256) || '-', value: str(f?.value, 1024) || '-', inline: !!f?.inline })) : undefined,
      image: e.image?.url && httpsUrl(e.image.url) ? { url: httpsUrl(e.image.url) } : undefined,
      thumbnail: e.thumbnail?.url && httpsUrl(e.thumbnail.url) ? { url: httpsUrl(e.thumbnail.url) } : undefined,
      footer: str(typeof e.footer === 'string' ? e.footer : e.footer?.text, 2048) ? { text: str(typeof e.footer === 'string' ? e.footer : e.footer.text, 2048) } : undefined,
    }
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
    if (!out.title && !out.description && !out.fields && !out.image) throw new Error(`embed ${i + 1} needs a title, description, fields or an image`)
    if (JSON.stringify(out).length > 8000) throw new Error(`embed ${i + 1} is too big (keep it under about 6000 characters)`)
    return out
  })
}

// ── slash command definitions (bot-api PUT /commands) ──
const CMD = /^[a-z0-9][a-z0-9_-]{0,31}( [a-z0-9][a-z0-9_-]{0,31})?$/
const OPT = /^[a-z0-9_-]{1,32}$/
export function cleanCommands(list) {
  if (!Array.isArray(list)) throw new Error('send a list of commands')
  if (list.length > 50) throw new Error('up to 50 commands')
  const seen = new Set()
  return list.map(c => {
    const name = String(c?.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!CMD.test(name)) throw new Error(`bad command name "${name}": use lowercase letters, numbers, - and _ (one word, or two like "dice roll")`)
    if (seen.has(name)) throw new Error(`two commands are called /${name}`)
    seen.add(name)
    const opts = c.options ?? []
    if (!Array.isArray(opts) || opts.length > 10) throw new Error(`/${name}: options must be a list of up to 10`)
    const names = new Set()
    let optional = false
    return {
      name,
      description: String(c.description ?? '').slice(0, 100),
      options: opts.map(o => {
        const on = String(o?.name ?? '').trim().toLowerCase()
        if (!OPT.test(on)) throw new Error(`/${name}: bad option name "${on}"`)
        if (names.has(on)) throw new Error(`/${name}: two options are called ${on}`)
        names.add(on)
        const type = o.type ?? 'string'
        if (!OPTION_TYPES.includes(type)) throw new Error(`/${name} ${on}: type must be one of ${OPTION_TYPES.join(', ')}`)
        const required = !!o.required
        if (required && optional) throw new Error(`/${name}: put required options before optional ones`)
        optional ||= !required
        let choices
        if (o.choices != null) {
          if (!Array.isArray(o.choices) || o.choices.length > 25) throw new Error(`/${name} ${on}: choices must be a list of up to 25`)
          choices = o.choices.map(x => String(x).slice(0, 100))
        }
        return { name: on, type, description: String(o.description ?? '').slice(0, 100), required, ...(choices && { choices }) }
      }),
    }
  })
}

// ── option values ──
// Raw text (or a JSON value) → the typed value, or throws a friendly Error.
export function coerceOption(opt, raw) {
  let v = typeof raw === 'string' ? raw.trim() : raw
  const s = String(v ?? '')
  switch (opt.type) {
    case 'integer':
      if (!(typeof v === 'number' && Number.isInteger(v)) && !/^-?\d{1,15}$/.test(s)) throw new Error(`${opt.name} should be a whole number`)
      v = Number(v); break
    case 'number':
      if (!(typeof v === 'number' && Number.isFinite(v)) && !/^-?\d{1,15}(\.\d+)?$/.test(s)) throw new Error(`${opt.name} should be a number`)
      v = Number(v); break
    case 'boolean':
      if (typeof v === 'boolean') break
      if (/^(yes|y|true|on|1)$/i.test(s)) v = true
      else if (/^(no|n|false|off|0)$/i.test(s)) v = false
      else throw new Error(`${opt.name} should be yes or no`)
      break
    case 'user':
      v = s.replace(/^@/, '').toLowerCase()
      if (!/^[a-z0-9_.]{2,32}$/.test(v)) throw new Error(`${opt.name} should be an @person`)
      break
    case 'room':
      v = s.replace(/^~/, '').trim()
      if (!v || v.length > 64) throw new Error(`${opt.name} should be a room name`)
      break
    default:
      v = s
      if (v.length > 1000) throw new Error(`${opt.name} is too long (1000 characters max)`)
  }
  if (opt.choices?.length) {
    const hit = opt.choices.find(c => String(c).toLowerCase() === String(v).toLowerCase())
    if (hit == null) throw new Error(`${opt.name} should be one of: ${opt.choices.join(', ')}`)
    v = hit
  }
  return v
}

// Whole options object vs. a command: required ones there, no unknown keys. → { options } or { error }
export function checkOptions(cmd, given) {
  const out = {}
  given = given && typeof given === 'object' && !Array.isArray(given) ? given : {}
  for (const k of Object.keys(given)) if (!cmd.options?.some(o => o.name === k)) return { error: `/${cmd.name} has no option called ${k}` }
  for (const o of cmd.options || []) {
    const raw = given[o.name]
    if (raw == null || raw === '') {
      if (o.required) return { error: `/${cmd.name} needs ${o.name}` }
      continue
    }
    try { out[o.name] = coerceOption(o, raw) } catch (e) { return { error: e.message } }
  }
  return { options: out }
}

// ── signatures: X-Chitchat-Signature = "sha256=" + hex HMAC-SHA256(signing secret, `${timestamp}.${raw body}`) ──
const enc = new TextEncoder()
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
export async function sign(secret, timestamp, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)))
}
export function safeEqual(a, b) {
  a = String(a); b = String(b)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
// What a bot does on its side (same code as in the docs). Rejects stale timestamps (5 minutes) to stop replays.
export async function verify(secret, timestamp, body, signature, now = Date.now()) {
  if (!/^\d{1,12}$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
  return safeEqual('sha256=' + await sign(secret, timestamp, body), signature)
}
export const sha256Hex = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))

// Small seeded random (mulberry32) for "of the day" picks and repeatable tests.
export function seeded(seed) {
  let a = 0x9e3779b9
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
