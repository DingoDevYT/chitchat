// Chatterflies: the referee. Everyone flies the same tunnel at once, one run per round, so the referee only judges
// the start and each flyer's landing; the flight itself happens on the clients (course.js), and friends see each
// other as ghosts over a realtime broadcast.
//
// The game contract is turn-based, so the "turn" here is whose landing the referee waits on next:
// - Chitbots first. A bot's whole run follows from (seed, seat, level), so when its turn comes the referee flies it
//   (pilot.js, ~30 ms) and posts the result just after the start. Clients fly the same bot locally as a ghost and
//   don't show its distance until its ghost lands (pub.results[bot].ticks says when).
// - Then each person, in seat order, with a deadline at the longest possible run plus grace. Anyone may post their
//   own run at any time (no need to wait for their "turn"); only the timeout, which lands someone who vanished on
//   0 m, is tied to the turn.
// A run is { type: 'run', ticks, m, spr, log, talk }. The referee replays the thrust log through the same sim (at most
// 21,600 ticks, a few ms) and keeps the replayed distance and sprinkles, so a claimed number never counts by itself.
// One cheap clock check (people only): a run can't be longer than the time since the start, plus slack for clocks.
import { MAX_TICKS, TICK_MS, metres, replay } from './course.js'
import { botRun } from './pilot.js'

export const LEAD_MS = 6000 // line-up countdown before everyone launches
const GRACE_MS = 20000, CLOCK_SLACK_MS = 15000
export const meta = {
  name: 'Chatterflies', min: 1, max: 8, turnMs: MAX_TICKS * TICK_MS + GRACE_MS,
  blurb: 'Hold to thrust, let go to fall: fly the Long Burrow as your own PNGtuber, dodge yarn, cranes and steam, and scoop sprinkles.',
}
const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const seatOf = pid => +pid.slice(4)

export function setup(players, seed, opts = {}) {
  return {
    pub: {
      players: [...players], seed: seed >>> 0, startAt: (opts.now ?? Date.now()) + LEAD_MS,
      opts: { whistle: !!opts.whistle }, results: {}, last: null, winner: null,
    },
    priv: {}, secret: {},
  }
}

export function turn(s) {
  const p = s.pub
  return p.players.find(x => isBot(x) && !p.results[x]) ?? p.players.find(x => !p.results[x]) ?? null
}

// When the next landing is due: a bot just after the start, a person once their longest possible run is over.
export function delay(s, now = Date.now()) {
  const who = turn(s)
  if (!who) return null
  const p = s.pub
  return isBot(who) ? Math.max(300, p.startAt - now + 400) : Math.max(1000, p.startAt + MAX_TICKS * TICK_MS + GRACE_MS - now)
}

const ints = (a, max) => Array.isArray(a) && a.length <= max && a.every((x, i) => Number.isInteger(x) && x >= 0 && x <= MAX_TICKS && (i === 0 || x >= a[i - 1]))

export function move(s, who, m, now = Date.now()) {
  const p = s.pub
  if (over(s)) throw new Error('This round is over.')
  if (!p.players.includes(who)) throw new Error("You're not flying this round.")
  if (p.results[who]) throw new Error('You already landed.')
  let r
  if (m?.type === 'timeout') {
    if (who !== turn(s)) throw new Error('Not your turn.')
    r = { m: 0, spr: 0, ticks: 0, out: true }
  } else if (m?.type === 'run') {
    const log = m.log || {}
    if (!Number.isInteger(m.ticks) || m.ticks < 0 || m.ticks > MAX_TICKS) throw new Error('That run is the wrong length.')
    if (!ints(log.t, 20000) || !ints(log.w || [], 40)) throw new Error("That run's log doesn't make sense.")
    if (!isBot(who) && now + CLOCK_SLACK_MS < p.startAt + m.ticks * TICK_MS) throw new Error("That run is longer than the time since the start.")
    const st = replay(p.seed, log, p.opts, m.ticks)
    r = { m: metres(st), spr: st.spr, ticks: st.n, shave: st.shave < 999 ? st.shave : null, talk: Math.max(0, Math.min(100, Math.round(+m.talk || 0))) }
    if (r.m !== m.m || r.spr !== m.spr) r.fixed = true // the replay disagreed with the client's numbers; the replay counts
  } else throw new Error('Unknown move.')
  const results = { ...p.results, [who]: r }
  const pub = { ...p, results, last: { who, ...r } }
  if (p.players.every(x => results[x])) pub.winner = ranking(pub)[0]
  return { ...s, pub }
}

// Farthest first; ties go to sprinkles, then seat order.
export function ranking(pub) {
  const r = pub.results
  return [...pub.players].sort((a, b) => (r[b]?.m ?? -1) - (r[a]?.m ?? -1) || (r[b]?.spr ?? -1) - (r[a]?.spr ?? -1))
}

export function over(s) {
  const p = s.pub
  if (!p.players.every(x => p.results[x])) return null
  const rk = ranking(p), top = p.results[rk[0]]
  return rk.filter(x => p.results[x].m === top.m && p.results[x].spr === top.spr)
}

export const view = s => s.pub
export const timeout = () => ({ type: 'timeout' })

// A Chitbot's run, flown from the seed. The level sets its reaction delay, look-ahead and slips (pilot.js LEVELS).
// rand is unused on purpose: the run must be the one every client draws as the bot's ghost.
export function bot(v, who, level) {
  if (!isBot(who) || v.results[who]) return timeout()
  const { st, log } = botRun(v.seed, seatOf(who), level, v.opts)
  return { type: 'run', ticks: st.n, m: metres(st), spr: st.spr, log, talk: 0 }
}
