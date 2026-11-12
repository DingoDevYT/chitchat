// Chitter Cove (working title: the name lives only in meta.name): a cozy hex-island trade-and-build game, our own.
// 19 hex tiles (woods, meadow, clay pit, berry patch, tea terrace, two lily ponds) make twigs, wool, clay, berries and tea
// when their number is rolled. Build paths, cottages (1 point) and lodges (2 points), trade with friends or at the
// harbour (4:1, or 3:1 / 2:1 at a dock), buy cozy cards, and keep the raccoon off your tiles. First to 10 points wins.
// Baskets are open: everyone can see everyone's resources (cozy cards stay secret). Plain JS: runs in the browser and
// in the `game` edge function, deterministic for a seed.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'isle', name: 'Chitter Cove', min: 2, max: 4, turnMs: 60000, blurb: 'Gather twigs, wool, clay, berries and tea on a cozy island. Build paths, cottages and lodges, trade, and shoo the raccoon. First to 10 points wins.' }

export const RES = ['twig', 'wool', 'clay', 'berry', 'tea']
export const RES_NAME = { twig: 'Twigs', wool: 'Wool', clay: 'Clay', berry: 'Berries', tea: 'Tea' }
export const RES_ONE = { twig: 'twig', wool: 'wool', clay: 'clay', berry: 'berry', tea: 'tea leaf' }
export const RES_COLOR = { twig: '#8a5a34', wool: '#e9e1cf', clay: '#c8693f', berry: '#a54a82', tea: '#5f9a4f' }
// Tiles: what each makes and how many are on the island (19 in all; the two ponds make nothing).
export const KINDS = {
  woods: { res: 'twig', name: 'Woods', n: 4, color: '#4f8a4a' },
  meadow: { res: 'wool', name: 'Meadow', n: 4, color: '#a6cf6a' },
  clay: { res: 'clay', name: 'Clay Pit', n: 3, color: '#d98b5a' },
  berry: { res: 'berry', name: 'Berry Patch', n: 3, color: '#b0658f' },
  tea: { res: 'tea', name: 'Tea Terrace', n: 3, color: '#7fb27a' },
  pond: { res: null, name: 'Lily Pond', n: 2, color: '#79b8c9' },
}
export const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 12]
export const COST = {
  path: { twig: 1, clay: 1 },
  cottage: { twig: 1, clay: 1, wool: 1, berry: 1 },
  lodge: { tea: 3, berry: 1, wool: 1 },
  card: { wool: 1, berry: 1, tea: 1 },
}
export const LIMIT = { path: 15, cottage: 5, lodge: 4 }
export const CARDS = {
  paw: { name: 'Helping Paw', n: 13, text: 'Move the raccoon to another tile and take one resource from someone there.' },
  picnic: { name: 'Picnic Basket', n: 3, text: 'Take any two resources from the bank.' },
  paths: { name: 'Path Party', n: 2, text: 'Build two paths for free.' },
  gossip: { name: 'Gossip Tea', n: 2, text: 'Name a resource: everyone else gives you up to two of it.' },
  keep: { name: 'Keepsake', n: 4, text: 'Worth 1 point. Keep it hidden until you win.' },
}
export const BONUS = { path: { name: 'Winding Way', min: 5, text: 'Longest path (at least 5)' }, help: { name: 'Kindest Neighbour', min: 3, text: 'Most Helping Paws played (at least 3)' } }
export const TARGET = 10, QUICK_TARGET = 8, DISCARD_OVER = 7, BIG_BASKETS = 9, OFFERS = 3, BANK = 19, FRIENDLY_UNDER = 3
// House rules (game.opts): quick (first to 8), friendly (the raccoon leaves players under 3 points alone),
// bigBaskets (only put back on a 7 when holding more than 9).
export const basketLimit = pub => (pub.opts?.bigBaskets ? BIG_BASKETS : DISCARD_OVER)
// The bank holds 19 of each; what's left is whatever nobody is holding.
export const bankLeft = (pub, k) => BANK - pub.players.reduce((a, p) => a + (pub.res[p]?.[k] || 0), 0)

// ── the island's shape (fixed; only what's on the tiles is shuffled) ──
// Pointy-top hexes of size 1, axial (q, r) within 2 of the middle. Corners (VERTS) and sides (EDGES) are shared between tiles.
export const TILES = [], VERTS = [], EDGES = []
{
  const S3 = Math.sqrt(3), vk = new Map(), ek = new Map()
  for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
    const t = TILES.length, x = S3 * (q + r / 2), y = 1.5 * r
    const tile = { q, r, x, y, v: [], e: [], n: [] }
    TILES.push(tile)
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30), vx = x + Math.cos(a), vy = y + Math.sin(a)
      const key = `${Math.round(vx * 1000)},${Math.round(vy * 1000)}`
      let id = vk.get(key)
      if (id == null) { id = VERTS.length; vk.set(key, id); VERTS.push({ x: vx, y: vy, t: [], v: [], e: [] }) }
      VERTS[id].t.push(t); tile.v.push(id)
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.min(tile.v[i], tile.v[(i + 1) % 6]), b = Math.max(tile.v[i], tile.v[(i + 1) % 6]), key = `${a}-${b}`
      let id = ek.get(key)
      if (id == null) {
        id = EDGES.length; ek.set(key, id); EDGES.push({ a, b, t: [] })
        VERTS[a].v.push(b); VERTS[b].v.push(a); VERTS[a].e.push(id); VERTS[b].e.push(id)
      }
      EDGES[id].t.push(t); tile.e.push(id)
    }
  }
  TILES.forEach((tile, t) => { tile.n = [...new Set(tile.e.flatMap(e => EDGES[e].t))].filter(o => o !== t) })
}
const mid = e => [(VERTS[EDGES[e].a].x + VERTS[EDGES[e].b].x) / 2, (VERTS[EDGES[e].a].y + VERTS[EDGES[e].b].y) / 2]
// The coastline, in order around the island, and the 8 sides that get a dock (spread evenly).
export const COAST = EDGES.map((_, e) => e).filter(e => EDGES[e].t.length === 1).sort((p, q) => Math.atan2(mid(p)[1], mid(p)[0]) - Math.atan2(mid(q)[1], mid(q)[0]))
export const DOCK_EDGES = Array.from({ length: 8 }, (_, i) => COAST[Math.round(i * COAST.length / 8)])
export const other = (e, v) => (EDGES[e].a === v ? EDGES[e].b : EDGES[e].a)
export const pips = n => (n ? 6 - Math.abs(7 - n) : 0)

// Shuffle tiles and numbers until no two busy numbers (6 and 8) touch and no two tiles with the same number touch.
function layout(r) {
  const kinds = Object.entries(KINDS).flatMap(([k, d]) => Array(d.n).fill(k))
  for (let tries = 0; ; tries++) {
    const ks = shuffle(kinds, r), nums = shuffle(NUMBERS, r)
    let i = 0
    const tiles = ks.map(k => ({ k, n: k === 'pond' ? 0 : nums[i++] }))
    const ok = tiles.every((t, a) => !t.n || TILES[a].n.every(b => tiles[b].n !== t.n && !([6, 8].includes(t.n) && [6, 8].includes(tiles[b].n))))
    if (ok || tries > 400) return tiles
  }
}

const zero = () => Object.fromEntries(RES.map(k => [k, 0]))
export function setup(players, seed, opts = {}) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`${meta.name} needs ${meta.min} to ${meta.max} players.`)
  const r = rng(seed)
  const tiles = layout(r)
  const kinds = shuffle(['any', 'any', 'any', ...RES], r)
  const n = players.length, idx = [...Array(n).keys()]
  const deck = shuffle(Object.entries(CARDS).flatMap(([k, c]) => Array(c.n).fill(k)), r)
  return {
    pub: {
      players: [...players], turn: 0, phase: 'place', place: { order: [...idx, ...idx.reverse()], step: 0, at: null },
      round: 1, turns: 0, maxRounds: opts.quick ? 40 : 120, target: opts.quick ? QUICK_TARGET : TARGET,
      tiles, docks: DOCK_EDGES.map((e, i) => ({ e, k: kinds[i] })), raccoon: tiles.findIndex(t => t.k === 'pond'),
      paths: {}, homes: {}, res: Object.fromEntries(players.map(p => [p, zero()])), cards: Object.fromEntries(players.map(p => [p, 0])),
      helped: Object.fromEntries(players.map(p => [p, 0])), long: Object.fromEntries(players.map(p => [p, 0])), bonus: { path: null, help: null },
      dice: [1, 1], rolls: 0, gains: null, discard: null, back: null, offer: null, offers: 0, free: 0, played: false, acts: 0,
      deck: deck.length, last: null, winner: null, reveal: null,
      opts: { quick: !!opts.quick, friendly: !!opts.friendly, bigBaskets: !!opts.bigBaskets },
    },
    priv: {}, // a player's cozy cards, made on their first buy: { hand: [{ k, at }] } (at = the turn it was bought)
    secret: { rs: Math.floor(r() * 2 ** 32), deck },
  }
}

export function turn(s) {
  const p = s.pub
  if (p.winner) return null
  if (p.phase === 'place') return p.players[p.place.order[p.place.step]]
  if (p.phase === 'trade') return p.offer.to
  if (p.phase === 'discard') {
    const n = p.players.length
    for (let k = 0; k < n; k++) { const q = p.players[(p.turn + k) % n]; if (p.discard[q] > 0) return q }
  }
  return p.players[p.turn]
}

// ── board questions (shared with the UI and the bots) ──
export const total = res => RES.reduce((a, k) => a + (res[k] || 0), 0)
export const has = (res, want) => RES.every(k => (res[k] || 0) >= (want[k] || 0))
export const missing = (res, want) => Object.fromEntries(RES.map(k => [k, Math.max(0, (want[k] || 0) - (res[k] || 0))]).filter(([, n]) => n))
const count = (pub, pid, l) => Object.values(pub.homes).filter(h => h.p === pid && (l == null || h.l === l)).length
export const left = (pub, pid) => ({
  path: LIMIT.path - Object.values(pub.paths).filter(p => p === pid).length,
  cottage: LIMIT.cottage - count(pub, pid, 1),
  lodge: LIMIT.lodge - count(pub, pid, 2),
})
const free = (pub, v) => !pub.homes[v] && VERTS[v].v.every(u => !pub.homes[u])
const touchesMine = (pub, pid, v) => VERTS[v].e.some(e => pub.paths[e] === pid)
// Why pid can't put that there right now (ignores the cost), or null. `setup`: initial placement (no path needed).
export function whyNot(pub, pid, kind, at, setup = pub.phase === 'place') {
  if (kind === 'cottage') {
    if (!VERTS[at]) return 'Pick a corner.'
    if (pub.homes[at]) return 'Someone already lives there.'
    if (!free(pub, at)) return 'Too close to another home: leave a corner between.'
    if (!setup && !touchesMine(pub, pid, at)) return 'Cottages go at the end of one of your paths.'
    return left(pub, pid).cottage > 0 ? null : 'All five of your cottages are out.'
  }
  if (kind === 'lodge') {
    if (pub.homes[at]?.p !== pid || pub.homes[at].l !== 1) return 'Pick one of your cottages to grow into a lodge.'
    return left(pub, pid).lodge > 0 ? null : 'All four of your lodges are out.'
  }
  if (kind === 'path') {
    const ed = EDGES[at]
    if (!ed) return 'Pick a side between two corners.'
    if (pub.paths[at] != null) return 'There is a path there already.'
    if (left(pub, pid).path <= 0) return 'All fifteen of your paths are out.'
    if (setup) return ed.a === pub.place?.at || ed.b === pub.place?.at ? null : 'Start your path at the cottage you just placed.'
    const ok = [ed.a, ed.b].some(v => pub.homes[v]?.p === pid || (!pub.homes[v] && VERTS[v].e.some(e => e !== at && pub.paths[e] === pid)))
    return ok ? null : 'Paths join your own paths or homes.'
  }
  return 'Build a path, cottage or lodge.'
}
export const legal = (pub, pid, kind) => (kind === 'path' ? EDGES : VERTS).map((_, i) => i).filter(i => !whyNot(pub, pid, kind, i))
// Best harbour rate for giving `res`: 4, or 3 at an any-dock, 2 at that resource's dock.
export function rate(pub, pid, res) {
  let best = 4
  for (const d of pub.docks) {
    if (![EDGES[d.e].a, EDGES[d.e].b].some(v => pub.homes[v]?.p === pid)) continue
    if (d.k === 'any') best = Math.min(best, 3)
    else if (d.k === res) best = 2
  }
  return best
}
// Where pid may send the raccoon: anywhere but where it is (friendly raccoon: not next to anyone else under 3 points,
// unless that rules out every tile).
export function raccoonSpots(pub, pid) {
  const all = TILES.map((_, t) => t).filter(t => t !== pub.raccoon)
  if (!pub.opts?.friendly) return all
  const ok = all.filter(t => TILES[t].v.every(v => { const h = pub.homes[v]; return !h || h.p === pid || score(pub, h.p) >= FRIENDLY_UNDER }))
  return ok.length ? ok : all
}
export const victims = (pub, pid, tile) => [...new Set(TILES[tile].v.map(v => pub.homes[v]?.p).filter(p => p && p !== pid && total(pub.res[p]) > 0))]
export function score(pub, pid) {
  let n = 0
  for (const h of Object.values(pub.homes)) if (h.p === pid) n += h.l
  if (pub.bonus.path === pid) n += 2
  if (pub.bonus.help === pid) n += 2
  return n
}
const keeps = (priv, pid) => (priv[pid]?.hand || []).filter(c => c.k === 'keep').length
export const points = (s, pid) => score(s.pub, pid) + keeps(s.priv, pid)

// Longest unbroken run of pid's paths (each side once; someone else's home cuts it).
export function longest(pub, pid) {
  const mine = Object.keys(pub.paths).filter(e => pub.paths[e] === pid).map(Number)
  let best = 0
  const used = new Set()
  const walk = (v, len) => {
    if (len > best) best = len
    for (const e of VERTS[v].e) {
      if (pub.paths[e] !== pid || used.has(e)) continue
      const o = other(e, v)
      used.add(e)
      if (pub.homes[o] && pub.homes[o].p !== pid) { if (len + 1 > best) best = len + 1 } else walk(o, len + 1)
      used.delete(e)
    }
  }
  for (const v of new Set(mine.flatMap(e => [EDGES[e].a, EDGES[e].b]))) walk(v, 0)
  return best
}
function updatePath(pub) {
  for (const p of pub.players) pub.long[p] = longest(pub, p)
  const max = Math.max(...pub.players.map(p => pub.long[p])), h = pub.bonus.path
  if (h && pub.long[h] === max && max >= BONUS.path.min) return
  const top = pub.players.filter(p => pub.long[p] === max)
  pub.bonus = { ...pub.bonus, path: max >= BONUS.path.min && top.length === 1 ? top[0] : null }
}

// ── moves ──
const clone = pub => ({
  ...pub, paths: { ...pub.paths }, homes: { ...pub.homes }, res: Object.fromEntries(Object.entries(pub.res).map(([p, r]) => [p, { ...r }])),
  cards: { ...pub.cards }, helped: { ...pub.helped }, long: { ...pub.long }, bonus: { ...pub.bonus }, place: pub.place && { ...pub.place },
  discard: pub.discard && { ...pub.discard },
})
const isRes = k => RES.includes(k)
function bag(x) { // a {res: n} from the client, checked
  if (!x || typeof x !== 'object') return null
  const out = {}
  for (const [k, n] of Object.entries(x)) { if (!isRes(k) || !Number.isInteger(n) || n < 0 || n > 99) return null; if (n) out[k] = n }
  return out
}
const add = (res, b, sign = 1) => { for (const [k, n] of Object.entries(b)) res[k] += n * sign }
function roll(pub, secret) {
  const r = rng(secret.rs)
  const d = [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]
  return { d, secret: { ...secret, rs: Math.floor(r() * 2 ** 32) } }
}
// What a roll makes. If the bank can't cover a resource for everyone owed it, nobody gets any of it, unless only one
// player is owed: then they get whatever is left. Returns { gains: { pid: { res: n } }, short: [res the bank ran out of] }.
function produce(pub, sum) {
  const owed = {}
  pub.tiles.forEach((t, i) => {
    if (t.n !== sum || i === pub.raccoon) return
    const k = KINDS[t.k].res
    for (const v of TILES[i].v) { const h = pub.homes[v]; if (h) owed[k] = { ...owed[k], [h.p]: (owed[k]?.[h.p] || 0) + h.l } }
  })
  const gains = {}, short = []
  for (const [k, by] of Object.entries(owed)) {
    const need = Object.values(by).reduce((a, n) => a + n, 0), have = bankLeft(pub, k), who = Object.keys(by)
    if (need > have) short.push(k)
    if (need > have && who.length > 1) continue
    for (const p of who) {
      const n = Math.min(by[p], have)
      if (!n) continue
      pub.res[p][k] += n
      gains[p] = { ...gains[p], [k]: n }
    }
  }
  return { gains, short }
}
function endTurn(pub) {
  const n = pub.players.length
  const t = (pub.turn + 1) % n
  if (t === 0) pub.round++
  Object.assign(pub, { turn: t, phase: 'roll', free: 0, played: false, offers: 0, acts: 0, turns: pub.turns + 1, gains: null })
}

export function move(s, pid, a) {
  if (s.pub.winner) throw new Error('This game is over.')
  if (turn(s) !== pid) throw new Error("It's not your turn.")
  const pub = clone(s.pub)
  let secret = s.secret, priv = s.priv
  const type = a?.type, ph = pub.phase
  const owner = pub.players[pub.turn]
  pub.last = { pid, type }
  const need = (ok, msg) => { if (!ok) throw new Error(msg) }

  if (ph === 'place') {
    const st = pub.place, kind = st.at == null ? 'cottage' : 'path'
    need(type === kind, kind === 'cottage' ? 'Place a cottage on a corner.' : 'Place a path next to your new cottage.')
    const at = kind === 'cottage' ? a.v : a.e
    const why = whyNot(pub, pid, kind, at, true)
    if (why) throw new Error(why)
    pub.last.at = at
    if (kind === 'cottage') {
      pub.homes[at] = { p: pid, l: 1 }
      st.at = at
      if (st.step >= pub.players.length) { // the second cottage brings in one of each tile around it
        const got = {}
        for (const t of VERTS[at].t) { const k = KINDS[pub.tiles[t].k].res; if (k && bankLeft(pub, k) > 0) { pub.res[pid][k]++; got[k] = (got[k] || 0) + 1 } }
        pub.gains = { [pid]: got }
        pub.last.got = got
      }
    } else {
      pub.paths[at] = pid
      st.at = null
      st.step++
      pub.gains = null
      if (st.step >= st.order.length) { pub.phase = 'roll'; pub.turn = 0; pub.place = null; updatePath(pub) } else pub.turn = st.order[st.step]
    }
    return { pub, priv, secret }
  }

  const res = pub.res[pid]
  if (type === 'roll') {
    need(ph === 'roll', 'Not time to roll.')
    const r = roll(pub, secret)
    secret = r.secret
    const sum = r.d[0] + r.d[1]
    pub.dice = r.d; pub.rolls++
    pub.last.dice = r.d
    if (sum === 7) {
      pub.gains = null
      const disc = Object.fromEntries(pub.players.map(p => [p, total(pub.res[p])]).filter(([, n]) => n > basketLimit(pub)).map(([p, n]) => [p, Math.floor(n / 2)]))
      pub.back = 'main'
      if (Object.keys(disc).length) { pub.discard = disc; pub.phase = 'discard' } else pub.phase = 'raccoon'
    } else {
      const made = produce(pub, sum)
      pub.gains = made.gains
      if (made.short.length) pub.last.short = made.short
      pub.last.nibbled = pub.tiles[pub.raccoon].n === sum
      pub.phase = 'main'
    }
  } else if (type === 'discard') {
    need(ph === 'discard', 'Nothing to put back.')
    const b = bag(a.give)
    need(b && total(b) === pub.discard[pid], `Put back exactly ${pub.discard[pid]}.`)
    need(has(res, b), "You don't have those.")
    add(res, b, -1)
    pub.last.give = b
    delete pub.discard[pid]
    if (!Object.keys(pub.discard).length) { pub.discard = null; pub.phase = 'raccoon' }
  } else if (type === 'raccoon') {
    need(ph === 'raccoon', 'The raccoon is napping.')
    need(Number.isInteger(a.tile) && TILES[a.tile] && a.tile !== pub.raccoon, 'Move the raccoon to a different tile.')
    need(raccoonSpots(pub, pid).includes(a.tile), `The friendly raccoon leaves players under ${FRIENDLY_UNDER} points alone.`)
    const vs = victims(pub, pid, a.tile)
    pub.raccoon = a.tile
    pub.last.tile = a.tile
    if (vs.length) {
      need(vs.includes(a.from), 'Pick who the raccoon takes from.')
      const r = rng(secret.rs), pool = RES.flatMap(k => Array(pub.res[a.from][k]).fill(k))
      const k = pool[Math.floor(r() * pool.length)]
      secret = { ...secret, rs: Math.floor(r() * 2 ** 32) }
      pub.res[a.from][k]--; res[k]++
      pub.last.from = a.from; pub.last.took = k
    }
    pub.phase = pub.back || 'main'
    pub.back = null
  } else if (type === 'build') {
    const kind = a.kind, at = kind === 'path' ? a.e : a.v
    const freePath = kind === 'path' && pub.free > 0 && (ph === 'roll' || ph === 'main')
    need(ph === 'main' || freePath, ph === 'roll' ? 'Roll first.' : 'Not right now.')
    need(COST[kind] && kind !== 'card', 'Build a path, cottage or lodge.')
    const why = whyNot(pub, pid, kind, at, false)
    if (why) throw new Error(why)
    if (freePath) pub.free--
    else { need(has(res, COST[kind]), `Not enough for a ${kind}.`); add(res, COST[kind], -1) }
    if (kind === 'path') pub.paths[at] = pid
    else pub.homes[at] = { p: pid, l: kind === 'lodge' ? 2 : 1 }
    pub.last.kind = kind; pub.last.at = at; pub.last.free = freePath
    if (kind !== 'lodge') updatePath(pub)
    pub.acts++
  } else if (type === 'buy') {
    need(ph === 'main', ph === 'roll' ? 'Roll first.' : 'Not right now.')
    need(pub.deck > 0, 'The cozy card pile is empty.')
    need(has(res, COST.card), 'A cozy card costs a wool, a berry and a tea leaf.')
    add(res, COST.card, -1)
    const [k, ...rest] = secret.deck
    secret = { ...secret, deck: rest }
    pub.deck = rest.length
    pub.cards[pid]++
    priv = { ...priv, [pid]: { hand: [...(priv[pid]?.hand || []), { k, at: pub.turns }] } }
    pub.acts++
  } else if (type === 'play') {
    need(ph === 'roll' || ph === 'main', 'Not right now.')
    need(!pub.played, 'One cozy card a turn.')
    const hand = priv[pid]?.hand || [], k = a.card
    need(k !== 'keep', 'Keepsakes stay hidden: they count when you win.')
    const i = hand.findIndex(c => c.k === k && c.at < pub.turns)
    need(i >= 0, hand.some(c => c.k === k) ? 'Cards bought this turn can be played next turn.' : "You don't have that card.")
    if (k === 'picnic') {
      need(Array.isArray(a.res) && a.res.length === 2 && a.res.every(isRes), 'Pick two resources.')
      need(a.res.every(r => bankLeft(pub, r) >= a.res.filter(x => x === r).length), 'The bank has run out of that.')
      for (const r of a.res) res[r]++
      pub.last.res = a.res
    } else if (k === 'gossip') {
      need(isRes(a.res), 'Name a resource.')
      let got = 0
      for (const p of pub.players) if (p !== pid) { const n = Math.min(2, pub.res[p][a.res]); pub.res[p][a.res] -= n; got += n }
      res[a.res] += got
      pub.last.res = a.res; pub.last.got = got
    } else if (k === 'paths') {
      pub.free = Math.min(2, left(pub, pid).path)
    } else if (k === 'paw') {
      pub.helped[pid]++
      const h = pub.bonus.help
      if (pub.helped[pid] >= BONUS.help.min && (!h || pub.helped[pid] > pub.helped[h])) pub.bonus.help = pid
      pub.back = ph
      pub.phase = 'raccoon'
    } else throw new Error("You don't have that card.")
    priv = { ...priv, [pid]: { hand: hand.filter((_, j) => j !== i) } }
    pub.cards[pid]--
    pub.played = true
    pub.last.card = k
    pub.acts++
  } else if (type === 'bank') {
    need(ph === 'main', ph === 'roll' ? 'Roll first.' : 'Not right now.')
    need(isRes(a.give) && isRes(a.get) && a.give !== a.get, 'Pick what to give and what to get.')
    const n = rate(pub, pid, a.give)
    need(res[a.give] >= n, `The harbour wants ${n} ${RES_NAME[a.give].toLowerCase()}.`)
    need(bankLeft(pub, a.get) > 0, `The bank has no ${RES_NAME[a.get].toLowerCase()} left.`)
    res[a.give] -= n; res[a.get]++
    Object.assign(pub.last, { give: a.give, n, get: a.get })
    pub.acts++
  } else if (type === 'offer') {
    need(ph === 'main', ph === 'roll' ? 'Roll first, then trade.' : 'Not right now.')
    need(pub.offers < OFFERS, 'Three offers a turn. Try again next turn.')
    need(a.to !== pid && pub.players.includes(a.to), 'Trade with someone at the table.')
    const give = bag(a.give), get = bag(a.get)
    need(give && get && total(give) && total(get), 'Pick something to give and something to get.')
    need(has(res, give), "You don't have those.")
    pub.offer = { from: pid, to: a.to, give, get }
    pub.offers++
    pub.phase = 'trade'
    pub.last.to = a.to
  } else if (type === 'accept' || type === 'decline') {
    need(ph === 'trade', 'No offer on the table.')
    const o = pub.offer
    if (type === 'accept') {
      need(has(res, o.get), "You don't have what they asked for.")
      need(has(pub.res[o.from], o.give), 'They no longer have that.')
      add(pub.res[o.from], o.give, -1); add(res, o.give)
      add(res, o.get, -1); add(pub.res[o.from], o.get)
    }
    pub.last.offer = o
    pub.offer = null
    pub.phase = 'main'
  } else if (type === 'end') {
    need(ph === 'main', ph === 'roll' ? 'Roll first.' : 'Not right now.')
    endTurn(pub)
  } else throw new Error('Roll, build, trade, play a card or end your turn.')

  // You can only win on your own turn: count your hidden keepsakes too.
  const full = { pub, priv }
  if (points(full, owner) >= pub.target) pub.winner = owner
  else if (pub.round > pub.maxRounds) { // the long-game cap (only reached by an empty table): most points wins
    pub.round = pub.maxRounds
    pub.winner = pub.players.reduce((b, p) => (points(full, p) > points(full, b) ? p : b))
  }
  if (pub.winner) pub.reveal = Object.fromEntries(pub.players.map(p => [p, keeps(priv, p)]))
  return { pub, priv, secret }
}

export const view = (s, pid) => ({ ...s.pub, me: s.priv?.[pid] ?? null })
export const over = s => (s.pub.winner ? [s.pub.winner] : null)

// ── timeouts: every phase has a move that keeps the table going ──
export function timeout(s) {
  const p = s.pub, who = turn(s)
  if (p.phase === 'place') return p.place.at == null ? { type: 'cottage', v: bestSpot(p, who, 'hard') } : { type: 'path', e: setupPath(p, who, 'hard') }
  if (p.phase === 'discard') return { type: 'discard', give: autoDiscard(p, who) }
  if (p.phase === 'raccoon') return raccoonMove(p, who, 'normal')
  return { roll: { type: 'roll' }, main: { type: 'end' }, trade: { type: 'decline' } }[p.phase]
}

// ── Chitbots ──
function prod(pub, pid) {
  const out = zero()
  for (const [v, h] of Object.entries(pub.homes)) if (h.p === pid) for (const t of VERTS[v].t) { const k = KINDS[pub.tiles[t].k].res; if (k && t !== pub.raccoon) out[k] += pips(pub.tiles[t].n) * h.l }
  return out
}
function spotValue(pub, pid, v, mine = prod(pub, pid)) {
  let val = 0
  const seen = new Set(RES.filter(k => mine[k] > 0))
  for (const t of VERTS[v].t) {
    const k = KINDS[pub.tiles[t].k].res
    if (!k) continue
    const p = pips(pub.tiles[t].n) * (t === pub.raccoon ? 0.4 : 1)
    val += p * (k === 'tea' || k === 'berry' ? 1.1 : 1)
    if (!seen.has(k)) { val += 1.6; seen.add(k) }
  }
  const d = pub.docks.find(d => EDGES[d.e].a === v || EDGES[d.e].b === v)
  if (d) val += d.k === 'any' ? 1.2 : mine[d.k] >= 5 ? 2.4 : 0.6
  return val
}
function pickBy(list, f, level, rand) {
  if (!list.length) return null
  const ranked = list.map(x => [x, f(x)]).sort((a, b) => b[1] - a[1]).map(x => x[0])
  const k = level === 'easy' ? Math.min(ranked.length, 8) : level === 'normal' ? Math.min(ranked.length, 2) : 1
  return ranked[Math.floor((rand ? rand() : 0) * k)]
}
function bestSpot(pub, pid, level, rand) {
  const mine = prod(pub, pid)
  return pickBy(legal(pub, pid, 'cottage'), v => spotValue(pub, pid, v, mine), level, rand)
}
// Which corners could take a cottage one day (the distance rule only), and how good they'd be.
function prospects(pub, pid) {
  const mine = prod(pub, pid)
  return VERTS.map((_, v) => v).filter(v => free(pub, v)).map(v => [v, spotValue(pub, pid, v, mine)])
}
function setupPath(pub, pid, level, rand) {
  const pros = prospects(pub, pid)
  return pickBy(legal(pub, pid, 'path'), e => {
    const o = other(e, pub.place.at)
    return Math.max(0, ...pros.filter(([u]) => VERTS[o].v.includes(u) && u !== pub.place.at).map(([, x]) => x))
  }, level, rand)
}
// Steps from a corner to the others (through corners nobody else lives on, along sides nobody else has a path on).
function steps(pub, pid, from) {
  const d = new Map(from.map(v => [v, 0])), q = [...from]
  while (q.length) {
    const v = q.shift()
    if (d.get(v) >= 4) continue
    for (const e of VERTS[v].e) {
      if (pub.paths[e] != null && pub.paths[e] !== pid) continue
      const o = other(e, v)
      if (d.has(o) || (pub.homes[o] && pub.homes[o].p !== pid)) continue
      d.set(o, d.get(v) + 1); q.push(o)
    }
  }
  return d
}
function pathToward(pub, pid, level, rand) {
  const pros = prospects(pub, pid).filter(([, x]) => x > 2)
  return pickBy(legal(pub, pid, 'path'), e => {
    const ends = [EDGES[e].a, EDGES[e].b].filter(v => !VERTS[v].e.some(x => x !== e && pub.paths[x] === pid) && pub.homes[v]?.p !== pid)
    if (!ends.length) return -1
    const d = steps(pub, pid, ends)
    return Math.max(-1, ...pros.filter(([u]) => d.has(u)).map(([u, x]) => x - 2.2 * d.get(u))) + (level === 'hard' ? 0.3 * pub.long[pid] : 0)
  }, level, rand)
}
// Put back the most plentiful resources first.
function autoDiscard(pub, pid) {
  const r = { ...pub.res[pid] }, give = {}
  for (let n = pub.discard?.[pid] || 0; n > 0; n--) {
    const k = RES.reduce((a, b) => (r[b] > r[a] ? b : a))
    r[k]--; give[k] = (give[k] || 0) + 1
  }
  return give
}
function raccoonMove(pub, pid, level, rand) {
  const lead = Math.max(...pub.players.map(p => score(pub, p)))
  const val = t => {
    let x = 0
    for (const v of TILES[t].v) {
      const h = pub.homes[v]
      if (!h) continue
      const p = pips(pub.tiles[t].n) * h.l
      x += h.p === pid ? -p * 3 : p * (1 + (score(pub, h.p) === lead ? 0.5 : 0)) + (total(pub.res[h.p]) ? 0.5 : 0)
    }
    return x
  }
  const tiles = raccoonSpots(pub, pid).filter(t => level !== 'easy' || !TILES[t].v.some(v => pub.homes[v]?.p === pid))
  const tile = pickBy(tiles.length ? tiles : raccoonSpots(pub, pid), val, level === 'easy' ? 'easy' : level === 'normal' ? 'normal' : 'hard', rand)
  const vs = victims(pub, pid, tile)
  const from = vs.length ? vs.reduce((b, p) => ((level === 'hard' ? score(pub, p) * 3 : 0) + total(pub.res[p]) > (level === 'hard' ? score(pub, b) * 3 : 0) + total(pub.res[b]) ? p : b)) : undefined
  return { type: 'raccoon', tile, from }
}

// What the bot is saving for, best first, among the things it could place right now.
function goals(v, me, level, rand) {
  const l = left(v, me)
  const can = {
    lodge: l.lodge > 0 && Object.values(v.homes).some(h => h.p === me && h.l === 1),
    cottage: l.cottage > 0 && legal(v, me, 'cottage').length > 0,
    card: v.deck > 0,
  }
  let order = level === 'hard' ? ['cottage', 'lodge', 'card'] : ['cottage', 'lodge', 'card']
  if (level === 'hard' && can.lodge && total(v.res[me]) >= 4 && v.res[me].tea >= 2) order = ['lodge', 'cottage', 'card']
  if (level === 'easy') order = shuffle(order, rand)
  return order.filter(g => can[g])
}
const valueFor = (v, me, level, rand) => {
  const want = {}
  for (const g of goals(v, me, level, rand).slice(0, 2)) for (const [k, n] of Object.entries(missing(v.res[me], COST[g]))) want[k] = (want[k] || 0) + n
  return k => 1 + (want[k] ? 1.2 : 0) - (v.res[me][k] >= 4 ? 0.5 : 0)
}

export function bot(v, me, level, rand = Math.random) {
  if (turn({ pub: v }) !== me) return null
  const res = v.res[me]
  if (v.phase === 'place') return v.place.at == null ? { type: 'cottage', v: bestSpot(v, me, level, rand) } : { type: 'path', e: setupPath(v, me, level, rand) }
  if (v.phase === 'discard') return { type: 'discard', give: autoDiscard(v, me) }
  if (v.phase === 'raccoon') return raccoonMove(v, me, level, rand)
  if (v.phase === 'trade') {
    const o = v.offer
    if (!has(res, o.get)) return { type: 'decline' }
    if (level === 'easy') return { type: rand() < 0.5 ? 'accept' : 'decline' }
    const val = valueFor(v, me, level, rand)
    const sum = b => Object.entries(b).reduce((a, [k, n]) => a + val(k) * n, 0)
    const gain = sum(o.give) - sum(o.get)
    const close = score(v, o.from) >= v.target - 2
    return { type: gain > (level === 'hard' ? 0.3 : 0) && !(level === 'hard' && close) ? 'accept' : 'decline' }
  }
  const hand = (v.me?.hand || []).filter(c => c.at < v.turns && c.k !== 'keep').map(c => c.k)
  const onMine = TILES[v.raccoon].v.some(x => v.homes[x]?.p === me)
  if (!v.played && hand.includes('paw') && (onMine || (level === 'hard' && v.helped[me] + 1 >= BONUS.help.min && v.bonus.help !== me))) return { type: 'play', card: 'paw' }
  if (v.phase === 'roll') return { type: 'roll' }
  if (v.phase !== 'main') return null
  if (v.acts > 40) return { type: 'end' }
  if (v.free > 0) { const e = pathToward(v, me, level, rand); if (e != null) return { type: 'build', kind: 'path', e } }

  const gs = goals(v, me, level, rand)
  // cozy cards that help right now
  if (!v.played && level !== 'easy' || (!v.played && rand() < 0.5)) {
    const g = gs[0] && missing(res, COST[gs[0]])
    if (hand.includes('picnic') && g && total(g) > 0 && total(g) <= 2) {
      const want = Object.entries(g).flatMap(([k, n]) => Array(n).fill(k))
      const stock = k => bankLeft(v, k) - want.filter(x => x === k).length
      while (want.length < 2) { const k = RES.filter(r => stock(r) > 0).sort((a, b) => res[a] - res[b])[0]; if (!k) break; want.push(k) }
      if (want.length === 2 && want.every(k => stock(k) >= 0)) return { type: 'play', card: 'picnic', res: want.slice(0, 2) }
    }
    if (hand.includes('gossip') && g && total(g) > 0) {
      const k = Object.keys(g).reduce((a, b) => (v.players.reduce((n, p) => n + (p === me ? 0 : Math.min(2, v.res[p][b])), 0) > v.players.reduce((n, p) => n + (p === me ? 0 : Math.min(2, v.res[p][a])), 0) ? b : a))
      if (v.players.some(p => p !== me && v.res[p][k] > 0)) return { type: 'play', card: 'gossip', res: k }
    }
    if (hand.includes('paths') && !gs.includes('cottage') && left(v, me).path > 0 && legal(v, me, 'path').length) return { type: 'play', card: 'paths' }
  }
  // build the first goal we can afford
  for (const g of gs) {
    if (!has(res, COST[g])) continue
    if (g === 'card') return { type: 'buy' }
    const mineHomes = Object.keys(v.homes).filter(x => v.homes[x].p === me && v.homes[x].l === 1).map(Number)
    const at = g === 'lodge' ? pickBy(mineHomes, x => spotValue(v, me, x), 'hard') : bestSpot(v, me, level === 'easy' ? 'easy' : 'hard', rand)
    if (at != null) return { type: 'build', kind: g, v: at }
  }
  // no spot for a cottage: grow a path toward one
  if (!gs.includes('cottage') && left(v, me).cottage > 0 && has(res, COST.path)) {
    const e = pathToward(v, me, level, rand)
    if (e != null) return { type: 'build', kind: 'path', e }
  }
  // one or two short of a goal: the harbour, then a friend
  const g = gs[0]
  if (g) {
    const need = missing(res, COST[g])
    const short = Object.keys(need)
    if (short.length && total(need) <= (level === 'easy' ? 1 : 2)) {
      const spare = RES.filter(k => !need[k] && res[k] - (COST[g][k] || 0) >= rate(v, me, k)).sort((a, b) => res[b] - res[a])[0]
      if (spare && bankLeft(v, short[0]) > 0 && (level !== 'easy' || total(res) > basketLimit(v))) return { type: 'bank', give: spare, get: short[0] }
      if (level !== 'easy' && v.offers === 0) {
        const extra = RES.filter(k => !need[k] && res[k] - (COST[g][k] || 0) >= 1).sort((a, b) => res[b] - res[a])[0]
        const to = v.players.filter(p => p !== me && v.res[p][short[0]] > 0 && score(v, p) < v.target - 2).sort((a, b) => v.res[b][short[0]] - v.res[a][short[0]])[0]
        if (extra && to) return { type: 'offer', to, give: { [extra]: 1 }, get: { [short[0]]: 1 } }
      }
    }
  }
  // too many to risk on a 7: spend on a card or a path
  if (total(res) > basketLimit(v) && level !== 'easy') {
    if (v.deck > 0 && has(res, COST.card)) return { type: 'buy' }
    if (has(res, COST.path) && left(v, me).path > 0) { const e = pathToward(v, me, level, rand); if (e != null) return { type: 'build', kind: 'path', e } }
  }
  return { type: 'end' }
}
