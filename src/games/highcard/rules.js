// High card: the tiny test game that proves hidden hands, turns and timers (GAMES.md milestone 1).
// Everyone gets one hidden card. In seat order each player Keeps it or Swaps it once for the top of the deck.
// Then all cards flip; the highest wins. Plain JS: runs in the browser and in the `game` edge function.
import { rng, shuffle } from '../rng.js'

export const meta = { id: 'highcard', name: 'High Card', min: 2, max: 10, turnMs: 20000 }

// Cards are 0..51: rank = c >> 2 (0 = two … 12 = ace), suit = c & 3 (clubs < diamonds < hearts < spades).
// So a bigger number is simply a better card, and equal ranks are broken by suit.
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']
export const SUITS = [
  { glyph: '♣︎', name: 'clubs', red: false },
  { glyph: '♦︎', name: 'diamonds', red: true },
  { glyph: '♥︎', name: 'hearts', red: true },
  { glyph: '♠︎', name: 'spades', red: false },
]
export const card = c => ({ rank: RANKS[c >> 2], suit: SUITS[c & 3], name: `${RANK_NAMES[c >> 2]} of ${SUITS[c & 3].name}` })

// players: user ids in seat order.
export function setup(players, seed) {
  if (players.length < meta.min || players.length > meta.max) throw new Error(`High Card needs ${meta.min} to ${meta.max} players.`)
  const deck = shuffle([...Array(52).keys()], rng(seed))
  const priv = {}
  for (const p of players) priv[p] = { card: deck.pop() }
  return {
    pub: { players: [...players], turn: 0, acted: {}, discards: [], reveal: null, winner: null, last: null },
    priv,
    secret: { deck },
  }
}

// Whose turn it is, or null once the cards are revealed.
export const turn = state => (state.pub.reveal ? null : state.pub.players[state.pub.turn])
// What a player does when their timer runs out.
export const timeout = () => ({ type: 'keep' })

export function move(state, pid, action) {
  const { pub } = state
  if (pub.reveal) throw new Error('This round is over.')
  if (turn(state) !== pid) throw new Error("It's not your turn.")
  const type = action?.type
  if (type !== 'keep' && type !== 'swap') throw new Error('Keep or swap?')
  let { priv, secret } = state, discards = pub.discards
  if (type === 'swap') {
    const deck = [...secret.deck]
    const c = deck.pop()
    discards = [...discards, priv[pid].card]
    priv = { ...priv, [pid]: { card: c } }
    secret = { ...secret, deck }
  }
  const next = pub.turn + 1
  const done = next >= pub.players.length
  return {
    pub: {
      ...pub, turn: next, acted: { ...pub.acted, [pid]: type }, discards, last: { pid, type },
      reveal: done ? Object.fromEntries(pub.players.map(p => [p, priv[p].card])) : null,
      winner: done ? pub.players.reduce((a, b) => (priv[b].card > priv[a].card ? b : a)) : null,
    },
    priv,
    secret,
  }
}

// Only the public state plus your own hand: the browser never has more than this.
export const view = (state, pid) => ({ ...state.pub, me: state.priv?.[pid] ?? null })

export const over = state => (state.pub.winner ? [state.pub.winner] : null)
