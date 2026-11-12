// Pillow Chit Fight: draw a champion for a silly title, give it a battle cry, and let everyone else vote on the pillow
// fight. Winners defend their title next round against a new challenger on a new prompt. Pure JS, refereed by the
// `game` edge function like every other game (see ../README.md).
//
// A round: draw (everyone without a champion draws one, ~90 s) → voice (record a battle cry, ~60 s, 90 s on long rules) → one bout per
// matchup: lines (the champions say their cries in turn), vote (the pillow fight; everyone not in the bout votes, live
// and changeable), win (winner up front) → recap → next round. The last round ends on the podium.
//
// A real-time game in the turn-based contract, like Midnight Chitchen: game time is `pub.clock` (ms since setup) and
// follows the wall clock when the referee stamps moves with `now` (setup with opts.now sets `pub.epoch`). Without it
// (tests) a tick jumps straight to the next scheduled event. `turn()` is the Chitbot whose vote is due next, else a
// clock keeper who may only send the tick; everyone may draw, record and vote at any time their phase allows.
//
// Pairing: champions defending a title each get a challenger first; spare defenders meet each other; the rest pair
// up. Nobody is ever filled in by a bot (Chitbots play only when the host seats them). An odd one out faces an old
// champion: one drawn by someone else in an earlier round, back with its drawing and battle cry, scoring its artist
// half (BACK); if none can come back (always in round 1) the odd one joins a bout as a three-way brawl (b.c).
// Drawings stay in the secret until the drawing phase ends, then move to the public state (capped by ink.js, a few KB
// each). Voice clips live in the `battle-cries`
// storage bucket at <game id>/<owner>/<round>.<ext>; the state only says a clip exists and how long it is.
import { rng, shuffle } from '../rng.js'
import { artPoints, cleanArt, cleanName } from './ink.js'
import { DOODLES, pickDoodle, varyArt } from './doodles.js'
import { CRIES, cleanCryText, pickCry, speechMs } from './cries.js'
import { PROMPTS } from './prompts.js'

// pause: the beat after a champion steps up before its battle cry plays (every cry, the winner's encore too).
// voice: recording the battle cry and racking filters (voiceLong with the Long night or Take your time house rule).
export const MS = { draw: 90000, drawLong: 120000, voice: 60000, voiceLong: 90000, slide: 1600, pause: 2000, gap: 700, vote: 12000, win: 6500, recap: 8000 }
export const PTS = { vote: 100, win: 250, streak: 150 }
export const BACK = 0.5 // a returning old champion earns its artist this share of what it scores
export const CRY_MIN = 200, CRY_MAX = 6500, SQUEAK_MS = 1300, SQUEAKS = 6
export const EXTS = ['wav', 'webm', 'ogg', 'mp4']
export const meta = {
  id: 'pillow', name: 'Pillow Chit Fight', min: 2, max: 8, turnMs: 30000, realtime: true,
  blurb: 'Draw a champion for a silly title, give it a battle cry, and let the call vote on the pillow fight. Winners defend their title.',
}

const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const fail = msg => { throw new Error(msg) }
export const ownerOf = (p, key) => p.champs[key]?.owner ?? null
// A recording's length; a typed (or Chitbot) line takes as long as a speech voice needs to say it; else the squeak.
export const cryMs = c => (c?.ms ? Math.max(CRY_MIN, Math.min(CRY_MAX, c.ms)) : c?.text ? Math.max(SQUEAK_MS, Math.min(CRY_MAX, speechMs(c.text))) : SQUEAK_MS)
// The sides of a bout: two champions, or three in a three-way brawl.
export const sidesOf = b => (b.c ? ['a', 'b', 'c'] : ['a', 'b'])
// How long the champions take to say their lines: slide in, then for each champion a pause, its cry and a beat.
export function cryAt(p, b) {
  const at = {}
  let t = MS.slide + MS.pause
  for (const s of sidesOf(b)) { at[s] = t; t += cryMs(p.champs[b[s]].cry) + MS.gap + MS.pause }
  return at
}
export const linesMs = (p, b) => { const last = sidesOf(b).at(-1); return cryAt(p, b)[last] + cryMs(p.champs[b[last]].cry) + MS.gap }
export const roundsOf = opts => (opts.long ? 5 : opts.quick ? 2 : 3)

export function setup(players, seed, opts = {}) {
  if (players.length < 2 || players.length > meta.max) fail(`Pillow Chit Fight needs ${meta.min} to ${meta.max} players.`)
  const s = seed >>> 0
  const pub = {
    players: [...players], seed: s, opts: { rounds: roundsOf(opts), longDraw: !!opts.longDraw, longVoice: !!(opts.long || opts.longDraw) },
    clock: 0, epoch: typeof opts.now === 'number' ? opts.now : null,
    deck: shuffle(PROMPTS.map((_, i) => i), rng(s ^ 0x5bd1e995)), pn: 0,
    round: 0, phase: 'draw', stage: null, from: 0, until: 0,
    makers: [], drawn: {}, bouts: [], bi: 0, votes: {}, bots: {},
    champs: {}, holders: [], scores: Object.fromEntries(players.map(x => [x, 0])), log: [], used: [], said: [], last: null,
  }
  const st = { pub, priv: {}, secret: { art: {} } }
  startRound(st)
  return st
}

const nextPrompt = p => PROMPTS[p.deck[p.pn++ % p.deck.length]]
// A silly battle-cry line for a champion with no recording (read aloud by the browser's speech voice).
const cryLine = (p, rand) => { p.said ||= []; const i = pickCry(rand, p.said); p.said.push(i); return CRIES[i] }

function startRound(st) {
  const p = st.pub
  p.round++
  // Retired champions that never won give back their ink once they're too old to come back (the state stays small).
  for (const c of Object.values(p.champs)) if (c.out && !c.wins && c.round < p.round - 1) c.art = null
  const holders = p.holders.filter(k => p.champs[k] && !p.champs[k].out)
  const owned = new Set(holders.map(k => p.champs[k].owner).filter(Boolean))
  const makers = p.players.filter(x => !owned.has(x))
  const order = shuffle(makers, rng(p.seed + p.round * 7919))
  const fresh = pid => { const key = `${pid}#${p.round}`; p.champs[key] = { owner: pid, round: p.round, art: null, name: '', cry: null, streak: 0, wins: 0, best: 0 }; return key }
  const bouts = [], spare = [...holders]
  while (spare.length && order.length) bouts.push({ a: spare.shift(), b: fresh(order.shift()) })
  while (spare.length >= 2) bouts.push({ a: spare.shift(), b: spare.shift() })
  while (order.length >= 2) bouts.push({ a: fresh(order.shift()), b: fresh(order.shift()) })
  const odd = spare[0] ?? (order.length ? fresh(order.shift()) : null)
  if (odd) {
    const old = oldChamp(p, odd, bouts)
    if (old) { // an old champion steps back in, as it was (it never holds a title, see tally)
      const c = p.champs[old]
      c.back = [...(c.back || []), ownerOf(p, odd)]
      c.out = false
      bouts.push({ a: odd, b: old, back: 'b' })
    } else { // a three-way brawl: the odd one joins the last pair of new champions (else the last bout)
      const t = [...bouts].reverse().find(b => p.champs[b.a].round === p.round && p.champs[b.b].round === p.round) || bouts.at(-1)
      t.c = odd
    }
  }
  for (const b of bouts) {
    b.prompt = nextPrompt(p)
    const fighters = sidesOf(b).map(s => ownerOf(p, b[s]))
    const crowd = p.players.filter(x => !fighters.includes(x))
    // Everyone not in the bout votes. A three-way brawl with nobody watching (three players) has its fighters vote
    // for one of their two rivals instead.
    b.voters = crowd.length || !b.c ? crowd : p.players.filter(x => fighters.includes(x))
    b.res = null
  }
  Object.assign(p, { bouts, makers, drawn: {}, bi: 0, votes: {}, bots: {}, phase: 'draw', stage: null, from: p.clock, until: p.clock + (p.opts.longDraw ? MS.drawLong : MS.draw) })
  st.secret.art = {}
  // Chitbots pick a doodle from the stash straight away (with their own silly spin on it) and shout a random line.
  for (const m of makers.filter(isBot)) {
    const r = rng(p.seed + p.round * 31 + +m.slice(4)), b = boutOf(p, m), i = pickDoodle(b.prompt, p.used, r)
    p.used.push(i)
    st.secret.art[m] = { art: varyArt(DOODLES[i].art, r), name: DOODLES[i].name }
    p.drawn[m] = true
    p.champs[`${m}#${p.round}`].cry = { synth: +m.slice(4) % SQUEAKS, text: cryLine(p, r) }
  }
  if (makers.every(m => p.drawn[m])) endDraw(st)
}

// The old champion who steps in for the odd one out: drawn by someone else in an earlier round, retired, still inked,
// not in play this round and never switched in against this player before. The best record comes back first.
export function oldChamp(p, odd, bouts) {
  const me = ownerOf(p, odd)
  const inPlay = new Set([odd, ...bouts.flatMap(b => sidesOf(b).map(s => b[s]))])
  const ok = Object.entries(p.champs).filter(([k, c]) => c.out && c.art?.length && c.owner && c.owner !== me && c.round < p.round && !inPlay.has(k) && !(c.back || []).includes(me))
  ok.sort(([ka, x], [kb, y]) => y.wins - x.wins || y.best - x.best || (x.back || []).length - (y.back || []).length || y.round - x.round || (ka < kb ? -1 : 1))
  return ok[0]?.[0] ?? null
}

export const boutOf = (p, pid) => p.bouts.find(b => sidesOf(b).some(s => ownerOf(p, b[s]) === pid && p.champs[b[s]].round === p.round))
export const champOf = (p, pid) => `${pid}#${p.round}`

function endDraw(st) {
  const p = st.pub
  for (const m of p.makers) {
    const c = p.champs[champOf(p, m)], got = st.secret.art[m]
    if (got) { c.art = got.art; c.name = got.name }
    else { // never sent one: the pillow fairy lends a stash doodle so the bout still happens
      const i = pickDoodle(boutOf(p, m).prompt, p.used, rng(p.seed + p.round * 53 + p.makers.indexOf(m)))
      p.used.push(i)
      Object.assign(c, { art: DOODLES[i].art, name: DOODLES[i].name, auto: true })
    }
  }
  st.secret.art = {}
  Object.assign(p, { phase: 'voice', from: p.clock, until: p.clock + (p.opts.longVoice ? MS.voiceLong : MS.voice) })
  if (p.makers.every(m => p.champs[champOf(p, m)].cry)) endVoice(st)
}

function endVoice(st) {
  const p = st.pub
  const r = rng(p.seed + p.round * 89)
  p.makers.forEach((m, i) => { const c = p.champs[champOf(p, m)]; if (!c.cry) c.cry = { synth: (p.round + i) % SQUEAKS, none: true, text: cryLine(p, r) } })
  startBout(st, 0)
}

function startBout(st, i) {
  const p = st.pub, b = p.bouts[i], r = rng(p.seed + p.round * 131 + i * 17)
  Object.assign(p, { phase: 'battle', stage: 'lines', bi: i, votes: {}, bots: {}, from: p.clock, until: p.clock + linesMs(p, b) })
  // Chitbots vote during the fight, at their own moment, so the meter moves like a crowd.
  for (const v of b.voters.filter(isBot)) p.bots[v] = p.until + 900 + Math.floor(r() * (MS.vote - 2800))
}

// Whatever a Chitbot thinks of a bout: easy ones flip a coin, normal ones like a busier drawing, hard ones join the
// side the people are on. "Randomly-ish", never the same twice. Never its own champion (`who`, in a three-way).
export function pickSide(p, b, level, rand, who) {
  const sides = sidesOf(b).filter(s => !who || ownerOf(p, b[s]) !== who)
  const humans = Object.entries(p.votes).filter(([k]) => !isBot(k)).map(([, s]) => s)
  const n = s => humans.filter(x => x === s).length, top = Math.max(...sides.map(n))
  const leaders = sides.filter(s => n(s) === top)
  if (level === 'hard' && top > 0 && leaders.length === 1 && rand() < 0.7) return leaders[0]
  if (level === 'easy') return sides[Math.floor(rand() * sides.length)]
  const ink = sides.map(s => artPoints(p.champs[b[s]].art))
  if (sides.length === 2) return rand() < 0.5 + 0.3 * Math.tanh((ink[0] - ink[1]) / 250) ? sides[0] : sides[1]
  const mean = ink.reduce((x, y) => x + y, 0) / ink.length, w = ink.map(d => 1 + 0.6 * Math.tanh((d - mean) / 250))
  let x = rand() * w.reduce((t, y) => t + y, 0)
  for (let i = 0; i < sides.length; i++) if ((x -= w[i]) < 0) return sides[i]
  return sides.at(-1)
}

function tally(st) {
  const p = st.pub, b = p.bouts[p.bi], r = rng(p.seed + p.round * 211 + p.bi * 13)
  for (const v of b.voters) if (isBot(v) && p.votes[v] === undefined) p.votes[v] = pickSide(p, b, 'normal', r, v)
  const sides = sidesOf(b), n = Object.fromEntries(sides.map(s => [s, b.voters.filter(v => p.votes[v] === s).length]))
  const top = Math.max(...sides.map(s => n[s]))
  // A tie keeps the title with the defender (the longest streak); then a new champion beats a returning old one; then
  // it's a coin toss between whoever is still level.
  let level = sides.filter(s => n[s] === top)
  const tie = level.length > 1, held = Math.max(...level.map(s => p.champs[b[s]].streak))
  if (held > 0) level = level.filter(s => p.champs[b[s]].streak === held)
  if (level.length > 1 && b.back) level = level.filter(s => s !== b.back)
  const w = level.length === 1 ? level[0] : level[Math.floor(r() * level.length)]
  const W = p.champs[b[w]]
  W.streak++; W.wins++; W.best = Math.max(W.best, W.streak)
  for (const s of sides) if (s !== w) Object.assign(p.champs[b[s]], { streak: 0, out: true })
  const pts = Object.fromEntries(sides.map(s => [s, n[s] * PTS.vote]))
  pts[w] += PTS.win + PTS.streak * (W.streak - 1)
  if (b.back) pts[b.back] = Math.round(pts[b.back] * BACK)
  for (const s of sides) { const o = p.champs[b[s]].owner; if (o) p.scores[o] = (p.scores[o] || 0) + pts[s] }
  const counts = { va: n.a, vb: n.b, ...(b.c ? { vc: n.c } : {}) }
  b.res = { w, ...counts, pts, streak: W.streak, tie }
  p.log.push({ round: p.round, prompt: b.prompt, a: b.a, b: b.b, ...(b.c ? { c: b.c } : {}), ...(b.back ? { back: b.back } : {}), w, ...counts })
  p.last = { type: 'bout', round: p.round, bi: p.bi, w: b[w], ...counts, streak: W.streak }
  // A returning old champion goes back to the bench afterwards, win or lose: it never holds a title.
  if (b.back) Object.assign(p.champs[b[b.back]], { streak: 0, out: true })
  Object.assign(p, { stage: 'win', from: p.clock, until: p.clock + MS.win + MS.pause + cryMs(W.cry) })
}

function fire(st) {
  const p = st.pub
  if (p.phase === 'draw') return endDraw(st)
  if (p.phase === 'voice') return endVoice(st)
  if (p.phase === 'recap') return startRound(st)
  if (p.phase !== 'battle') return
  if (p.stage === 'lines') return Object.assign(p, { stage: 'vote', from: p.until, until: p.until + MS.vote })
  if (p.stage === 'vote') return tally(st)
  // stage 'win': the next bout, the recap, or the podium.
  if (p.bi + 1 < p.bouts.length) return startBout(st, p.bi + 1)
  p.holders = p.bouts.filter(b => b.res.w !== b.back).map(b => b[b.res.w])
  p.bots = {}
  if (p.round < p.opts.rounds) return Object.assign(p, { phase: 'recap', stage: null, from: p.clock, until: p.clock + MS.recap })
  Object.assign(p, { phase: 'end', stage: null, from: p.clock, until: p.clock })
}

const pendingBots = p => p.phase === 'battle' && (p.stage === 'lines' || p.stage === 'vote')
  ? Object.entries(p.bots).filter(([k]) => p.votes[k] === undefined).sort((x, y) => x[1] - y[1]) : []
function nextEvent(p) {
  if (p.phase === 'end') return null
  const b = pendingBots(p)[0]
  return b && b[1] < p.until ? b[1] : p.until
}

export function turn(s) {
  const p = s.pub
  if (p.phase === 'end') return null
  const b = pendingBots(p)[0]
  if (b && b[1] <= p.until) return b[0]
  return p.players.find(x => !isBot(x)) ?? p.players[0] // the clock keeper
}
export function delay(s) {
  const p = s.pub, e = nextEvent(p)
  return e == null ? null : Math.max(150, e - p.clock)
}
export const timeout = () => ({ type: 'tick' })

function advance(st, T) {
  const p = st.pub
  for (let guard = 0; guard < 200 && p.phase !== 'end' && p.until <= T; guard++) {
    if (p.until > p.clock) p.clock = p.until
    fire(st)
  }
  if (p.phase !== 'end' && T > p.clock) p.clock = T
}
function timeOf(p, pid, a) {
  if (p.epoch != null && typeof a.now === 'number') return Math.max(p.clock, a.now - p.epoch)
  if (a.type === 'tick') return Math.max(p.clock, nextEvent(p) ?? p.clock)
  if (isBot(pid) && p.bots[pid] != null) return Math.max(p.clock, p.bots[pid])
  return p.clock
}

export function move(s, who, a) {
  if (!a || typeof a !== 'object') fail('Unknown move.')
  if (s.pub.phase === 'end') fail('This game is over.')
  if (!s.pub.players.includes(who)) fail("You're not in this game.")
  if (a.type === 'tick' && who !== turn(s)) fail('Not your turn.')
  const st = JSON.parse(JSON.stringify(s)), p = st.pub
  advance(st, timeOf(p, who, a))
  if (a.type === 'tick') return st
  if (p.phase === 'end') fail('This game is over.')
  if (a.type === 'draw') {
    if (p.phase !== 'draw') fail("Time's up: the pillows are already flying.")
    if (!p.makers.includes(who)) fail('Your champion is resting this round.')
    if (p.drawn[who]) fail('Your champion is already in the locker room.')
    st.secret.art[who] = { art: cleanArt(a.art), name: cleanName(a.name) }
    p.drawn[who] = true
    p.last = { type: 'drawn', who }
    if (p.makers.every(m => p.drawn[m])) endDraw(st)
  } else if (a.type === 'cry') {
    if (p.phase !== 'voice') fail(p.phase === 'draw' ? 'Finish your drawing first.' : "Time's up for battle cries.")
    if (!p.makers.includes(who)) fail('Your champion already has a battle cry.')
    const c = p.champs[champOf(p, who)]
    if (c.cry) fail('Your battle cry is already in.')
    if (a.none) { // no mic: a typed line (or a random one), read aloud by the speech voice, else the squeak
      const typed = cleanCryText(a.text)
      c.cry = { synth: p.makers.indexOf(who) % SQUEAKS, none: true, text: typed || cryLine(p, rng(p.seed + p.round * 97 + p.makers.indexOf(who))) }
    }
    else {
      if (!EXTS.includes(a.ext)) fail('That recording is in an odd format.')
      if (!Number.isInteger(a.ms) || a.ms < CRY_MIN || a.ms > CRY_MAX) fail('That battle cry is the wrong length.')
      c.cry = { r: p.round, ext: a.ext, ms: a.ms }
    }
    p.last = { type: 'cried', who }
    if (p.makers.every(m => p.champs[champOf(p, m)].cry)) endVoice(st)
  } else if (a.type === 'vote') {
    if (p.phase !== 'battle' || (p.stage !== 'lines' && p.stage !== 'vote')) fail('Voting is closed.')
    const b = p.bouts[p.bi]
    if (!b.voters.includes(who)) fail("You can't vote on your own bout.")
    if (a.side !== null && !sidesOf(b).includes(a.side)) fail(b.c ? 'Vote for one of the three.' : 'Vote for one of the two.')
    if (a.side && ownerOf(p, b[a.side]) === who) fail("You can't vote for your own champion.")
    if (a.side === null) delete p.votes[who]
    else p.votes[who] = a.side
  } else fail('Unknown move.')
  return st
}

export function over(s) {
  const p = s.pub
  if (p.phase !== 'end') return null
  const top = Math.max(...p.players.map(x => p.scores[x] || 0))
  return p.players.filter(x => (p.scores[x] || 0) === top)
}

export const view = s => s.pub
export const standings = p => [...p.players].sort((x, y) => (p.scores[y] || 0) - (p.scores[x] || 0))

export function bot(v, who, level = 'normal', rand = Math.random) {
  if (!pendingBots(v).some(([k]) => k === who)) return timeout()
  return { type: 'vote', side: pickSide(v, v.bouts[v.bi], level, rand, who) }
}
