// Drawing Duel: pairing, odd counts, voting, champions defending, scoring, timeouts, Chitbots, the stroke codec,
// the doodle stash and the voice-filter rack and chain.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import { COLORS, MAX_POINTS, artPoints, cleanArt, cleanName, makeStroke, packPts, simplify, unpackPts } from './ink.js'
import { DOODLES, pickDoodle } from './doodles.js'
import { PROMPTS } from './prompts.js'
import * as F from './filters.js'

const tick = (s, n = 1) => { for (let i = 0; i < n && !R.over(s); i++) s = R.move(s, R.turn(s), R.timeout()); return s }
const art = DOODLES[0].art
// Everyone without a champion draws and records (no voice), so the round goes straight to its first bout.
function make(s, list = s.pub.makers) {
  for (const m of list) if (!m.startsWith('bot:') && !s.pub.drawn[m] && s.pub.phase === 'draw') s = R.move(s, m, { type: 'draw', art, name: `${m}'s champ` })
  for (const m of list) if (!m.startsWith('bot:') && s.pub.phase === 'voice' && !s.pub.champs[R.champOf(s.pub, m)].cry) s = R.move(s, m, { type: 'cry', ext: 'wav', ms: 1500 })
  return s
}
const untilStage = (s, phase, stage) => { let k = 0; while (!(s.pub.phase === phase && s.pub.stage === stage) && k++ < 500) s = tick(s); return s }
const owners = (p, b) => [R.ownerOf(p, b.a), R.ownerOf(p, b.b)]

test('pillow: an even table pairs everyone, one prompt per pair', () => {
  const s = R.setup(['a', 'b', 'c', 'd'], 7)
  const p = s.pub
  assert.equal(p.phase, 'draw')
  assert.equal(p.bouts.length, 2)
  const all = p.bouts.flatMap(b => owners(p, b)).sort()
  assert.deepEqual(all, ['a', 'b', 'c', 'd'])
  assert.ok(p.bouts.every(b => PROMPTS.includes(b.prompt)))
  assert.notEqual(p.bouts[0].prompt, p.bouts[1].prompt)
  for (const b of p.bouts) assert.deepEqual(b.voters.sort(), ['a', 'b', 'c', 'd'].filter(x => !owners(p, b).includes(x)))
})

// Every champion in play belongs to a seated player: no House doodles, no Chitbots nobody seated.
const noFillers = p => {
  for (const b of p.bouts) for (const s of R.sidesOf(b)) {
    const c = p.champs[b[s]]
    assert.ok(c.owner && !c.house && p.players.includes(c.owner), `champion ${b[s]} has a seated owner`)
  }
  assert.ok(!Object.keys(p.champs).some(k => k.startsWith('house')))
}
// Each player plays exactly once per round: one new or defending champion each (returning old champions aside).
const everyoneOnce = p => {
  const own = p.bouts.flatMap(b => R.sidesOf(b).filter(s => s !== b.back).map(s => R.ownerOf(p, b[s]))).sort()
  assert.deepEqual(own, [...p.players].sort())
}

test('pillow: an odd table in round 1 makes one bout a three-way brawl, never a House or a bot', () => {
  for (const n of [3, 5, 7]) {
    const players = 'abcdefg'.slice(0, n).split('')
    const p = R.setup(players, n).pub
    assert.equal(p.bouts.length, (n - 1) / 2)
    const three = p.bouts.filter(b => b.c)
    assert.equal(three.length, 1, `${n} players: one three-way`)
    noFillers(p)
    everyoneOnce(p)
    assert.ok(p.bouts.every(b => !b.back), 'nobody to bring back in round 1')
    const t = three[0], fighters = R.sidesOf(t).map(s => R.ownerOf(p, t[s]))
    if (n === 3) assert.deepEqual(t.voters.sort(), fighters.sort(), 'three players: the fighters vote for a rival')
    else assert.deepEqual(t.voters.sort(), players.filter(x => !fighters.includes(x)))
    assert.equal(p.players.length, n, 'no seats were added')
  }
})

test('pillow: three champions say their lines in turn, each after the pause', () => {
  const s = make(R.setup(['a', 'b', 'c'], 3))
  const p = s.pub, b = p.bouts[0], at = R.cryAt(p, b)
  assert.ok(b.c)
  assert.equal(at.a, R.MS.slide + R.MS.pause)
  assert.equal(at.b, at.a + R.cryMs(p.champs[b.a].cry) + R.MS.gap + R.MS.pause)
  assert.equal(at.c, at.b + R.cryMs(p.champs[b.b].cry) + R.MS.gap + R.MS.pause)
  assert.equal(R.linesMs(p, b), at.c + R.cryMs(p.champs[b.c].cry) + R.MS.gap)
  assert.equal(p.until - p.from, R.linesMs(p, b))
})

test('pillow: three-way votes: pick one of three, never your own; per-vote scoring and the bonus to the top', () => {
  // Three players: the fighters vote for a rival.
  let s = make(R.setup(['a', 'b', 'c'], 5))
  const b = s.pub.bouts[0], own = side => R.ownerOf(s.pub, b[side])
  assert.throws(() => R.move(s, own('a'), { type: 'vote', side: 'a' }), /own champion/)
  assert.throws(() => R.move(s, own('a'), { type: 'vote', side: 'd' }), /one of the three/)
  s = R.move(s, own('a'), { type: 'vote', side: 'c' })
  s = R.move(s, own('b'), { type: 'vote', side: 'c' })
  s = R.move(s, own('c'), { type: 'vote', side: 'a' })
  s = untilStage(s, 'battle', 'win')
  const res = s.pub.bouts[0].res
  assert.deepEqual([res.w, res.va, res.vb, res.vc, res.tie], ['c', 1, 0, 2, false])
  assert.equal(s.pub.scores[own('c')], 2 * R.PTS.vote + R.PTS.win)
  assert.equal(s.pub.scores[own('a')], R.PTS.vote)
  assert.equal(s.pub.scores[own('b')], 0)
  assert.ok(s.pub.champs[b.a].out && s.pub.champs[b.b].out && !s.pub.champs[b.c].out)
  s = untilStage(s, 'recap', null)
  assert.deepEqual(s.pub.holders, [b.c])

  // Five players: the two outside voters split, so the tie is a coin toss between the two level champions only.
  for (let seed = 1; seed < 12; seed++) {
    let t = make(R.setup(['a', 'b', 'c', 'd', 'e'], seed))
    const i = t.pub.bouts.findIndex(x => x.c)
    while (t.pub.bi < i) t = untilStage(tick(t), 'battle', 'lines')
    const x = t.pub.bouts[i]
    assert.equal(x.voters.length, 2)
    t = R.move(t, x.voters[0], { type: 'vote', side: 'b' }); t = R.move(t, x.voters[1], { type: 'vote', side: 'c' })
    t = untilStage(t, 'battle', 'win')
    const r = t.pub.bouts[i].res
    assert.ok(r.tie && ['b', 'c'].includes(r.w))
    assert.equal(r.pts[r.w], R.PTS.vote + R.PTS.win)
    assert.equal(r.pts.a, 0)
  }
})

// Play a table of people to the end: everyone draws and records, the crowd votes for the first side they may.
function playPeople(players, seed, opts, onRound = () => {}) {
  let s = R.setup(players, seed, opts), k = 0, seen = 0
  while (!R.over(s) && k++ < 5000) {
    const p = s.pub
    if (p.round !== seen && p.phase === 'draw') { seen = p.round; onRound(p) }
    if (p.phase === 'draw' || p.phase === 'voice') { s = make(s); if (s.pub.phase === p.phase) s = tick(s); continue }
    if (p.phase === 'battle' && p.stage === 'vote') {
      const b = p.bouts[p.bi]
      for (const v of b.voters) if (p.votes[v] === undefined) { const side = R.sidesOf(b).find(x => R.ownerOf(p, b[x]) !== v); s = R.move(s, v, { type: 'vote', side }) }
    }
    s = tick(s)
  }
  assert.ok(R.over(s), 'the game ends')
  return s
}

test('pillow: odd tables of people switch old champions back in after round 1, and never get bots', () => {
  for (const n of [3, 5, 7]) {
    const players = 'abcdefg'.slice(0, n).split('')
    let backs = 0
    const s = playPeople(players, 40 + n, { long: true }, p => {
      noFillers(p)
      everyoneOnce(p)
      for (const b of p.bouts.filter(x => x.back)) {
        const c = p.champs[b[b.back]], odd = R.ownerOf(p, b.a)
        assert.equal(p.round > 1, true)
        assert.ok(c.round < p.round && c.owner !== odd && c.art.length, 'drawn earlier by someone else, with its ink')
        assert.ok(c.cry, 'with its battle cry')
        assert.ok(!b.voters.includes(c.owner), "its artist doesn't vote on it")
        backs++
      }
      if (p.round > 1) assert.ok(p.bouts.filter(b => b.back || b.c).length <= 1)
    })
    assert.ok(backs >= 1, `${n} players: an old champion came back`)
    assert.ok(s.pub.players.every(x => !x.startsWith('bot:')))
    // An old champion never comes back against the same player twice.
    const pairs = s.pub.log.filter(l => l.back).map(l => `${l[l.back]}>${s.pub.champs[l.a].owner}`)
    assert.equal(new Set(pairs).size, pairs.length)
  }
})

test('pillow: a returning old champion keeps its drawing and cry, scores its artist half, and never takes the title', () => {
  let s = make(R.setup(['a', 'b', 'c'], 6))
  s = untilStage(s, 'recap', null)
  const before = JSON.parse(JSON.stringify(s.pub.champs))
  s = make(tick(s))
  const i = s.pub.bouts.findIndex(b => b.back)
  assert.ok(i >= 0, 'round 2 brings an old champion back')
  while (s.pub.bi < i) s = untilStage(tick(s), 'battle', 'lines')
  const b = s.pub.bouts[i], key = b[b.back], artist = s.pub.champs[key].owner
  assert.deepEqual(s.pub.champs[key].art, before[key].art)
  assert.deepEqual(s.pub.champs[key].cry, before[key].cry)
  assert.ok(R.cryAt(s.pub, b).b > R.cryAt(s.pub, b).a)
  const had = s.pub.scores[artist]
  for (const v of b.voters) s = R.move(s, v, { type: 'vote', side: b.back })
  s = untilStage(s, 'battle', 'win')
  const res = s.pub.bouts[i].res
  assert.equal(res.w, b.back)
  const full = b.voters.length * R.PTS.vote + R.PTS.win
  assert.equal(res.pts[b.back], Math.round(full * R.BACK))
  assert.equal(s.pub.scores[artist] - had, Math.round(full * R.BACK))
  s = untilStage(s, 'recap', null)
  assert.ok(!s.pub.holders.includes(key), 'back to the bench')
  assert.ok(s.pub.champs[key].out)
})

test('pillow: a tie between a new champion and a returning one goes to the new one', () => {
  let s = make(R.setup(['a', 'b', 'c'], 6))
  s = untilStage(s, 'recap', null)
  s = make(tick(s))
  const i = s.pub.bouts.findIndex(b => b.back)
  while (s.pub.bi < i) s = untilStage(tick(s), 'battle', 'lines')
  s = untilStage(s, 'battle', 'win')
  const res = s.pub.bouts[i].res
  assert.ok(res.tie)
  assert.equal(res.w, 'a')
})

test('pillow: with no old champion to bring back, a later odd one out makes a three-way instead', () => {
  let s = make(R.setup(['a', 'b', 'c'], 6))
  s = untilStage(s, 'recap', null)
  s = JSON.parse(JSON.stringify(s))
  for (const c of Object.values(s.pub.champs)) c.back = ['a', 'b', 'c'] // as if every old champion had met everyone
  s = tick(s)
  assert.equal(s.pub.round, 2)
  assert.ok(!s.pub.bouts.some(b => b.back))
  assert.equal(s.pub.bouts.filter(b => b.c).length, 1)
  noFillers(s.pub)
  everyoneOnce(s.pub)
})

test('pillow: two players still play (nobody votes, so a coin decides)', () => {
  let s = make(R.setup(['a', 'b'], 3))
  assert.equal(s.pub.phase, 'battle')
  s = untilStage(s, 'battle', 'win')
  assert.equal(s.pub.bouts[0].res.tie, true)
  assert.equal(s.pub.bouts[0].voters.length, 0)
})

test('pillow: drawings stay secret until everyone is done, then the cries, then the battle', () => {
  let s = R.setup(['a', 'b', 'c', 'd'], 11)
  s = R.move(s, 'a', { type: 'draw', art, name: 'Spud' })
  assert.ok(!JSON.stringify(R.view(s)).includes(art[0].p), 'not public yet')
  assert.ok(s.secret.art.a)
  assert.throws(() => R.move(s, 'a', { type: 'draw', art }), /already/)
  assert.throws(() => R.move(s, 'b', { type: 'cry', none: true }), /drawing first/)
  s = make(s)
  assert.equal(s.pub.phase, 'battle')
  assert.equal(s.pub.stage, 'lines')
  assert.equal(s.pub.champs[R.champOf(s.pub, 'a')].name, 'Spud')
  assert.equal(s.pub.champs[R.champOf(s.pub, 'a')].art[0].p, art[0].p)
  assert.deepEqual(s.secret.art, {})
})

test('pillow: bad drawings and recordings are refused', () => {
  const s = R.setup(['a', 'b', 'c'], 2)
  assert.throws(() => R.move(s, 'a', { type: 'draw', art: [{ c: 99, w: 0, p: 'AAAA' }] }), /sense/)
  assert.throws(() => R.move(s, 'a', { type: 'draw', art: [{ c: 0, w: 0, p: '!!' }] }), /sense/)
  const big = Array.from({ length: 10 }, () => ({ c: 0, w: 1, p: packPts(Array.from({ length: 400 }, (_, i) => i % 256)) }))
  assert.throws(() => R.move(s, 'a', { type: 'draw', art: big }), /crayon/)
  assert.throws(() => R.move(s, 'a', { type: 'draw', art: Array(200).fill(art[0]) }), /strokes/)
  let t = make(s, ['a', 'b', 'c'].slice(0, 0))
  t = R.move(t, 'a', { type: 'draw', art }); t = R.move(t, 'b', { type: 'draw', art }); t = R.move(t, 'c', { type: 'draw', art })
  assert.equal(t.pub.phase, 'voice')
  assert.throws(() => R.move(t, 'a', { type: 'cry', ext: 'exe', ms: 1000 }), /format/)
  assert.throws(() => R.move(t, 'a', { type: 'cry', ext: 'wav', ms: 99999 }), /length/)
  t = R.move(t, 'a', { type: 'cry', ext: 'webm', ms: 4000 })
  assert.deepEqual(t.pub.champs[R.champOf(t.pub, 'a')].cry, { r: 1, ext: 'webm', ms: 4000 })
  assert.throws(() => R.move(t, 'a', { type: 'cry', none: true }), /already/)
})

test('pillow: votes are live and changeable, fighters cannot vote on their own bout', () => {
  let s = make(R.setup(['a', 'b', 'c', 'd', 'e'], 21))
  const p = s.pub, b = p.bouts[0], [oa, ob] = owners(p, b)
  const voter = b.voters[0]
  assert.throws(() => R.move(s, oa, { type: 'vote', side: 'a' }), /own bout/)
  s = R.move(s, voter, { type: 'vote', side: 'a' })
  assert.equal(s.pub.votes[voter], 'a')
  s = R.move(s, voter, { type: 'vote', side: 'b' })
  assert.equal(s.pub.votes[voter], 'b')
  s = R.move(s, voter, { type: 'vote', side: null })
  assert.equal(s.pub.votes[voter], undefined)
  assert.throws(() => R.move(s, voter, { type: 'vote', side: 'c' }), /one of/)
  s = R.move(s, voter, { type: 'vote', side: 'b' })
  s = untilStage(s, 'battle', 'win')
  assert.throws(() => R.move(s, voter, { type: 'vote', side: 'a' }), /closed/)
  assert.equal(s.pub.bouts[0].res.vb >= 1, true)
  void ob
})

test('pillow: scoring is votes, a win bonus and a streak bonus; winners defend on a new prompt', () => {
  let s = make(R.setup(['a', 'b', 'c', 'd'], 5))
  const p0 = s.pub, b0 = p0.bouts[0], [oa, ob] = owners(p0, b0)
  for (const v of b0.voters) s = R.move(s, v, { type: 'vote', side: 'a' })
  s = untilStage(s, 'battle', 'win')
  const res = s.pub.bouts[0].res
  assert.deepEqual([res.w, res.va, res.vb, res.streak], ['a', 2, 0, 1])
  assert.equal(s.pub.scores[oa], 2 * R.PTS.vote + R.PTS.win)
  assert.equal(s.pub.scores[ob], 0)
  // Second bout: the first voter split.
  s = untilStage(s, 'battle', 'lines')
  const b1 = s.pub.bouts[1]
  s = R.move(s, b1.voters[0], { type: 'vote', side: 'b' })
  s = untilStage(s, 'battle', 'win')
  s = untilStage(s, 'recap', null)
  assert.equal(s.pub.holders.length, 2)
  assert.ok(s.pub.holders.includes(b0.a))
  // Round 2: the defending champion's owner rests, everyone else draws a challenger.
  s = tick(s)
  assert.equal(s.pub.round, 2)
  assert.equal(s.pub.phase, 'draw')
  const defend = s.pub.bouts.find(b => b.a === b0.a)
  assert.ok(defend, 'the champion is back')
  assert.notEqual(defend.prompt, b0.prompt)
  assert.ok(!s.pub.makers.includes(oa))
  assert.throws(() => R.move(s, oa, { type: 'draw', art }), /resting/)
  assert.equal(s.pub.makers.length, 2)
  s = make(s)
  const d = s.pub.bouts.findIndex(b => b.a === b0.a)
  while (s.pub.bi < d) s = untilStage(tick(s), 'battle', 'lines')
  for (const v of s.pub.bouts[d].voters) s = R.move(s, v, { type: 'vote', side: 'a' })
  s = untilStage(s, 'battle', 'win')
  const r2 = s.pub.bouts[d].res
  assert.equal(r2.streak, 2)
  assert.equal(r2.pts.a, s.pub.bouts[d].voters.length * R.PTS.vote + R.PTS.win + R.PTS.streak)
  assert.equal(s.pub.champs[b0.a].best, 2)
})

test('pillow: a tie keeps the title with the defender', () => {
  let s = make(R.setup(['a', 'b', 'c', 'd'], 9))
  for (let k = 0; k < 2; k++) {
    const b = s.pub.bouts[s.pub.bi]
    s = R.move(s, b.voters[0], { type: 'vote', side: 'a' })
    s = untilStage(s, 'battle', 'win')
    s = tick(s)
  }
  s = untilStage(s, 'draw', null)
  s = make(s)
  const i = s.pub.bouts.findIndex(b => s.pub.champs[b.a].streak > 0)
  while (s.pub.bi < i) s = untilStage(tick(s), 'battle', 'lines')
  const b = s.pub.bouts[i]
  s = R.move(s, b.voters[0], { type: 'vote', side: 'a' }); s = R.move(s, b.voters[1], { type: 'vote', side: 'b' })
  s = untilStage(s, 'battle', 'win')
  assert.equal(s.pub.bouts[i].res.tie, true)
  assert.equal(s.pub.bouts[i].res.w, 'a')
})

test('pillow: timeouts fill in missing drawings and cries, and the house rule sets the length', () => {
  for (const [opts, rounds] of [[{}, 3], [{ quick: true }, 2], [{ long: true }, 5]]) {
    let s = R.setup(['a', 'b', 'c'], 4, opts)
    assert.equal(s.pub.opts.rounds, rounds)
    s = tick(s)
    assert.equal(s.pub.phase, 'voice')
    const c = s.pub.champs[R.champOf(s.pub, 'a')]
    assert.ok(c.auto && c.art.length, 'a stand-in doodle')
    s = tick(s)
    assert.equal(s.pub.phase, 'battle')
    assert.ok(s.pub.champs[R.champOf(s.pub, 'a')].cry.none)
    let k = 0
    while (!R.over(s) && k++ < 2000) s = tick(s)
    assert.ok(R.over(s))
    assert.equal(s.pub.round, rounds)
    assert.equal(s.pub.log.length, rounds * 2 - 1, 'a three-way in round 1, then a pair and an old-champion bout')
  }
})

test('pillow: the clock follows the referee when moves are stamped', () => {
  const t0 = 1_000_000
  let s = R.setup(['a', 'b', 'bot:2'], 8, { now: t0 })
  assert.equal(s.pub.epoch, t0)
  assert.equal(R.delay(s), R.MS.draw)
  s = R.move(s, 'a', { type: 'draw', art, now: t0 + 30000 })
  assert.equal(s.pub.clock, 30000)
  assert.equal(R.delay(s), R.MS.draw - 30000)
  // A drawing that arrives after the deadline is too late: the phase has moved on.
  assert.throws(() => R.move(s, 'b', { type: 'draw', art, now: t0 + R.MS.draw + 10 }), /Time's up/)
  // An early tick from the keeper only advances the clock.
  s = R.move(s, 'a', { type: 'tick', now: t0 + 40000 })
  assert.equal(s.pub.phase, 'draw')
})

test('pillow: Chitbots draw from the stash, squeak, and vote during the fight', () => {
  let s = R.setup(['a', 'bot:1', 'bot:2', 'bot:3'], 13)
  for (const b of ['bot:1', 'bot:2', 'bot:3']) assert.ok(s.pub.drawn[b] || !s.pub.makers.includes(b))
  s = make(s)
  assert.equal(s.pub.phase, 'battle')
  const bout = s.pub.bouts[0]
  const botVoters = bout.voters.filter(v => v.startsWith('bot:'))
  assert.equal(Object.keys(s.pub.bots).length, botVoters.length)
  if (botVoters.length) {
    assert.equal(R.turn(s), 'a', 'lines first: the keeper')
    s = tick(s) // lines → vote
    assert.equal(s.pub.stage, 'vote')
    const who = R.turn(s)
    assert.ok(who.startsWith('bot:'))
    s = R.move(s, who, R.bot(R.view(s), who, 'hard', Math.random))
    assert.ok(['a', 'b'].includes(s.pub.votes[who]))
  }
  for (const k of Object.keys(s.pub.champs).filter(k => k.startsWith('bot:'))) assert.ok(Number.isInteger(s.pub.champs[k].cry.synth))
})

test('pillow: hard Chitbots lean towards the side people are on', () => {
  const s = make(R.setup(['a', 'b', 'c', 'd', 'e', 'bot:5'], 17))
  const p = JSON.parse(JSON.stringify(s.pub)), b = p.bouts.find(x => x.voters.includes('bot:5') && x.voters.filter(v => !v.startsWith('bot:')).length >= 2)
  p.bi = p.bouts.indexOf(b)
  for (const v of b.voters.filter(v => !v.startsWith('bot:'))) p.votes[v] = 'b'
  let n = 0
  for (let i = 0; i < 200; i++) if (R.pickSide(p, b, 'hard', Math.random) === 'b') n++
  assert.ok(n > 130, `${n}/200 joined the crowd`)
})

test('pillow: retired champions keep their ink one round (to come back), then give it back', () => {
  let s = make(R.setup(['a', 'b', 'c', 'd'], 19))
  s = untilStage(s, 'recap', null)
  const losers = s.pub.bouts.map(b => b[b.res.w === 'a' ? 'b' : 'a'])
  s = tick(s)
  for (const k of losers) assert.ok(s.pub.champs[k].art.length)
  s = make(s)
  s = untilStage(s, 'recap', null)
  s = tick(s)
  for (const k of losers) assert.equal(s.pub.champs[k].art, null)
})

test('pillow: two people just battle each other every round (nobody votes, the fair fallback holds)', () => {
  const s = playPeople(['a', 'b'], 12, {}, p => {
    noFillers(p)
    assert.equal(p.bouts.length, 1)
    assert.ok(!p.bouts[0].c && !p.bouts[0].back)
    assert.deepEqual(p.bouts[0].voters, [])
    everyoneOnce(p)
  })
  assert.equal(s.pub.log.length, 3)
  assert.deepEqual(s.pub.players, ['a', 'b'])
})

test('pillow: Chitbots the host seats still play, in three-ways too', () => {
  for (const players of [['a', 'b', 'bot:1'], ['a', 'bot:1', 'bot:2', 'bot:3', 'bot:4']]) {
    let s = R.setup(players, 3)
    assert.equal(s.pub.bouts.filter(b => b.c).length, 1)
    noFillers(s.pub)
    for (let k = 0; k < 5000 && !R.over(s); k++) {
      const p = s.pub
      if (p.phase === 'draw' || p.phase === 'voice') { s = make(s); if (s.pub.phase === p.phase) s = tick(s); continue }
      const who = R.turn(s)
      s = R.move(s, who, who.startsWith('bot:') ? R.bot(R.view(s), who, 'hard', Math.random) : R.timeout())
    }
    assert.ok(R.over(s))
    for (const l of s.pub.log) for (const side of ['a', 'b', 'c']) if (l[side]) assert.ok(s.pub.champs[l[side]].owner)
  }
})

test('pillow: a whole game of Chitbots (and a table of 8) finishes with a podium', () => {
  for (const n of [3, 4, 8]) {
    const players = Array.from({ length: n }, (_, i) => `bot:${i}`)
    let s = R.setup(players, 30 + n), k = 0
    while (!R.over(s) && k++ < 5000) { const who = R.turn(s); s = R.move(s, who, R.bot(R.view(s), who, 'normal', Math.random)) }
    assert.ok(R.over(s))
    const w = R.over(s)
    assert.equal(R.standings(s.pub)[0], w[0])
    assert.ok(JSON.stringify(s.pub).length < 120000, 'public state stays small')
  }
})

// ── ink ──
test('pillow ink: points pack and unpack exactly', () => {
  for (const pts of [[0, 0], [255, 255, 1, 2], [10, 20, 30, 40, 50, 60], Array.from({ length: 500 }, (_, i) => (i * 37) % 256)]) {
    const s = packPts(pts)
    assert.match(s, /^[A-Za-z0-9_-]*$/)
    assert.deepEqual(unpackPts(s), pts)
  }
  assert.equal(unpackPts('A'), null)
  assert.equal(unpackPts('a b'), null)
})

test('pillow ink: strokes are simplified, clamped and validated', () => {
  const line = []
  for (let i = 0; i <= 100; i++) line.push(i, i * 0.5)
  assert.equal(simplify(line, 0.8).length, 4)
  const st = makeStroke(1, 2, [-5, 300, 10, 10, 10, 10, 20, 20])
  assert.deepEqual(unpackPts(st.p), [0, 255, 10, 10, 20, 20])
  assert.deepEqual(cleanArt([st]), [st])
  assert.equal(cleanName('  Sir <b>Spud</b>\n  the Brave  '), 'Sir bSpud/b the Brave')
  assert.equal(cleanName('x'.repeat(80)).length, 28)
})

test('pillow ink: every stash doodle is valid and bots match prompts by tag', () => {
  assert.ok(DOODLES.length >= 10 && DOODLES.length <= 20)
  for (const d of DOODLES) {
    assert.deepEqual(cleanArt(d.art), d.art, d.name)
    assert.ok(artPoints(d.art) < MAX_POINTS)
    assert.ok(d.art.every(s => s.c < COLORS.length))
  }
  const i = pickDoodle('Most Likely to Honk at a Duck', [], () => 0)
  assert.equal(DOODLES[i].name, 'Duck of Doom')
  assert.notEqual(pickDoodle('duck', [i], () => 0), i, 'a used doodle gives way')
})

test('pillow prompts: at least 250, unique (ignoring case), short and clean; a game never repeats one', () => {
  assert.ok(PROMPTS.length >= 250, `${PROMPTS.length} prompts`)
  assert.equal(new Set(PROMPTS.map(x => x.toLowerCase().trim())).size, PROMPTS.length)
  for (const x of PROMPTS) { assert.equal(x, x.trim()); assert.ok(x.length >= 8 && x.length <= 60, x); assert.ok(!/[<>]/.test(x), x) }
  const s = playPeople(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 99, { long: true })
  const used = s.pub.log.map(l => l.prompt)
  assert.ok(used.length >= 16)
  assert.equal(new Set(used).size, used.length, 'no prompt twice at one table')
})

test('pillow: recording holds the mic back from the call, and every release puts it back', async () => {
  const { holdMic, micHeld, onMicHold } = await import('../../lib/micHold.js')
  let pings = 0
  const off = onMicHold(() => pings++)
  assert.equal(micHeld(), false)
  const r1 = holdMic(), r2 = holdMic()
  assert.equal(micHeld(), true)
  r1(); r1() // releasing twice is harmless
  assert.equal(micHeld(), true, 'another hold is still on')
  r2()
  assert.equal(micHeld(), false)
  assert.equal(pings, 4)
  off()
})

test('pillow: the voice booth gets 60 s, 90 s on the long house rules', () => {
  for (const [opts, ms] of [[{}, 60000], [{ long: true }, 90000], [{ longDraw: true }, 90000], [{ quick: true }, 60000]]) {
    let s = R.setup(['a', 'b'], 1, opts)
    for (const m of ['a', 'b']) s = R.move(s, m, { type: 'draw', art })
    assert.equal(s.pub.phase, 'voice')
    assert.equal(s.pub.until - s.pub.from, ms)
  }
})

// ── filters ──
test('pillow filters: the rack fills, swaps and clears', () => {
  let r = F.emptyRack()
  r = F.rackAdd(r, 'echo'); r = F.rackAdd(r, 'robot'); r = F.rackAdd(r, 'echo')
  assert.deepEqual(r, ['echo', 'robot', null])
  r = F.rackAdd(r, 'wah'); assert.deepEqual(F.rackAdd(r, 'alien'), r, 'full rack')
  assert.deepEqual(F.rackMove(r, 0, 2), ['wah', 'robot', 'echo'])
  assert.deepEqual(F.rackClear(r, 1), ['echo', null, 'wah'])
  assert.deepEqual(F.rackPut(F.rackClear(r, 1), 'alien', 1), ['echo', 'alien', 'wah'])
  assert.deepEqual(F.rackPut(r, 'echo', 2), ['wah', 'robot', 'echo'], 'dropping a racked chip moves it')
  assert.deepEqual(F.rackAdd(r, 'nope'), r)
  assert.deepEqual(F.rackIds(['echo', null, 'wah']), ['echo', 'wah'])
})

test('pillow filters: rate and tails set the baked length', () => {
  assert.equal(F.chainRate(['chipmunk']), 1.7)
  assert.ok(Math.abs(F.chainRate(['chipmunk', 'slowmo']) - 1.054) < 1e-9)
  assert.equal(F.bakedSeconds(4, []), 4)
  assert.ok(Math.abs(F.bakedSeconds(4, ['slowmo', 'reverb']) - 6.5) < 1e-9, 'capped')
  assert.ok(Math.abs(F.bakedSeconds(1, ['echo']) - 2.4) < 1e-9)
})

test('pillow filters: curves, impulse, trimming and the WAV header', () => {
  const d = F.driveCurve(30)
  assert.ok(Math.abs(d[0] + 1) < 1e-6 && Math.abs(d[d.length - 1] - 1) < 1e-6)
  assert.ok(new Set(F.crushCurve(4)).size <= 9)
  const [l, r] = F.makeImpulse(1000, 2, 3, () => 0.75)
  assert.equal(l.length, 2000); assert.ok(Math.abs(l[0]) > Math.abs(l[1500])); assert.equal(r.length, 2000)
  const x = new Float32Array(1000); x[300] = 0.5; x[700] = -0.4
  assert.deepEqual(F.soundSpan(x, 1000, 0.02, 10), [290, 711])
  assert.equal(F.soundSpan(new Float32Array(10), 1000), null)
  assert.ok(Math.abs(Math.max(...F.normalize(x, 0.9)) - 0.9) < 1e-6)
  assert.equal(F.decimate(new Float32Array(9).fill(1), 3).length, 3)
  const w = F.encodeWav(new Float32Array([0, 1, -1]), 16000), v = new DataView(w.buffer)
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF')
  assert.equal(v.getUint32(24, true), 16000)
  assert.equal(w.length, 44 + 6)
  assert.equal(v.getInt16(46, true), 32767); assert.equal(v.getInt16(48, true), -32768)
})

// A fake AudioContext that records the graph, so the chain can be checked without a browser.
function fakeCtx(rate = 16000) {
  const edges = [], started = []
  const param = (v = 0) => ({ value: v, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} })
  let id = 0
  const node = (kind, extra = {}) => {
    const n = { kind, id: id++, connect(t) { edges.push([n, t]); return t }, disconnect() {}, ...extra }
    return n
  }
  const ctx = {
    sampleRate: rate, currentTime: 0, edges, started,
    createGain: () => node('gain', { gain: param(1) }),
    createBiquadFilter: () => node('biquad', { frequency: param(350), Q: param(1), type: 'lowpass' }),
    createDelay: () => node('delay', { delayTime: param(0) }),
    createWaveShaper: () => node('shaper', { curve: null }),
    createConvolver: () => node('convolver', { buffer: null }),
    createOscillator: () => node('osc', { frequency: param(440), type: 'sine', start(t, o) { started.push(['osc', t, o]) }, stop() {} }),
    createBufferSource: () => node('bufsrc', { playbackRate: param(1), loop: false, start(t, o) { started.push(['buf', t, o]) }, stop() {} }),
    createBuffer: (c, n) => { const ch = Array.from({ length: c }, () => new Float32Array(n)); return { length: n, getChannelData: i => ch[i] } },
  }
  return ctx
}
// Is `to` reachable from `from` through audio connections (not into AudioParams)?
function reaches(edges, from, to) {
  const seen = new Set([from]), q = [from]
  while (q.length) { const n = q.shift(); if (n === to) return true; for (const [a, b] of edges) if (a === n && b && b.kind && !seen.has(b)) { seen.add(b); q.push(b) } }
  return false
}

test('pillow filters: every filter builds a connected chain on a fake context', () => {
  for (const id of F.FILTER_IDS) {
    const ctx = fakeCtx(), src = ctx.createBufferSource(), ch = F.buildChain(ctx, src, [id])
    assert.ok(reaches(ctx.edges, src, ch.out), `${id} reaches the output`)
    ch.start(0); ch.stop()
  }
  const ctx = fakeCtx(), src = ctx.createBufferSource()
  F.buildChain(ctx, src, ['chipmunk', 'echo'])
  assert.equal(src.playbackRate.value, 1.7)
  const hi = fakeCtx(), s2 = hi.createBufferSource(), c2 = F.buildChain(hi, s2, ['high'])
  c2.start(1)
  assert.equal(hi.started.length, 4, 'two taps, each with a sweep and a fade')
  assert.deepEqual(hi.started.map(x => x[2]).sort(), [0, 0, 0.05, 0.05])
})

test('pillow filters: stages run in slot order', () => {
  const ctx = fakeCtx(), src = ctx.createBufferSource()
  F.buildChain(ctx, src, ['phone', 'distort'])
  const firstBiquad = ctx.edges.find(([, b]) => b.kind === 'biquad')[1]
  const shapers = ctx.edges.filter(([, b]) => b.kind === 'shaper').map(([, b]) => b)
  const distortShaper = shapers[shapers.length - 1]
  assert.ok(reaches(ctx.edges, firstBiquad, distortShaper), 'telephone comes before distortion')
  assert.ok(!reaches(ctx.edges, distortShaper, firstBiquad))
})

test('pillow filters: squeaks schedule a short tune', () => {
  const ctx = fakeCtx()
  const secs = F.squeak(ctx, ctx.createGain(), 3, 0.5)
  assert.ok(secs > 1 && secs < 1.4)
  assert.ok(ctx.started.filter(x => x[0] === 'osc').length >= 2)
})

// ── 2-player tables, Chitbots that draw their own spin on the stash and shout nonsense ──
import { CRIES, cleanCryText, pickCry } from './cries.js'
import { varyArt } from './doodles.js'

test('pillow: two is enough to start (meta.min 2), one is not', () => {
  assert.equal(R.meta.min, 2)
  assert.ok(R.setup(['a', 'b'], 1))
  assert.throws(() => R.setup(['a'], 1), /2 to 8/)
})

test('pillow: the battle-cry lines are plenty, distinct and clean', () => {
  assert.ok(CRIES.length >= 30)
  assert.equal(new Set(CRIES).size, CRIES.length)
  for (const c of CRIES) assert.equal(cleanCryText(c), c)
  assert.equal(cleanCryText('  hi <b>there</b>\n'), 'hi bthere/b')
  const said = []
  for (let i = 0; i < CRIES.length; i++) said.push(pickCry(Math.random, said))
  assert.equal(new Set(said).size, CRIES.length, 'no repeats until the list runs out')
})

test('pillow: Chitbots hand in a varied stash doodle and a battle-cry line', () => {
  const s = R.setup(['a', 'bot:1', 'bot:2'], 9)
  for (const m of ['bot:1', 'bot:2']) {
    const c = s.pub.champs[R.champOf(s.pub, m)]
    assert.ok(CRIES.includes(c.cry.text), 'a line to shout')
    assert.ok(R.cryMs(c.cry) >= R.SQUEAK_MS)
    const got = s.secret.art[m].art
    assert.doesNotThrow(() => cleanArt(got))
    assert.ok(!DOODLES.some(d => JSON.stringify(d.art) === JSON.stringify(got)), 'not a straight copy of the stash')
  }
  // varyArt is deterministic and stays on the grid
  let n = 1
  const r = () => { n = (n * 16807) % 2147483647; return n / 2147483647 }
  const v1 = varyArt(DOODLES[3].art, r)
  n = 1
  assert.deepEqual(varyArt(DOODLES[3].art, r), v1)
  assert.equal(v1.length, DOODLES[3].art.length)
})

test('pillow: no-mic cries carry a typed line, or a random one', () => {
  let s = R.setup(['a', 'b', 'c'], 4)
  for (const m of ['a', 'b', 'c']) s = R.move(s, m, { type: 'draw', art })
  s = R.move(s, 'a', { type: 'cry', none: true, text: '  Fear   the fluff! ' })
  assert.equal(s.pub.champs[R.champOf(s.pub, 'a')].cry.text, 'Fear the fluff!')
  s = R.move(s, 'b', { type: 'cry', none: true })
  assert.ok(CRIES.includes(s.pub.champs[R.champOf(s.pub, 'b')].cry.text))
  assert.throws(() => R.move(s, 'c', { type: 'cry', none: true, text: 42 }), /not text/)
})

test('pillow: two people and two Chitbots play a whole game, and every bout gets real votes', () => {
  let s = R.setup(['a', 'b', 'bot:1', 'bot:2'], 77, { quick: true })
  const seen = new Set()
  for (let k = 0; k < 3000 && !R.over(s); k++) {
    const p = s.pub
    seen.add(p.phase)
    if (p.phase === 'draw') { s = make(s); continue }
    if (p.phase === 'voice') { for (const m of p.makers) if (!m.startsWith('bot:') && !p.champs[R.champOf(p, m)].cry) s = R.move(s, m, { type: 'cry', none: true }); continue }
    if (p.phase === 'battle' && p.stage === 'vote') for (const h of ['a', 'b']) if (p.bouts[p.bi].voters.includes(h) && p.votes[h] === undefined) s = R.move(s, h, { type: 'vote', side: 'a' })
    const who = R.turn(s)
    s = R.move(s, who, who.startsWith('bot:') ? R.bot(R.view(s), who, 'normal', Math.random) : R.timeout())
  }
  assert.ok(R.over(s), 'the game ends')
  assert.deepEqual([...seen].filter(x => x !== 'end').sort(), ['battle', 'draw', 'recap', 'voice'].filter(x => seen.has(x)).sort())
  assert.equal(s.pub.round, 2)
  for (const l of s.pub.log) assert.ok(l.va + l.vb >= 1, 'somebody voted in every bout')
})
