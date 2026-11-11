import { scatter } from '../../lib/themes'
import { Plane, anim } from '../parts'

// Rainy window: soft city bokeh behind the glass, rain streaking past, beads of water and drops sliding down the pane.
const BOKEH = ['#ffb86b', '#ff8fa3', '#8fd3ff', '#ffe08a', '#b59cff', '#7ef0c8']
const lights = scatter(22, 31)
const beads = scatter(40, 17)
const sliders = scatter(9, 23)

export default function Rain({ variant }) {
  return <>
    <div className="rn-city">
      {lights.map((p, i) => <i key={i} className="rn-bokeh a" style={{
        left: `${p.x * 100}%`, top: `${40 + p.y * 55}%`, width: 30 + p.r * 70, height: 30 + p.r * 70,
        '--c': BOKEH[i % BOKEH.length], ...anim(5 + p.t * 6, p.r * 8),
      }} />)}
    </div>
    <Plane n={40} seed={3} dir="down" d="1.6s" className="rn-streaks far" item={(p, st, k) => <i key={k} style={{ ...st, height: 12 + p.r * 14 }} />} />
    <Plane n={26} seed={13} dir="down" d="1s" className="rn-streaks near" item={(p, st, k) => <i key={k} style={{ ...st, height: 22 + p.r * 22 }} />} />
    {beads.map((p, i) => <i key={i} className="rn-bead" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 3 + p.r * 6, height: 3 + p.r * 7 }} />)}
    {sliders.map((p, i) => (
      <div key={i} className="rn-lane a" style={{ left: `${4 + p.x * 92}%`, ...anim(7 + p.r * 9, p.t * 16) }}>
        <i className="rn-drop" style={{ width: 7 + p.t * 5, height: 9 + p.t * 6 }} />
      </div>
    ))}
    {variant !== 'room' && <div className="rn-frame"><i /><i /></div>}
    <div className="rn-fog" />
  </>
}
