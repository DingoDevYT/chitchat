// Slash commands in the composer: which command is being typed, its option values, and what to suggest (tested in plugins.test.js).
// Registry rows come from public.server_commands: { install_id, plugin, icon, bot_user_id, name: 'chef rate', description, options: [...] }.
import { coerceOption } from '../../supabase/functions/plugin-runtime/shared.js'

export const TYPE_LABEL = { string: 'text', integer: 'whole number', number: 'number', boolean: 'yes/no', user: '@person', room: 'room' }

// The registered command at the start of the text ("chef rate" wins over "chef"), or null.
export function findCommand(text, registry) {
  if (!text?.startsWith('/')) return null
  const body = text.slice(1).toLowerCase().replace(/\s+/g, ' ')
  let best = null
  for (const c of registry || []) if ((body === c.name || body.startsWith(c.name + ' ')) && (!best || c.name.length > best.name.length)) best = c
  return best
}

// "/chef rate a big pizza" → { options: { thing: 'a big pizza' } } or { error }.
// Values go in option order; name:value (or name:"two words") sets one by name; the last text option takes the rest.
export function parseCommand(text, cmd) {
  const opts = cmd.options || []
  const head = new RegExp('^/' + cmd.name.split(' ').join('\\s+') + '(\\s+|$)', 'i')
  let raw = text.trim().replace(head, '')
  const values = {}
  raw = raw.replace(/(^|\s)([a-z0-9_-]+):(?:"([^"]*)"|(\S+))/gi, (all, sp, k, q, w) => {
    const o = opts.find(x => x.name === k.toLowerCase())
    if (!o) return all
    values[o.name] = q ?? w
    return sp
  })
  const next = () => {
    const m = raw.match(/^\s*(?:"([^"]*)"|(\S+))/)
    if (!m) return null
    raw = raw.slice(m[0].length)
    return m[1] ?? m[2]
  }
  const free = opts.filter(o => values[o.name] == null)
  free.forEach((o, i) => {
    if (i === free.length - 1 && o.type === 'string') {
      const t = raw.trim()
      if (t) values[o.name] = /^"[^"]*"$/.test(t) ? t.slice(1, -1) : t
      raw = ''
    } else {
      const v = next()
      if (v != null) values[o.name] = v
    }
  })
  if (raw.trim()) return { error: opts.length ? `That's more than /${cmd.name} takes.` : `/${cmd.name} doesn't take anything after it.` }
  const options = {}
  for (const o of opts) {
    const v = values[o.name]
    if (v == null || v === '') {
      if (o.required) return { error: `/${cmd.name} needs ${o.name}${o.description ? `: ${o.description.replace(/[.?]$/, '')}` : ''}.`, missing: o.name }
      continue
    }
    try { options[o.name] = coerceOption(o, v) } catch (e) { return { error: e.message.charAt(0).toUpperCase() + e.message.slice(1) + '.' } }
  }
  return { options }
}

// While typing "/…": { items } (matching commands, best first) or { cmd } once a command is fully typed. null = no popup.
export function suggest(text, registry) {
  if (!text?.startsWith('/') || text.includes('\n') || !registry?.length) return null
  const q = text.slice(1).toLowerCase().replace(/\s+/g, ' ')
  const cmd = findCommand(text, registry)
  // "/chef r" with both /chef and /chef rate around: still choosing, so keep listing
  if (cmd && !registry.some(c => c !== cmd && c.name.startsWith(q))) return { cmd }
  if (q.length > 40) return null
  const items = registry.filter(c => c.name.startsWith(q) || (q && (c.name.includes(' ' + q) || c.plugin?.toLowerCase().startsWith(q))))
    .sort((a, b) => b.name.startsWith(q) - a.name.startsWith(q) || a.name.localeCompare(b.name))
  return items.length ? { items: items.slice(0, 25) } : null
}

// "thing (text)" / "[count (whole number)]" chips for the hint line.
export const optionLabel = o => `${o.required ? '' : '['}${o.name}${o.choices?.length ? `: ${o.choices.join(' | ')}` : ` (${TYPE_LABEL[o.type] || o.type})`}${o.required ? '' : ']'}`
