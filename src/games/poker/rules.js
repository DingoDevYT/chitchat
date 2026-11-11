// Acorn Hold'em: Texas hold'em with pretend acorns. Never real money, nothing to buy (GAMES.md).
// Quick night: everyone starts with 1,000 acorns, blinds double every 6 hands, and after 40 hands the biggest pile wins.
// Plain JS: runs in the browser and in the `game` edge function.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'poker', name: "Acorn Hold'em", min: 2, max: 8, turnMs: 30000, blurb: "Texas hold'em with pretend acorns." }
export { card } from '../highcard/rules.js'

const START = 1000, BLIND = 10, LEVEL_EVERY = 6, MAX_HANDS = 40, SHOW_MS = 5000

// ── hand ranking: cards 0..51, rank = c >> 2 (0 = two … 12 = ace) ──
export const HANDS = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']
function rank5(cs) {
  const r = cs.map(c => c >> 2).sort((a, b) => b - a)
  const flush = cs.every(c => (c & 3) === (cs[0] & 3))
  const uniq = [...new Set(r)]
  let straight = -1
  if (uniq.length === 5 && r[0] - r[4] === 4) straight = r[0]
  if (uniq.length === 5 && r[0] === 12 && r[1] === 3) straight = 3 // wheel: A-2-3-4-5
  const cnt = {}
  for (const x of r) cnt[x] = (cnt[x] || 0) + 1
  const groups = Object.entries(cnt).map(([k, n]) => [n, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const kick = groups.map(g => g[1])
  if (straight >= 0 && flush) return [8, straight]
  if (groups[0][0] === 4) return [7, ...kick]
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...kick]
  if (flush) return [5, ...r]
  if (straight >= 0) return [4, straight]
  if (groups[0][0] === 3) return [3, ...kick]
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...kick]
  if (groups[0][0] === 2) return [1, ...kick]
  return [0, ...r]
}
export const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) - (b[i] ?? -1); return 0 }
// Best five of up to seven cards.
export function best(cards) {
  if (cards.length <= 5) return rank5(cards)
  let top = null
  const pick = (start, chosen) => {
    if (chosen.length === 5) { const v = rank5(chosen); if (!top || cmp(v, top) > 0) top = v; return }
    for (let i = start; i < cards.length; i++) pick(i + 1, [...chosen, cards[i]])
  }
  pick(0, [])
  return top
}

// ── table flow ──
const alive = pub => pub.players.filter(p => !pub.folded[p] && !pub.out[p])
const canAct = pub => alive(pub).filter(p => !pub.allin[p])
const nextFrom = (pub, i, ok) => { for (let k = 1; k <= pub.players.length; k++) { const j = (i + k) % pub.players.length; if (ok(pub.players[j])) return j } return -1 }

function deal(pub, secret) {
  const r = rng(secret.rs)
  const deck = shuffle([...Array(52).keys()], r)
  const n = pub.players.length
  const live = p => !pub.out[p]
  const button = pub.hand === 0 ? nextFrom(pub, n - 1, live) : nextFrom(pub, pub.button, live)
  const level = Math.floor(pub.hand / LEVEL_EVERY)
  const bb = BLIND * 2 * 2 ** level, sb = bb / 2
  const p = { ...pub, hand: pub.hand + 1, button, sb, bb, phase: 'preflop', board: [], pot: 0, bets: {}, put: {}, folded: {}, allin: {}, acted: {}, shown: null, results: null, last: null }
  const heads = pub.players.filter(live).length === 2
  const sbI = heads ? button : nextFrom(p, button, live)
  const bbI = nextFrom(p, sbI, live)
  const stacks = { ...p.stacks }
  const post = (i, amt) => {
    const id = p.players[i], a = Math.min(amt, stacks[id])
    stacks[id] -= a; p.bets[id] = a; p.put[id] = a
    if (!stacks[id]) p.allin[id] = true
  }
  post(sbI, sb); post(bbI, bb)
  p.stacks = stacks
  p.bet = bb; p.minRaise = bb
  const priv = {}
  for (const id of p.players) if (live(id)) priv[id] = { cards: [deck.pop(), deck.pop()] }
  p.turn = nextFrom(p, bbI, id => live(id) && !p.allin[id])
  if (p.turn < 0) p.turn = bbI
  return { pub: p, priv, secret: { deck, rs: Math.floor(r() * 2 ** 32) } }
}

export function setup(players, seed) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`Acorn Hold'em needs ${meta.min} to ${meta.max} players.`)
  const pub = { players: [...players], stacks: Object.fromEntries(players.map(p => [p, START])), out: {}, hand: 0, button: 0, winner: null, maxHands: MAX_HANDS }
  return deal(pub, { rs: seed >>> 0 })
}

export const turn = s => (s.pub.winner ? null : s.pub.players[s.pub.turn])
export const delay = s => (s.pub.phase === 'showdown' ? SHOW_MS : null)

// Street over: deal the next cards, or show down.
function advance(s) {
  let { pub, secret, priv } = s
  const left = alive(pub)
  if (left.length === 1 || pub.phase === 'river') return showdown(s)
  const pot = pub.pot + Object.values(pub.bets).reduce((a, b) => a + b, 0)
  const deck = [...secret.deck]
  const add = pub.phase === 'preflop' ? 3 : 1
  const board = [...pub.board, ...deck.splice(-add)]
  const phase = { preflop: 'flop', flop: 'turn', turn: 'river' }[pub.phase]
  pub = { ...pub, board, pot, bets: {}, acted: {}, bet: 0, minRaise: pub.bb, phase }
  secret = { ...secret, deck }
  pub.turn = nextFrom(pub, pub.button, p => !pub.folded[p] && !pub.out[p] && !pub.allin[p])
  const s2 = { pub, secret, priv }
  if (canAct(pub).length <= 1) return phase === 'river' ? showdown(s2) : advance(s2) // nobody left to bet: run it out
  return s2
}

function showdown(s) {
  const pub = { ...s.pub }
  const put = { ...pub.put }
  const left = alive(pub)
  let board = pub.board, deck = [...s.secret.deck]
  if (left.length > 1 && board.length < 5) board = [...board, ...deck.splice(-(5 - board.length))]
  const score = left.length < 2 ? {} : Object.fromEntries(left.map(p => [p, best([...s.priv[p].cards, ...board])]))
  const stacks = { ...pub.stacks }, won = {}
  // Side pots: slice contributions by each distinct all-in level.
  const levels = [...new Set(Object.values(put))].sort((a, b) => a - b)
  let prev = 0
  for (const lv of levels) {
    const slice = Object.values(put).reduce((a, x) => a + Math.max(0, Math.min(x, lv) - prev), 0)
    const elig = left.filter(p => (put[p] || 0) >= lv)
    prev = lv
    if (!slice) continue
    if (!elig.length) { const p = left[0]; stacks[p] += slice; won[p] = (won[p] || 0) + slice; continue }
    const top = elig.reduce((a, b) => (cmp(score[b] || [0], score[a] || [0]) > 0 ? b : a))
    const winners = elig.filter(p => cmp(score[p] || [0], score[top] || [0]) === 0)
    const share = Math.floor(slice / winners.length)
    winners.forEach((p, i) => { const amt = share + (i === 0 ? slice - share * winners.length : 0); stacks[p] += amt; won[p] = (won[p] || 0) + amt })
  }
  const out = { ...pub.out }
  for (const p of pub.players) if (!stacks[p]) out[p] = true
  const standing = pub.players.filter(p => !out[p])
  const last = pub.hand >= pub.maxHands
  const winner = standing.length === 1 ? standing[0] : last ? standing.reduce((a, b) => (stacks[b] > stacks[a] ? b : a)) : null
  return {
    pub: {
      ...pub, board, stacks, out, pot: 0, bets: {}, phase: 'showdown', winner,
      shown: left.length > 1 ? Object.fromEntries(left.map(p => [p, s.priv[p].cards])) : null,
      results: Object.entries(won).map(([p, amt]) => ({ p, amt, hand: left.length > 1 ? HANDS[score[p][0]] : null })),
      turn: pub.players.indexOf(standing.includes(pub.players[pub.button]) ? pub.players[pub.button] : standing[0]),
    },
    priv: s.priv,
    secret: { ...s.secret, deck },
  }
}

export function move(s, pid, a) {
  const { pub } = s
  if (pub.winner) throw new Error('This game is over.')
  if (turn(s) !== pid) throw new Error("It's not your turn.")
  const type = a?.type
  if (pub.phase === 'showdown') {
    if (type !== 'next') throw new Error('Deal the next hand.')
    return deal(pub, s.secret)
  }
  const stack = pub.stacks[pid], mine = pub.bets[pid] || 0, owe = pub.bet - mine
  const bets = { ...pub.bets }, stacks = { ...pub.stacks }, put = { ...pub.put }, allin = { ...pub.allin }, folded = { ...pub.folded }
  let bet = pub.bet, minRaise = pub.minRaise, acted = { ...pub.acted, [pid]: true }
  const pay = amt => { amt = Math.min(amt, stacks[pid]); stacks[pid] -= amt; bets[pid] = (bets[pid] || 0) + amt; put[pid] = (put[pid] || 0) + amt; if (!stacks[pid]) allin[pid] = true }
  if (type === 'fold') folded[pid] = true
  else if (type === 'check') { if (owe > 0) throw new Error('You need to call or fold.') }
  else if (type === 'call') { if (owe <= 0) throw new Error('Nothing to call.'); pay(owe) }
  else if (type === 'allin' && mine + stack <= bet) pay(stack) // all in for less than the bet: just a short call
  else if (type === 'raise' || type === 'allin') {
    const to = type === 'allin' ? mine + stack : Math.floor(a.to)
    if (!(to > bet)) throw new Error('Raise above the current bet.')
    if (to > mine + stack) throw new Error("You don't have that many acorns.")
    if (to < bet + minRaise && to < mine + stack) throw new Error(`Raise to at least ${bet + minRaise}.`)
    pay(to - mine)
    if (to - bet >= minRaise) { minRaise = to - bet; acted = { [pid]: true } } // a full raise reopens the betting
    bet = to
  } else throw new Error('Fold, check, call or raise.')
  const p = { ...pub, bets, stacks, put, allin, folded, bet, minRaise, acted, last: { pid, type, amt: bets[pid] || 0 } }
  const s2 = { ...s, pub: p }
  if (alive(p).length === 1) return showdown(s2)
  const waiting = canAct(p).filter(x => !p.acted[x] || (p.bets[x] || 0) < p.bet)
  if (!waiting.length) return advance(s2)
  p.turn = nextFrom(p, p.turn, x => waiting.includes(x))
  return s2
}

export const timeout = s => {
  const p = s.pub
  if (p.phase === 'showdown') return { type: 'next' }
  const id = p.players[p.turn]
  return (p.bets[id] || 0) >= p.bet ? { type: 'check' } : { type: 'fold' }
}
export const view = (s, pid) => ({ ...s.pub, me: s.priv?.[pid] ?? null })
export const over = s => (s.pub.winner ? [s.pub.winner] : null)

// Rough chance to win: Monte Carlo against random hands for the players still in.
export function equity(cards, board, opponents, sims, rand = Math.random) {
  const used = new Set([...cards, ...board])
  const rest = [...Array(52).keys()].filter(c => !used.has(c))
  let wins = 0
  for (let k = 0; k < sims; k++) {
    const d = shuffle(rest, rand)
    const b = [...board, ...d.slice(0, 5 - board.length)]
    let i = 5 - board.length
    const me = best([...cards, ...b])
    let mine = 1
    for (let o = 0; o < opponents; o++) {
      const c = cmp(best([d[i++], d[i++], ...b]), me)
      if (c > 0) { mine = 0; break }
      if (c === 0) mine = Math.min(mine, 0.5)
    }
    wins += mine
  }
  return wins / sims
}

// ── Chitbots ──
export function bot(v, me, level, rand = Math.random) {
  if (v.players[v.turn] !== me) return null
  if (v.phase === 'showdown') return { type: 'next' }
  const stack = v.stacks[me], mine = v.bets[me] || 0, owe = v.bet - mine
  const pot = v.pot + Object.values(v.bets).reduce((a, b) => a + b, 0)
  const opp = v.players.filter(p => p !== me && !v.folded[p] && !v.out[p]).length
  const sims = { easy: 0, normal: 60, hard: 200 }[level]
  let eq
  if (level === 'easy') {
    const [a, b] = v.me.cards.map(c => c >> 2)
    eq = 0.25 + (a + b) / 48 + (a === b ? 0.2 : 0) + (rand() - 0.5) * 0.3
  } else eq = equity(v.me.cards, v.board, Math.max(1, opp), sims, rand)
  const odds = owe > 0 ? owe / (pot + owe) : 0
  const raiseTo = mult => {
    const to = Math.max(v.bet + v.minRaise, Math.round(v.bet + pot * mult))
    return to >= mine + stack ? { type: 'allin' } : { type: 'raise', to }
  }
  const strong = level === 'hard' ? 0.7 : 0.75
  if (eq > strong && rand() < 0.85) return raiseTo(level === 'hard' ? 0.75 : 0.5)
  if (level === 'hard' && owe === 0 && rand() < 0.12) return raiseTo(0.5) // the odd bluff
  if (owe === 0) return { type: 'check' }
  if (eq >= odds + (level === 'easy' ? -0.1 : 0.03)) return owe >= stack ? { type: 'allin' } : { type: 'call' }
  return { type: 'fold' }
}
