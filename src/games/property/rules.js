// Teacup Town: our own cozy property-trading board game. Roll, walk the 24-space loop, buy little shops,
// collect rent, build cottages. Quick mode (default) ends after 12 rounds: the richest player wins.
// Plain JS: runs in the browser and in the `game` edge function.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'property', name: 'Teacup Town', min: 2, max: 6, turnMs: 45000, blurb: 'Buy cozy shops, build cottages, collect rent.' }

// Groups: colour + cottage price. Rent with 0..4 cottages = base × MULT; a full group doubles bare rent.
export const GROUPS = [
  { name: 'Mossy', color: '#9a6b4f', cottage: 50 },
  { name: 'Sky', color: '#8fc7e8', cottage: 50 },
  { name: 'Blossom', color: '#e58fb4', cottage: 100 },
  { name: 'Marmalade', color: '#f0a050', cottage: 100 },
  { name: 'Fern', color: '#6fb06a', cottage: 150 },
  { name: 'Plum', color: '#8a6bc4', cottage: 150 },
]
const MULT = [1, 5, 14, 32, 45]
export const BOARD = [
  { k: 'start', name: 'Start', sub: 'Collect 200' },
  { k: 'prop', name: 'Mossy Lane', g: 0, price: 60, rent: 4 },
  { k: 'fortune', name: 'Fortune Cookie' },
  { k: 'prop', name: 'Fern Row', g: 0, price: 80, rent: 6 },
  { k: 'tax', name: 'Tea Tax', amt: 100 },
  { k: 'trolley', name: 'North Trolley', price: 200 },
  { k: 'nap', name: 'Nap Nook', sub: 'Just visiting' },
  { k: 'prop', name: 'Pudding Place', g: 1, price: 100, rent: 8 },
  { k: 'prop', name: 'Button Street', g: 1, price: 120, rent: 10 },
  { k: 'oven', name: 'Bakery Oven', price: 150 },
  { k: 'prop', name: 'Clover Court', g: 2, price: 140, rent: 12 },
  { k: 'prop', name: 'Sprout Square', g: 2, price: 160, rent: 14 },
  { k: 'picnic', name: 'Picnic Blanket', sub: 'Free rest' },
  { k: 'prop', name: 'Maple Market', g: 3, price: 180, rent: 16 },
  { k: 'fortune', name: 'Fortune Cookie' },
  { k: 'prop', name: 'Honey Hill', g: 3, price: 200, rent: 18 },
  { k: 'trolley', name: 'South Trolley', price: 200 },
  { k: 'prop', name: 'Teapot Terrace', g: 4, price: 240, rent: 22 },
  { k: 'gonap', name: 'Go Nap', sub: 'Off to the Nap Nook' },
  { k: 'prop', name: 'Willow Walk', g: 4, price: 260, rent: 24 },
  { k: 'fortune', name: 'Fortune Cookie' },
  { k: 'prop', name: 'Starlight Row', g: 5, price: 320, rent: 30 },
  { k: 'tax', name: 'Comfy Tax', amt: 75 },
  { k: 'prop', name: 'Moonbeam Manor', g: 5, price: 350, rent: 36 },
]
const NAP = 6, WAKE = 50, SALARY = 200, START_CASH = 1500
export const FORTUNES = [
  { text: 'You won the pie contest. Collect 100.', cash: 100 },
  { text: 'Your teapot cracked. Pay 50.', cash: -50 },
  { text: 'Hop on the trolley to Start. Collect 200.', to: 0 },
  { text: 'Wander back 3 spaces.', back: 3 },
  { text: 'Too cozy! Go to the Nap Nook.', nap: true },
  { text: 'It\'s your birthday: everyone gives you 20.', each: 20 },
  { text: 'Roof repairs: pay 25 per cottage.', perCottage: 25 },
  { text: 'Found acorns in the couch. Collect 50.', cash: 50 },
  { text: 'Stroll to Moonbeam Manor.', to: 23 },
  { text: 'Knitting club dues. Pay 30.', cash: -30 },
]
export const ownable = sp => ['prop', 'trolley', 'oven'].includes(BOARD[sp].k)

const groupOf = g => BOARD.map((b, i) => (b.g === g && b.k === 'prop' ? i : -1)).filter(i => i >= 0)
export const fullGroup = (pub, g, pid) => groupOf(g).every(i => pub.owner[i] === pid)
export function rentOf(pub, sp, dice) {
  const b = BOARD[sp], o = pub.owner[sp]
  if (b.k === 'trolley') return 25 * BOARD.filter((x, i) => x.k === 'trolley' && pub.owner[i] === o).length
  if (b.k === 'oven') return 6 * (dice[0] + dice[1])
  const c = pub.cottages[sp] || 0
  return b.rent * MULT[c] * (c === 0 && fullGroup(pub, b.g, o) ? 2 : 1)
}
export function worth(pub, pid) {
  let w = pub.cash[pid]
  for (const [sp, o] of Object.entries(pub.owner)) if (o === pid) w += BOARD[sp].price + (pub.cottages[sp] || 0) * (GROUPS[BOARD[sp].g]?.cottage || 0)
  return w
}
// Can pid add a cottage here now? (Full group, build evenly, max 4.)
export function canBuild(pub, pid, sp) {
  const b = BOARD[sp]
  if (b.k !== 'prop' || pub.owner[sp] !== pid || !fullGroup(pub, b.g, pid)) return false
  const c = pub.cottages[sp] || 0
  return c < 4 && pub.cash[pid] >= GROUPS[b.g].cottage && groupOf(b.g).every(i => (pub.cottages[i] || 0) >= c)
}

export function setup(players, seed, opts = {}) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`Teacup Town needs ${meta.min} to ${meta.max} players.`)
  const r = rng(seed)
  return {
    pub: {
      players: [...players], turn: 0, phase: 'roll', cash: Object.fromEntries(players.map(p => [p, START_CASH])),
      pos: Object.fromEntries(players.map(p => [p, 0])), owner: {}, cottages: {}, napping: {}, broke: {},
      dice: [1, 1], doubles: 0, round: 1, maxRounds: opts.full ? 0 : 12, fortune: null, last: null, winner: null, rolls: 0,
    },
    priv: {},
    secret: { rs: Math.floor(r() * 2 ** 32), fortunes: shuffle([...FORTUNES.keys()], r) },
  }
}

export const turn = s => (s.pub.winner ? null : s.pub.players[s.pub.turn])

// Pay `amt` to `to` (a player id, or null for the bank). Sells cottages at half price to cover it; else bankrupt.
function pay(pub, pid, amt, to) {
  pub.cash[pid] -= amt
  if (to) pub.cash[to] += amt
  for (const sp of Object.keys(pub.cottages)) {
    while (pub.cash[pid] < 0 && pub.owner[sp] === pid && pub.cottages[sp] > 0) {
      pub.cottages[sp]--
      pub.cash[pid] += GROUPS[BOARD[sp].g].cottage / 2
    }
  }
  if (pub.cash[pid] < 0) {
    if (to) pub.cash[to] += pub.cash[pid] // creditor can't get more than there was
    pub.broke[pid] = true
    for (const sp of Object.keys(pub.owner)) if (pub.owner[sp] === pid) { if (to) pub.owner[sp] = to; else delete pub.owner[sp]; delete pub.cottages[sp] }
    pub.cash[pid] = 0
  }
}

function land(pub, pid, secret) {
  const sp = pub.pos[pid], b = BOARD[sp]
  pub.fortune = null
  if (b.k === 'tax') pay(pub, pid, b.amt, null)
  else if (b.k === 'gonap') { pub.pos[pid] = NAP; pub.napping[pid] = 1; pub.doubles = 0; return { secret, napped: true } }
  else if (b.k === 'fortune') {
    const [i, ...rest] = secret.fortunes
    secret = { ...secret, fortunes: [...rest, i] }
    const f = FORTUNES[i]
    pub.fortune = f.text
    if (f.cash > 0) pub.cash[pid] += f.cash
    if (f.cash < 0) pay(pub, pid, -f.cash, null)
    if (f.each) for (const o of pub.players) if (o !== pid && !pub.broke[o]) pay(pub, o, f.each, pid)
    if (f.perCottage) pay(pub, pid, f.perCottage * Object.entries(pub.cottages).reduce((a, [k, n]) => a + (pub.owner[k] === pid ? n : 0), 0), null)
    if (f.nap) { pub.pos[pid] = NAP; pub.napping[pid] = 1; pub.doubles = 0; return { secret, napped: true } }
    if (f.to != null) { if (f.to < sp) pub.cash[pid] += SALARY; pub.pos[pid] = f.to; return land(pub, pid, secret) }
    if (f.back) { pub.pos[pid] = (sp - f.back + 24) % 24; return land(pub, pid, secret) }
  } else if (ownable(sp)) {
    const o = pub.owner[sp]
    if (o == null) { pub.phase = 'buy'; return { secret } }
    if (o !== pid && !pub.broke[o]) pay(pub, pid, rentOf(pub, sp, pub.dice), o)
  }
  return { secret }
}

function endTurn(pub) {
  const live = pub.players.filter(p => !pub.broke[p])
  const n = pub.players.length
  if (live.length <= 1) { pub.winner = live[0] ?? pub.players[0]; return }
  let t = pub.turn
  do { t = (t + 1) % n; if (t === 0) pub.round++ } while (pub.broke[pub.players[t]])
  if (pub.maxRounds && pub.round > pub.maxRounds) {
    pub.round = pub.maxRounds
    pub.winner = live.reduce((a, b) => (worth(pub, b) > worth(pub, a) ? b : a))
    return
  }
  pub.turn = t; pub.phase = 'roll'; pub.doubles = 0
}

const clone = pub => ({ ...pub, cash: { ...pub.cash }, pos: { ...pub.pos }, owner: { ...pub.owner }, cottages: { ...pub.cottages }, napping: { ...pub.napping }, broke: { ...pub.broke } })

export function move(s, pid, a) {
  if (s.pub.winner) throw new Error('This game is over.')
  if (turn(s) !== pid) throw new Error("It's not your turn.")
  const pub = clone(s.pub)
  let secret = s.secret
  const type = a?.type
  pub.last = { pid, type }
  if (type === 'wake') {
    if (pub.phase !== 'roll' || !pub.napping[pid]) throw new Error("You're wide awake.")
    if (pub.cash[pid] < WAKE) throw new Error(`Waking up costs ${WAKE}.`)
    pub.cash[pid] -= WAKE
    delete pub.napping[pid]
  } else if (type === 'roll') {
    if (pub.phase !== 'roll') throw new Error('Not time to roll.')
    const r = rng(secret.rs)
    const d = [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]
    secret = { ...secret, rs: Math.floor(r() * 2 ** 32) }
    pub.dice = d; pub.rolls++
    const dbl = d[0] === d[1]
    if (pub.napping[pid]) {
      if (!dbl && pub.napping[pid] < 3) { pub.napping[pid]++; pub.phase = 'end'; pub.last.dice = d; return { pub, priv: s.priv, secret } }
      if (!dbl) pay(pub, pid, WAKE, null) // third try: pay and go
      delete pub.napping[pid]
      pub.doubles = 0
    } else if (dbl && ++pub.doubles === 3) {
      pub.pos[pid] = NAP; pub.napping[pid] = 1; pub.phase = 'end'; pub.last.dice = d; pub.last.napped = true
      return { pub, priv: s.priv, secret }
    }
    const from = pub.pos[pid], to = (from + d[0] + d[1]) % 24
    if (to < from) pub.cash[pid] += SALARY
    pub.pos[pid] = to
    pub.last.dice = d; pub.last.from = from
    pub.phase = 'end'
    const res = land(pub, pid, secret)
    secret = res.secret
    if (res.napped) pub.doubles = 0
    else if (dbl && !pub.napping[pid] && pub.phase === 'end') pub.again = true
  } else if (type === 'buy' || type === 'pass') {
    if (pub.phase !== 'buy') throw new Error('Nothing to buy.')
    const sp = pub.pos[pid]
    if (type === 'buy') {
      if (pub.cash[pid] < BOARD[sp].price) throw new Error('Not enough coins.')
      pub.cash[pid] -= BOARD[sp].price
      pub.owner[sp] = pid
    }
    pub.phase = 'end'
    if (pub.dice[0] === pub.dice[1] && pub.doubles > 0 && !pub.napping[pid]) pub.again = true
  } else if (type === 'build') {
    if (pub.phase !== 'end' && pub.phase !== 'roll') throw new Error('Build before you roll or after you land.')
    if (!canBuild(pub, pid, a.space)) throw new Error("You can't build there yet.")
    pub.cash[pid] -= GROUPS[BOARD[a.space].g].cottage
    pub.cottages[a.space] = (pub.cottages[a.space] || 0) + 1
    pub.last.space = a.space
  } else if (type === 'end') {
    if (pub.phase !== 'end') throw new Error('Roll first.')
    if (pub.again && !pub.broke[pid]) { pub.again = false; pub.phase = 'roll' }
    else { pub.again = false; endTurn(pub) }
  } else throw new Error('Roll, buy, build or end your turn.')
  if (pub.broke[pid] && !pub.winner) { pub.again = false; endTurn(pub) }
  return { pub, priv: s.priv, secret }
}

export function timeout(s) {
  const p = s.pub
  return { roll: { type: 'roll' }, buy: { type: 'pass' }, end: { type: 'end' } }[p.phase]
}
export const view = (s, pid) => ({ ...s.pub, me: null })
export const over = s => (s.pub.winner ? [s.pub.winner] : null)

// ── Chitbots ──
export function bot(v, me, level, rand = Math.random) {
  if (v.players[v.turn] !== me) return null
  const cash = v.cash[me]
  if (v.phase === 'roll') {
    if (v.napping[me] && level !== 'easy' && cash > 300 && (level === 'normal' || v.round < 7)) return { type: 'wake' }
    return { type: 'roll' }
  }
  if (v.phase === 'buy') {
    const b = BOARD[v.pos[me]]
    const reserve = { easy: 0, normal: 150, hard: 100 }[level]
    const wants = level === 'easy' ? rand() < 0.65
      : level === 'hard' && b.g != null && BOARD.some((x, i) => x.g === b.g && i !== v.pos[me] && v.owner[i] === me) ? true // completes a set
      : true
    return cash - b.price >= reserve && wants ? { type: 'buy' } : { type: 'pass' }
  }
  if (level !== 'easy') {
    const keep = level === 'hard' ? 120 : 250
    const spots = BOARD.map((_, i) => i).filter(i => canBuild(v, me, i) && cash - GROUPS[BOARD[i].g].cottage >= keep)
    if (spots.length) return { type: 'build', space: spots.reduce((a, b) => (BOARD[b].rent > BOARD[a].rent ? b : a)) }
  }
  return { type: 'end' }
}
