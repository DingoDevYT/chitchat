import { scatter } from '../../lib/themes'
import { Plane, anim } from '../parts'

// Starry night: a glowing crescent moon, twinkling and sparkling stars, wispy clouds, shooting stars,
// and a little cabin with a warm window on the hills.
const dust = scatter(70, 21)
const twinkles = scatter(26, 5)
const sparkles = scatter(6, 9)

export default function Night() {
  return <>
    {dust.map((p, i) => <i key={i} className="ngt-dust" style={{ left: `${p.x * 100}%`, top: `${p.y * 72}%`, opacity: .25 + p.r * .5, width: 1 + p.t * 1.6, height: 1 + p.t * 1.6 }} />)}
    {twinkles.map((p, i) => <i key={i} className="ngt-star a tb-tw" style={{ left: `${p.x * 100}%`, top: `${p.y * 68}%`, ...anim(2 + p.r * 4, p.t * 6) }} />)}
    {sparkles.map((p, i) => (
      <svg key={i} className="ngt-sparkle a" viewBox="0 0 20 20" style={{ left: `${8 + p.x * 84}%`, top: `${4 + p.y * 50}%`, width: 12 + p.r * 10, ...anim(3 + p.t * 3, p.r * 6) }}>
        <path d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0z" fill="#fff6d8" />
      </svg>
    ))}
    <div className="ngt-moon-glow a tb-pulse" style={anim(7)} />
    <div className="ngt-moon"><i /><i /><i /></div>
    <Plane n={3} seed={8} dir="left" d="220s" className="ngt-wisps" item={(p, st, k) =>
      <i key={k} className="ngt-wisp" style={{ ...st, width: 160 + p.r * 220, opacity: .1 + p.t * .14 }} />} />
    <i className="ngt-shoot a" style={anim(11, 3, { left: '58%', top: '10%' })} />
    <i className="ngt-shoot a" style={anim(17, 12, { left: '24%', top: '22%' })} />
    <svg className="ngt-hills" viewBox="0 0 1200 220" preserveAspectRatio="none">
      <path d="M0 120C180 60 360 70 520 110S860 60 1200 90V220H0z" fill="#2a2457" />
      <path d="M0 160C220 110 420 120 640 150S1000 120 1200 140V220H0z" fill="#1c1840" />
    </svg>
    <svg className="ngt-cabin" viewBox="0 0 90 80">
      <path d="M12 40L45 12 78 40z" fill="#3a2f6a" />
      <rect x="20" y="38" width="50" height="34" rx="3" fill="#2b2452" />
      <rect x="58" y="16" width="8" height="16" fill="#2b2452" />
      <rect className="ngt-window a" style={anim(5)} x="30" y="46" width="14" height="13" rx="2" fill="#ffd27a" />
      <rect x="52" y="50" width="10" height="22" rx="2" fill="#1c1840" />
    </svg>
    {[[6, 1], [12, .8], [88, 1.1], [94, .75]].map(([x, s], i) =>
      <svg key={i} className="ngt-pine" viewBox="0 0 40 80" style={{ left: `${x}%`, width: 40 * s }}>
        <path d="M20 0L34 30H27L38 54H28L36 74H4L12 54H2L13 30H6z" fill="#141233" />
      </svg>)}
  </>
}
