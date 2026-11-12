// Hot Bun (TURN, free-for-all, made for voice banter): a steaming bun goes round the picnic blanket. Whoever holds
// it puffs 1, 2 or 3 steam into it and passes it on. It pops at a hidden number between cfg.lo and cfg.hi; whoever is
// holding it when it pops is out, and a fresh bun (with a fresh hidden number) starts with the next player. The last
// one standing wins. A brave puff pays: +1 coin for a 2, +2 for a 3, banked as soon as you pass the bun on safely.
//
// The pop number lives only in the referee's secret, and each new one is drawn from the rules' secret rng, so the
// public state never gives it away. Turn games add to the interface in count.js:
//   kind: 'turn'
//   whose(state)                          -> pid | null   who decides next (null: the game is over)
//   act(state, secret, pid, move, rand)   -> { state, secret }  apply one decision (pure); throw if bad
//   timeoutMove(state, pid)               -> move         what someone who lets the clock run out does
// begin / bot / finish are as in count.js (finish gets entries = {}).
export const id = 'bun'
export const kind = 'turn'

const popAt = (cfg, rand) => cfg.lo + Math.floor(rand() * (cfg.hi - cfg.lo + 1))
const LOG = 24 // the public log keeps the last few puffs for the UI

export function begin(players, rand, cfg) {
  const start = Math.floor(rand() * players.length)
  return {
    pub: { order: [...players], holder: start, steam: 0, bun: 1, out: [], banked: {}, log: [], lo: cfg.lo, hi: cfg.hi, bonus: cfg.bonus, done: false },
    secret: { pop: popAt(cfg, rand) },
  }
}

export const alive = state => state.order.filter(p => !state.out.includes(p))
export const whose = state => (state.done ? null : state.order[state.holder])
export const timeoutMove = () => ({ type: 'mini', puff: 1 })

function nextHolder(state, from) {
  const n = state.order.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (!state.out.includes(state.order[i])) return i
  }
  return from
}

export function act(state, secret, pid, m, rand) {
  if (whose(state) !== pid) throw new Error("You're not holding the bun.")
  const n = m?.puff
  if (n !== 1 && n !== 2 && n !== 3) throw new Error('Puff 1, 2 or 3.')
  const s = { ...state, out: [...state.out], banked: { ...state.banked }, log: [...state.log] }
  const sec = { ...secret }
  s.steam += n
  const me = s.holder
  if (s.steam >= sec.pop) { // pop!
    s.out.push(pid)
    s.log.push({ pid, puff: n, steam: s.steam, pop: sec.pop, bun: s.bun })
    if (alive(s).length <= 1) s.done = true
    else {
      s.bun++
      s.steam = 0
      sec.pop = popAt({ lo: s.lo, hi: s.hi }, rand)
      s.holder = nextHolder(s, me)
    }
  } else {
    const c = s.bonus[n - 1] || 0
    if (c) s.banked[pid] = (s.banked[pid] || 0) + c
    s.log.push({ pid, puff: n, steam: s.steam, bun: s.bun })
    s.holder = nextHolder(s, me)
  }
  if (s.log.length > LOG) s.log = s.log.slice(-LOG)
  return { state: s, secret: sec }
}

// How likely a puff of n is to pop the bun, from the public steam alone (the pop is uniform in lo..hi above it).
export function risk(state, n) {
  const from = Math.max(state.lo, state.steam + 1), left = state.hi - from + 1
  if (left <= 0) return 1
  const bad = Math.max(0, Math.min(state.hi, state.steam + n) - from + 1)
  return bad / left
}

export function bot(state, pid, level, rand) {
  if (whose(state) !== pid) return null
  const safe = [3, 2, 1].find(n => risk(state, n) === 0)
  if (level === 'easy') return { type: 'mini', puff: 1 + Math.floor(rand() * 3) }
  if (level === 'hard') return { type: 'mini', puff: safe ?? 1 }
  // normal: greedy while it's safe, mostly careful after, with the odd brave puff
  if (safe) return { type: 'mini', puff: rand() < 0.75 ? safe : Math.max(1, safe - 1) }
  return { type: 'mini', puff: rand() < 0.85 ? 1 : 2 }
}

// The winner places first; everyone else by how long they lasted (popped later = higher).
export function finish(state) {
  const scores = {}
  state.out.forEach((p, i) => { scores[p] = i })
  for (const p of alive(state)) scores[p] = state.order.length
  return { scores, bonus: { ...state.banked }, reveal: { out: [...state.out], winner: alive(state)[0] ?? null, banked: { ...state.banked } } }
}
