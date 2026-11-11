import { scatter } from '../../lib/themes'
import { Plane, WaveStrip, anim } from '../parts'

// Beach day: sun, drifting clouds and gulls; a sea with rolling crests and glints; foam washing up on textured sand; a shy crab.
const glints = scatter(18, 11)

export default function Beach() {
  return <>
    <div className="bch-sun a tb-pulse" style={anim(6)} />
    <Plane n={3} seed={4} dir="left" d="150s" className="bch-clouds" item={(p, st, k) =>
      <Cloud key={k} style={{ ...st, width: 90 + p.r * 110, opacity: .7 + p.t * .3 }} />} />
    <Gull top="15%" d={46} dl={8} size={1} />
    <Gull top="22%" d={64} dl={40} size={.7} />
    <div className="bch-sea">
      <WaveStrip className="a tb-left" style={{ ...anim(60), top: '6%', height: 10, opacity: .45 }} n={16} amp={3} h={12} stroke="#ffffff" sw={1.5} />
      <WaveStrip className="a tb-right" style={{ ...anim(48), top: '24%', height: 12, opacity: .5 }} n={12} amp={4} h={14} stroke="#ffffff" sw={1.5} />
      <WaveStrip className="a tb-left" style={{ ...anim(34), top: '46%', height: 16, opacity: .55 }} n={10} amp={5} h={18} stroke="#ffffff" sw={2} />
      {glints.map((p, i) => <i key={i} className="bch-glint a tb-tw" style={{
        left: `${48 + p.x * 46}%`, top: `${8 + p.y * 62}%`, width: 8 + p.r * 16, ...anim(2.4 + p.t * 2.6, p.r * 5),
      }} />)}
      <WaveStrip className="bch-roll a tb-left" style={anim(26)} n={6} amp={9} h={40} fill="#86d6e4" stroke="#ffffff" sw={3} />
    </div>
    <div className="bch-sand">
      <div className="bch-wash a" style={anim(9)}>
        <WaveStrip className="a tb-right" style={{ ...anim(40), top: 0, height: 30 }} n={8} amp={7} h={30} fill="#9fe0ea" stroke="#ffffff" sw={4} />
      </div>
      <div className="bch-foam a" style={anim(9)}>
        <WaveStrip className="a tb-left" style={{ ...anim(52), top: 0, height: 14 }} n={10} amp={4} h={14} stroke="#ffffffcc" sw={2} />
      </div>
      <Starfish />
      <i className="bch-shell" />
      <div className="bch-crab-hole"><i className="bch-hole" />
        <div className="bch-crab-clip"><Crab /></div>
      </div>
    </div>
  </>
}

const Cloud = ({ style }) => (
  <svg className="bch-cloud" style={style} viewBox="0 0 120 52" aria-hidden="true">
    <path d="M18 50a15 15 0 0 1 2-30 20 20 0 0 1 36-10 17 17 0 0 1 30 4 15 15 0 0 1 16 36z" fill="#fff" />
  </svg>
)

function Gull({ top, d, dl, size }) {
  return (
    <div className="tb-crossing a tb-cross" style={{ ...anim(d, dl), top }}>
      <div className="a tb-bob" style={anim(3.2, dl)}>
        <svg className="bch-gull a" style={{ ...anim(.55, dl), width: 34 * size }} viewBox="0 0 40 16">
          <path d="M2 11Q10 2 20 10Q30 2 38 11" fill="none" stroke="#3b4a5c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

const Starfish = () => (
  <svg className="bch-star" viewBox="0 0 40 40">
    <path d="M20 3l4.6 11 11.9.9-9.1 7.7 2.9 11.6L20 27.9 9.7 34.2l2.9-11.6L3.5 14.9l11.9-.9z" fill="#ff9a76" stroke="#e8735a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="16" cy="18" r="1.4" fill="#5a2a1e" /><circle cx="24" cy="18" r="1.4" fill="#5a2a1e" />
  </svg>
)

const Crab = () => (
  <svg className="bch-crab a" viewBox="0 0 64 44" style={anim(13, 4)}>
    <g className="bch-claw a" style={anim(.5)}>
      <path d="M16 30L9 22" stroke="#e85d3f" strokeWidth="3" strokeLinecap="round" />
      <path d="M9 22a6 6 0 1 1 1-9l-3 4z" fill="#ff7a59" />
    </g>
    <g className="bch-claw r a" style={anim(.5, .25)}>
      <path d="M48 30l7-8" stroke="#e85d3f" strokeWidth="3" strokeLinecap="round" />
      <path d="M55 22a6 6 0 1 0-1-9l3 4z" fill="#ff7a59" />
    </g>
    <path d="M27 24l-2-11M37 24l2-11" stroke="#e85d3f" strokeWidth="2.6" strokeLinecap="round" />
    <ellipse cx="32" cy="33" rx="17" ry="11" fill="#ff7a59" />
    <circle cx="25" cy="11" r="4" fill="#fff" /><circle cx="39" cy="11" r="4" fill="#fff" />
    <circle className="bch-eye a" style={anim(4)} cx="25.5" cy="11.5" r="2" fill="#2a1a10" />
    <circle className="bch-eye a" style={anim(4)} cx="39.5" cy="11.5" r="2" fill="#2a1a10" />
    <circle cx="24" cy="34" r="2.6" fill="#ffb3a0" /><circle cx="40" cy="34" r="2.6" fill="#ffb3a0" />
    <path d="M29 33q3 3 6 0" stroke="#8a2e1e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
)
