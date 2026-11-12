import test from 'node:test'
import assert from 'node:assert/strict'
import * as prop from './rules.js'
import { cashDiff, drawn, money, ticks } from './moments.js'

test('teacup HUD moments: every move of whole bot games gives sane ticker lines, money and cards', () => {
  const short = pid => pid
  let seen = { rent: 0, card: 0, start: 0 }
  for (let seed = 1; seed <= 6; seed++) {
    const ps = ['a', 'bot:1', 'bot:2']
    let s = prop.setup(ps, seed)
    for (let k = 0; k < 600 && !prop.over(s); k++) {
      const who = prop.turn(s)
      const n = prop.move(s, who, prop.bot(prop.view(s), who, 'normal', Math.random) ?? prop.timeout(s))
      const p = prop.view(s), v = prop.view(n)
      const t = ticks(p, v, short), m = money(p, v, short), c = drawn(p, v)
      for (const x of t) assert.ok(x.text && x.icon && x.c, JSON.stringify(x))
      const d = cashDiff(p, v)
      assert.equal(!!m, Object.keys(d).length > 0, 'a money moment exactly when cash moved')
      if (v.last.rent) { seen.rent++; assert.match(m.receipt.title, /^Rent paid/); assert.ok(d[v.last.rent.to] > 0 || v.broke[v.last.pid], 'the owner got paid') }
      if (c) { seen.card++; assert.ok(prop.DECKS[c.deck].cards.some(x => x.text === c.text)) }
      if (t.some(x => x.text.endsWith('passed Start'))) seen.start++
      s = n
    }
  }
  assert.ok(seen.rent && seen.card && seen.start, JSON.stringify(seen))
})

test('teacup HUD moments: birthday card totals what everyone gives', () => {
  const s = prop.setup(['a', 'b', 'c'], 1)
  const p = s.pub
  const v = { ...p, rolls: 1, card: { deck: 'party', text: "It's your birthday! Every player gives you 10.", back: false }, last: { pid: 'a', type: 'roll', dice: [1, 1], from: 0 } }
  assert.equal(drawn(p, v).fx, '+20 total')
  assert.equal(drawn(v, v), null, 'the same card is not drawn twice')
})
