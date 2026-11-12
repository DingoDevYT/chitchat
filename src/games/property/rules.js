// Teacup Town: the classic property-trading board game, cozy. 40 spaces, 8 street groups, 4 trolleys, 2 works,
// two card decks, the Nap Nook (jail), cottages and inns (houses and hotels, with a limited bank), mortgages,
// auctions and trades. The full game (default) plays until everyone but one is broke; Quick mode ends after 20
// rounds and the richest wins. House rules (opts): quick, noAuction, picnicPot, startDouble, napNoRent.
// Can't pay? Your coins go negative: sell, mortgage or trade before your turn ends, or declare bankruptcy. Plain JS: runs in the browser and in the `game` edge function.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'property', name: 'Teacup Town', min: 2, max: 6, turnMs: 45000, blurb: 'The classic property game: buy streets, trade, build cottages and inns, and bankrupt your friends.' }

// `house` = price of one cottage (an inn costs one more on top of 4 cottages).
export const GROUPS = [
  { name: 'Mossy', color: '#9a6b4f', house: 50 },
  { name: 'Sky', color: '#8fc7e8', house: 50 },
  { name: 'Blossom', color: '#e58fb4', house: 100 },
  { name: 'Marmalade', color: '#f0a050', house: 100 },
  { name: 'Berry', color: '#d9534f', house: 150 },
  { name: 'Butter', color: '#f2d15c', house: 150 },
  { name: 'Fern', color: '#6fb06a', house: 200 },
  { name: 'Plum', color: '#6a5bc4', house: 200 },
]
// rent: [bare, 1 cottage, 2, 3, 4, inn]
const st = (name, g, price, rent) => ({ k: 'prop', name, g, price, rent })
export const BOARD = [
  { k: 'start', name: 'Start', sub: 'Collect 200 as you pass' },
  st('Mossy Lane', 0, 60, [2, 10, 30, 90, 160, 250]),
  { k: 'party', name: 'Tea Party' },
  st('Acorn Alley', 0, 60, [4, 20, 60, 180, 320, 450]),
  { k: 'tax', name: 'Tea Tax', amt: 200 },
  { k: 'rail', name: 'North Trolley', price: 200 },
  st('Pudding Place', 1, 100, [6, 30, 90, 270, 400, 550]),
  { k: 'cookie', name: 'Fortune Cookie' },
  st('Button Street', 1, 100, [6, 30, 90, 270, 400, 550]),
  st('Bluebell Bend', 1, 120, [8, 40, 100, 300, 450, 600]),
  { k: 'jail', name: 'Nap Nook', sub: 'Just visiting' },
  st('Clover Court', 2, 140, [10, 50, 150, 450, 625, 750]),
  { k: 'util', name: 'Lantern Works', price: 150 },
  st('Petal Path', 2, 140, [10, 50, 150, 450, 625, 750]),
  st('Sprout Square', 2, 160, [12, 60, 180, 500, 700, 900]),
  { k: 'rail', name: 'East Trolley', price: 200 },
  st('Maple Market', 3, 180, [14, 70, 200, 550, 750, 950]),
  { k: 'party', name: 'Tea Party' },
  st('Pumpkin Patch', 3, 180, [14, 70, 200, 550, 750, 950]),
  st('Honey Hill', 3, 200, [16, 80, 220, 600, 800, 1000]),
  { k: 'parking', name: 'Picnic Blanket', sub: 'Free rest' },
  st('Cherry Corner', 4, 220, [18, 90, 250, 700, 875, 1050]),
  { k: 'cookie', name: 'Fortune Cookie' },
  st('Jam Jar Row', 4, 220, [18, 90, 250, 700, 875, 1050]),
  st('Strawberry Steps', 4, 240, [20, 100, 300, 750, 925, 1100]),
  { k: 'rail', name: 'South Trolley', price: 200 },
  st('Buttercup Way', 5, 260, [22, 110, 330, 800, 975, 1150]),
  st('Sunny Side', 5, 260, [22, 110, 330, 800, 975, 1150]),
  { k: 'util', name: 'Well House', price: 150 },
  st('Lemon Lane', 5, 280, [24, 120, 360, 850, 1025, 1200]),
  { k: 'gojail', name: 'Go Nap', sub: 'Straight to the Nap Nook' },
  st('Teapot Terrace', 6, 300, [26, 130, 390, 900, 1100, 1275]),
  st('Willow Walk', 6, 300, [26, 130, 390, 900, 1100, 1275]),
  { k: 'party', name: 'Tea Party' },
  st('Fern Gardens', 6, 320, [28, 150, 450, 1000, 1200, 1400]),
  { k: 'rail', name: 'West Trolley', price: 200 },
  { k: 'cookie', name: 'Fortune Cookie' },
  st('Starlight Row', 7, 350, [35, 175, 500, 1100, 1300, 1500]),
  { k: 'tax', name: 'Comfy Tax', amt: 100 },
  st('Moonbeam Manor', 7, 400, [50, 200, 600, 1400, 1700, 2000]),
]
export const N = BOARD.length, JAIL = 10, BAIL = 50, SALARY = 200, START_CASH = 1500, HOUSES = 32, INNS = 12, QUICK_ROUNDS = 20
const RAIL_RENT = [0, 25, 50, 100, 200]

// Two decks. Effects: cash ±, to (walk there, collecting 200 if you pass Start), near (next rail/util: double rent /
// 10× a fresh roll if owned), back, nap, keep (get out of the Nap Nook free), repair [per cottage, per inn], each (±, from/to every player).
export const DECKS = {
  cookie: { name: 'Fortune Cookie', cards: [
    { text: 'Hop on the trolley to Start. Collect 200.', to: 0 },
    { text: 'Stroll to Strawberry Steps.', to: 24 },
    { text: 'Pop over to Clover Court.', to: 11 },
    { text: 'Wander to the nearest works. If someone owns it, roll and pay them 10 times the roll.', near: 'util' },
    { text: 'Catch the nearest trolley. If someone owns it, pay them double.', near: 'rail' },
    { text: 'Catch the nearest trolley. If someone owns it, pay them double.', near: 'rail' },
    { text: 'Your jam stall paid off. Collect 50.', cash: 50 },
    { text: 'A warm blanket: get out of the Nap Nook free. Keep this until you need it.', keep: true },
    { text: 'Oops, forgot your scarf. Go back 3 spaces.', back: 3 },
    { text: 'Too cozy! Go straight to the Nap Nook. Do not pass Start.', nap: true },
    { text: 'Spring cleaning: pay 25 per cottage and 100 per inn.', repair: [25, 100] },
    { text: 'You trod on a slug. Pay 15.', cash: -15 },
    { text: 'Take a ride on the North Trolley.', to: 5 },
    { text: 'Treat yourself at Moonbeam Manor.', to: 39 },
    { text: 'You hosted the bake-off. Pay every player 50.', each: -50 },
    { text: 'Your scarf pattern sold. Collect 150.', cash: 150 },
  ] },
  party: { name: 'Tea Party', cards: [
    { text: 'Hop on the trolley to Start. Collect 200.', to: 0 },
    { text: 'The bank found extra biscuits in your tin. Collect 200.', cash: 200 },
    { text: 'Vet visit for the cat. Pay 50.', cash: -50 },
    { text: 'Sold your old teapot. Collect 50.', cash: 50 },
    { text: 'A warm blanket: get out of the Nap Nook free. Keep this until you need it.', keep: true },
    { text: 'Fell asleep at the party. Go straight to the Nap Nook. Do not pass Start.', nap: true },
    { text: 'Your holiday jar is full. Collect 100.', cash: 100 },
    { text: 'Tea tax refund. Collect 20.', cash: 20 },
    { text: "It's your birthday! Every player gives you 10.", each: 10 },
    { text: 'Your knitting insurance paid out. Collect 100.', cash: 100 },
    { text: 'Hot water bottle burst. Pay 100.', cash: -100 },
    { text: 'Baking class fees. Pay 50.', cash: -50 },
    { text: 'Helped a neighbour plant tulips. Collect 25.', cash: 25 },
    { text: 'Fix the garden paths: pay 40 per cottage and 115 per inn.', repair: [40, 115] },
    { text: 'Second place in the cutest pet contest. Collect 10.', cash: 10 },
    { text: 'Great-aunt left you a quilt fund. Collect 100.', cash: 100 },
  ] },
}

export const ownable = sp => ['prop', 'rail', 'util'].includes(BOARD[sp].k)
export const groupOf = g => BOARD.map((b, i) => (b.g === g && b.k === 'prop' ? i : -1)).filter(i => i >= 0)
const lvl = (pub, sp) => pub.cottages[sp] || 0
export const fullGroup = (pub, g, pid) => groupOf(g).every(i => pub.owner[i] === pid)
export const housesLeft = pub => HOUSES - Object.values(pub.cottages).reduce((a, n) => a + (n < 5 ? n : 0), 0)
export const innsLeft = pub => INNS - Object.values(pub.cottages).filter(n => n === 5).length
export const houseCost = sp => GROUPS[BOARD[sp].g].house
export const mortgageValue = sp => BOARD[sp].price / 2
export const unmortgageCost = sp => Math.ceil(BOARD[sp].price * 0.55) // the loan plus 10%
const sameKind = (pub, sp, o) => BOARD.filter((x, i) => x.k === BOARD[sp].k && pub.owner[i] === o).length

export function rentOf(pub, sp, dice) {
  const b = BOARD[sp], o = pub.owner[sp]
  if (o == null || pub.mortgaged[sp]) return 0
  if (b.k === 'rail') return RAIL_RENT[sameKind(pub, sp, o)]
  if (b.k === 'util') return (sameKind(pub, sp, o) === 2 ? 10 : 4) * (dice[0] + dice[1])
  const c = lvl(pub, sp)
  return c ? b.rent[c] : b.rent[0] * (fullGroup(pub, b.g, o) ? 2 : 1)
}
export function worth(pub, pid) {
  let w = pub.cash[pid]
  for (const [sp, o] of Object.entries(pub.owner)) {
    if (o !== pid) continue
    w += pub.mortgaged[sp] ? mortgageValue(sp) : BOARD[sp].price
    if (BOARD[sp].k === 'prop') w += lvl(pub, sp) * houseCost(sp)
  }
  return w
}
const groupBuilt = (pub, sp) => BOARD[sp].k === 'prop' && groupOf(BOARD[sp].g).some(i => lvl(pub, i) > 0)

// Why you can't build here right now (null = you can): build evenly, on a whole unmortgaged group, while the bank has stock.
export function buildWhy(pub, pid, sp) {
  const b = BOARD[sp]
  if (b?.k !== 'prop' || pub.owner[sp] !== pid) return 'Not your street.'
  if (!fullGroup(pub, b.g, pid)) return `Own the whole ${GROUPS[b.g].name} set to build.`
  const g = groupOf(b.g), c = lvl(pub, sp)
  if (c >= 5) return 'It already has an inn.'
  const m = g.find(i => pub.mortgaged[i])
  if (m != null) return `Pay off ${BOARD[m].name} first.`
  const behind = g.find(i => lvl(pub, i) < c)
  if (behind != null) return `Build evenly: ${BOARD[behind].name} needs ${c === 4 ? '4 cottages' : 'a cottage'} first.`
  if (pub.cash[pid] < houseCost(sp)) return `You need ${houseCost(sp)} coins.`
  if (c < 4 ? housesLeft(pub) <= 0 : innsLeft(pub) <= 0) return `The bank is out of ${c < 4 ? 'cottages' : 'inns'}.`
  return null
}
export const canBuild = (pub, pid, sp) => buildWhy(pub, pid, sp) === null
// Sell evenly, at half price. Breaking an inn back into 4 cottages needs 4 in the bank.
export function canSell(pub, pid, sp) {
  if (BOARD[sp]?.k !== 'prop' || pub.owner[sp] !== pid) return false
  const c = lvl(pub, sp)
  return c > 0 && groupOf(BOARD[sp].g).every(i => lvl(pub, i) <= c) && (c < 5 || housesLeft(pub) >= 4)
}
export const canMortgage = (pub, pid, sp) => ownable(sp) && pub.owner[sp] === pid && !pub.mortgaged[sp] && !groupBuilt(pub, sp)
export const canUnmortgage = (pub, pid, sp) => pub.owner[sp] === pid && !!pub.mortgaged[sp] && pub.cash[pid] >= unmortgageCost(sp)

export function setup(players, seed, opts = {}) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`Teacup Town needs ${meta.min} to ${meta.max} players.`)
  const r = rng(seed)
  return {
    pub: {
      players: [...players], turn: 0, phase: 'roll', cash: Object.fromEntries(players.map(p => [p, START_CASH])),
      pos: Object.fromEntries(players.map(p => [p, 0])), owner: {}, cottages: {}, mortgaged: {}, napping: {}, broke: {},
      held: { cookie: null, party: null }, auction: null, offer: null, offers: 0,
      dice: [1, 1], doubles: 0, again: false, round: 1, maxRounds: opts.quick ? QUICK_ROUNDS : 0, debtTo: {}, pot: 0,
      opts: { noAuction: !!opts.noAuction, picnicPot: !!opts.picnicPot, startDouble: !!opts.startDouble, napNoRent: !!opts.napNoRent }, card: null, last: null, winner: null, rolls: 0,
    },
    priv: {},
    secret: { rs: Math.floor(r() * 2 ** 32), cookie: shuffle([...DECKS.cookie.cards.keys()], r), party: shuffle([...DECKS.party.cards.keys()], r) },
  }
}

export function turn(s) {
  const p = s.pub
  if (p.winner) return null
  if (p.phase === 'auction') return p.auction.in[p.auction.at]
  if (p.phase === 'trade') return p.offer.to
  return p.players[p.turn]
}
const live = pub => pub.players.filter(p => !pub.broke[p])

function sellOne(pub, sp) {
  pub.cash[pub.owner[sp]] += houseCost(sp) / 2
  pub.cottages[sp]--
  if (!pub.cottages[sp]) delete pub.cottages[sp]
}
// Only when a debtor's timer runs out: sell buildings evenly, then mortgage, so an away player doesn't stall the table.
function raise(pub, pid) {
  const mine = () => Object.keys(pub.owner).filter(sp => pub.owner[sp] === pid).map(Number)
  while (pub.cash[pid] < 0) {
    const sell = mine().filter(sp => canSell(pub, pid, sp)).sort((a, b) => lvl(pub, b) - lvl(pub, a))[0]
    if (sell != null) { sellOne(pub, sell); continue }
    const inn = mine().find(sp => lvl(pub, sp) === 5) // no cottages to break it into: sell it outright
    if (inn != null) { pub.cash[pid] += houseCost(inn) / 2 * 5; delete pub.cottages[inn]; continue }
    const m = mine().find(sp => canMortgage(pub, pid, sp))
    if (m == null) return
    pub.mortgaged[m] = true
    pub.cash[pid] += mortgageValue(m)
  }
}
// Pay amt to `to` (a player, or null for the bank). Coins can go negative: the payer owes it until they raise
// the money or go bankrupt (the creditor is paid in full now and loses back whatever was never covered).
function pay(pub, pid, amt, to) {
  if (amt <= 0) return
  pub.cash[pid] -= amt
  if (to) pub.cash[to] += amt
  else if (pub.opts?.picnicPot) pub.pot = (pub.pot || 0) + amt // house rule: bank fees pile up on the Picnic Blanket
  if (pub.cash[pid] < 0) pub.debtTo = { ...pub.debtTo, [pid]: to }
}
const owes = (pub, pid) => pub.cash[pid] < 0
// Out of the game: everything goes to whoever they owed (the bank takes property back unowned).
function goBroke(pub, pid) {
  const to = pub.debtTo?.[pid] ?? null
  if (to && !pub.broke[to] && pub.cash[pid] < 0) pub.cash[to] += pub.cash[pid] // they never got what wasn't there
  pub.broke[pid] = true
  pub.cash[pid] = 0
  const { [pid]: _, ...rest } = pub.debtTo || {}
  pub.debtTo = rest
  for (const sp of Object.keys(pub.owner)) {
    if (pub.owner[sp] !== pid) continue
    delete pub.cottages[sp]
    // shortcut: the bank takes property back unowned instead of auctioning it.
    if (to && !pub.broke[to]) pub.owner[sp] = to
    else { delete pub.owner[sp]; delete pub.mortgaged[sp] }
  }
  for (const d of Object.keys(pub.held)) if (pub.held[d] === pid) pub.held[d] = to && !pub.broke[to] ? to : null
}
function toNap(pub, pid) {
  pub.pos[pid] = JAIL; pub.napping[pid] = 1; pub.doubles = 0; pub.again = false; pub.phase = 'end'
}
function walk(pub, pid, to) {
  if (to < pub.pos[pid]) pub.cash[pid] += SALARY
  pub.pos[pid] = to
}
function draw(pub, secret, deck) {
  let order = secret[deck], i
  do { [i, ...order] = order; order = [...order, i] } while (DECKS[deck].cards[i].keep && pub.held[deck]) // the blanket is out: skip it
  return { secret: { ...secret, [deck]: order }, card: DECKS[deck].cards[i] }
}

// Resolve the space pid stands on. `mod`: 'rail2' (pay double) or 'util10' (pay 10× a fresh roll), from cards.
function land(pub, pid, secret, mod) {
  const sp = pub.pos[pid], b = BOARD[sp]
  if (b.k === 'tax') pay(pub, pid, b.amt, null)
  else if (b.k === 'gojail') toNap(pub, pid)
  else if (b.k === 'parking' && pub.opts?.picnicPot && pub.pot) { pub.cash[pid] += pub.pot; pub.last.pot = pub.pot; pub.pot = 0 }
  else if (b.k === 'cookie' || b.k === 'party') {
    const d = draw(pub, secret, b.k)
    secret = d.secret
    const c = d.card
    pub.card = { deck: b.k, text: c.text, back: !!c.back } // back: the token jumps instead of walking
    if (c.keep) pub.held[b.k] = pid
    if (c.cash > 0) pub.cash[pid] += c.cash
    if (c.cash < 0) pay(pub, pid, -c.cash, null)
    if (c.each > 0) for (const o of live(pub)) if (o !== pid) pay(pub, o, c.each, pid)
    if (c.each < 0) for (const o of live(pub)) if (o !== pid && !pub.broke[pid]) pay(pub, pid, -c.each, o)
    if (c.repair) {
      let n = 0, h = 0
      for (const [k, v] of Object.entries(pub.cottages)) if (pub.owner[k] === pid) { if (v === 5) h++; else n += v }
      pay(pub, pid, n * c.repair[0] + h * c.repair[1], null)
    }
    if (c.nap) toNap(pub, pid)
    if (c.to != null) { walk(pub, pid, c.to); return land(pub, pid, secret) }
    if (c.back) { pub.pos[pid] = (sp - c.back + N) % N; return land(pub, pid, secret) }
    if (c.near) {
      let t = sp
      do t = (t + 1) % N; while (BOARD[t].k !== c.near)
      walk(pub, pid, t)
      return land(pub, pid, secret, c.near === 'rail' ? 'rail2' : 'util10')
    }
  } else if (ownable(sp)) {
    const o = pub.owner[sp]
    if (o == null) pub.phase = 'buy'
    else if (o !== pid && !pub.broke[o] && !(pub.opts?.napNoRent && pub.napping[o])) {
      let dice = pub.dice
      if (mod === 'util10') {
        const r = rng(secret.rs)
        dice = [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]
        secret = { ...secret, rs: Math.floor(r() * 2 ** 32) }
        pub.last.util = dice
      }
      const rent = mod === 'util10' ? 10 * (dice[0] + dice[1]) : rentOf(pub, sp, dice) * (mod === 'rail2' ? 2 : 1)
      if (!pub.mortgaged[sp]) { pay(pub, pid, rent, o); pub.last.rent = { to: o, amt: rent } }
    }
  }
  return secret
}

function endTurn(pub) {
  const alive = live(pub)
  if (alive.length <= 1) { pub.winner = alive[0] ?? pub.players[0]; return }
  const n = pub.players.length
  let t = pub.turn
  do { t = (t + 1) % n; if (t === 0) pub.round++ } while (pub.broke[pub.players[t]])
  if (pub.maxRounds && pub.round > pub.maxRounds) {
    pub.round = pub.maxRounds
    pub.winner = alive.reduce((a, b) => (worth(pub, b) > worth(pub, a) ? b : a))
    return
  }
  Object.assign(pub, { turn: t, phase: 'roll', doubles: 0, again: false, offers: 0, card: null })
}

function finishAuction(pub) {
  const a = pub.auction
  if (a.high) { pub.cash[a.high] -= a.bid; pub.owner[a.sp] = a.high }
  pub.last = { ...pub.last, sold: a.high ? { sp: a.sp, to: a.high, bid: a.bid } : { sp: a.sp } }
  pub.auction = null
  pub.phase = 'end'
}

const clone = pub => ({
  ...pub, cash: { ...pub.cash }, pos: { ...pub.pos }, owner: { ...pub.owner }, cottages: { ...pub.cottages }, mortgaged: { ...pub.mortgaged },
  napping: { ...pub.napping }, broke: { ...pub.broke }, held: { ...pub.held }, debtTo: { ...pub.debtTo }, auction: pub.auction && { ...pub.auction, in: [...pub.auction.in] },
})
const ints = (x, n = 40) => Array.isArray(x) && x.length <= n && x.every(Number.isInteger) && new Set(x).size === x.length

export function move(s, pid, a) {
  if (s.pub.winner) throw new Error('This game is over.')
  if (turn(s) !== pid) throw new Error("It's not your turn.")
  const pub = clone(s.pub)
  let secret = s.secret
  const type = a?.type
  const owner = pub.players[pub.turn]
  const managing = ['roll', 'buy', 'end'].includes(pub.phase) // the turn owner can build, sell and mortgage
  pub.last = { pid, type }
  if (type === 'bail' || type === 'blanket') {
    if (pub.phase !== 'roll' || !pub.napping[pid]) throw new Error("You're wide awake.")
    if (type === 'bail') {
      if (pub.cash[pid] < BAIL) throw new Error(`Waking up costs ${BAIL}.`)
      pub.cash[pid] -= BAIL
    } else {
      const d = Object.keys(pub.held).find(k => pub.held[k] === pid)
      if (!d) throw new Error("You don't have a blanket card.")
      pub.held[d] = null
    }
    delete pub.napping[pid]
  } else if (type === 'roll') {
    if (pub.phase !== 'roll') throw new Error('Not time to roll.')
    if (owes(pub, pid)) throw new Error(`You owe ${-pub.cash[pid]}. Sell, mortgage or trade to pay it first, or declare bankruptcy.`)
    const r = rng(secret.rs)
    const d = [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]
    secret = { ...secret, rs: Math.floor(r() * 2 ** 32) }
    pub.dice = d; pub.rolls++; pub.card = null
    pub.last.dice = d; pub.last.from = pub.pos[pid]
    const dbl = d[0] === d[1]
    pub.phase = 'end'
    if (pub.napping[pid]) {
      if (!dbl && pub.napping[pid] < 3) { pub.napping[pid]++; pub.last.stay = true; return { pub, priv: s.priv, secret } }
      if (!dbl) pay(pub, pid, BAIL, null) // third try: pay and walk
      delete pub.napping[pid]
      pub.again = false // doubles out of the Nap Nook don't roll again
    } else if (dbl && ++pub.doubles === 3) {
      toNap(pub, pid); pub.last.napped = true
      return { pub, priv: s.priv, secret }
    } else pub.again = dbl
    if (!pub.broke[pid]) {
      walk(pub, pid, (pub.pos[pid] + d[0] + d[1]) % N)
      if (pub.pos[pid] === 0 && pub.opts?.startDouble) { pub.cash[pid] += SALARY; pub.last.startDouble = true } // house rule: land right on Start, collect double
      secret = land(pub, pid, secret)
      if (pub.napping[pid]) pub.last.napped = true
    }
  } else if (type === 'buy') {
    if (pub.phase !== 'buy') throw new Error('Nothing to buy.')
    const sp = pub.pos[pid]
    if (pub.cash[pid] < BOARD[sp].price) throw new Error('Not enough coins. Mortgage or sell something first, or let it go to auction.')
    pub.cash[pid] -= BOARD[sp].price
    pub.owner[sp] = pid
    pub.last.space = sp
    pub.phase = 'end'
  } else if (type === 'pass') {
    if (pub.phase !== 'buy') throw new Error('Nothing to buy.')
    const alive = live(pub), i = alive.indexOf(pid)
    pub.last.space = pub.pos[pid]
    if (pub.opts?.noAuction) pub.phase = 'end' // house rule: no auctions, it just stays for sale
    else {
      pub.auction = { sp: pub.pos[pid], bid: 0, high: null, in: [...alive.slice(i + 1), ...alive.slice(0, i + 1)], at: 0 }
      pub.phase = 'auction'
    }
  } else if (type === 'bid' || type === 'fold') {
    if (pub.phase !== 'auction') throw new Error('No auction right now.')
    const au = pub.auction
    if (type === 'bid') {
      const amt = a.amount
      if (!Number.isInteger(amt) || amt <= au.bid) throw new Error(`Bid more than ${au.bid}.`)
      if (amt > pub.cash[pid]) throw new Error("You don't have that many coins.")
      au.bid = amt; au.high = pid; au.at = (au.at + 1) % au.in.length
      pub.last.amount = amt
    } else {
      au.in.splice(au.at, 1)
      if (au.at >= au.in.length) au.at = 0
    }
    if (!au.in.length || (au.in.length === 1 && au.high === au.in[0])) finishAuction(pub)
  } else if (['build', 'sell', 'mortgage', 'unmortgage'].includes(type)) {
    const sp = a.space
    if (!managing) throw new Error('Not right now.')
    pub.last.space = sp
    if (type === 'build') {
      const why = buildWhy(pub, pid, sp)
      if (why) throw new Error(why)
      pub.cash[pid] -= houseCost(sp)
      pub.cottages[sp] = lvl(pub, sp) + 1
    } else if (type === 'sell') {
      if (!canSell(pub, pid, sp)) throw new Error("You can't sell there.")
      sellOne(pub, sp)
    } else if (type === 'mortgage') {
      if (!canMortgage(pub, pid, sp)) throw new Error("You can't mortgage that.")
      pub.mortgaged[sp] = true
      pub.cash[pid] += mortgageValue(sp)
    } else {
      if (!canUnmortgage(pub, pid, sp)) throw new Error("You can't pay that off yet.")
      pub.cash[pid] -= unmortgageCost(sp)
      delete pub.mortgaged[sp]
    }
  } else if (type === 'offer') {
    if (pub.phase !== 'roll' && pub.phase !== 'end') throw new Error('Trade before you roll or after you land.')
    if (pub.offers >= 3) throw new Error('Three offers a turn. Try again next turn.')
    const { to, give, get } = a
    const cash = Math.trunc(Number(a.cash) || 0)
    if (to === pid || !pub.players.includes(to) || pub.broke[to]) throw new Error('Trade with someone still playing.')
    if (!ints(give) || !ints(get) || (!give.length && !get.length)) throw new Error('Pick something to trade.')
    if (!give.every(sp => pub.owner[sp] === pid) || !get.every(sp => pub.owner[sp] === to)) throw new Error("That's not theirs to trade.")
    if ([...give, ...get].some(sp => groupBuilt(pub, sp))) throw new Error('Sell the cottages on that street group first.')
    if (cash > pub.cash[pid] || -cash > pub.cash[to]) throw new Error('Not enough coins for that.')
    pub.offer = { from: pid, to, give, get, cash, back: pub.phase }
    pub.offers++
    pub.phase = 'trade'
  } else if (type === 'accept' || type === 'decline') {
    if (pub.phase !== 'trade') throw new Error('No offer on the table.')
    const o = pub.offer
    if (type === 'accept') {
      for (const sp of o.give) pub.owner[sp] = o.to
      for (const sp of o.get) pub.owner[sp] = o.from
      pub.cash[o.from] -= o.cash; pub.cash[o.to] += o.cash
    }
    pub.last.offer = o
    pub.phase = o.back
    pub.offer = null
  } else if (type === 'end') {
    if (pub.phase !== 'end') throw new Error('Roll first.')
    if (owes(pub, pid)) throw new Error(`You owe ${-pub.cash[pid]}. Sell, mortgage or trade to pay it before your turn ends, or declare bankruptcy.`)
    if (pub.again && !pub.broke[pid] && !pub.napping[pid]) { pub.again = false; pub.phase = 'roll' }
    else endTurn(pub)
  } else if (type === 'bankrupt' || type === 'settle') {
    if (!managing || !owes(pub, pid)) throw new Error("You don't owe anything.")
    if (type === 'settle') raise(pub, pid) // the timer ran out: cover it automatically if possible
    if (owes(pub, pid)) { goBroke(pub, pid); pub.last.broke = true }
  } else throw new Error('Roll, buy, build, trade or end your turn.')
  if (live(pub).length <= 1 && !pub.winner) pub.winner = live(pub)[0]
  else if (pub.broke[owner] && !pub.winner && pub.phase !== 'auction' && pub.phase !== 'trade') endTurn(pub)
  return { pub, priv: s.priv, secret }
}

export function timeout(s) {
  const p = s.pub
  if ((p.phase === 'roll' || p.phase === 'end') && owes(p, p.players[p.turn])) return { type: 'settle' }
  return { roll: { type: 'roll' }, buy: { type: 'pass' }, end: { type: 'end' }, auction: { type: 'fold' }, trade: { type: 'decline' } }[s.pub.phase]
}
export const view = s => ({ ...s.pub, me: null })
export const over = s => (s.pub.winner ? [s.pub.winner] : null)

// ── Chitbots ──
// One street short of a set: swap for a street that completes theirs (sweetened so they gain), or offer people coins for it.
const missingOne = (v, pid) => GROUPS.map((_, g) => groupOf(g)).filter(gr => !gr.some(i => v.cottages[i]))
  .map(gr => gr.filter(i => v.owner[i] !== pid)).filter(m => m.length === 1 && v.owner[m[0]] != null && !v.broke[v.owner[m[0]]]).map(m => m[0])
function tradeIdea(v, me, rand) {
  for (const sp of missingOne(v, me)) {
    const them = v.owner[sp]
    const swap = missingOne(v, them).find(q => v.owner[q] === me && BOARD[q].g !== BOARD[sp].g)
    if (swap != null) {
      const cash = Math.max(0, Math.ceil((BOARD[sp].price - BOARD[swap].price) * 1.8 / 10) * 10) + 70
      if (v.cash[me] - cash >= 150) return { type: 'offer', to: them, give: [swap], get: [sp], cash }
    } else if (!them.startsWith('bot:') && rand() < 0.3) {
      const cash = Math.round(BOARD[sp].price * 1.6 / 10) * 10
      if (v.cash[me] - cash >= 300) return { type: 'offer', to: them, give: [], get: [sp], cash }
    }
  }
  return null
}
function value(v, me, sp, level) {
  const b = BOARD[sp]
  let x = b.price
  if (b.k === 'prop') {
    const g = groupOf(b.g)
    const others = g.filter(i => i !== sp)
    if (others.every(i => v.owner[i] === me)) x *= 1.8 // completes my set
    else if (level === 'hard' && others.every(i => v.owner[i] && v.owner[i] === v.owner[others[0]] && v.owner[i] !== me)) x *= 1.4 // blocks theirs
  } else if (sameKind(v, sp, me)) x *= 1.3
  return x
}
export function bot(v, me, level, rand = Math.random) {
  if (turn({ pub: v }) !== me) return null
  const cash = v.cash[me]
  const reserve = { easy: 0, normal: 150, hard: 100 }[level]
  if (v.phase === 'trade') {
    const o = v.offer
    const gain = o.give.reduce((a, sp) => a + value(v, me, sp, level), 0) + o.cash - o.get.reduce((a, sp) => a + value(v, o.from, sp, level), 0)
    const setsThem = o.get.some(sp => BOARD[sp].k === 'prop' && groupOf(BOARD[sp].g).every(i => i === sp || v.owner[i] === o.from))
    const setsMe = o.give.some(sp => BOARD[sp].k === 'prop' && groupOf(BOARD[sp].g).every(i => i === sp || v.owner[i] === me))
    const ok = level === 'easy' ? gain > -50 && rand() < 0.7 : gain > (level === 'hard' ? 60 : 0) && (!setsThem || setsMe)
    return { type: ok ? 'accept' : 'decline' }
  }
  if (v.phase === 'auction') {
    const a = v.auction
    const limit = value(v, me, a.sp, level) * { easy: 0.6 + rand() * 0.5, normal: 1, hard: 1.15 }[level]
    const next = a.bid + (a.bid < 100 ? 10 : 20)
    return next <= limit && cash - next >= reserve ? { type: 'bid', amount: next } : { type: 'fold' }
  }
  const mine = Object.keys(v.owner).filter(sp => v.owner[sp] === me).map(Number)
  if (cash < 0) { // in debt: sell buildings, then mortgage the cheapest streets, then give up
    const sell = mine.filter(sp => canSell(v, me, sp)).sort((a, b) => (v.cottages[b] || 0) - (v.cottages[a] || 0))[0]
    if (sell != null) return { type: 'sell', space: sell }
    const m = mine.filter(sp => canMortgage(v, me, sp)).sort((a, b) => BOARD[a].price - BOARD[b].price)[0]
    if (m != null) return { type: 'mortgage', space: m }
    return { type: 'bankrupt' }
  }
  if (level !== 'easy' && v.phase !== 'buy') {
    const pay = mine.filter(sp => canUnmortgage(v, me, sp) && cash - unmortgageCost(sp) >= 400)[0]
    if (pay != null) return { type: 'unmortgage', space: pay }
  }
  if (v.phase === 'roll' && !v.offers && level !== 'easy') {
    const t = tradeIdea(v, me, rand)
    if (t) return t
  }
  if (v.phase === 'roll') {
    if (v.napping[me]) {
      if (Object.values(v.held).includes(me)) return { type: 'blanket' }
      const early = BOARD.some((_, i) => ownable(i) && v.owner[i] == null)
      if (level !== 'easy' && cash > 300 && early) return { type: 'bail' }
    }
    return { type: 'roll' }
  }
  if (v.phase === 'buy') {
    const sp = v.pos[me], b = BOARD[sp]
    const wants = level === 'easy' ? rand() < 0.65 : true
    const keep = level === 'hard' && value(v, me, sp, level) > b.price ? 0 : reserve
    return cash - b.price >= keep && wants ? { type: 'buy' } : { type: 'pass' }
  }
  if (level !== 'easy') {
    const keep = level === 'hard' ? 120 : 250
    const spots = mine.filter(sp => canBuild(v, me, sp) && cash - houseCost(sp) >= keep)
    if (spots.length) return { type: 'build', space: spots.reduce((a, b) => (BOARD[b].rent[1] > BOARD[a].rent[1] ? b : a)) }
  }
  return { type: 'end' }
}
