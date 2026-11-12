// Pillow Chit Fight: draw a champion for a silly title, give it a battle cry, and let everyone else vote on the pillow
// fight. Winners defend their title next round against a new challenger on a new prompt. Pure JS, refereed by the
// `game` edge function like every other game (see ../README.md).
//
// A round: draw (everyone without a champion draws one, ~90 s) → voice (record a battle cry, ~45 s) → one bout per
// matchup: lines (the two champions say their cries), vote (the pillow fight; everyone not in the bout votes, live and
// changeable), win (winner up front) → recap → next round. The last round ends on the podium.
//
// A real-time game in the turn-based contract, like Midnight Chitchen: game time is `pub.clock` (ms since setup) and
// follows the wall clock when the referee stamps moves with `now` (setup with opts.now sets `pub.epoch`). Without it
// (tests) a tick jumps straight to the next scheduled event. `turn()` is the Chitbot whose vote is due next, else a
// clock keeper who may only send the tick; everyone may draw, record and vote at any time their phase allows.
//
// Pairing: champions defending a title each get a challenger first; the rest pair up; anyone left over faces a House
// champion from the Chitbots' stash (it scores nobody points). Drawings stay in the secret until the drawing phase
// ends, then move to the public state (capped by ink.js, a few KB each). Voice clips live in the `battle-cries`
// storage bucket at <game id>/<owner>/<round>.<ext>; the state only says a clip exists and how long it is.
import { rng, shuffle } from '../rng.js'
import { artPoints, cleanArt, cleanName } from './ink.js'
import { DOODLES, pickDoodle } from './doodles.js'
import { PROMPTS } from './prompts.js'

export const MS = { draw: 90000, drawLong: 120000, voice: 45000, slide: 1600, gap: 700, vote: 12000, win: 6500, recap: 8000 }
export const PTS = { vote: 100, win: 250, streak: 150 }
export const CRY_MIN = 200, CRY_MAX = 6500, SQUEAK_MS = 1300, SQUEAKS = 6
export const EXTS = ['wav', 'webm', 'ogg', 'mp4']
export const meta = {
  id: 'pillow', name: 'Pillow Chit Fight', min: 3, max: 8, turnMs: 30000, realtime: true,
  blurb: 'Draw a champion for a silly title, give it a battle cry, and let the call vote on the pillow fight. Winners defend their title.',
}

const isBot = pid => typeof pid === 'string' && pid.startsWith('bot:')
const fail = msg => { throw new Error(msg) }
export const ownerOf = (p, key) => p.champs[key]?.owner ?? null
export const cryMs = c => (c?.ms ? Math.max(CRY_MIN, Math.min(CRY_MAX, c.ms)) : SQUEAK_MS)
// How long the champions take to say their lines: slide in, champion A, a beat, champion B, a beat.
export const linesMs = (p, b) => MS.slide + cryMs(p.champs[b.a].cry) + MS.gap + cryMs(p.champs[b.b].cry) + MS.gap
export const roundsOf = opts => (opts.long ? 5 : opts.quick ? 2 : 3)

export function setup(players, seed, opts = {}) {
  if (players.length < 2 || players.length > meta.max) fail(`Pillow Chit Fight needs ${meta.min} to ${meta.max} players.`)
  const s = seed >>> 0
  const pub = {
    players: [...players], seed: s, opts: { rounds: roundsOf(opts), longDraw: !!opts.longDraw },
    clock: 0, epoch: typeof opts.now === 'number' ? opts.now : null,
    deck: shuffle(PROMPTS.map((_, i) => i), rng(s ^ 0x5bd1e995)), pn: 0,
    round: 0, phase: 'draw', stage: null, from: 0, until: 0,
    makers: [], drawn: {}, bouts: [], bi: 0, votes: {}, bots: {},
    champs: {}, holders: [], scores: Object.fromEntries(players.map(x => [x, 0])), log: [], used: [], houses: 0, last: null,
  }
  const st = { pub, priv: {}, secret: { art: {} } }
  startRound(st)
  return st
}

const nextPrompt = p => PROMPTS[p.deck[p.pn++ % p.deck.length]]

function startRound(st) {
  const p = st.pub
  p.round++
  // Retired champions that never won give back their ink (the public state stays small).
  for (const [k, c] of Object.entries(p.champs)) if (c.out && !c.wins) c.art = null
  const holders = p.holders.filter(k => p.champs[k] && !p.champs[k].out)
  const owned = new Set(holders.map(k => p.champs[k].owner).filter(Boolean))
  const makers = p.players.filter(x => !owned.has(x))
  const order = shuffle(makers, rng(p.seed + p.round * 7919))
  const fresh = pid => { const key = `${pid}#${p.round}`; p.champs[key] = { owner: pid, round: p.round, art: null, name: '', cry: null, streak: 0, wins: 0, best: 0 }; return key }
  const bouts = []
  for (const h of holders) bouts.push({ a: h, b: order.length ? fresh(order.shift()) : house(p) })
  while (order.length >= 2) bouts.push({ a: fresh(order.shift()), b: fresh(order.shift()) })
  if (order.length) bouts.push({ a: fresh(order.shift()), b: house(p) })
  for (const b of bouts) { b.prompt = nextPrompt(p); b.voters = p.players.filter(x => x !== ownerOf(p, b.a) && x !== ownerOf(p, b.b)); b.res = null }
  Object.assign(p, { bouts, makers, drawn: {}, bi: 0, votes: {}, bots: {}, phase: 'draw', stage: null, from: p.clock, until: p.clock + (p.opts.longDraw ? MS.drawLong : MS.draw) })
  st.secret.art = {}
  // Chitbots pick their doodle from the stash straight away and use a canned squeak for a battle cry.
  for (const m of makers.filter(isBot)) {
    const b = boutOf(p, m), i = pickDoodle(b.prompt, p.used, rng(p.seed + p.round * 31 + +m.slice(4)))
    p.used.push(i)
    st.secret.art[m] = { art: DOODLES[i].art, name: DOODLES[i].name }
    p.drawn[m] = true
    p.champs[`${m}#${p.round}`].cry = { synth: +m.slice(4) % SQUEAKS }
  }
  if (makers.every(m => p.drawn[m])) endDraw(st)
}

function house(p) {
  const key = `house#${++p.houses}`, i = pickDoodle('', p.used, rng(p.seed + p.houses * 977))
  p.used.push(i)
  p.champs[key] = { owner: null, house: true, round: p.round, art: DOODLES[i].art, name: DOODLES[i].name, cry: { synth: p.houses % SQUEAKS }, streak: 0, wins: 0, best: 0 }
  return key
}

export const boutOf = (p, pid) => p.bouts.find(b => ownerOf(p, b.a) === pid && p.champs[b.a].round === p.round || ownerOf(p, b.b) === pid && p.champs[b.b].round === p.round)
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
  Object.assign(p, { phase: 'voice', from: p.clock, until: p.clock + MS.voice })
  if (p.makers.every(m => p.champs[champOf(p, m)].cry)) endVoice(st)
}

function endVoice(st) {
  const p = st.pub
  p.makers.forEach((m, i) => { const c = p.champs[champOf(p, m)]; if (!c.cry) c.cry = { synth: (p.round + i) % SQUEAKS, none: true } })
  startBout(st, 0)
}

function startBout(st, i) {
  const p = st.pub, b = p.bouts[i], r = rng(p.seed + p.round * 131 + i * 17)
  Object.assign(p, { phase: 'battle', stage: 'lines', bi: i, votes: {}, bots: {}, from: p.clock, until: p.clock + linesMs(p, b) })
  // Chitbots vote during the fight, at their own moment, so the meter moves like a crowd.
  for (const v of b.voters.filter(isBot)) p.bots[v] = p.until + 900 + Math.floor(r() * (MS.vote - 2800))
}

// Whatever a Chitbot thinks of a bout: easy ones flip a coin, normal ones like a busier drawing, hard ones join the
// side the people are on. "Randomly-ish", never the same twice.
export function pickSide(p, b, level, rand) {
  const humans = Object.entries(p.votes).filter(([k]) => !isBot(k)).map(([, s]) => s)
  const lead = humans.filter(s => s === 'a').length - humans.filter(s => s === 'b').length
  if (level === 'hard' && lead && rand() < 0.7) return lead > 0 ? 'a' : 'b'
  if (level === 'easy') return rand() < 0.5 ? 'a' : 'b'
  const da = artPoints(p.champs[b.a].art), db = artPoints(p.champs[b.b].art)
  return rand() < 0.5 + 0.3 * Math.tanh((da - db) / 250) ? 'a' : 'b'
}

function tally(st) {
  const p = st.pub, b = p.bouts[p.bi], r = rng(p.seed + p.round * 211 + p.bi * 13)
  for (const v of b.voters) if (isBot(v) && p.votes[v] === undefined) p.votes[v] = pickSide(p, b, 'normal', r)
  const va = b.voters.filter(v => p.votes[v] === 'a').length, vb = b.voters.filter(v => p.votes[v] === 'b').length
  const A = p.champs[b.a], B = p.champs[b.b]
  // A tie keeps the title with the defender; between two new champions it's a coin toss.
  const w = va > vb ? 'a' : vb > va ? 'b' : A.streak > 0 ? 'a' : B.streak > 0 ? 'b' : r() < 0.5 ? 'a' : 'b'
  const W = w === 'a' ? A : B, Lz = w === 'a' ? B : A
  W.streak++; W.wins++; W.best = Math.max(W.best, W.streak)
  Lz.streak = 0; Lz.out = true
  const pts = { a: va * PTS.vote, b: vb * PTS.vote }
  pts[w] += PTS.win + PTS.streak * (W.streak - 1)
  for (const side of ['a', 'b']) { const o = p.champs[b[side]].owner; if (o) p.scores[o] = (p.scores[o] || 0) + pts[side] }
  b.res = { w, va, vb, pts, streak: W.streak, tie: va === vb }
  p.log.push({ round: p.round, prompt: b.prompt, a: b.a, b: b.b, w, va, vb })
  p.last = { type: 'bout', round: p.round, bi: p.bi, w: b[w], va, vb, streak: W.streak }
  Object.assign(p, { stage: 'win', from: p.clock, until: p.clock + MS.win + cryMs(W.cry) })
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
  p.holders = p.bouts.map(b => b[b.res.w])
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
    if (a.none) c.cry = { synth: p.makers.indexOf(who) % SQUEAKS, none: true }
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
    if (a.side !== 'a' && a.side !== 'b' && a.side !== null) fail('Vote for one of the two.')
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
  return { type: 'vote', side: pickSide(v, v.bouts[v.bi], level, rand) }
}
