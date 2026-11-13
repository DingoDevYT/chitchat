// Jetpack Dash in the stadium-game screen: it brings its own full-screen Stage (line-up, canvas run, podium), so the
// generic 3D table, banner and hand aren't used. These exports keep GameScreen's screen-reader line working.
import { ranking } from './rules.js'

export { Stage } from './Stage.jsx'

export const banner = (v, nm, me) => {
  if (v.winner) return `${v.winner === me ? 'You fly' : `${nm(v.winner)} flies`} farthest: ${v.results[v.winner].m.toLocaleString()} m!`
  const left = v.players.filter(p => !v.results[p]).length
  return left ? `${left} still flying the Long Burrow` : 'Everyone has landed'
}
// (Chitbots post at the start, before their ghosts land, so they aren't announced.)
export const lastText = (v, nm) => v.last && !v.last.who.startsWith('bot:') ?`${nm(v.last.who)} landed at ${v.last.m.toLocaleString()} m with ${v.last.spr} sprinkles.` : ''
export const seatCards = () => []
export const info = (v, pid) => (v.results[pid] ? `${v.results[pid].m} m` : null)
export const place = (v, pid) => ranking(v).indexOf(pid) + 1

// Dev lab only (#/table?g=flyer&lab=podium): jump straight to a finished round to check the podium by eye.
// (In the lab the run also takes &auto=1 to let a Chitbot fly for you, &veh=trotter|brolly|flip|cup|rocket|sponge to
// start in a vehicle, &tok=3 to start with brew tokens, and &opts=whistle,flock for the house rules.)
export function lab(s, me, what) {
  if (what !== 'podium') return s
  const results = {}
  s.pub.players.forEach((p, i) => { results[p] = { m: [2410, 1980, 1655, 1120, 980, 640][i % 6], spr: [88, 41, 57, 23, 30, 12][i % 6], ticks: 60, shave: [9, 3, 14, 6, 20, 11][i % 6], talk: [62, 0, 35, 10, 0, 5][i % 6], ms: [7, 3, 1, 0, 5, 2][i % 6] } })
  const pub = { ...s.pub, startAt: Date.now() - 60000, results }
  pub.winner = ranking(pub)[0]
  return { ...s, pub }
}
