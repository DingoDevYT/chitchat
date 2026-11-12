// Lantern Hollow news: turns what just happened (pub.last, plus a finished minigame) into short lines for the ticker,
// the screen reader and the moments the HUD plays. Pure, so it's tested without a browser.
import { BONUS, HOSTS, ITEMS, KINDS, MINIGAMES, MISHAPS, SPACES, TEA_EVENTS } from './data.js'

export const spaceName = sp => SPACES[sp]?.name || KINDS[SPACES[sp]?.k]?.name || `Space ${sp}`
const a = name => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name

// [{ icon, text, amt?, k }]: one line per notable event in v.last (who: the short name of whoever moved).
export function news(v, who, nm = who) {
  const l = v?.last
  if (!l) return []
  const out = [], w = who(l.pid)
  if (l.item) {
    const it = ITEMS[l.item]
    out.push({ k: 'item', icon: l.item, item: l.item, text: `${w} used ${a(it.name)}${l.target ? ` on ${nm(l.target)}` : ''}${l.item === 'boat' && v.boat ? ` (rolling a ${v.boat})` : ''}` })
  }
  if (l.dice) out.push({ k: 'roll', icon: 'die', text: `${w} rolled ${l.dice.length > 1 ? `${l.dice.join(' + ')} = ${l.dice.reduce((x, y) => x + y, 0)}` : l.dice[0]}` })
  for (const e of l.ev || []) {
    const line = {
      toll: () => ({ k: 'toll', icon: 'bridge', text: `${w} paid the toll onto the Firefly Bridge`, amt: -e.coins }),
      star: () => ({ k: 'star', icon: 'star', text: `${w} caught ${e.n > 1 ? `${e.n} stars` : 'the star'} from ${HOSTS.star}`, amt: -e.coins }),
      buy: () => ({ k: 'buy', icon: e.item, text: `${w} bought ${a(ITEMS[e.item].name)} at ${HOSTS.stall}'s stall`, amt: -e.coins }),
      glow: () => ({ k: 'glow', icon: 'glow', text: `${w} landed on a Glow`, amt: e.coins }),
      drizzle: () => ({ k: 'drizzle', icon: 'drizzle', text: `${w} got caught in a Drizzle`, amt: -e.coins }),
      umbrella: () => ({ k: 'umbrella', icon: 'umbrella', text: `${w}'s Umbrella kept the trouble off` }),
      firefly: () => (e.item ? { k: 'firefly', icon: e.item, text: `${w} found ${a(ITEMS[e.item].name)} in the fireflies` } : { k: 'firefly', icon: 'firefly', text: `${w}'s satchel was full: coins instead`, amt: e.coins }),
      mishap: () => ({ k: 'mishap', icon: 'bramble', text: `${w} hit a Bramble: ${MISHAPS[e.card].text}`, amt: e.coins ? -e.coins : undefined }),
      tea: () => ({ k: 'tea', icon: 'tea', text: `${HOSTS.tea}'s Tea House: ${TEA_EVENTS.find(t => t.id === e.id)?.text}${e.with ? ` (${w} and ${nm(e.with)})` : ''}` }),
      owl: () => ({ k: 'owl', icon: 'owl', text: `${HOSTS.owl}'s Owl Post: duels arrive later in the festival` }),
      post: () => ({ k: 'post', icon: 'post', text: `${w} rested at ${spaceName(v.pos[l.pid])}`, amt: e.coins }),
      pot: () => ({ k: 'pot', icon: 'pot', text: `${w} took the tea pot`, amt: e.coins }),
      trap: () => ({ k: 'trap', icon: 'trap', text: `${w} stepped in ${nm(e.to)}'s Honey Trap`, amt: -e.coins }),
      drift: () => ({ k: 'drift', icon: 'star', text: `The star drifted to ${spaceName(e.to)}` }),
      lastLanterns: () => ({ k: 'lastLanterns', icon: 'glow', text: `${HOSTS.rounds}: Last Lanterns! Glow and Drizzle count double` }),
    }[e.e]
    if (line) out.push(line())
  }
  return out
}

// A minigame that just finished: who won what.
export function miniNews(v, nm) {
  const r = v?.miniResult
  if (!r) return []
  const top = Object.keys(r.place).filter(p => r.place[p] === 1)
  return [{ k: 'mini', icon: 'firefly', text: `${MINIGAMES[r.id]?.name || 'Minigame'}: ${top.map(nm).join(' & ')} ${top.length > 1 ? 'share' : 'takes'} first place`, amt: r.coins[top[0]] }]
}

export const bonusOf = id => BONUS.find(b => b.id === id)
