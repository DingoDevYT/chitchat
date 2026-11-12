// Lantern Hollow news and the board layout: every event a bot game produces reads as a line, and the geometry
// puts the bridge across the pond.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from './rules.js'
import { news, miniNews } from './news.js'
import { SPOTS, POND } from './geom.js'
import { BRIDGE, SPACES } from './data.js'
import { ICONS } from './icons.js'

test('news: every event of a whole bot game becomes a line with a known icon', () => {
  const players = ['bot:0', 'bot:1', 'bot:2', 'bot:3']
  let s = R.setup(players, 5, { quick: true }), seen = new Set(), steps = 0
  while (!R.over(s) && steps++ < 5000) {
    const who = R.turn(s), p = s.pub
    s = R.move(s, who, R.bot(R.view(s, who), who, 'hard', Math.random) ?? R.timeout(s))
    const v = s.pub
    for (const l of news(v, x => x)) {
      assert.ok(l.text && !l.text.includes('undefined'), l.text)
      assert.ok(ICONS[l.icon], `icon ${l.icon}`)
      seen.add(l.k)
    }
    if (v.miniResult !== p.miniResult) for (const l of miniNews(v, x => x)) assert.ok(!l.text.includes('undefined'))
  }
  assert.ok(R.over(s))
  for (const k of ['roll', 'glow', 'drizzle']) assert.ok(seen.has(k), `saw ${k}`)
})

test('geom: every space has a spot, the bridge runs across the pond, neighbours are spread out', () => {
  assert.equal(SPOTS.length, SPACES.length)
  const w = SPOTS[BRIDGE.from], e = SPOTS[SPACES[SPACES.length - 1].next[0]]
  assert.ok(w.x < POND.x - POND.rx && e.x > POND.x + POND.rx, 'bridge ends on opposite banks')
  for (let i = BRIDGE.to; i < SPACES.length; i++) assert.ok(Math.abs(SPOTS[i].x - POND.x) < POND.rx + 0.5)
  for (let i = 0; i < 36; i++) { const a = SPOTS[i], b = SPOTS[(i + 1) % 36]; assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.6) }
})
