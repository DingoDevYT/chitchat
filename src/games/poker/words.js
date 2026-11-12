// Acorn Hold'em in plain words for beginners: hands, moves, stages and showdown results. Pure, so it has a node test.
import { HANDS, best, cmp } from './rules.js'

const NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']
const PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces']
const fmt = n => n.toLocaleString()

// A best() score in words: "Pair of Jacks", "Two pair (Jacks and Fours)".
export function scoreWords(s) {
  const [k, a, b] = s
  switch (k) {
    case 8: return a === 12 ? 'Royal flush' : `Straight flush (${a === 3 ? 'Ace' : NAMES[a - 4]} to ${NAMES[a]})`
    case 7: return `Four of a kind (${PLURAL[a]})`
    case 6: return `Full house (${PLURAL[a]} and ${PLURAL[b]})`
    case 5: return `Flush (${NAMES[a]} high)`
    case 4: return `Straight (${a === 3 ? 'Ace' : NAMES[a - 4]} to ${NAMES[a]})`
    case 3: return `Three of a kind (${PLURAL[a]})`
    case 2: return `Two pair (${PLURAL[a]} and ${PLURAL[b]})`
    case 1: return `Pair of ${PLURAL[a]}`
    default: return `High card (${NAMES[a]})`
  }
}

// Your hand so far. Before the flop it's just your two cards (best() wants five to judge flushes and straights).
export function handWords(cards, board = []) {
  if (!cards?.length) return ''
  if (board.length >= 3) return scoreWords(best([...cards, ...board]))
  const [a, b] = cards.map(c => c >> 2).sort((x, y) => y - x)
  return a === b ? `Pair of ${PLURAL[a]}` : `High card (${NAMES[a]})`
}

// The five cards that make the best hand, to highlight them.
export function bestFive(cards) {
  const top = best(cards)
  if (cards.length <= 5) return cards
  let hit = null
  const pick = (start, chosen) => {
    if (hit) return
    if (chosen.length === 5) { if (!cmp(best(chosen), top)) hit = chosen; return }
    for (let i = start; i < cards.length; i++) pick(i + 1, [...chosen, cards[i]])
  }
  pick(0, [])
  return hit
}

// A win chance in friendly words, compared with a fair share (1 in players-still-in).
export function strength(eq, opponents) {
  const fair = 1 / (opponents + 1)
  if (eq >= Math.max(0.6, fair * 1.5)) return { word: 'strong', tip: 'Your hand looks strong. Betting is reasonable.' }
  if (eq >= fair * 0.8) return { word: 'okay', tip: 'Your hand looks okay. Calling a small bet is fine.' }
  return { word: 'weak', tip: 'Your hand looks weak. Check if you can; folding to a big bet is fine.' }
}

// What a move looked like, short (nameplate badge) and as a sentence (toast).
export function moveBadge(l) {
  return { fold: 'Folded', check: 'Checked', call: `Called ${fmt(l.amt)}`, raise: `Raised to ${fmt(l.amt)}`, allin: 'All in!' }[l.type] || ''
}
export function moveSentence(name, l) {
  return {
    fold: `${name} folded (gave up this hand).`,
    check: `${name} checked (no bet, still in).`,
    call: `${name} called, matching the bet of ${fmt(l.amt)}.`,
    raise: `${name} raised the bet to ${fmt(l.amt)}.`,
    allin: `${name} went all in with ${fmt(l.amt)}!`,
  }[l.type] || ''
}

export const STAGES = [['preflop', 'Deal'], ['flop', 'Flop'], ['turn', 'Turn'], ['river', 'River'], ['showdown', 'Showdown']]
export const stageTip = (phase, sb, bb) => ({
  preflop: `Deal: everyone has 2 secret cards. Two players put in starter bets (blinds ${sb}/${bb}) so there's something to win.`,
  flop: 'Flop: 3 shared cards are out. Everyone can use them with their own 2.',
  turn: 'Turn: a 4th shared card. One more to come.',
  river: 'River: the 5th and last shared card. Last chance to bet.',
  showdown: 'Showdown: cards are flipped and the best 5-card hand wins the pot.',
}[phase] || '')

// Raise presets: Min, half the pot, the pot, all in. "to" = your total bet this round, clamped to what's legal.
export function raiseSizes({ bet, minRaise, pot, put, stack }) {
  const max = put + stack, min = Math.min(bet + minRaise, max)
  const owe = bet - put, clamp = x => Math.max(min, Math.min(max, Math.round(x)))
  return { min, half: clamp(bet + (pot + owe) / 2), pot: clamp(bet + pot + owe), max }
}

// Showdown sentences: who won what and why, and whose hand they beat. nm(pid) gives a name; 'You' reads as "You win".
export function showdownText({ results, shown, board }, nm) {
  if (!results?.length) return []
  const score = p => shown?.[p] && best([...shown[p], ...board])
  const winners = new Set(results.map(r => r.p))
  return results.map(r => {
    const who = nm(r.p), wins = who === 'You' ? 'win' : 'wins'
    if (!r.hand || !score(r.p)) return `${who} ${wins} ${fmt(r.amt)} acorns because everyone else folded.`
    const mine = score(r.p)
    const beat = Object.keys(shown).filter(p => !winners.has(p) && cmp(score(p), mine) < 0)
      .reduce((a, p) => (!a || cmp(score(p), score(a)) > 0 ? p : a), null)
    const tie = results.length > 1 && results.some(o => o.p !== r.p && score(o.p) && !cmp(score(o.p), mine))
    const whose = beat && (nm(beat) === 'You' ? 'your' : `${nm(beat)}'s`)
    return `${who} ${wins} ${fmt(r.amt)} acorns with ${scoreWords(mine)}${beat ? `, beating ${whose} ${scoreWords(score(beat))}` : ''}${tie ? ' (a tie, so the pot is shared)' : ''}.`
  })
}

// Hand rankings, best first, with a tiny example each (cheat sheet).
export const RANKINGS = [
  ['Royal flush', 'A K Q J 10, all one suit', 'A♠ K♠ Q♠ J♠ 10♠'],
  [HANDS[8], 'Five in a row, all one suit', '9♥ 8♥ 7♥ 6♥ 5♥'],
  [HANDS[7], 'Four cards of the same rank', 'Q Q Q Q 3'],
  [HANDS[6], 'Three of one rank plus a pair', 'K K K 4 4'],
  [HANDS[5], 'Any five of one suit', 'A♦ J♦ 8♦ 6♦ 2♦'],
  [HANDS[4], 'Five in a row, any suits', '9 8 7 6 5'],
  [HANDS[3], 'Three of the same rank', '7 7 7 K 2'],
  [HANDS[2], 'Two different pairs', 'J J 4 4 A'],
  [HANDS[1], 'Two of the same rank', '9 9 A 6 3'],
  [HANDS[0], 'None of the above: your highest card counts', 'A J 8 5 2'],
]
