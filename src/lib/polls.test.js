import test from 'node:test'
import assert from 'node:assert/strict'
import { tally, applyVote, pollArgs } from './polls.js'

test('tally counts voters, not votes, for percentages', () => {
  const votes = [{ user_id: 'a', answer: 0 }, { user_id: 'a', answer: 1 }, { user_id: 'b', answer: 1 }]
  const t = tally(['x', 'y', 'z'], votes, 'a')
  assert.equal(t.total, 2)
  assert.deepEqual(t.rows.map(r => [r.count, r.pct, r.mine, r.top]), [[1, 50, true, false], [2, 100, true, true], [0, 0, false, false]])
  assert.deepEqual(t.rows[1].who, ['a', 'b'])
  assert.equal(tally(['x', 'y'], [], 'a').rows[0].top, false)
})

test('applyVote is idempotent (realtime echoes our own votes)', () => {
  const v = { user_id: 'a', answer: 1, poll_id: 'p' }
  const once = applyVote([], v, true)
  assert.deepEqual(once, [{ user_id: 'a', answer: 1 }])
  assert.equal(applyVote(once, v, true), once)
  assert.deepEqual(applyVote(once, v, false), [])
})

test('pollArgs validates like the database', () => {
  const ok = pollArgs({ question: ' Snack? ', answers: [' tea', '', 'cake '], multi: 1, hours: 24 })
  assert.deepEqual(ok, { question: 'Snack?', answers: ['tea', 'cake'], allow_multiple: true, duration_h: 24 })
  assert.ok(pollArgs({ question: '', answers: ['a', 'b'], hours: 1 }).error)
  assert.ok(pollArgs({ question: 'q', answers: ['a'], hours: 1 }).error)
  assert.ok(pollArgs({ question: 'q', answers: ['a', 'A'], hours: 1 }).error)
  assert.ok(pollArgs({ question: 'q', answers: ['a', 'x'.repeat(56)], hours: 1 }).error)
  assert.ok(pollArgs({ question: 'q', answers: Array.from({ length: 11 }, (_, i) => 'a' + i), hours: 1 }).error)
  assert.ok(pollArgs({ question: 'q', answers: ['a', 'b'], hours: 5 }).error)
})
