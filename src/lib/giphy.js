// GIPHY search. The key is a public client key (it ships in the site, like any GIF picker key).
// shortcut: beta key = ~100 calls/hour shared by everyone; request a production key in the GIPHY dashboard when that bites.
const KEY = 'NPO2m1fEp2tYapcVAXqM1IYwgGQmsTNy'
const cache = new Map() // query -> Promise<gif[]>, so repeat searches cost nothing

export function toGif(g) {
  const pick = g.images.fixed_width, full = g.images.downsized || g.images.original
  return {
    id: g.id, title: g.title || 'GIF',
    preview: pick.webp || pick.url, pw: +pick.width, ph: +pick.height,
    url: full.url, w: +full.width, h: +full.height,
  }
}

export function searchGifs(query = '') {
  const q = query.trim().toLowerCase()
  if (cache.has(q)) return cache.get(q)
  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${KEY}&limit=24&rating=pg-13`
  const p = fetch(url)
    .then(r => {
      if (r.status === 429) throw new Error('GIF search is resting for a bit (hourly limit). Try again soon.')
      if (!r.ok) throw new Error("Couldn't reach GIPHY.")
      return r.json()
    })
    .then(j => j.data.map(toGif))
  cache.set(q, p)
  p.catch(() => cache.delete(q))
  return p
}
