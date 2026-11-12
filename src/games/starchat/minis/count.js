// Firefly Count (TURN with one simultaneous secret pick): a jar of fireflies blinks for cfg.showMs. Each firefly
// blinks one to three times, drifting a little between blinks, so counting the blinks isn't counting the fireflies.
// Everyone makes one secret guess; closest wins, an exact guess earns a bonus. Pure, integer-only.
//
// The minigame interface (every module in minis/ exports these; rules.js drives them, minis/index.js lists them):
//   kind                               :  'pick' (everyone posts one entry), 'sim' (the same, the entry is a replayed
//                                         run, see catch.js) or 'turn' (short referee turns, see bun.js)
//   begin(players, rand, cfg)          -> { pub, secret }  visible setup (in pub.mini.state) and the hidden part
//   submit(state, pid, move, ctx)      -> entry            validate (or, for a SIM game, replay) a { type: 'mini' } move; throw if bad.
//                                                          ctx: { now, startAt, bot } for clock checks
//   timeoutEntry                       :  entry            what someone who never posts scores with
//   bot(state, pid, level, rand)       -> move             a Chitbot's { type: 'mini', ... } move from the public state only
//   finish(state, secret, entries)     -> { scores, bonus, reveal }  scores: higher is better; bonus: extra coins; reveal: public results
//   duration(cfg)                      -> ms               (pick/sim) how long play lasts after the start, for deadlines
// Entries stay in the referee's secret until everyone has posted, so nobody can copy a pick.
//
// The blink schedule is public (every client has to draw it), so someone reading the raw state could try to cluster
// the blinks; the drift and the shared blink times make that about as hard as watching.
export const id = 'count'
export const kind = 'pick'
export const BLINK_MS = 520

export const duration = cfg => cfg.showMs + cfg.pickMs

export function begin(players, rand, cfg) {
  const target = cfg.lo + Math.floor(rand() * (cfg.hi - cfg.lo + 1))
  const int = n => Math.floor(rand() * n)
  const blinks = []
  for (let f = 0; f < target; f++) {
    let x = 14 + int(73), y = 22 + int(64)
    const k = 1 + int(3)
    for (let b = 0; b < k; b++) {
      blinks.push({ t: int(cfg.showMs - BLINK_MS), x, y, s: 3 + int(3) })
      x = Math.max(10, Math.min(90, x + int(19) - 9))
      y = Math.max(18, Math.min(90, y + int(15) - 7))
    }
  }
  blinks.sort((a, b) => a.t - b.t || a.x - b.x || a.y - b.y)
  return { pub: { lo: cfg.lo, hi: cfg.hi, showMs: cfg.showMs, pickMs: cfg.pickMs, blinks }, secret: { target, exact: cfg.exact } }
}

export function submit(state, pid, m) {
  const g = m?.guess
  if (!Number.isInteger(g) || g < state.lo || g > state.hi) throw new Error(`Guess a whole number from ${state.lo} to ${state.hi}.`)
  return g
}

export const timeoutEntry = null

// Bots count blinks and halve (two blinks a firefly on average), with level-sized slips.
export function bot(state, pid, level, rand) {
  const est = Math.round(state.blinks.length / 2)
  const spread = level === 'hard' ? 2 : level === 'normal' ? 4 : 7
  const g = est - spread + Math.floor(rand() * (2 * spread + 1))
  return { type: 'mini', guess: Math.max(state.lo, Math.min(state.hi, g)) }
}

export function finish(state, secret, entries) {
  const scores = {}, bonus = {}
  for (const [pid, g] of Object.entries(entries)) {
    scores[pid] = g == null ? -1000 : 0 - Math.abs(g - secret.target)
    if (g === secret.target) bonus[pid] = secret.exact
  }
  return { scores, bonus, reveal: { target: secret.target, guesses: { ...entries } } }
}
