// link-preview: { url } -> { url, title, description, image, site_name, favicon, color }.
// SSRF-hardened: http(s) on 80/443 only, every hop's host must resolve to public IPs, manual redirects (max 3),
// 5 s total timeout, 512 KB read cap, text/html (or oEmbed JSON) only, text-only output. Cached 7 days in link_previews.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkUrl, fromOembed, isIPLiteral, isPublicIP, oembedFor, parseMeta } from './safe.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MAX_BYTES = 512 * 1024
const TTL = 7 * 24 * 3600 * 1000
const PER_MINUTE = 30
const UA = 'Mozilla/5.0 (compatible; ChitchatBot/1.0; link previews)'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
class Blocked extends Error {}

async function assertPublic(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const ips = isIPLiteral(host) ? [host] : (await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ])).flat()
  if (!ips.length || !ips.every(isPublicIP)) throw new Blocked('address not allowed')
}

// shortcut: fetch() re-resolves DNS after our check, so a rebinding host could still swap IPs in between; pin the IP if Deno's fetch ever allows it.
async function safeFetch(start: URL, signal: AbortSignal) {
  let u = start
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublic(u)
    const res = await fetch(u, { redirect: 'manual', signal, headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9' } })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel()
      try { u = checkUrl(new URL(loc, u).href) } catch { throw new Blocked('bad redirect') }
      continue
    }
    return { res, url: u }
  }
  throw new Blocked('too many redirects')
}

async function readText(res: Response) {
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); size += value.length
  }
  await reader.cancel().catch(() => {})
  const buf = new Uint8Array(Math.min(size, MAX_BYTES))
  let o = 0
  for (const c of chunks) { const n = Math.min(c.length, buf.length - o); buf.set(c.subarray(0, n), o); o += n }
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1]
  try { return new TextDecoder(charset || 'utf-8').decode(buf) } catch { return new TextDecoder().decode(buf) }
}

async function preview(target: URL, signal: AbortSignal) {
  const oe = oembedFor(target)
  if (oe) {
    try {
      const { res } = await safeFetch(checkUrl(oe[0] + encodeURIComponent(target.href)), signal)
      if (res.ok && /json/i.test(res.headers.get('content-type') || '')) {
        const p = fromOembed(JSON.parse(await readText(res)), target.href, oe[1], oe[2])
        if (p.title || p.description) return p
      } else await res.body?.cancel()
    } catch (e) { if (e instanceof Blocked) throw e } // otherwise fall back to the page itself
  }
  const { res, url } = await safeFetch(target, signal)
  const type = res.headers.get('content-type') || ''
  if (!res.ok || !/text\/html/i.test(type)) {
    await res.body?.cancel()
    return { url: target.href, title: null, description: null, image: null, site_name: target.hostname.replace(/^www\./, ''), favicon: null, color: null }
  }
  return { ...parseMeta(await readText(res), url.href), url: target.href }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // verify_jwt already checked the signature at the gateway; we only need the user id.
  let uid: string | undefined
  try { uid = JSON.parse(atob((req.headers.get('authorization') || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub } catch { /* no user */ }
  if (!uid) return json({ error: 'sign in first' }, 401)

  let target: URL
  try { target = checkUrl((await req.json()).url) } catch { return json({ error: 'bad url' }, 400) }
  const key = target.href

  const { data: hit } = await db.from('link_previews').select('data, fetched_at').eq('url', key).maybeSingle()
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL) return json(hit.data)

  const { data: n, error } = await db.rpc('link_preview_hit', { uid })
  if (error) return json({ error: 'try again later' }, 503)
  if (n > PER_MINUTE) return json({ error: 'slow down' }, 429)

  try {
    const data = await preview(target, AbortSignal.timeout(5000))
    await db.from('link_previews').upsert({ url: key, data, fetched_at: new Date().toISOString() })
    return json(data)
  } catch (e) {
    return e instanceof Blocked ? json({ error: e.message }, 400) : json({ error: 'fetch failed' }, 502)
  }
})
