// Midnight Chitchen in the stadium: the game draws its own 3D world and HUD (Game.jsx, its own lazy chunk), so the
// shared table isn't used (ownScene). The rest is the small text GameScreen asks every game for.
import { Suspense, lazy } from 'react'
import * as R from './rules.js'
import { spot } from './map.js'

const Game = lazy(() => import('./Game.jsx'))
export const ownScene = true

const WHY = {
  bake: 'The Morning Bake is done before sunrise!', caught: 'Every Nibbler caught the night tram home.',
  outnumbered: 'The Nibblers outnumber the bakers still awake.', boil: 'The oven boiled over.', sunrise: 'The sun came up on an unfinished bake.',
}
export const banner = (v) => {
  if (v.phase === 'end') return `${v.winner === 'bakers' ? 'Bakers' : 'Nibblers'} win! ${WHY[v.why] || ''}`
  if (v.phase === 'apron') return 'Apron up! Check your role.'
  if (v.phase === 'talk' || v.phase === 'vote') return 'Tea Break!'
  if (v.phase === 'reveal') return 'Off on the night tram…'
  return 'The night shift'
}
export const lastText = () => ''
export const info = () => null
export const seatCards = () => []
export const Controls = () => null
export const Flat = () => null

// Dev lab only (#/table?g=chitchen&n=6&lab=play|chore|candles|flour|nap|tea|reveal): jump to a situation to check by eye.
export function lab(s, me, what) {
  const tick = st => R.move(st, R.turn(st), { type: 'tick' })
  let k = 0
  while (s.pub.phase === 'apron' && k++ < 5) s = tick(s)
  // let the bots walk a few steps so the bakery has people about
  for (let i = 0; i < 14 && s.pub.phase === 'play'; i++) {
    const w = R.turn(s), next = R.move(s, w, w.startsWith('bot:') ? R.bot(R.view(s, w), w, 'normal', Math.random) ?? { type: 'tick' } : { type: 'tick' })
    if (next.pub.phase !== 'play') break // keep the bakery scene: no Tea Break or ending during warm-up
    s = next
  }
  if (s.pub.phase !== 'play') return s
  s = structuredClone(s)
  const p = s.pub, t = p.clock
  const bots = p.players.filter(x => x.startsWith('bot:'))
  const role = x => s.priv[x].role
  if (what === 'chore') { const sp = spot(s.priv[me].chores[0]); p.seats[me] = [sp.x + 0.6, sp.y + 0.6]; p.seen[me] = { x: sp.x + 0.6, y: sp.y + 0.6, t } }
  if (what === 'play') p.seats[me] = [15.4, 15.6]
  if (what === 'candles' || what === 'flour') { p.mischief = { kind: what, t, ends: t + 60000 }; p.seats[me] = [15.4, 15.6] }
  if (what === 'nap') { p.status[me] = 'nap'; p.naps[me] = { x: p.seats[me][0], y: p.seats[me][1], room: 'kitchen', t, found: false } }
  if (what === 'tea' || what === 'reveal') {
    const victim = bots.find(x => role(x) === 'baker'), finder = bots.find(x => role(x) === 'baker' && x !== victim)
    if (!victim || !finder) return s
    p.status[victim] = 'nap'; p.naps[victim] = { x: 19, y: 7, room: 'loft', t, found: false }
    p.bots[finder] = { pts: [[20, 7]], t0: t, to: null, next: t }
    s = R.move(s, finder, { type: 'report', target: victim })
    if (what === 'reveal') {
      const out = s.pub.players.find(x => role(x) === 'nibbler' && x !== me) || s.pub.players.find(x => x !== me && s.pub.status[x] === 'awake')
      for (const x of s.pub.players) if (s.pub.status[x] === 'awake' && s.pub.phase !== 'reveal') s = R.move(s, x, { type: 'vote', target: x === out ? 'skip' : out })
    }
  }
  return s
}

export function Hud(props) {
  return <Suspense fallback={<div className="gs-loading">Lighting the candles…</div>}><Game {...props} /></Suspense>
}
