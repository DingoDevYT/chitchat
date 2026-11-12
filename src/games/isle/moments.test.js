import test from 'node:test'
import assert from 'node:assert/strict'
import * as I from './rules.js'
import { describe, flights, gained, ticks } from './moments.js'
import { rng } from '../rng.js'

const nm = p => p.toUpperCase()

test('isle moments: every move of whole bot games gets a sentence, log lines and sane flights', () => {
  const players = ['a', 'b', 'c'], rand = rng(5)
  let s = I.setup(players, 8), k = 0
  const seen = new Set()
  while (!I.over(s) && k++ < 3000) {
    const who = I.turn(s), p = I.view(s, 'x')
    s = I.move(s, who, I.bot(I.view(s, who), who, 'normal', rand))
    const v = I.view(s, 'x'), l = v.last
    seen.add(l.type)
    if (l.type !== 'end') assert.ok(describe(v, nm).length > 5, `${l.type} described`)
    for (const t of ticks(p, v, nm)) assert.ok(t.icon && t.text)
    for (const f of flights(p, v)) {
      assert.ok(I.RES.includes(f.res) && players.includes(f.to))
      assert.ok(f.from.tile != null || players.includes(f.from.pid))
    }
    if (l.type === 'roll' && v.gains) {
      const g = gained(p, v)
      assert.deepEqual(Object.keys(g).sort(), Object.keys(v.gains).sort(), 'bubbles match the producers')
      assert.equal(flights(p, v).length, Math.min(14, Object.values(v.gains).reduce((a, b) => a + I.total(b), 0)), 'one chip per resource made')
    }
  }
  for (const t of ['cottage', 'path', 'roll', 'build', 'buy', 'raccoon', 'end']) assert.ok(seen.has(t), t)
  assert.match(ticks({ ...I.view(s, 'x'), winner: null }, I.view(s, 'x'), nm).at(-1).text, /wins!/)
})
