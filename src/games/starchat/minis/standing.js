// Last Lantern Standing (TURN, simultaneous secret picks, free-for-all): each round everyone secretly lights a lantern
// numbered 1 to cfg.top. Lanterns two or more people lit blow out; the highest lantern only one person lit stands, and
// they score its number. cfg.rounds rounds; most points wins. Big numbers score big, but everyone else wants them too.
//
// Picks live only in the referee's secret until everyone has picked (then the round goes into pub history). The
// public state says who has picked, never what. As in lanterns.js, anyone still to pick may move (`open`), and
// whose() names the one the clock waits on (Chitbots first). Someone who lets the clock run out lights nothing.
export const id = 'standing'
export const kind = 'turn'

const isBot = p => typeof p === 'string' && p.startsWith('bot:')

export function begin(players, rand, cfg) {
  return {
    pub: { order: [...players], round: 1, rounds: cfg.rounds, top: cfg.top, picked: [], points: Object.fromEntries(players.map(p => [p, 0])), history: [], done: false },
    secret: { picks: {} },
  }
}

const waiting = state => state.order.filter(p => !state.picked.includes(p))
export function whose(state) {
  if (state.done) return null
  const w = waiting(state)
  return w.find(isBot) ?? w[0] ?? null
}
export const open = (state, pid) => !state.done && waiting(state).includes(pid)
export const legal = (state, pid) => (open(state, pid) ? Array.from({ length: state.top }, (_, i) => ({ type: 'mini', pick: i + 1 })) : [])
export const timeoutMove = () => ({ type: 'mini', skip: true })

// Which pick stands: the highest number exactly one person chose (null if every lantern blew out).
export function standing(picks) {
  const count = {}
  for (const n of Object.values(picks)) if (n != null) count[n] = (count[n] || 0) + 1
  let best = null
  for (const [n, c] of Object.entries(count)) if (c === 1 && (best == null || +n > best)) best = +n
  if (best == null) return { value: null, winner: null, out: Object.keys(count).map(Number) }
  const winner = Object.keys(picks).find(p => picks[p] === best)
  return { value: best, winner, out: Object.keys(count).filter(n => count[n] > 1).map(Number) }
}

export function act(state, secret, pid, m) {
  if (!open(state, pid)) throw new Error(state.done ? 'The festival is over.' : "You've already lit your lantern.")
  const s = { ...state, picked: [...state.picked], points: { ...state.points }, history: [...state.history] }
  const sec = { picks: { ...secret.picks } }
  if (m?.skip) sec.picks[pid] = null
  else if (Number.isInteger(m?.pick) && m.pick >= 1 && m.pick <= s.top) sec.picks[pid] = m.pick
  else throw new Error(`Light a lantern from 1 to ${s.top}.`)
  s.picked.push(pid)
  if (!waiting(s).length) {
    const r = standing(sec.picks)
    if (r.winner) s.points[r.winner] += r.value
    s.history.push({ round: s.round, picks: sec.picks, winner: r.winner, value: r.value, out: r.out })
    sec.picks = {}
    s.picked = []
    if (s.round >= s.rounds) s.done = true
    else s.round++
  }
  return { state: s, secret: sec }
}

// ── Chitbots (public history only) ──
// easy: any lantern. normal: leans high, avoids last round's winning number. hard: estimates how often the others
// light each number from the history (smoothed), and picks the best expected score n * P(nobody else lights n).
export function bot(state, pid, level, rand) {
  if (!open(state, pid)) return null
  const top = state.top, roll = n => Math.floor(rand() * n)
  if (level === 'easy') return { type: 'mini', pick: 1 + roll(top) }
  if (level === 'normal') {
    const last = state.history.at(-1)?.value
    let n = top - roll(3)
    if (n === last && rand() < 0.6) n = Math.max(1, n - 1 - roll(2))
    return { type: 'mini', pick: n }
  }
  const freq = Array(top + 1).fill(1), others = state.order.length - 1
  let total = top
  for (const h of state.history) for (const [p, n] of Object.entries(h.picks)) if (p !== pid && n != null) { freq[n]++; total++ }
  let best = 1, bestV = -1
  for (let n = 1; n <= top; n++) {
    const q = freq[n] / total // one other player's chance of lighting n
    const v = n * Math.pow(1 - q, others) * (0.85 + 0.3 * rand()) // a little noise so hard bots aren't a mirror
    if (v > bestV) { bestV = v; best = n }
  }
  return { type: 'mini', pick: best }
}

export function finish(state) {
  return { scores: { ...state.points }, bonus: {}, reveal: { points: { ...state.points }, history: state.history } }
}
