// Three Lanterns (TURN, one against the rest, made for bluffing out loud): each round one player (the hider, in turn
// round the table) secretly tucks the star under one of three paper lanterns and may point at one of them, truthfully
// or not. Everyone else then secretly picks a lantern. The reveal: a seeker who finds the star scores cfg.find, the
// hider scores cfg.fool for every seeker who picked an empty lantern (at most cfg.foolMax). min(players, cfg.rounds)
// rounds; most points wins.
//
// Where the star is and what each seeker picked live only in the referee's secret until the round's reveal (then in
// pub history). The public state shows who has picked, never what. Seekers pick in any order: `open` lets anyone still
// to pick move out of turn (rules.js), while whose() names the one the clock is waiting on (Chitbots first).
// Turn-game interface as in bun.js, plus:
//   open(state, pid)  -> bool    may pid act now even though whose() names someone else
//   legal(state, pid) -> moves   every move pid may make now (for the placeholder UI and tests)
export const id = 'lanterns'
export const kind = 'turn'
export const N = 3

const isBot = p => typeof p === 'string' && p.startsWith('bot:')

export function begin(players, rand, cfg) {
  const start = Math.floor(rand() * players.length)
  const rounds = Math.max(1, Math.min(players.length, cfg.rounds))
  const points = Object.fromEntries(players.map(p => [p, 0]))
  return {
    pub: { order: [...players], start, round: 1, rounds, hider: players[start], step: 'hide', tease: null, picked: [], points, history: [], find: cfg.find, fool: cfg.fool, foolMax: cfg.foolMax, done: false },
    secret: { at: null, picks: {} },
  }
}

export const seekers = state => state.order.filter(p => p !== state.hider)
const waiting = state => seekers(state).filter(p => !state.picked.includes(p))

export function whose(state) {
  if (state.done) return null
  if (state.step === 'hide') return state.hider
  const w = waiting(state)
  return w.find(isBot) ?? w[0] ?? null
}

export const open = (state, pid) => !state.done && state.step === 'seek' && waiting(state).includes(pid)

export function legal(state, pid) {
  if (state.done) return []
  if (state.step === 'hide') {
    if (pid !== state.hider) return []
    const out = []
    for (let l = 0; l < N; l++) for (const tease of [null, 0, 1, 2]) out.push({ type: 'mini', lantern: l, tease })
    return out
  }
  return open(state, pid) ? [0, 1, 2].map(lantern => ({ type: 'mini', lantern })) : []
}

// The hider who lets the clock run out hides it at random (and points at nothing); a seeker just doesn't pick.
export const timeoutMove = state => (state.step === 'hide' ? { type: 'mini', auto: true } : { type: 'mini', skip: true })

const okLantern = l => Number.isInteger(l) && l >= 0 && l < N

export function act(state, secret, pid, m, rand) {
  if (state.done) throw new Error('The lanterns are out.')
  const s = { ...state, picked: [...state.picked], points: { ...state.points }, history: [...state.history] }
  const sec = { at: secret.at, picks: { ...secret.picks } }
  if (s.step === 'hide') {
    if (pid !== s.hider) throw new Error(`It's not your turn to hide the star.`)
    let at = m?.lantern, tease = m?.tease ?? null
    if (m?.auto) { at = Math.floor(rand() * N); tease = null }
    if (!okLantern(at)) throw new Error('Hide it under lantern 1, 2 or 3.')
    if (tease !== null && !okLantern(tease)) throw new Error('Point at lantern 1, 2 or 3, or at none.')
    sec.at = at
    sec.picks = {}
    s.tease = tease
    s.step = 'seek'
    s.picked = []
    return { state: s, secret: sec }
  }
  if (!open(s, pid)) throw new Error(pid === s.hider ? "You hid it: let them guess." : "You've already picked.")
  if (m?.skip) sec.picks[pid] = null
  else if (okLantern(m?.lantern)) sec.picks[pid] = m.lantern
  else throw new Error('Pick lantern 1, 2 or 3.')
  s.picked.push(pid)
  if (!waiting(s).length) reveal(s, sec)
  return { state: s, secret: sec }
}

// Everyone has picked: score the round, put it in the public history, pass the star to the next hider.
function reveal(s, sec) {
  const found = [], fooled = []
  for (const p of seekers(s)) {
    const l = sec.picks[p]
    if (l == null) continue
    if (l === sec.at) found.push(p)
    else fooled.push(p)
  }
  for (const p of found) s.points[p] += s.find
  const hiderGot = Math.min(s.foolMax, fooled.length * s.fool)
  s.points[s.hider] += hiderGot
  s.history.push({ round: s.round, hider: s.hider, at: sec.at, tease: s.tease, picks: { ...sec.picks }, found, fooled, hiderGot })
  if (s.round >= s.rounds) { s.done = true; s.step = 'done' }
  else {
    s.round++
    s.hider = s.order[(s.start + s.round - 1) % s.order.length]
    s.step = 'hide'
    s.tease = null
  }
  s.picked = []
  sec.at = null
  sec.picks = {}
}

// ── Chitbots (public state only: the history of past reveals and the current point) ──
// How often hiders have told the truth when they pointed, and how often seekers have followed a point.
export function habits(state) {
  let told = 0, pointed = 0, followed = 0, picks = 0
  for (const h of state.history) {
    if (h.tease == null) continue
    pointed++
    if (h.tease === h.at) told++
    for (const l of Object.values(h.picks)) if (l != null) { picks++; if (l === h.tease) followed++ }
  }
  return { told, pointed, followed, picks }
}

export function bot(state, pid, level, rand) {
  const roll = n => Math.floor(rand() * n)
  if (state.step === 'hide') {
    if (pid !== state.hider) return null
    if (level === 'easy') return { type: 'mini', lantern: roll(N), tease: null }
    const tease = roll(N)
    if (level === 'normal') return { type: 'mini', lantern: roll(N), tease }
    // hard: if seekers tend to follow a point, lie; if they tend to avoid it, tell the truth; else a coin flip
    const { followed, picks } = habits(state)
    const lie = picks ? followed * 3 > picks : rand() < 0.5
    const other = (tease + 1 + roll(N - 1)) % N
    return { type: 'mini', lantern: lie ? other : tease, tease }
  }
  if (!open(state, pid)) return null
  const t = state.tease
  if (level === 'easy' || t == null) return { type: 'mini', lantern: roll(N) }
  if (level === 'normal') return { type: 'mini', lantern: rand() < 0.5 ? t : roll(N) }
  // hard: trust the point as far as hiders have earned it (a third is what chance would give)
  const { told, pointed } = habits(state)
  const trust = pointed ? told * 3 > pointed : rand() < 0.4
  return { type: 'mini', lantern: trust ? t : (t + 1 + roll(N - 1)) % N }
}

export function finish(state) {
  return { scores: { ...state.points }, bonus: {}, reveal: { points: { ...state.points }, history: state.history } }
}
