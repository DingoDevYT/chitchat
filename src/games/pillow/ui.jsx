// Pillow Chit Fight in the stadium-game screen: it brings its own full-screen Stage (lobby, drawing pad, voice booth,
// battles, recap, podium), so the 3D table, banner and hand aren't used. These exports keep GameScreen's screen-reader
// line working, and `lab` jumps the GameLab to any phase.
import * as R from './rules.js'
import { DOODLES } from './doodles.js'
import { champName } from './bits.jsx'

export { Stage } from './Stage.jsx'

export const banner = (v, nm, me) => {
  if (v.phase === 'end') { const w = R.over({ pub: v }) || []; return `${w.includes(me) ? 'You win' : `${w.map(nm).join(' & ')} wins`} Pillow Chit Fight!` }
  if (v.phase === 'draw') return `Round ${v.round}: drawing champions`
  if (v.phase === 'voice') return `Round ${v.round}: recording battle cries`
  if (v.phase === 'recap') return `Round ${v.round} results`
  const b = v.bouts[v.bi]
  return `Bout ${v.bi + 1}: ${champName(v.champs[b.a], nm)} versus ${champName(v.champs[b.b], nm)}, for ${b.prompt}`
}
export const lastText = (v, nm) => {
  const l = v.last
  if (l?.type !== 'bout' || v.phase !== 'battle' || v.stage !== 'win') return ''
  return `${champName(v.champs[l.w], nm)} wins the pillow fight, ${Math.max(l.va, l.vb)} to ${Math.min(l.va, l.vb)}.`
}
export const seatCards = () => []
export const info = (v, pid) => `${(v.scores[pid] || 0).toLocaleString()} pts`

// Dev lab only (#/table?g=pillow&lab=voice|battle|vote|win|recap|podium): jump to a phase with Chitbots. Timers are
// stretched so there's time to look; the clock then runs on as normal.
export function lab(s, me, what) {
  if (!what || what === 'draw') return s
  let st = s
  const p = () => st.pub
  const step = pred => {
    for (let k = 0; k < 500 && !pred(p()) && !R.over(st); k++) {
      const who = R.turn(st)
      st = R.move(st, who, who.startsWith('bot:') ? R.bot(R.view(st), who, 'normal', Math.random) : R.timeout())
    }
  }
  const hold = ms => { st = JSON.parse(JSON.stringify(st)); const q = st.pub; q.until = q.clock + ms; for (const k of Object.keys(q.bots)) q.bots[k] = q.until - 500; return st }
  if (p().phase === 'draw' && p().makers.includes(me)) st = R.move(st, me, { type: 'draw', art: DOODLES[9].art, name: 'Kettle Kraken' })
  if (what === 'voice') return hold(45000)
  // Bouts I'm not fighting in go first, so the lab can vote on them.
  st = JSON.parse(JSON.stringify(st))
  st.pub.bouts.sort((x, y) => +([x.a, x.b].map(k => st.pub.champs[k].owner).includes(me)) - +([y.a, y.b].map(k => st.pub.champs[k].owner).includes(me)))
  if (p().phase === 'voice') st = R.move(st, me, { type: 'cry', none: true })
  if (what === 'battle') return hold(R.linesMs(p(), p().bouts[p().bi]) + 20000)
  step(q => q.stage === 'vote')
  if (what === 'vote') {
    st = JSON.parse(JSON.stringify(st))
    const b = p().bouts[p().bi]
    b.voters.forEach((x, i) => { p().votes[x] = i % 3 === 2 ? 'b' : 'a' })
    return hold(40000)
  }
  step(q => q.stage === 'win')
  if (what === 'win') return hold(30000)
  step(q => q.phase === 'recap')
  if (what === 'recap') return hold(30000)
  step(q => q.phase === 'end')
  return st
}
