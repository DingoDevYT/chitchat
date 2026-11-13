// Impostor in the stadium: the game draws its own 3D world and HUD (Game.jsx, its own lazy chunk), so the
// shared table isn't used (ownScene). The rest is the small text GameScreen asks every game for.
import { Suspense, lazy } from 'react'
import * as R from './rules.js'
import { spot } from './map.js'

const Game = lazy(() => import('./Game.jsx'))
export const ownScene = true

export const WHY = {
  bake: 'Every task is done: the Morning Bake is ready!', caught: 'Every Nibbler was voted onto the night tram.',
  outnumbered: 'The Nibblers outnumber the bakers left standing.', boil: 'Nobody turned the dials: the oven boiled over.', sunrise: 'The sun came up on an unfinished bake.',
}
export const banner = (v) => {
  if (v.phase === 'end') return `${v.winner === 'bakers' ? 'Bakers' : 'Nibblers'} win! ${WHY[v.why] || ''}`
  if (v.phase === 'apron') return 'Shhh… check your role.'
  if (v.phase === 'talk') return 'Meeting: discuss!'
  if (v.phase === 'vote') return 'Meeting: vote!'
  if (v.phase === 'reveal') return 'Ejecting…'
  return 'The night shift'
}
export const lastText = () => ''
export const info = () => null
export const seatCards = () => []
export const Controls = () => null
export const Flat = () => null

// Dev lab only (#/table?g=chitchen&n=6&lab=…): jump to a situation to check by eye.
// apron (role reveal) · play · nibbler (you're a Nibbler) · chore · candles · flour · nap (you're a ghost) · body (a
// body near you) · tea (meeting, discussion) · vote (meeting, voting) · reveal (votes, then the ejection) · end
export function lab(s, me, what) {
  if (what === 'apron') return s
  const role = (st, x) => st.priv[x].role
  if (what === 'nibbler' && role(s, me) !== 'nibbler') { // swap roles with a Nibbler bot
    s = structuredClone(s)
    const nib = s.pub.players.find(x => role(s, x) === 'nibbler'), mine = s.priv[me]
    s.priv[me] = { ...s.priv[nib], id: me, mates: s.priv[nib].mates.filter(x => x !== me) }
    s.priv[nib] = { ...mine, id: nib, memory: [], witness: [], to: null }
    for (const x of s.pub.players) if (role(s, x) === 'nibbler' && x !== me) s.priv[x].mates = s.pub.players.filter(y => y !== x && role(s, y) === 'nibbler')
  }
  const tick = st => R.move(st, R.turn(st), { type: 'tick' })
  let k = 0
  while (s.pub.phase === 'apron' && k++ < 5) s = tick(s)
  // let the bots walk a few steps so the bakery has people about
  for (let i = 0; i < 14 && s.pub.phase === 'play'; i++) {
    const w = R.turn(s), next = R.move(s, w, w.startsWith('bot:') ? R.bot(R.view(s, w), w, 'normal', Math.random) ?? { type: 'tick' } : { type: 'tick' })
    if (next.pub.phase !== 'play' || Object.keys(next.pub.naps).length) break // keep a calm bakery scene
    s = next
  }
  if (s.pub.phase !== 'play') return s
  s = structuredClone(s)
  const p = s.pub, t = p.clock
  const bots = p.players.filter(x => x.startsWith('bot:'))
  const place = (x, y) => { p.seats[me] = [x, y]; s.secret.seen[me] = { x, y, t } }
  if (what === 'chore') { const sp = spot(s.priv[me].chores[0]); place(sp.x + 0.6, sp.y + 0.6) }
  if (what === 'play' || what === 'nibbler') place(15.4, 15.6)
  if (what === 'candles' || what === 'flour') { p.mischief = { kind: what, t, ends: t + 60000 }; place(15.4, 15.6) }
  if (what === 'nap') { p.status[me] = 'nap'; p.naps[me] = { x: p.seats[me][0], y: p.seats[me][1], room: 'kitchen', t, found: false } }
  if (what === 'body') {
    const victim = bots.find(x => role(s, x) === 'baker')
    if (victim) { p.status[victim] = 'nap'; p.naps[victim] = { x: 16.5, y: 15, room: 'kitchen', t, found: false }; p.bots[victim] = { pts: [[13, 22]], t0: t, next: null } }
    place(15.4, 16.2)
  }
  if (['tea', 'vote', 'reveal', 'end'].includes(what)) {
    const victim = bots.find(x => role(s, x) === 'baker'), finder = bots.find(x => role(s, x) === 'baker' && x !== victim)
    if (!victim || !finder) return s
    p.status[victim] = 'nap'; p.naps[victim] = { x: 19, y: 7, room: 'loft', t, found: false }
    p.bots[finder] = { pts: [[20, 7]], t0: t, next: t }
    s = R.move(s, finder, { type: 'report', target: victim })
    if (what === 'tea') return s
    s = R.move(s, R.turn(s), { type: 'tick' }) // discussion over: voting opens
    const out = s.pub.players.find(x => role(s, x) === 'nibbler' && x !== me) || s.pub.players.find(x => x !== me && s.pub.status[x] === 'awake')
    const voters = s.pub.players.filter(x => s.pub.status[x] === 'awake' && x !== me)
    if (what === 'vote') { for (const x of voters.slice(0, 2)) s = R.move(s, x, { type: 'vote', target: x === out ? 'skip' : out }); return s }
    for (const x of [...voters, me]) if (s.pub.phase === 'vote') s = R.move(s, x, { type: 'vote', target: x === out ? 'skip' : out })
    if (what === 'end') { while (s.pub.phase !== 'end') s = R.move(s, R.turn(s), { type: 'tick' }) }
  }
  return s
}

export function Hud(props) {
  return <Suspense fallback={<div className="gs-loading">Lighting the candles…</div>}><Game {...props} /></Suspense>
}
