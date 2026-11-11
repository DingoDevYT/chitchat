// Mirror of public.automod_rule and friends (supabase/migrations/035_plugins.sql) for the Plugins tab's
// "would this be held back?" preview. The database is what actually enforces it: change both together (tested in plugins.test.js).

const FROM = '01!|l34@5$7+', TO = 'oiiiieaasstt'
export const norm = s => String(s ?? '').toLowerCase().replace(/[01!|l34@5$7+]/g, c => TO[FROM.indexOf(c)])

// One regex for the whole list: whole words, * = any letters, letters may repeat and be split by one of " ._*-".
export function wordsRx(words) {
  const bodies = (Array.isArray(words) ? words : [])
    .map(w => norm(String(w).trim()).replace(/[^a-z0-9* ]/g, '').replace(/\s+/g, ' '))
    .filter(p => !['', '*'].includes(p.trim()))
    .map(p => [...p].map(ch => (ch === '*' ? '[a-z0-9]*' : ch === ' ' ? '[^a-z0-9]+' : ch + '+[ ._*-]?')).join(''))
  return bodies.length ? new RegExp('(^|[^a-z0-9])(' + bodies.join('|') + ')($|[^a-z0-9])') : null
}

export function mentionHandles(body) {
  const out = new Set()
  for (const m of String(body ?? '').matchAll(/(?:^|[^a-z0-9_@])@([a-z0-9_.]{2,32})/gi)) out.add(m[1].toLowerCase().replace(/\.+$/, ''))
  return [...out]
}

const INVITE = /(#\/invite\/[a-z0-9_-]+|discord(app)?\.(gg|com\/invite)\/|chat\.whatsapp\.com\/|t\.me\/(joinchat|\+))/i
const site = s => String(s).replace(/^\s*https?:\/\//, '').replace(/^[ ./]+|[ ./]+$/g, '').toLowerCase().replace(/^www\./, '')

// Which content rule a message breaks ('words' | 'invites' | 'links' | 'mentions' | 'caps'), or null.
// Bursts and repeats need the room's history, so only the database checks those.
export function automodRule(cfg, body) {
  if (!body) return null
  const rx = wordsRx(cfg.words)
  if (rx && rx.test(norm(body))) return 'words'
  const mode = cfg.links || 'off'
  if ((mode === 'invites' || mode === 'all') && INVITE.test(body)) return 'invites'
  if (mode === 'all') {
    const allow = (cfg.allow_sites || []).map(site).filter(Boolean)
    for (const m of body.matchAll(/(?:https?:\/\/|www\.)([a-z0-9.-]+)/gi)) {
      const h = m[1].toLowerCase().replace(/^www\./, '')
      if (!allow.some(d => h === d || h.endsWith('.' + d))) return 'links'
    }
  }
  if (cfg.max_mentions > 0 && mentionHandles(body).length > cfg.max_mentions) return 'mentions'
  if (cfg.caps > 0) {
    const letters = (body.match(/[A-Za-z]/g) || []).length, caps = (body.match(/[A-Z]/g) || []).length
    if (letters >= 12 && caps * 100 > cfg.caps * letters) return 'caps'
  }
  return null
}

export const RULE_TEXT = {
  words: 'it has a blocked word or phrase', invites: 'it has an invite link', links: "it links to a site that isn't allowed",
  mentions: 'it mentions too many people', caps: "it's mostly capitals",
}
