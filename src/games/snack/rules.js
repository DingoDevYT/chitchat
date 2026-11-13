// Card Rush: an Uno-style shedding game (GAMES.md). 108 snack cards in four flavours, plus wilds.
// Match the top card's flavour or number, or play a wild. First to empty their hand wins.
// Plain JS: runs in the browser and in the `game` edge function.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'snack', name: 'Card Rush', min: 2, max: 10, turnMs: 30000, blurb: 'Match flavours, dodge the Feast, shout Last bite!' }

export const FLAVOURS = [
  { name: 'Berry', color: '#e0607e' },
  { name: 'Lime', color: '#7cc46a' },
  { name: 'Blueberry', color: '#5b8de0' },
  { name: 'Honey', color: '#f2b84b' },
]
export const ACTIONS = { nap: 'Nap', uturn: 'U-turn', plus2: 'Second helping', chef: "Chef's choice", feast: 'Feast' }

// Card ids 0..107 index this table: { f: flavour 0-3 (4 = wild), v: 0-9 or an ACTIONS key }.
export const CARDS = (() => {
  const out = []
  for (let f = 0; f < 4; f++) {
    out.push({ f, v: 0 })
    for (let k = 0; k < 2; k++) {
      for (let v = 1; v <= 9; v++) out.push({ f, v })
      for (const v of ['nap', 'uturn', 'plus2']) out.push({ f, v })
    }
  }
  for (let k = 0; k < 4; k++) out.push({ f: 4, v: 'chef' }, { f: 4, v: 'feast' })
  return out
})()
export const cardLabel = id => {
  const c = CARDS[id]
  const what = typeof c.v === 'number' ? String(c.v) : ACTIONS[c.v]
  return c.f === 4 ? what : `${FLAVOURS[c.f].name} ${what}`
}

const HAND = 7
const nextRand = secret => { const r = rng(secret.rs); return [r, Math.floor(r() * 2 ** 32)] }

export function setup(players, seed, opts = {}) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`Card Rush needs ${meta.min} to ${meta.max} players.`)
  const r = rng(seed)
  let deck = shuffle([...CARDS.keys()], r)
  const priv = {}
  for (const p of players) priv[p] = { hand: deck.splice(-HAND) }
  // First top card is a plain number.
  const i = deck.findLastIndex(id => typeof CARDS[id].v === 'number')
  const top = deck.splice(i, 1)[0]
  const counts = Object.fromEntries(players.map(p => [p, HAND]))
  return {
    pub: {
      players: [...players], turn: 0, dir: 1, top, flavour: CARDS[top].f, counts, deck: deck.length, pending: 0,
      drew: null, called: {}, last: null, winner: null, opts: { stack: !!opts.stack, drawUntil: !!opts.drawUntil }, moves: 0,
    },
    priv,
    secret: { deck, discard: [top], rs: Math.floor(r() * 2 ** 32) },
  }
}

export const turn = s => (s.pub.winner ? null : s.pub.players[s.pub.turn])

// Can this card go on the pile right now?
export function playable(pub, id) {
  const c = CARDS[id], top = CARDS[pub.top]
  if (pub.pending) return pub.opts.stack && (c.v === 'feast' || (c.v === 'plus2' && top.v === 'plus2'))
  return c.f === 4 || c.f === pub.flavour || c.v === top.v
}

function drawCards(s, n) {
  let { deck, discard } = s.secret, rs = s.secret.rs
  const got = []
  for (let k = 0; k < n; k++) {
    if (!deck.length) {
      if (discard.length <= 1) break // every card is in someone's hand
      const r = rng(rs)
      deck = shuffle(discard.slice(0, -1), r)
      discard = discard.slice(-1)
      rs = Math.floor(r() * 2 ** 32)
    }
    got.push(deck.at(-1))
    deck = deck.slice(0, -1)
  }
  return { got, secret: { ...s.secret, deck, discard, rs } }
}

const step = (pub, k = 1) => (pub.turn + pub.dir * k + pub.players.length * 4) % pub.players.length

export function move(s, pid, a) {
  const { pub } = s
  if (pub.winner) throw new Error('This game is over.')
  const type = a?.type
  // Anyone may catch someone sitting on one card without having said "Last bite!".
  if (type === 'catch') {
    const t = a.target
    if (t === pid || pub.counts[t] !== 1 || pub.called[t]) throw new Error('Nobody to catch.')
    const { got, secret } = drawCards(s, 2)
    const hand = [...s.priv[t].hand, ...got]
    return { pub: { ...pub, counts: { ...pub.counts, [t]: hand.length }, deck: secret.deck.length, called: { ...pub.called, [t]: false }, last: { pid, type, target: t }, moves: pub.moves + 1 },
      priv: { ...s.priv, [t]: { hand } }, secret }
  }
  if (type === 'lastbite') {
    if (s.priv[pid].hand.length > 2) throw new Error('Only with two cards or fewer.')
    return { ...s, pub: { ...pub, called: { ...pub.called, [pid]: true }, last: { pid, type }, moves: pub.moves + 1 } }
  }
  if (turn(s) !== pid) throw new Error("It's not your turn.")
  let hand = s.priv[pid].hand

  if (type === 'pass') {
    if (pub.drew == null) throw new Error('Draw a card first.')
    return { ...s, pub: { ...pub, drew: null, turn: step(pub), last: { pid, type }, moves: pub.moves + 1 } }
  }

  if (type === 'draw') {
    if (pub.drew != null) throw new Error('You already drew.')
    let secret = s.secret, got = []
    if (pub.pending) {
      ({ got, secret } = drawCards(s, pub.pending))
      hand = [...hand, ...got]
      return { pub: { ...pub, pending: 0, turn: step(pub), counts: { ...pub.counts, [pid]: hand.length }, deck: secret.deck.length, called: { ...pub.called, [pid]: false }, last: { pid, type, n: got.length }, moves: pub.moves + 1 },
        priv: { ...s.priv, [pid]: { hand } }, secret }
    }
    // One card, or (house rule) keep drawing until something fits.
    do {
      const r = drawCards({ secret }, 1)
      secret = r.secret
      if (!r.got.length) break
      got.push(r.got[0])
    } while (pub.opts.drawUntil && !playable(pub, got.at(-1)) && got.length < 30)
    hand = [...hand, ...got]
    const fits = got.length && playable(pub, got.at(-1))
    const keep = fits && !a.pass // a timeout draws and passes straight away
    return {
      pub: { ...pub, drew: keep ? got.at(-1) : null, turn: keep ? pub.turn : step(pub), counts: { ...pub.counts, [pid]: hand.length }, deck: secret.deck.length,
        called: { ...pub.called, [pid]: false }, last: { pid, type, n: got.length }, moves: pub.moves + 1 },
      priv: { ...s.priv, [pid]: { hand } }, secret,
    }
  }

  if (type !== 'play') throw new Error('Play, draw or pass.')
  const id = a.card
  if (!hand.includes(id)) throw new Error("That card isn't in your hand.")
  if (pub.drew != null && id !== pub.drew) throw new Error('You can only play the card you just drew.')
  if (!playable(pub, id)) throw new Error("That card doesn't fit.")
  const c = CARDS[id]
  if (c.f === 4 && !(a.flavour >= 0 && a.flavour <= 3)) throw new Error('Pick a flavour.')
  hand = hand.filter(x => x !== id)
  const n = pub.players.length
  let dir = pub.dir, skip = 0, pending = pub.pending, secret = { ...s.secret, discard: [...s.secret.discard, id] }
  let priv = { ...s.priv, [pid]: { hand } }, counts = { ...pub.counts, [pid]: hand.length }
  const called = { ...pub.called, [pid]: !!(pub.called[pid] || a.bite) && hand.length <= 1 }
  const hit = (k) => { // the next player draws k and loses their turn (or, stacking, may answer)
    if (pub.opts.stack) { pending += k; return }
    const victim = pub.players[(pub.turn + dir + n) % n]
    const r = drawCards({ secret }, k)
    secret = r.secret
    priv = { ...priv, [victim]: { hand: [...priv[victim].hand, ...r.got] } }
    counts = { ...counts, [victim]: priv[victim].hand.length }
    called[victim] = false
    skip = 1
  }
  if (c.v === 'nap') skip = 1
  if (c.v === 'uturn') { dir = -dir; if (n === 2) skip = 1 }
  if (c.v === 'plus2') hit(2)
  if (c.v === 'feast') hit(4)
  const won = hand.length === 0
  const np = { ...pub, dir }
  return {
    pub: {
      ...pub, dir, top: id, flavour: c.f === 4 ? a.flavour : c.f, counts, deck: secret.deck.length, pending, drew: null, called,
      turn: won ? pub.turn : step(np, 1 + skip), last: { pid, type, card: id }, winner: won ? pid : null, moves: pub.moves + 1,
    },
    priv,
    secret,
  }
}

export const timeout = s => (s.pub.drew != null ? { type: 'pass' } : { type: 'draw', pass: true })
export const view = (s, pid) => ({ ...s.pub, me: s.priv?.[pid] ?? null })
export const over = s => (s.pub.winner ? [s.pub.winner] : null)

// ── Chitbots ── v: what the bot may see (view), me: its id.
export function bot(v, me, level, rand = Math.random) {
  const hand = v.me.hand
  const n = v.players.length
  const nextId = v.players[(v.turn + v.dir + n) % n]
  // Catch anyone who forgot Last bite! (Hard always, Normal sometimes, Easy rarely.)
  const slow = v.players.find(p => p !== me && v.counts[p] === 1 && !v.called[p])
  if (slow && rand() < { easy: 0.15, normal: 0.5, hard: 1 }[level]) return { type: 'catch', target: slow }
  if (v.players[v.turn] !== me) return null
  const ok = hand.filter(id => (v.drew == null || id === v.drew) && playable(v, id))
  if (!ok.length) return v.drew != null ? { type: 'pass' } : { type: 'draw' }
  const bite = hand.length === 2 && rand() < { easy: 0.5, normal: 0.9, hard: 1 }[level]
  const counts = [0, 0, 0, 0]
  for (const id of hand) if (CARDS[id].f < 4) counts[CARDS[id].f]++
  const bestFlavour = counts.indexOf(Math.max(...counts))
  let pick
  if (level === 'easy') pick = ok[Math.floor(rand() * ok.length)]
  else {
    const score = id => {
      const c = CARDS[id]
      let sc = c.f === 4 ? -10 : counts[c.f] // keep wilds for later, dump your biggest flavour
      if (typeof c.v === 'number') sc += c.v / 10
      if (level === 'hard' && v.counts[nextId] <= 2 && ['plus2', 'feast', 'nap'].includes(c.v)) sc += 20 // stop the leader
      if (level === 'hard' && hand.length <= 2 && c.f === 4) sc += 5 // a wild is a safe finisher
      return sc
    }
    pick = ok.reduce((a, b) => (score(b) > score(a) ? b : a))
  }
  const flavour = CARDS[pick].f === 4 ? (level === 'easy' ? Math.floor(rand() * 4) : bestFlavour) : undefined
  return { type: 'play', card: pick, ...(flavour !== undefined && { flavour }), ...(bite && { bite: true }) }
}
