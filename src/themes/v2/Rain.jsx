import { scatter } from '../../lib/themes'
import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'
import './rain.css'

// Rainy window: a city at dusk painted behind wet glass. A warm knot of out-of-focus street lights (the focal point)
// sits low right, a lit sign stutters between two painted frames, a far lightning glow and a passing car turn up now
// and then; on the glass, sheets of rain thicken and thin in gusts, beads gather at the edges and drops run down.
// Palette: deep slate, slate, cool haze, glass light, sodium amber, dusty rose, grey teal.
const C = { deep: '#202839', slate: '#2c3448', haze: '#4f566e', glass: '#c9d2df', amber: '#e2ad69', rose: '#c98a80', teal: '#7ea3a2' }

const r2 = n => Math.round(n * 100) / 100
// an organic closed dab through n jittered points round a radius (sy squashes it)
function blob(r, seed, n = 7, j = .2, sy = 1) {
  const pts = scatter(n, seed).map((q, i) => {
    const a = (i + q.t * .5) / n * Math.PI * 2, k = r * (1 - j + q.r * j * 2)
    return [Math.cos(a) * k, Math.sin(a) * k * sy]
  })
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n], e = pts[(i + 2) % n]
    d += `C${r2(b[0] + (c[0] - a[0]) / 6)} ${r2(b[1] + (c[1] - a[1]) / 6)} ${r2(c[0] - (e[0] - b[0]) / 6)} ${r2(c[1] - (e[1] - b[1]) / 6)} ${r2(c[0])} ${r2(c[1])}`
  }
  return d + 'Z'
}

const FAR = [[0, 61], [3, 61], [3, 57.5], [6.5, 57.5], [6.5, 59], [10, 59], [10, 55], [11, 55], [11, 53.4], [12, 53.4], [12, 55], [14, 55],
  [14, 58.5], [19, 58.5], [19, 56], [23, 56], [23, 60], [27, 60], [27, 57], [29.5, 57], [29.5, 52.2], [31.4, 52.2], [31.4, 57], [35, 57],
  [35, 59.5], [41, 59.5], [41, 56.5], [46, 56.5], [46, 58], [52, 58], [52, 54.5], [55, 54.5], [55, 57.5], [60, 57.5], [60, 55.5], [63, 55.5],
  [63, 59], [69, 59], [69, 56], [72, 56], [72, 51], [73, 51], [73.4, 48.6], [73.8, 51], [75, 51], [75, 56], [79, 56], [79, 58.5], [85, 58.5],
  [85, 55], [90, 55], [90, 57.5], [95, 57.5], [95, 54], [98, 54], [98, 58], [100, 58]]
const MID = [[0, 63], [5, 63], [5, 59], [8, 59], [8, 57.5], [13, 57.5], [13, 61], [18, 61], [18, 64], [22, 64], [22, 60.5], [27, 60.5],
  [27, 62.5], [33, 62.5], [33, 65], [40, 65], [40, 61.5], [44, 61.5], [44, 63.5], [51, 63.5], [51, 66], [57, 66], [57, 62], [62, 62],
  [62, 59.5], [66, 59.5], [66, 63], [71, 63], [71, 60], [77, 60], [77, 62.5], [83, 62.5], [83, 58.5], [88, 58.5], [88, 61], [94, 61],
  [94, 63.5], [100, 63.5]]
// lit windows across the street (x %, y %, opacity): most in the warm block on the right
const WINDOWS = [[58.5, 64.5, .7], [60.2, 64.5, .45], [63.3, 61.5, .8], [63.3, 64, .5], [64.8, 66, .6], [84.2, 60.5, .75], [86, 60.5, .5],
  [84.2, 63, .65], [86, 65.5, .4], [72.5, 62, .55], [74.5, 64.5, .7], [6, 61, .45], [9.5, 60, .5], [11.2, 62.5, .35], [41.5, 63.5, .4], [45.5, 65.5, .3]]
const BLINKS = [[85.1, 63, 19.3], [60.2, 67, 27.1], [9.5, 62.5, 33.7]]
// out-of-focus lights beyond the glass: x %, y %, radius, colour, highlight, duration
const BOKEH = [
  [74, 58, 24, C.amber, '#f2cf96', 9.7], [79.5, 63.5, 36, C.amber, '#f0c98e', 13.1], [85.5, 56.5, 18, C.rose, '#e6b2a2', 7.3],
  [88.5, 66.5, 28, '#d9b07a', '#f3d7a6', 11.9], [70, 68, 17, C.rose, '#e3ada0', 8.9], [82.5, 72, 21, C.amber, '#f0cb92', 15.7],
  [92.5, 61, 14, '#ecd29a', '#fbe9c2', 6.7], [8, 64.5, 22, C.teal, '#b5cfcb', 12.3], [15.5, 70.5, 14, '#b89566', '#d8bd8f', 10.3],
  [22.5, 62.5, 11, C.rose, '#d9aaa0', 8.3], [47, 68.5, 12, '#cdb487', '#e6d3ad', 14.9], [55.5, 72.5, 18, C.teal, '#aecbc8', 17.1],
  [94, 21, 12, '#c9a274', '#e2c9a2', 9.1],
]
// condensation beads: hand-placed clusters (centre x, y, spread x, y, count, seed), heavy at the bottom edge and corners
const BEADS = [[50, 95, 52, 4, 34, 7], [5, 78, 6, 16, 14, 8], [91, 9, 9, 8, 12, 9], [30, 46, 30, 24, 7, 10], [72, 30, 12, 9, 7, 11]]
  .flatMap(([cx, cy, sx, sy, n, seed]) => scatter(n, seed).map(q =>
    [r2(cx + (q.x + q.y - 1) * sx), r2(cy + (q.r + q.t - 1) * sy), r2(1.4 + q.t * q.x * 4.6)]))
// running drops: x %, duration, radius, trail length, cling pattern
const LANES = [[7, 17.3, 3.2, 34, 0], [12.5, 23.9, 2.4, 20, 1], [21, 13.1, 3.8, 46, 0], [29, 29.3, 2.6, 26, 1], [47, 19.7, 3, 30, 0],
  [58, 31.1, 2.2, 16, 1], [66, 15.3, 4.2, 54, 1], [81, 21.1, 3.4, 40, 0], [88.5, 26.7, 2.6, 22, 1], [95, 11.9, 3.6, 48, 0]]
// rain sheets: streaks bunch into curtains rather than an even field
const sheet = (n, seed) => scatter(n, seed).filter(q => q.t < .4 + .6 * Math.abs(Math.sin(q.x * 9.4 + seed)))
const SHEETS = [
  { pts: sheet(70, 3), d: 2.6, dl: .7, len: [10, 20], w: 1.2, o: .42 },
  { pts: sheet(44, 13), d: 1.7, dl: 1.1, len: [20, 34], w: 1.6, o: .5 },
  { pts: sheet(20, 23), d: 1.15, dl: .4, len: [38, 60], w: 2.1, o: .55 },
]

function Rainfall({ id, pts, d, dl, len, w, o }) {
  return (
    <div className="v2-rain-plane a" style={anim(d, dl)}>
      <svg width="100%" height="100%">
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.glass} stopOpacity="0" /><stop offset="1" stopColor={C.glass} /></linearGradient></defs>
        {[0, 1].flatMap(k => pts.map((q, i) => {
          const L = r2(len[0] + q.r * (len[1] - len[0])), a = r2(w * .25), b = r2(w * .55)
          return <svg key={k + '-' + i} x={`${r2(q.x * 100)}%`} y={`${r2((q.y + k) * 50)}%`}>
            <path d={`M${-a} 0L${a} 0L${b} ${L}L${-b} ${L}Z`} fill={`url(#${id})`} opacity={r2(o * (.55 + q.t * .7))} />
          </svg>
        }))}
      </svg>
    </div>
  )
}

// a drop and the wet trail it leaves, fading upward (gradient defined with the beads)
const Drop = ({ r, L, g }) => <>
  <path d={`M-.4 ${-L}C.6 ${r2(-L * .66)} -1 ${r2(-L * .33)} ${r2(-r * .55)} -1L${r2(r * .55)} -1C.5 ${r2(-L * .33)} 1.2 ${r2(-L * .66)} .4 ${-L}Z`} fill={`url(#${g})`} opacity=".42" />
  <ellipse rx={r} ry={r2(r * 1.2)} fill="#161d2c" opacity=".38" />
  <ellipse cy={r2(r * .42)} rx={r2(r * .62)} ry={r2(r * .38)} fill={C.glass} opacity=".5" />
  <circle cx={r2(-r * .35)} cy={r2(-r * .45)} r={r2(r * .3)} fill="#f1f4f8" opacity=".85" />
</>

// a drip under the transom, in three held frames: a bead, a hanging drop, the drop let go
const DRIP = [
  <><path d="M-3 0C-2.6 2.6 2.6 2.6 3 0Z" fill="#8a95a8" /><circle cx="-1" cy=".8" r=".7" fill="#eef2f6" /></>,
  <><path d="M-2.6 0C-2.8 3 -4.2 5.4 -4 8C-3.8 11.6 3.8 11.6 4 8C4.2 5.4 2.8 3 2.6 0Z" fill="#8a95a8" /><circle cx="-1.6" cy="6.6" r="1" fill="#eef2f6" /></>,
  <><path d="M-2.4 0C-2 1.6 2 1.6 2.4 0Z" fill="#8a95a8" /><ellipse cy="17" rx="3" ry="3.8" fill="#8a95a8" /><circle cx="-1" cy="15.8" r=".8" fill="#eef2f6" /></>,
]

export default function Rain({ variant }) {
  const p = usePaint(7)
  const glass = variant !== 'room'
  return <>
    <Canvas p={p} className="v2-rain-canvas">
      <Wash f={p.sky} d={band(-10, 30, 2.5, .3)} fill={['#1e2638', '#222a3d', '#1c2435']} o={.75} />
      <Wash f={p.sky} d={band(25, 50, 3, 1.9)} fill={['#2f374d', '#333b51', '#2c344a']} o={.6} />
      <Wash f={p.sky} d={band(43, 66, 2.5, 3.1)} fill={['#58586c', '#5f5d6e', '#545469']} o={.6} />
      <Wash f={p.haze} d={band(50, 61, 2, .8)} fill="#a88b7b" o={.2} />
    </Canvas>

    <Pin x="21%" y="calc(27% + var(--sky) * .5)" className="v2-rain-pin a v2-rain-flash" style={anim(41.3, 17)}>
      <Glaze r={70} fill="#c2c6e4" o={.6} f={p.glow} />
    </Pin>
    <Pin x="30%" y="calc(10% + var(--sky) * .4)" className="v2-rain-pin a v2-rain-drift" style={anim(61.7, 23, { '--x': '38px' })}>
      <Wash px f={p.haze} o={.55} fill={['#333b51', '#373f56', '#30384d']} rim={['#4c536a', 0, 3]}
        d="M-230 10C-200 -6 -170 -2 -150 -12C-120 -26 -80 -14 -60 -22C-30 -34 10 -20 30 -26C60 -34 90 -18 120 -20C160 -22 190 -6 230 8C190 16 150 12 110 18C60 24 20 16 -20 20C-70 24 -120 16 -160 18C-190 19 -215 16 -230 10Z" />
    </Pin>
    <Pin x="77%" y="calc(22% + var(--sky) * .4)" className="v2-rain-pin a v2-rain-drift" style={anim(83.9, 51, { '--x': '-30px' })}>
      <Wash px f={p.haze} o={.45} fill={['#3b4258', '#40465c', '#383f55']} rim={['#575b6f', 0, 2.5]}
        d="M-150 6C-130 -4 -110 -2 -96 -10C-74 -20 -50 -8 -34 -14C-10 -22 20 -10 40 -14C70 -18 110 -4 150 5C110 12 70 9 30 13C-10 16 -50 10 -90 12C-120 13 -140 10 -150 6Z" />
    </Pin>

    <Canvas className="v2-rain-canvas">
      <Wash f={p.haze} d={ridge(FAR, false)} fill={['#464d65', '#4a5068', '#434a61']} o={.92} />
      <Wash f={p.brush} d={ridge(MID, false)} fill={['#2a3145', '#2d3449', '#272e41']} rim={['#454b62', .35, .5]} />
      <g filter={p.fine}>{WINDOWS.map(([x, y, o], i) =>
        <At key={i} x={`${x}%`} y={`${y}%`}><path d="M-1.6 -2.1L1.7 -1.9 1.6 2.1 -1.7 2Z" fill={i % 5 ? C.amber : '#efcf93'} opacity={o} /></At>)}</g>
      <Wash f={p.brush} d={ridge([[0, 75.4], [21, 74.6], [47, 75.8], [70, 74.9], [100, 75.6]])} fill={['#1d2333', '#202637', '#1b2131']} rim={['#30364a', 0, .5]} o={.94} />
      <g filter={p.haze}>
        {[[72.5, .07, C.rose], [78.8, .12, C.amber], [84.5, .07, C.rose], [88, .1, '#d9b07a'], [8.4, .08, C.teal], [55, .05, C.teal]].map(([x, o, c], i) =>
          <Wash key={i} fill={c} o={o} d={`M${x - .9} 76C${x - .2} 81 ${x - 1.3} 87 ${x - .4} 94L${x + 1.1} 94C${x + 1.5} 87 ${x + .5} 81 ${x + .9} 76Z`} />)}
      </g>
    </Canvas>

    {BLINKS.map(([x, y, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-rain-pin a v2-rain-blink" style={anim(d, d * (.3 + i * .21))}>
        <path d="M-1.6 -2.1L1.7 -1.9 1.6 2.1 -1.7 2Z" fill="#efcf93" filter={p.fine} />
      </Pin>
    ))}
    {BOKEH.map(([x, y, r, c, hi, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-rain-pin a v2-rain-bokeh" style={anim(d, d * ((i * .61) % 1), { '--lo': .5 })}>
        <Wash px f={p.glow} d={blob(r * 1.4, 40 + i)} fill={c} o={.3} />
        <Wash px f={p.fine} d={blob(r, 60 + i, 8, .12)} fill={[c, hi, c]} o={.42} rim={[hi, 1.2, -1]} />
      </Pin>
    ))}
    <Pin x="79%" y="70.5%" className="v2-rain-pin a v2-rain-sa" style={anim(13.7, 4)}>
      <Wash px f={p.glow} d={blob(30, 91, 8, .15, .4)} fill={C.rose} o={.45} />
      <Wash px f={p.fine} d={blob(19, 92, 8, .12, .34)} fill={['#d9968a', '#ebb7a8', '#d18c80']} o={.62} />
    </Pin>
    <Pin x="79%" y="70.5%" className="v2-rain-pin a v2-rain-sb" style={anim(13.7, 4)}>
      <Wash px f={p.glow} d={blob(22, 93, 8, .15, .45)} fill={C.rose} o={.25} />
      <g transform="translate(-7 0)"><Wash px f={p.fine} d={blob(11, 94, 7, .14, .5)} fill={['#c98a80', '#dba79a', '#c48479']} o={.45} /></g>
    </Pin>
    <div className="v2-rain-car a" style={{ top: '80.5%', ...anim(37.9, 12) }}>
      <svg className="v2-rain-pin">
        <Wash px f={p.glow} d={blob(46, 77, 7, .2, .3)} fill="#e9c58c" o={.45} />
        <Wash px f={p.fine} d={blob(7, 78, 6, .2, .7)} fill="#f6e2b4" o={.75} />
        <g transform="translate(-24 1)"><Wash px f={p.fine} d={blob(6, 79, 6, .2, .7)} fill="#f6e2b4" o={.65} /></g>
      </svg>
    </div>

    <Canvas className="v2-rain-canvas">
      <defs><linearGradient id={`${p.id}tr`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.glass} stopOpacity="0" /><stop offset="1" stopColor={C.glass} /></linearGradient></defs>
      <g filter={p.fine}>{BEADS.map(([x, y, r], i) => (
        <At key={i} x={`${x}%`} y={`${y}%`}>
          <ellipse rx={r} ry={r2(r * 1.12)} fill="#161d2c" opacity=".3" />
          <ellipse cy={r2(r * .42)} rx={r2(r * .6)} ry={r2(r * .36)} fill={C.glass} opacity=".42" />
          <circle cx={r2(-r * .35)} cy={r2(-r * .4)} r={r2(Math.max(.55, r * .28))} fill="#eef2f6" opacity=".75" />
        </At>
      ))}</g>
    </Canvas>
    <div className="v2-rain-full a v2-rain-breathe" style={anim(17.3, 5, { '--lo': .55 })}>
      <div className="v2-rain-wind">{SHEETS.map((s, i) => <Rainfall key={i} id={`${p.id}r${i}`} {...s} />)}</div>
    </div>
    {LANES.map(([x, d, r, L, t], i) => (
      <div key={i} className={`v2-rain-lane a t${t}`} style={{ left: `${x}%`, ...anim(d, d * ((i * .37) % 1)) }}>
        <svg className="v2-rain-pin"><Drop r={r} L={L} g={`${p.id}tr`} /></svg>
      </div>
    ))}
    <svg className="v2-rain-full a v2-rain-breathe" width="100%" height="100%" style={anim(23.3, 9, { '--lo': .5 })}>
      <Wash f={p.brush} d={ridge([[0, 84], [14, 86.5], [27, 83.5], [41, 87], [56, 85], [70, 88], [84, 84.5], [100, 86]])}
        fill={['#aab4c4', '#b3bccb', '#a3adbf']} o={.15} />
    </svg>

    {glass && <>
      <Canvas className="v2-rain-canvas">
        <Wash f={p.fine} fill={['#191e2c', '#1c2131', '#171c29']} rim={['#4f4a55', .16, .3]}
          d="M33.7 -2L35.8 -2L35.85 40L35.8 102L33.75 102L33.7 60ZM-2 29.5L50 29.4L102 29.55L102 32.1L48 32.2L-2 32.05Z" />
        <Wash f={p.brush} fill="#2a3042" o={.5} d="M34.1 -2L34.9 -2L35 102L34.2 102ZM-2 30.1L102 30.2L102 30.8L-2 30.7Z" />
      </Canvas>
      {[[52, 9.1, 2], [18, 6.7, 6], [71, 11.3, 1]].map(([x, d, dl], i) => DRIP.map((f, k) => (
        <Pin key={i + '-' + k} x={`${x}%`} y="32%" className={`v2-rain-pin a v2-rain-d${k}`} style={anim(d, dl)}>
          <g transform="scale(1.3)" opacity=".8">{f}</g>
        </Pin>
      )))}
    </>}
  </>
}
