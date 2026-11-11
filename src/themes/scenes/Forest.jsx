import { scatter } from '../../lib/themes'
import { anim } from '../parts'

// Firefly forest: moonlit layers of pines, glowing mushrooms, swaying grass and fireflies wandering and blinking.
const flies = scatter(22, 41)
const blades = scatter(70, 3)

const pines = (seed, n, h, y) => scatter(n, seed).map((p, i) => {
  const x = (i + p.x * .6) * (1200 / n), w = 50 + p.r * 40, t = h * (.7 + p.t * .5)
  return `M${x} ${y}L${x + w / 2} ${y - t}L${x + w} ${y}z`
}).join('')

export default function Forest() {
  return <>
    <div className="frs-moon" />
    <svg className="frs-trees" viewBox="0 0 1200 300" preserveAspectRatio="none">
      <path d={pines(1, 16, 170, 250) + 'M0 240H1200V300H0z'} fill="#1d3b38" />
      <path d={pines(2, 13, 200, 275) + 'M0 268H1200V300H0z'} fill="#16302a" />
      <path d={pines(3, 10, 230, 300)} fill="#0e221d" />
    </svg>
    <div className="frs-ground" />
    <svg className="frs-shrooms" viewBox="0 0 70 44">
      <g className="frs-glow a" style={anim(4)}>
        <path d="M14 42V26h6v16z" fill="#e8dcc8" /><path d="M5 27a12 9 0 0 1 24 0z" fill="#ff8b7b" />
        <path d="M38 42V20h7v22z" fill="#efe4d0" /><path d="M27 21a14 11 0 0 1 29 0z" fill="#ffb36b" />
        <circle cx="12" cy="23" r="1.6" fill="#fff4e8" /><circle cx="22" cy="22" r="1.3" fill="#fff4e8" />
        <circle cx="36" cy="15" r="1.8" fill="#fff4e8" /><circle cx="47" cy="13" r="1.4" fill="#fff4e8" />
      </g>
    </svg>
    <div className="frs-grass">
      {blades.map((p, i) => <i key={i} className="frs-blade a tb-sway" style={{
        left: `${p.x * 100}%`, height: 16 + p.r * 30, ...anim(2.6 + p.t * 2.4, p.r * 4),
        background: i % 3 ? '#2f6b45' : '#3f8a52',
      }} />)}
    </div>
    {flies.map((p, i) => (
      <div key={i} className={`frs-path a p${i % 3}`} style={{ left: `${p.x * 96}%`, top: `${20 + p.y * 68}%`, ...anim(9 + p.r * 10, p.t * 20) }}>
        <i className="frs-fly a" style={anim(1.6 + p.t * 2.2, p.r * 3)} />
      </div>
    ))}
  </>
}
