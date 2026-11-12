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
// 21,600 ticks, a few ms) and keeps the replayed distance, sprinkles and missions, so a claimed number never counts by
// itself. One cheap clock check (people only): a run can't be longer than the time since the start, plus slack.
//
// The Flock house rule (opts.flock): the podium adds everyone's distance into one flock total, and a person who bonks
// floats on in a rescue bubble for 8 s; a friend who flies through it revives them once. The revived flyer's log says
// when (log.r) and who (log.rb). That claim needs the rescuer's flight, so it's checked against the rescuer's replay
// (a Chitbot's is flown from the seed; a person's log is kept in `secret`) once both have landed: the rescuer must
// really touch the bubble's path (course.js bubbleAt, the same sums on every engine) within a second and a half of the
// rescue (network lag and clock skew). A claim that doesn't hold is replayed without the rescue, which lands that
// flyer where they first bonked.
import { MAX_TICKS, TICK_MS, metres, missionMask, pickMissions, replay, touches } from './course.js'
import { botRun } from './pilot.js'

export const LEAD_MS = 6000 // line-up countdown before everyone launches
const GRACE_MS = 20000, CLOCK_SLACK_MS = 15000
export const RESCUE_LAG = 90, RESCUE_EARLY = 30 // ticks the rescue may trail / lead the rescuer's touch
export const meta = {
  // noBots: people only (the referee refuses Chitbot seats; the pilot code stays for tests and the lab).
  name: 'Chatterflies', min: 1, max: 8, noBots: true, turnMs: MAX_TICKS * TICK_MS + GRACE_MS,
  blurb: 'Hold to thrust, let go to fall: fly the Long Burrow as your own PNGtuber, dodge yarn, cranes, looms and steam, and scoop sprinkles.',
}
const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const seatOf = pid => +pid.slice(4)

export function setup(players, seed, opts = {}) {
  return {
    pub: {
      players: [...players], seed: seed >>> 0, startAt: (opts.now ?? Date.now()) + LEAD_MS,
      opts: { whistle: !!opts.whistle, flock: !!opts.flock }, missions: pickMissions(seed >>> 0),
      results: {}, last: null, winner: null, ...(opts.flock ? { flock: 0 } : {}),
    },
    priv: {}, secret: { logs: {} },
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

// A run's result from its replay.
function score(p, st, talk) {
  return {
    m: metres(st), spr: st.spr, ticks: st.n, shave: st.shave < 999 ? st.shave : null, talk,
    ms: missionMask(p.missions, st), ...(st.revives ? { brew: st.revives } : {}),
  }
}

export function move(s, who, m, now = Date.now()) {
  const p = s.pub
  if (over(s)) throw new Error('This round is over.')
  if (!p.players.includes(who)) throw new Error("You're not flying this round.")
  if (p.results[who]) throw new Error('You already landed.')
  let r, secret = s.secret || {}
  if (m?.type === 'timeout') {
    if (who !== turn(s)) throw new Error('Not your turn.')
    r = { m: 0, spr: 0, ticks: 0, out: true, ms: 0 }
  } else if (m?.type === 'run') {
    const log = m.log || {}
    if (!Number.isInteger(m.ticks) || m.ticks < 0 || m.ticks > MAX_TICKS) throw new Error('That run is the wrong length.')
    if (!ints(log.t, 20000) || !ints(log.w || [], 40) || !ints(log.r || [], 1)) throw new Error("That run's log doesn't make sense.")
    if (!isBot(who) && now + CLOCK_SLACK_MS < p.startAt + m.ticks * TICK_MS) throw new Error("That run is longer than the time since the start.")
    // A rescue needs the Flock rule and a rescuer who's flying this round (not you).
    const by = log.r?.length && p.opts.flock && typeof log.rb === 'string' && log.rb !== who && p.players.includes(log.rb) ? log.rb : null
    const clean = { t: log.t, w: log.w || [], ...(by ? { r: log.r, rb: by } : {}) }
    const st = replay(p.seed, clean, p.opts, m.ticks, { bot: isBot(who) })
    r = score(p, st, Math.max(0, Math.min(100, Math.round(+m.talk || 0))))
    if (st.bubLog && st.bubLog.nR >= 0) { const b = st.bubLog; r.resc = { by, n0: b.n0, d0: b.d0, y0: b.y0, nR: b.nR, ok: null } }
    if (r.m !== m.m || r.spr !== m.spr) r.fixed = true // the replay disagreed with the client's numbers; the replay counts
    if (p.opts.flock && !isBot(who)) secret = { ...secret, logs: { ...(secret.logs || {}), [who]: clean } }
  } else throw new Error('Unknown move.')
  let results = { ...p.results, [who]: r }
  results = checkRescues(p, results, secret)
  const pub = { ...p, results, last: { who, ...results[who] } }
  if (isBot(who) && ['easy', 'normal', 'hard'].includes(m.level)) pub.levels = { ...(p.levels || {}), [who]: m.level }
  if (p.opts.flock) pub.flock = Object.values(results).reduce((a, x) => a + (x.m || 0), 0)
  if (p.players.every(x => results[x])) pub.winner = ranking(pub)[0]
  return { ...s, pub, secret }
}

// Settles every rescue claim whose rescuer has landed (see the top of the file).
function checkRescues(p, results, secret) {
  let out = results
  for (const [pid, r] of Object.entries(results)) {
    if (!r.resc || r.resc.ok !== null) continue
    const by = r.resc.by, rr = by && results[by]
    if (by && !rr) continue // the rescuer is still flying: wait
    const ok = !!rr && !rr.out && rescuerTouched(p, by, r.resc, secret)
    let fixed = { ...r, resc: { ...r.resc, ok } }
    if (!ok) {
      const log = secret.logs?.[pid]
      // (to the end of the bubble: unpopped, it lands them where they first bonked, whatever came after)
      const st = log ? replay(p.seed, log, p.opts, MAX_TICKS, { noRescue: true }) : null
      fixed = st ? { ...score(p, st, r.talk), resc: fixed.resc, ...(r.fixed ? { fixed: true } : {}) } : { ...fixed, m: 0, spr: 0 }
    }
    out = { ...out, [pid]: fixed }
  }
  return out
}

// Did the rescuer (alive, not spinning or bubbled) touch the bubble at some tick near the rescue?
function rescuerTouched(p, by, c, secret) {
  const lo = Math.max(c.n0, c.nR - RESCUE_LAG), hi = c.nR + RESCUE_EARLY
  const bub = { n0: c.n0, d0: c.d0, y0: c.y0 }
  let hit = false
  const onTick = st => { if (!hit && st.n >= lo && st.n <= hi && st.alive && !st.spin && !st.bub && touches(bub, st.n, st.d, st.y)) hit = true }
  if (isBot(by)) botRun(p.seed, seatOf(by), botLevel(p, by), p.opts, onTick)
  else {
    const log = secret.logs?.[by]
    if (!log) return false
    replay(p.seed, log, p.opts, Math.min(MAX_TICKS, hi + 1), { onTick })
  }
  return hit
}
// The referee doesn't keep seat levels in pub, so a bot rescuer is flown at the level its result was posted for.
const botLevel = (p, by) => p.levels?.[by] || 'normal'

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
  return { type: 'run', ticks: st.n, m: metres(st), spr: st.spr, log, talk: 0, level }
}
