// Owl Says (SIM, 30 s, free-for-all): Inkwell the owl hoots calls from a seeded schedule. Four big lantern buttons
// (up, right, down, left), each a colour; a call names a direction ("Left!") or a colour ("Berry!"). When the owl says
// "Owl says ...", tap that button fast: 10 points, plus up to 10 more for speed. The wrong button costs 5. Sometimes
// the owl just hoots the call without "Owl says": leave it alone for +5, tap anything and lose 5. Tapping while the
// owl is quiet is a false start: -3. Only your first tap in a call's window counts for it; any more are false starts.
// The score never goes below 0.
//
// The log is [tick, button] taps (60 ticks a second) from the shared start on your own clock. A player posts
// { type: 'mini', log, score }; the referee replays the taps against the schedule and keeps its own score.
// Integer-only. Bots' runs follow from (seed, seat, level) alone.
import { botSeed, irng, tooEarly, validPairs } from './simkit.js'

export const id = 'owl'
export const kind = 'sim'

export const HZ = 60
export const TICKS = 30 * HZ // 1800
export const WINDOW = 90 // ticks a call stays open (1.5 s)
export const DIRS = ['up', 'right', 'down', 'left']
export const COLOURS = ['honey', 'berry', 'sage', 'plum']
export const PTS = { right: 10, speed: 10, wrong: -5, resist: 5, fooled: -5, early: -3 }
const MAX_LOG = 300
export const duration = () => Math.ceil(TICKS * 1000 / HZ)

// The schedule from the seed: which colour sits on each button, and the calls { t, btn, by: 'dir' | 'colour', says }.
export function makeCalls(seed) {
  const r = irng(seed)
  const colours = [0, 1, 2, 3]
  for (let i = 3; i > 0; i--) { const j = r(i + 1); [colours[i], colours[j]] = [colours[j], colours[i]] }
  const calls = []
  let t = 70, prev = -1
  while (t + WINDOW < TICKS) {
    let btn = r(4)
    if (btn === prev) btn = (btn + 1 + r(3)) % 4
    prev = btn
    calls.push({ t, btn, by: r(100) < 45 ? 'colour' : 'dir', says: calls.length < 2 || r(100) >= 22 })
    t += WINDOW + 20 + r(50)
  }
  return { colours: colours.map(c => COLOURS[c]), calls }
}

export const newRun = () => ({ ci: 0, score: 0, right: 0, wrong: 0, fooled: 0, resist: 0, early: 0, fast: 0, done: [] })

// Close every call whose window ended before tick t (an untouched "owl doesn't say" call is a point for resisting).
function closeTo(st, calls, t) {
  while (st.ci < calls.length && calls[st.ci].t + WINDOW <= t) {
    const c = calls[st.ci]
    if (st.done[st.ci] == null) {
      if (c.says) st.done[st.ci] = 'slow'
      else { st.done[st.ci] = 'resist'; st.resist++; st.score += PTS.resist }
    }
    st.ci++
  }
}

const add = (st, n) => { st.score = Math.max(0, st.score + n) }

// One tap of button b at tick t (taps strictly increasing).
export function tap(st, sched, t, b) {
  const calls = sched.calls
  closeTo(st, calls, t)
  const c = calls[st.ci]
  if (!c || t < c.t || st.done[st.ci] != null) { st.early++; add(st, PTS.early); return 'early' }
  const rt = t - c.t
  if (!c.says) { st.done[st.ci] = 'fooled'; st.fooled++; add(st, PTS.fooled); return 'fooled' }
  if (b !== c.btn) { st.done[st.ci] = 'wrong'; st.wrong++; add(st, PTS.wrong); return 'wrong' }
  const p = PTS.right + Math.floor((WINDOW - rt) * PTS.speed / WINDOW)
  st.done[st.ci] = 'right'; st.right++; st.fast += rt; add(st, p)
  return 'right'
}

export const settle = (st, sched, now = TICKS) => { closeTo(st, sched.calls, now); return st }

export function replay(seed, log, sched = makeCalls(seed)) {
  const st = newRun()
  for (const [t, b] of log) tap(st, sched, t, b)
  return settle(st, sched)
}

export const validLog = log => validPairs(log, TICKS, 3, MAX_LOG)

// ── Chitbots ──
// Reaction time (ticks: base + up to spread), and how often (per mille) they hit the wrong button, get fooled by a
// call without "Owl says", or jump the gun.
export const LEVELS = {
  easy: { base: 32, spread: 30, wrong: 120, fooled: 280, early: 60 },
  normal: { base: 22, spread: 18, wrong: 50, fooled: 110, early: 20 },
  hard: { base: 14, spread: 10, wrong: 10, fooled: 30, early: 0 },
}

export function botLog(seed, seat, level) {
  const L = LEVELS[level] || LEVELS.normal, r = irng(botSeed(seed, seat, 53)), sched = makeCalls(seed), log = []
  let last = -1
  for (const c of sched.calls) {
    if (r(1000) < L.early && c.t - 20 > last) log.push([last = c.t - 20 + r(10), r(4)])
    const go = c.says || r(1000) < L.fooled
    if (!go) continue
    const t = Math.max(last + 1, c.t + L.base + r(L.spread + 1))
    const b = r(1000) < L.wrong ? (c.btn + 1 + r(3)) % 4 : c.btn
    log.push([last = t, b])
  }
  return { st: replay(seed, log, sched), log }
}

// ── the minigame interface (see count.js) ──
export function begin(players, rand) {
  return { pub: { seed: Math.floor(rand() * 2 ** 32), players: [...players] }, secret: {} }
}

const total = st => ({ score: st.score, right: st.right, wrong: st.wrong, fooled: st.fooled, resist: st.resist, early: st.early, avg: st.right ? Math.floor(st.fast * 1000 / (st.right * HZ)) : 0 })

export function submit(state, pid, m, ctx = {}) {
  if (!validLog(m?.log)) throw new Error("Those taps don't make sense.")
  if (tooEarly(ctx, duration())) throw new Error('The owl is still calling.')
  const st = replay(state.seed, m.log)
  const e = total(st)
  if (m.score !== st.score) e.fixed = true
  return e
}

export const timeoutEntry = null

export function bot(state, pid, level) {
  const seat = Math.max(0, state.players.indexOf(pid))
  const { st, log } = botLog(state.seed, seat, level)
  return { type: 'mini', log, score: st.score }
}

export function finish(state, secret, entries) {
  const scores = {}, runs = {}
  for (const [pid, e] of Object.entries(entries)) {
    scores[pid] = e ? e.score : -1
    runs[pid] = e
  }
  return { scores, bonus: {}, reveal: { runs } }
}
