import { scatter } from '../../lib/themes'
import { Plane, anim } from '../parts'

// Sakura breeze: a blossoming branch swaying in from the corner, petals tumbling on the wind, a misty mountain and lake.
const blooms = [[60, 52, 1], [118, 38, .8], [150, 92, 1.1], [205, 70, .9], [236, 124, .75], [92, 112, .7], [262, 40, .65], [30, 90, .8]]
const petal = (p, st, k) => (
  <i key={k} className="skr-petal a" style={{ ...st, ...anim(3 + p.r * 4, p.t * 6), '--s': .9 + p.r * .8 }} />
)

export default function Sakura() {
  const buds = scatter(12, 77)
  return <>
    <div className="skr-sun" />
    <svg className="skr-hills" viewBox="0 0 1200 260" preserveAspectRatio="none">
      <path d="M0 150L260 120 520 30 600 22 680 34 900 118 1200 140V260H0z" fill="#e9d6ee" />
      <path d="M520 30L600 22 680 34 650 52 620 44 600 56 575 44 550 54z" fill="#fff" />
      <path d="M0 175C260 140 520 160 760 172S1060 150 1200 160V260H0z" fill="#dcc3e6" />
      <path d="M0 205H1200V260H0z" fill="#cfe1f3" />
      <path d="M80 222H300M480 236H760M900 220H1120" stroke="#ffffffaa" strokeWidth="3" strokeLinecap="round" />
    </svg>
    <div className="skr-wind a tb-swayx" style={anim(8)}>
      <Plane n={26} seed={12} dir="down" d="26s" className="skr-petals far" item={petal} />
    </div>
    <svg className="skr-branch a" viewBox="0 0 300 170" style={anim(7)}>
      <path d="M-10 20C60 30 120 50 170 80S250 120 290 150" stroke="#6b4237" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M90 42C110 20 130 14 150 12M160 74C190 64 220 66 240 70M120 58C110 80 100 96 96 112" stroke="#6b4237" strokeWidth="5" fill="none" strokeLinecap="round" />
      {blooms.map(([x, y, s], i) => <Bloom key={i} x={x} y={y} s={s} />)}
      {buds.map((p, i) => <circle key={i} cx={20 + p.x * 260} cy={20 + p.y * 120} r={2.5 + p.r * 2} fill="#ff9fbd" />)}
    </svg>
    <div className="skr-wind a tb-swayx" style={anim(6, 2)}>
      <Plane n={16} seed={5} dir="down" d="15s" className="skr-petals near" item={petal} />
    </div>
  </>
}

function Bloom({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map(r => <ellipse key={r} cx="0" cy="-8" rx="6" ry="8.5" fill="#ffc4d6" stroke="#ff9fbd" strokeWidth="1" transform={`rotate(${r})`} />)}
      <circle r="3.6" fill="#ff7aa2" />
      <circle r="1.6" fill="#ffe08a" />
    </g>
  )
}
