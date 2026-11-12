// Starchat: the referee for a cozy party board game. Roll and walk the lantern loop, buy the star at whichever
// Wishing Post it sits on (then it drifts on), shop, use items, and play a minigame after every round. Most stars
// after the last round wins (bonus stars included); coins, then minigame coins, break ties.
// Mechanics only: every name and number comes from data.js. Plain JS, shared by the browser and the `game` edge
// function. All randomness is the seeded rng in secret.rs (dice can't be predicted from the public view).
//
// A turn (pub.phase): 'roll' (optionally one { type: 'item' } first, then { type: 'roll' }), then the walk, step by
// step. The walk stops for a decision when one is due: 'fork' (pick a path), 'star' (buy the star you are passing or
// standing on), 'shop' (a Lantern Stall you pass or land on). After the last step the space resolves and the turn
// passes on by itself. When everyone has moved: 'mini' (one minigame from minis/index.js, the interface is at the
// top of minis/count.js), the payout, then the next round. After the final round: bonus stars and 'done'.
//
// The minigame phase: pub.mini = { id, kind, state (the module's public part), posted, startAt }. startAt is the
// referee's clock plus the intro and 3-2-1 (D.MINI_LEAD_MS), so every client counts down to the same moment.
// 'pick' and 'sim' games: everyone posts one { type: 'mini', ... } entry, in any order, kept in the secret until the
// last one is in (bots first in turn(), like Chatterflies). 'turn' games: turn() names whoever decides next and only
// they may move. delay() paces it all: bots just after the start, people at the end of the play window.
import { rng, shuffle } from '../rng.js'
import * as D from './data.js'
import { MINIS } from './minis/index.js'

export { MINIS }
const { SPACES, POSTS, ITEMS, STAR, COINS, BRIDGE, ROUNDS } = D

export const meta = {
  id: 'starchat', name: D.NAME, min: 2, max: 8, turnMs: 30000,
  blurb: 'Roll round Lantern Hollow, buy the falling star wherever it lands, play a minigame every round. Most stars wins.',
}

export const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
export const current = pub => pub.order[pub.turn]
export const lastLanterns = pub => pub.round > pub.maxRounds - ROUNDS.lastLanterns
export const starPrice = pub => (pub.opts.cheapStars ? STAR.cheap : pub.opts.dearStars ? STAR.dear : STAR.price) + (pub.opts.risingPrice ? STAR.rising * pub.starsBought : 0)
export const bridgeOpen = pub => !pub.opts.noBridge && (!BRIDGE.even || pub.round % 2 === 0)
// The paths you may take from a space (a gated one needs the toll and, for the bridge, an even round).
export function exits(pub, pid, sp) {
  return SPACES[sp].next.filter(to => to !== BRIDGE.to || sp !== BRIDGE.from || (bridgeOpen(pub) && pub.coins[pid] >= BRIDGE.toll))
}
// Steps from `from` to every space (forward only). `bridge`: may the shortcut be used?
export function dists(from, bridge = true) {
  const d = SPACES.map(() => Infinity), q = [from]
  d[from] = 0
  while (q.length) {
    const x = q.shift()
    for (const y of SPACES[x].next) if ((bridge || x !== BRIDGE.from || y !== BRIDGE.to) && d[y] === Infinity) { d[y] = d[x] + 1; q.push(y) }
  }
  return d
}
export const ranking = pub => [...pub.players].sort((a, b) => pub.stars[b] - pub.stars[a] || pub.coins[b] - pub.coins[a] || pub.stats.mini[b] - pub.stats.mini[a])
const tied = (pub, a, b) => pub.stars[a] === pub.stars[b] && pub.coins[a] === pub.coins[b] && pub.stats.mini[a] === pub.stats.mini[b]
const STATS = ['mini', 'walked', 'talk', 'glow', 'mishaps', 'spent']
const pick = (list, r) => list[Math.floor(r() * list.length)]
const canHold = (pub, pid, id) => pub.satchel[pid].length < D.SATCHEL && (!ITEMS[id].max || pub.satchel[pid].filter(x => x === id).length < ITEMS[id].max)
const stocked = pub => Object.keys(ITEMS).filter(id => !ITEMS[id].from || pub.round >= ITEMS[id].from)

export function setup(players, seed, opts = {}) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`${D.NAME} needs ${meta.min} to ${meta.max} players.`)
  const r = rng(seed)
  const o = {
    quick: !!opts.quick, festival: !!opts.festival, openBonus: !!opts.openBonus, noBonus: !!opts.noBonus,
    risingPrice: !!opts.risingPrice, cheapStars: !!opts.cheapStars, dearStars: !!opts.dearStars, noBridge: !!opts.noBridge,
    mini: typeof opts.mini === 'string' && MINIS[opts.mini] ? opts.mini : null, // always this minigame (tests, the lab)
  }
  const each = v => Object.fromEntries(players.map(p => [p, typeof v === 'function' ? v() : v]))
  const bonus = o.noBonus ? [] : shuffle(D.BONUS.map(b => b.id), r).slice(0, D.BONUS_DRAWN)
  const pub = {
    players: [...players], order: shuffle(players, r), turn: 0, round: 1, phase: 'roll',
    maxRounds: o.quick ? ROUNDS.quick : o.festival ? ROUNDS.festival : ROUNDS.standard,
    coins: each(D.START_COINS), stars: each(0), pos: each(D.START), satchel: each(() => []), snail: {}, traps: {}, pot: 0,
    star: pick(POSTS, r), starIdle: 0, starsBought: 0,
    used: false, diceN: 1, boat: null, dice: null, rolls: 0, walk: null, fork: null, shop: null,
    mini: null, miniResult: null, lastMini: null,
    stats: Object.fromEntries(STATS.map(k => [k, each(0)])),
    bonus: o.openBonus ? bonus : null, awards: null, opts: o, last: null, winners: null, winner: null,
  }
  return { pub, priv: {}, secret: { rs: Math.floor(r() * 2 ** 32), bonus, mini: null } }
}

export function turn(s) {
  const p = s.pub
  if (p.winners) return null
  if (p.phase === 'mini') {
    if (p.mini.kind === 'turn') return MINIS[p.mini.id].whose(p.mini.state)
    return p.players.find(x => isBot(x) && !p.mini.posted[x]) ?? p.players.find(x => !p.mini.posted[x]) ?? null
  }
  return current(p)
}

// When the next move is due (the edge function's deadline; undefined: its usual timer). Minigames: a bot just after
// the start (a turn game's bot after a short think), a person at the end of the play window or their turn timer.
// The first roll after a minigame waits for the results reveal.
export function delay(s, now = Date.now()) {
  const p = s.pub, who = turn(s)
  if (!who) return null
  if (p.phase === 'mini') {
    const M = MINIS[p.mini.id], cfg = D.MINIGAMES[p.mini.id], start = p.mini.startAt ?? now
    if (p.mini.kind === 'turn') return isBot(who) ? Math.max(900, start - now + 1200) : Math.max(0, start - now) + cfg.turnMs
    return isBot(who) ? Math.max(300, start - now + 400) : Math.max(1000, start + M.duration(cfg) + D.MINI_GRACE_MS - now)
  }
  const r = p.miniResult
  if (p.phase === 'roll' && p.turn === 0 && r?.at && r.round === p.round - 1 && now < r.at + D.MINI_RESULTS_MS) {
    const wait = r.at + D.MINI_RESULTS_MS - now
    return isBot(who) ? wait + 600 : wait + meta.turnMs
  }
  return undefined
}

// ── moving the star ──
// Pick another post: never the one it's on, nor one within reach just ahead of whoever bought it.
function drift(pub, r, from) {
  const near = from == null ? null : dists(from)
  let opts = POSTS.filter(p => p !== pub.star && (!near || near[p] > STAR.notWithin))
  if (!opts.length) opts = POSTS.filter(p => p !== pub.star)
  const was = pub.star
  pub.star = pick(opts, r)
  pub.starIdle = 0
  pub.last.ev.push({ e: 'drift', from: was, to: pub.star })
}

function give(pub, r, pid) { // a random item, or coins when the satchel is full
  const can = stocked(pub).filter(id => canHold(pub, pid, id))
  if (pub.satchel[pid].length >= D.SATCHEL || !can.length) { pub.coins[pid] += COINS.fireflyFull; return { e: 'firefly', coins: COINS.fireflyFull } }
  const id = pick(can, r)
  pub.satchel[pid].push(id)
  return { e: 'firefly', item: id }
}
const take = (pub, pid, amt) => { const n = Math.min(pub.coins[pid], amt); pub.coins[pid] -= n; return n }
function umbrella(pub, pid) {
  const i = pub.satchel[pid].indexOf('umbrella')
  if (i < 0) return false
  pub.satchel[pid].splice(i, 1)
  return true
}
const prev = sp => SPACES.findIndex(x => x.next.includes(sp))

// ── the walk ──
// Runs the walk until it needs a decision (sets the phase and returns) or the last step resolves and the turn ends.
// walk.chk: 0 = check the star here next, 1 = check a stall here next, 2 = this space is done, take the next step.
function proceed(pub, secret, r, pid) {
  const w = pub.walk
  for (;;) {
    const here = pub.pos[pid]
    if (w.chk === 0) {
      w.chk = 1
      if (here === pub.star && pub.coins[pid] >= starPrice(pub)) { pub.phase = 'star'; return }
    }
    if (w.chk === 1) {
      w.chk = 2
      if (SPACES[here].k === 'stall') {
        const stock = shuffle(stocked(pub), r).slice(0, D.STALL_STOCK)
        pub.shop = { at: here, stock }
        if (shopping(pub, pid)) { pub.phase = 'shop'; return }
        pub.shop = null
      }
    }
    if (w.left <= 0) { land(pub, r, pid); endTurn(pub, secret, r); return }
    const ex = exits(pub, pid, here)
    if (ex.length > 1 && w.choice == null) { pub.fork = ex; pub.phase = 'fork'; return }
    const to = w.choice ?? ex[0]
    w.choice = null
    pub.fork = null
    pub.pos[pid] = to
    pub.stats.walked[pid]++
    w.left--
    w.chk = 0
    pub.last.path = [...(pub.last.path || []), to]
  }
}
export const shopping = (pub, pid) => !!pub.shop && pub.shop.stock.some(id => ITEMS[id].price <= pub.coins[pid] && canHold(pub, pid, id))

// Resolve the space you stopped on. Last Lanterns doubles Glow and Drizzle.
function land(pub, r, pid) {
  const sp = pub.pos[pid], k = SPACES[sp].k, x = lastLanterns(pub) ? 2 : 1, ev = pub.last.ev
  const owner = pub.traps[sp]
  if (owner != null && owner !== pid) { // your own trap stays set for someone else
    const n = take(pub, pid, COINS.trap)
    pub.coins[owner] += n
    ev.push({ e: 'trap', to: owner, coins: n })
    delete pub.traps[sp]
  }
  ev.push({ e: 'land', sp, k })
  if (k === 'glow') {
    pub.coins[pid] += COINS.glow * x
    pub.stats.glow[pid]++
    ev.push({ e: 'glow', coins: COINS.glow * x })
    if (pub.pot) { pub.coins[pid] += pub.pot; ev.push({ e: 'pot', coins: pub.pot }); pub.pot = 0 }
  } else if (k === 'drizzle') {
    if (umbrella(pub, pid)) ev.push({ e: 'umbrella' })
    else ev.push({ e: 'drizzle', coins: take(pub, pid, COINS.drizzle * x) })
  } else if (k === 'firefly') ev.push(give(pub, r, pid))
  else if (k === 'bramble') {
    if (umbrella(pub, pid)) { ev.push({ e: 'umbrella' }); return }
    const i = Math.floor(r() * D.MISHAPS.length), c = D.MISHAPS[i]
    if (!c.none) pub.stats.mishaps[pid]++
    const out = { e: 'mishap', card: i }
    if (c.lose) out.coins = take(pub, pid, c.lose)
    if (c.back) for (let n = 0; n < c.back; n++) pub.pos[pid] = prev(pub.pos[pid])
    if (c.each) for (const o of pub.players) if (o !== pid) pub.coins[o] += take(pub, pid, c.each)
    ev.push(out)
  } else if (k === 'tea') {
    const t = D.TEA_EVENTS[Math.floor(r() * D.TEA_EVENTS.length)]
    const out = { e: 'tea', id: t.id }
    if (t.id === 'ferry') pub.pos[pid] = out.to = pick(POSTS, r)
    else if (t.id === 'swap') {
      const o = pick(pub.players.filter(q => q !== pid), r)
      ;[pub.pos[pid], pub.pos[o]] = [pub.pos[o], pub.pos[pid]]
      out.with = o
    } else if (t.id === 'pot') for (const o of pub.players) pub.pot += take(pub, o, COINS.teaPot)
    ev.push(out)
    if (t.id === 'drift') drift(pub, r, null)
  } else if (k === 'owl') ev.push({ e: 'owl' }) // shortcut: Owl Post duels and Moonlight Trade arrive in M3
  else if (k === 'post' && sp !== pub.star) { pub.coins[pid] += COINS.post; ev.push({ e: 'post', coins: COINS.post }) }
}

function endTurn(pub, secret, r) {
  Object.assign(pub, { used: false, diceN: 1, boat: null, walk: null, fork: null, shop: null, phase: 'roll' })
  if (++pub.turn < pub.order.length) return
  // Everyone has moved: the minigame (one that fits the table, never the same one twice in a row while there's a choice).
  const n = pub.players.length
  const ids = pub.opts.mini ? [pub.opts.mini] : Object.keys(MINIS).filter(i => n >= (D.MINIGAMES[i].min ?? 1) && n <= (D.MINIGAMES[i].max ?? 99))
  const choice = ids.length > 1 ? ids.filter(i => i !== pub.lastMini) : ids
  const id = pick(choice, r), b = MINIS[id].begin(pub.players, r, D.MINIGAMES[id])
  pub.mini = { id, kind: MINIS[id].kind, state: b.pub, posted: {}, startAt: null } // move() stamps startAt
  pub.phase = 'mini'
  secret.mini = { secret: b.secret, entries: {} }
}

function finishMini(pub, secret, r, now) {
  const { id, state } = pub.mini, M = MINIS[id]
  const { scores, bonus, reveal } = M.finish(state, secret.mini.secret, secret.mini.entries)
  const order = [...pub.players].sort((a, b) => scores[b] - scores[a])
  const place = {}, won = {}
  order.forEach((p, i) => { place[p] = i && scores[p] === scores[order[i - 1]] ? place[order[i - 1]] : i + 1 })
  for (const p of pub.players) {
    won[p] = (D.MINI_PRIZES[place[p] - 1] || 0) + (bonus[p] || 0)
    pub.coins[p] += won[p]
    pub.stats.mini[p] += won[p]
  }
  pub.miniResult = { id, round: pub.round, place, coins: won, reveal, at: now }
  pub.lastMini = id
  pub.mini = null
  secret.mini = null
  if (++pub.starIdle >= STAR.idleRounds) drift(pub, r, null) // nobody bought it for a while: it wanders off
  if (pub.round >= pub.maxRounds) return finishGame(pub, secret)
  pub.round++
  pub.turn = 0
  pub.phase = 'roll'
  if (pub.round === pub.maxRounds - ROUNDS.lastLanterns + 1 && pub.round > 1) { // Last Lanterns: a hand for last place
    const rk = ranking(pub), low = rk[rk.length - 1]
    const who = pub.players.filter(p => pub.stars[p] === pub.stars[low] && pub.coins[p] === pub.coins[low])
    for (const p of who) { pub.coins[p] += COINS.lastPlace; if (canHold(pub, p, 'jar')) pub.satchel[p].push('jar') }
    pub.last.ev.push({ e: 'lastLanterns', to: who })
  }
}

function finishGame(pub, secret) {
  const ids = pub.bonus ?? secret.bonus
  pub.awards = ids.map(id => {
    const st = D.BONUS.find(b => b.id === id).stat
    const top = Math.max(...pub.players.map(p => pub.stats[st][p]))
    const to = top > 0 ? pub.players.filter(p => pub.stats[st][p] === top) : [] // ties share; nobody wins a zero
    for (const p of to) pub.stars[p]++
    return { id, to, value: top }
  })
  pub.bonus = ids
  const rk = ranking(pub)
  pub.winners = rk.filter(p => tied(pub, p, rk[0]))
  pub.winner = rk[0]
  pub.phase = 'done'
}

const clone = x => JSON.parse(JSON.stringify(x))

// now: the referee's clock (the edge function calls move with three arguments, so it's the server's Date.now()).
export function move(s, pid, a, now = Date.now()) {
  if (s.pub.winners) throw new Error('This game is over.')
  const type = a?.type
  const mini = s.pub.phase === 'mini'
  if (mini && type === 'mini' && s.pub.mini.kind !== 'turn') { // simultaneous: anyone still to post, in any order
    if (!s.pub.players.includes(pid)) throw new Error("You're not playing this one.")
    if (s.pub.mini.posted[pid]) throw new Error('You already played this minigame.')
  } else if (turn(s) !== pid) throw new Error("It's not your turn.")
  const pub = clone(s.pub), secret = { ...s.secret }, r = rng(secret.rs)
  pub.last = { pid, type, ev: [] }
  if (Number.isFinite(a?.talk) && !isBot(pid)) pub.stats.talk[pid] = Math.max(pub.stats.talk[pid], Math.min(1e7, Math.floor(a.talk))) // a running speaking-time meter
  const ph = pub.phase
  if (ph === 'mini') {
    const M = MINIS[pub.mini.id]
    if (type !== 'mini' && type !== 'timeout') throw new Error('Play the minigame.')
    if (pub.mini.kind === 'turn') {
      const out = M.act(pub.mini.state, secret.mini.secret, pid, type === 'timeout' ? M.timeoutMove(pub.mini.state, pid) : a, r)
      pub.mini.state = out.state
      secret.mini = { ...secret.mini, secret: out.secret }
      if (M.whose(out.state) == null) { for (const p of pub.players) pub.mini.posted[p] = true; finishMini(pub, secret, r, now) }
    } else {
      const entry = type === 'mini' ? M.submit(pub.mini.state, pid, a, { now, startAt: pub.mini.startAt, bot: isBot(pid) }) : M.timeoutEntry
      secret.mini = { ...secret.mini, entries: { ...secret.mini.entries, [pid]: entry } }
      pub.mini.posted[pid] = true
      if (pub.players.every(p => pub.mini.posted[p])) finishMini(pub, secret, r, now)
    }
  } else if (ph === 'roll' && type === 'item') {
    if (pub.used) throw new Error('One item a turn.')
    const id = a.item, it = ITEMS[id], bag = pub.satchel[pid]
    if (!it || !bag.includes(id)) throw new Error("You don't have that.")
    if (it.use === 'passive') throw new Error(`The ${it.name} works by itself.`)
    if (it.use === 'pick' && !(Number.isInteger(a.pick) && a.pick >= 1 && a.pick <= 6)) throw new Error('Pick a roll from 1 to 6.')
    if (it.use === 'trap' && !(Number.isInteger(a.space) && SPACES[a.space])) throw new Error('Pick a space for the trap.')
    if (it.use === 'snail' && (a.target === pid || !pub.players.includes(a.target))) throw new Error('Pick someone else.')
    bag.splice(bag.indexOf(id), 1)
    pub.used = true
    pub.last.item = id
    if (it.use === 'dice') pub.diceN = it.dice
    else if (it.use === 'pick') pub.boat = a.pick
    else if (it.use === 'trap') { pub.traps[a.space] = pid; pub.last.space = a.space }
    else if (it.use === 'snail') { pub.snail[a.target] = true; pub.last.target = a.target }
    else if (it.use === 'gust') drift(pub, r, null)
    else if (it.use === 'warp') { // straight to the star: you may buy it, then the post resolves
      pub.pos[pid] = pub.star
      pub.walk = { left: 0, chk: 0 }
      proceed(pub, secret, r, pid)
    }
  } else if (ph === 'roll' && type === 'roll') {
    const faces = pub.snail[pid] ? 3 : 6
    const dice = pub.boat ? [Math.min(pub.boat, faces)] : Array.from({ length: pub.diceN }, () => 1 + Math.floor(r() * faces))
    delete pub.snail[pid]
    pub.dice = dice
    pub.rolls++
    pub.last.dice = dice
    pub.last.from = pub.pos[pid]
    pub.walk = { left: dice.reduce((x, y) => x + y, 0), chk: 2 }
    proceed(pub, secret, r, pid)
  } else if (ph === 'fork' && type === 'path') {
    if (!pub.fork.includes(a.to)) throw new Error("You can't go that way.")
    if (a.to === BRIDGE.to && pub.pos[pid] === BRIDGE.from) { pub.coins[pid] -= BRIDGE.toll; pub.last.ev.push({ e: 'toll', coins: BRIDGE.toll }) }
    pub.walk.choice = a.to
    proceed(pub, secret, r, pid)
  } else if (ph === 'star' && (type === 'star' || type === 'pass')) {
    if (type === 'star') {
      const n = a.n ?? 1
      if (n !== 1 && !(n === 2 && lastLanterns(pub))) throw new Error('One star at a time (two during Last Lanterns).')
      let cost = 0
      for (let i = 0; i < n; i++) cost += starPrice({ ...pub, starsBought: pub.starsBought + i })
      if (pub.coins[pid] < cost) throw new Error(`That costs ${cost} coins.`)
      pub.coins[pid] -= cost
      pub.stars[pid] += n
      pub.starsBought += n
      pub.stats.spent[pid] += cost
      pub.last.ev.push({ e: 'star', n, coins: cost, at: pub.star })
      drift(pub, r, pub.pos[pid])
    }
    proceed(pub, secret, r, pid)
  } else if (ph === 'shop' && (type === 'buy' || type === 'leave')) {
    if (type === 'buy') {
      const id = a.item, it = ITEMS[id]
      if (!pub.shop.stock.includes(id)) throw new Error("That's not on the stall today.")
      if (pub.coins[pid] < it.price) throw new Error(`The ${it.name} costs ${it.price} coins.`)
      if (!canHold(pub, pid, id)) throw new Error('Your satchel is full.')
      pub.coins[pid] -= it.price
      pub.stats.spent[pid] += it.price
      pub.satchel[pid].push(id)
      pub.shop.stock.splice(pub.shop.stock.indexOf(id), 1)
      pub.last.ev.push({ e: 'buy', item: id, coins: it.price })
    }
    if (type === 'leave' || !shopping(pub, pid)) { pub.shop = null; proceed(pub, secret, r, pid) }
  } else throw new Error({ roll: 'Roll, or use an item first.', fork: 'Pick a path.', star: 'Buy the star or pass.', shop: 'Buy something or leave the stall.' }[ph] || 'Not right now.')
  if (pub.mini && pub.mini.startAt == null) pub.mini.startAt = now + D.MINI_LEAD_MS // a minigame just began
  secret.rs = Math.floor(r() * 2 ** 32)
  return { pub, priv: s.priv, secret }
}

export function timeout(s) {
  const p = s.pub
  return { roll: { type: 'roll' }, fork: { type: 'path', to: p.fork?.[0] }, star: { type: 'pass' }, shop: { type: 'leave' }, mini: { type: 'timeout' } }[p.phase] ?? null
}
export const view = s => ({ ...s.pub })
export const over = s => s.pub.winners

// Every move pid may make right now (item moves with one sensible target each). For the placeholder UI and tests.
export function legal(v, pid) {
  if (v.winners) return []
  if (v.phase === 'mini') {
    if (v.mini.kind === 'turn') return turn({ pub: v }) === pid ? [1, 2, 3].map(puff => ({ type: 'mini', puff })) : []
    return v.mini.posted[pid] ? [] : [{ type: 'mini' }]
  }
  if (turn({ pub: v }) !== pid) return []
  if (v.phase === 'fork') return v.fork.map(to => ({ type: 'path', to }))
  if (v.phase === 'star') return [...(v.coins[pid] >= starPrice(v) ? [{ type: 'star', n: 1 }] : []), ...(lastLanterns(v) && v.coins[pid] >= 2 * starPrice(v) + STAR.rising * (v.opts.risingPrice ? 1 : 0) ? [{ type: 'star', n: 2 }] : []), { type: 'pass' }]
  if (v.phase === 'shop') return [...v.shop.stock.filter(id => ITEMS[id].price <= v.coins[pid] && canHold(v, pid, id)).map(item => ({ type: 'buy', item })), { type: 'leave' }]
  const out = [{ type: 'roll' }]
  if (!v.used) for (const item of new Set(v.satchel[pid])) {
    const u = ITEMS[item].use
    if (u === 'pick') for (let n = 1; n <= 6; n++) out.push({ type: 'item', item, pick: n })
    else if (u === 'trap') out.push({ type: 'item', item, space: SPACES[v.star].next[0] })
    else if (u === 'snail') { for (const t of v.players) if (t !== pid) out.push({ type: 'item', item, target: t }) } // braces: a bare `else` here bound to the inner if
    else if (u !== 'passive') out.push({ type: 'item', item })
  }
  return out
}

// ── Chitbots ──
// Steps to the star from a space (the bridge counts only when it's open and affordable).
const starDist = (v, pid, from = v.pos[pid]) => dists(from, bridgeOpen(v) && v.coins[pid] >= BRIDGE.toll)[v.star]
const PREFS = {
  easy: ['boat', 'umbrella'], // the pretty ones
  normal: ['comet', 'jar', 'boat', 'bigjar', 'umbrella', 'snail', 'trap'],
  hard: ['comet', 'boat', 'bigjar', 'jar', 'gust', 'snail', 'trap', 'umbrella'],
}
export function bot(v, me, level, rand = Math.random) {
  if (v.winners) return null
  if (v.phase === 'mini') {
    if (v.mini.kind === 'turn') return turn({ pub: v }) === me ? MINIS[v.mini.id].bot(v.mini.state, me, level, rand) : null
    return v.mini.posted[me] ? null : MINIS[v.mini.id].bot(v.mini.state, me, level, rand)
  }
  if (turn({ pub: v }) !== me) return null
  const coins = v.coins[me], price = starPrice(v), d = starDist(v, me), bag = v.satchel[me]
  if (v.phase === 'star') return { type: 'star', n: level !== 'easy' && lastLanterns(v) && legal(v, me).some(m => m.n === 2) ? 2 : 1 }
  if (v.phase === 'fork') {
    if (level === 'easy') return { type: 'path', to: v.fork[Math.floor(rand() * v.fork.length)] }
    const cost = to => starDist(v, me, to) + (to === BRIDGE.to ? 1 : 0) // the toll makes a tie go the long way
    return { type: 'path', to: v.fork.reduce((a, b) => (cost(b) < cost(a) ? b : a)) }
  }
  if (v.phase === 'shop') {
    const reserve = level === 'easy' ? 0 : d <= 12 ? price : 0
    const want = PREFS[level].find(id => v.shop.stock.includes(id) && !bag.includes(id) && legal(v, me).some(m => m.item === id) &&
      coins - ITEMS[id].price >= (id === 'comet' ? price : reserve))
    return want ? { type: 'buy', item: want } : { type: 'leave' }
  }
  // roll phase: maybe an item first
  if (!v.used && bag.length) {
    const has = id => bag.includes(id)
    if (level === 'easy') return has('boat') && rand() < 0.5 ? { type: 'item', item: 'boat', pick: 1 + Math.floor(rand() * 6) } : { type: 'roll' }
    const rich = coins >= price
    if (has('comet') && rich && d > 6) return { type: 'item', item: 'comet' }
    if (has('boat') && rich && d >= 1 && d <= 6) return { type: 'item', item: 'boat', pick: d }
    if (d >= 7 && d <= 12) {
      if (has('bigjar') && d > 9) return { type: 'item', item: 'bigjar' }
      if (has('jar')) return { type: 'item', item: 'jar' }
    }
    const rivals = v.players.filter(p => p !== me)
    const leader = ranking(v).find(p => p !== me)
    if (has('snail') && leader && (level === 'hard' || v.stars[leader] >= v.stars[me])) return { type: 'item', item: 'snail', target: leader }
    if (has('trap')) return { type: 'item', item: 'trap', space: level === 'hard' ? SPACES[v.star].next[0] : v.star }
    if (level === 'hard' && has('gust') && d > 6 && rivals.some(p => starDist(v, p) <= 6)) return { type: 'item', item: 'gust' }
  }
  return { type: 'roll' }
}
