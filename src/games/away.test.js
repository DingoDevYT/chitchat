import test from 'node:test'
import assert from 'node:assert/strict'
import { awayOf, quitPlan, settleAway, standIns, withoutAway } from './away.js'
import { GAMES } from './registry.js'
import { rng } from './rng.js'

const seats = [{ seat: 0, user_id: 'h', bot: null }, { seat: 1, user_id: null, bot: 'easy' }, { seat: 2, user_id: 'p', bot: null }]

test('awayOf reads only a list of ids; withoutAway keeps the house rules', () => {
  assert.deepEqual(awayOf(null), [])
  assert.deepEqual(awayOf({ away: 'x' }), [])
  assert.deepEqual(awayOf({ away: ['a', 3, 'b'] }), ['a', 'b'])
  assert.deepEqual(withoutAway({ quick: true, away: ['a'] }), { quick: true })
  assert.deepEqual(withoutAway(null), {})
})

test('Chitbots stand in for away people only where the game has Chitbots', () => {
  assert.deepEqual(standIns({}, { away: ['a'] }), ['a'])
  assert.deepEqual(standIns({ noBots: true }, { away: ['a'] }), [])
})

test('quit between rounds is a stand; the host hands over', () => {
  for (const status of ['lobby', 'done']) {
    const plan = quitPlan({ status, seats, hostId: 'h', uid: 'h' })
    assert.equal(plan.kind, 'stand')
    assert.deepEqual(plan.seats.map(s => s.seat), [1, 2])
    assert.equal(plan.host, 'p')
  }
  assert.equal(quitPlan({ status: 'lobby', seats, hostId: 'h', uid: 'p' }).host, undefined)
})

test('quit mid-round keeps the seat and marks you away', () => {
  const plan = quitPlan({ status: 'playing', seats, hostId: 'h', uid: 'p', away: [] })
  assert.deepEqual(plan, { kind: 'away', away: ['p'], host: undefined })
  assert.equal(quitPlan({ status: 'playing', seats, hostId: 'h', uid: 'h' }).host, 'p')
})

test('nobody seated, or already away: nothing to do', () => {
  assert.equal(quitPlan({ status: 'playing', seats, hostId: 'h', uid: 'z' }).kind, 'none')
  assert.equal(quitPlan({ status: 'playing', seats, hostId: 'h', uid: 'p', away: ['p'] }).kind, 'none')
})

test('the last present person leaving closes the table (Chitbots and away people do not count)', () => {
  assert.equal(quitPlan({ status: 'playing', seats, hostId: 'h', uid: 'h', away: ['p'] }).kind, 'close')
  assert.equal(quitPlan({ status: 'lobby', seats: seats.slice(0, 2), hostId: 'h', uid: 'h' }).kind, 'close')
})

test('the host passes to the first present person in seat order, skipping away people', () => {
  const s = [{ seat: 3, user_id: 'c' }, { seat: 0, user_id: 'h' }, { seat: 1, user_id: 'a' }, { seat: 2, user_id: 'b' }]
  assert.equal(quitPlan({ status: 'playing', seats: s, hostId: 'h', uid: 'h', away: ['a'] }).host, 'b')
})

test('settleAway gives up away seats and clears the list', () => {
  const r = settleAway(seats, { quick: true, away: ['p'] })
  assert.deepEqual(r.seats.map(s => s.seat), [0, 1])
  assert.deepEqual(r.opts, { quick: true })
})

// The referee's tick for an away person: R.bot with their own view (their private hand included), Normal level.
for (const id of ['snack', 'poker', 'property', 'isle', 'highcard']) {
  test(`${id}: a Chitbot finishes the game in a quitter's seat`, () => {
    const R = GAMES[id], rand = rng(7)
    let s = R.setup(['a', 'b'], 3, { quick: true }), steps = 0
    const away = []
    while (!R.over(s) && steps++ < 20000) {
      if (steps === 5) away.push('a', 'b') // both quit: from here on only stand-ins play
      const who = R.turn(s)
      const a = standIns(R.meta, { away }).includes(who) ? R.bot(R.view(s, who), who, 'normal', rand) : R.timeout(s)
      s = R.move(s, who, a ?? R.timeout(s))
    }
    assert.ok(R.over(s), `${id} ended in ${steps} steps`)
  })
}
