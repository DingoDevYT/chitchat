// Firefly Count (placeholder, TURN with one simultaneous secret pick): a hidden number of fireflies sits in the jar.
// Everyone sees a hint window that holds it and makes one secret guess; closest wins, an exact guess earns a bonus.
// M2 replaces the hint with a 6-second blinking jar drawn from the same seed. Pure, integer-only.
//
// The minigame interface (every module in minis/ exports these; rules.js drives them):
//   begin(players, rand, cfg)          -> { pub, secret }  visible setup (in pub.mini.state) and the hidden part
//   submit(state, pid, move)           -> entry            validate (or, for a SIM game, replay) a { type: 'mini' } move; throw if bad
//   timeoutEntry                       :  entry            what someone who never posts scores with
//   bot(state, pid, level, rand)       -> move             a Chitbot's { type: 'mini', ... } move from the public state only
//   finish(state, secret, entries)     -> { scores, bonus, reveal }  scores: higher is better; bonus: extra coins; reveal: public results
// Entries stay in the referee's secret until everyone has posted, so nobody can copy a pick.
export const id = 'count'

export function begin(players, rand, cfg) {
  const target = cfg.lo + Math.floor(rand() * (cfg.hi - cfg.lo + 1))
  const from = Math.max(cfg.lo, Math.min(cfg.hi - cfg.window + 1, target - Math.floor(rand() * cfg.window)))
  return { pub: { hint: [from, from + cfg.window - 1], lo: cfg.lo, hi: cfg.hi }, secret: { target, exact: cfg.exact } }
}

export function submit(state, pid, m) {
  const g = m?.guess
  if (!Number.isInteger(g) || g < state.lo || g > state.hi) throw new Error(`Guess a whole number from ${state.lo} to ${state.hi}.`)
  return g
}

export const timeoutEntry = null

export function bot(state, pid, level, rand) {
  const [a, b] = state.hint
  const mid = Math.round((a + b) / 2)
  if (level === 'hard') return { type: 'mini', guess: mid }
  if (level === 'normal') return { type: 'mini', guess: a + Math.floor(rand() * (b - a + 1)) }
  const g = mid - 6 + Math.floor(rand() * 13) // easy: a wild guess round the middle
  return { type: 'mini', guess: Math.max(state.lo, Math.min(state.hi, g)) }
}

export function finish(state, secret, entries) {
  const scores = {}, bonus = {}
  for (const [pid, g] of Object.entries(entries)) {
    scores[pid] = g == null ? -1000 : -Math.abs(g - secret.target)
    if (g === secret.target) bonus[pid] = secret.exact
  }
  return { scores, bonus, reveal: { target: secret.target, guesses: { ...entries } } }
}
