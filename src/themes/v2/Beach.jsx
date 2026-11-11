import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'
import { scatter } from '../../lib/themes'
import './beach.css'

// Beach day, gouache: a hazy late-morning sky with painted cumulus drifting, a far headland and a little sail on the
// horizon, a sea of held-frame wave strokes with glitter under the sun, the shore wash running up the sand, marram
// grass nodding on a dune, gulls now and then, and a crab that peeks out once in a long while.

// palette: cerulean sky, greyed teal sea, warm cream light, ochre sand, olive grass, one clay accent
const C = {
  sky: '#8cb8cf', skyHi: '#b6d4dc', haze: '#efe6cf', far: '#a6babd', deep: '#4e8395', sea: '#679ca6', shallow: '#9cc6b9',
  foam: '#f4efe0', sand: '#e0c796', sandLo: '#c8ad83', grass: '#a19c63', grassLo: '#737d59', clay: '#b9765c', sun: '#f7ecc8',
}

// x %, local y px, half-length px: hand-placed wave strokes per row; frame B nudges each stroke on (limited animation)
const ROWS = [
  { y: 50.6, h: 1.1, c: '#a2c3c5', o: .55, d: 1.7, dr: 19.3, x: 9, s: [[4, 14, 5], [11, 17, 4], [19, 13, 7], [27, 16, 3], [36, 15, 6], [44, 17, 4], [53, 14, 5], [61, 16, 4], [70, 13, 6], [83, 16, 5], [91, 14, 4], [97, 17, 3]] },
  { y: 54.4, h: 1.6, c: '#b5d4d1', o: .6, d: 2.3, dr: 13.7, x: 12, s: [[2, 12, 9], [10, 18, 6], [17, 14, 12], [29, 16, 7], [38, 11, 10], [47, 18, 8], [58, 13, 11], [66, 17, 6], [79, 12, 9], [88, 16, 12], [96, 13, 7]] },
  { y: 60.2, h: 2.3, c: '#cfe3dc', o: .6, d: 1.9, dr: 23.9, x: 16, s: [[5, 15, 16], [16, 11, 11], [24, 18, 20], [37, 13, 13], [49, 16, 18], [60, 12, 10], [71, 17, 22], [85, 13, 14], [95, 16, 17]] },
  { y: 67.8, h: 3.4, c: C.foam, o: .75, d: 2.9, dr: 17.1, x: 10, s: [[1, 14, 34], [14, 17, 20], [26, 13, 42], [41, 16, 26], [54, 12, 38], [69, 16, 30], [82, 13, 44], [97, 15, 24]] },
]
const stroke = (w, h) => `M${-w} 0C${-w * .5} ${-h} ${w * .4} ${-h * 1.15} ${w} ${h * .25}C${w * .35} ${-h * .25} ${-w * .4} ${-h * .1} ${-w} 0Z`

// glitter under the sun: three held frames of dashes packed into a cone that widens toward the shore
const GLINTS = [21, 34, 55].map(seed => scatter(13, seed).map(q => {
  const d = q.y ** 1.3
  return [76 + (q.x - .5) * (2.5 + d * 24) * (.35 + q.r * .65), 49.7 + d * 17, 1.5 + d * 6 * (.5 + q.t)]
}))
// x %, y %, size px, duration s: a few brighter sparkles that catch now and then
const SPARKS = [[75.4, 51, 3.2, 5.3], [78.6, 54.5, 4, 7.9], [73, 58.8, 4.6, 6.1], [80.8, 62.5, 5.2, 9.7], [76.2, 66, 5.8, 8.3], [70.4, 64.2, 4.2, 11.3]]
const spark = s => `M0 ${-s}Q${s * .14} ${-s * .14} ${s} 0Q${s * .14} ${s * .14} 0 ${s}Q${-s * .14} ${s * .14} ${-s} 0Q${-s * .14} ${-s * .14} 0 ${-s}Z`

// marram tufts: blades [x, height, lean] drawn from the base at (0, 0)
const TUFTS = [
  [[-6, 22, -9], [-3, 30, -5], [0, 36, 2], [2, 27, 8], [5, 20, 12], [-1, 18, -12], [4, 32, 4]],
  [[-4, 18, -7], [-1, 26, -2], [2, 22, 6], [4, 15, 10], [0, 30, 3]],
  [[-5, 26, -11], [-2, 34, -4], [1, 40, 1], [3, 31, 7], [6, 22, 13], [-3, 20, -14], [2, 28, 10], [0, 24, -6]],
]
const blade = ([x, h, l]) => `M${x - 1.5} 0C${x - 1} ${-h * .5} ${x + l * .5} ${-h * .85} ${x + l} ${-h}C${x + l * .4} ${-h * .8} ${x + 1.1} ${-h * .45} ${x + 1.5} 0Z`
// x %, y % (stadium space), tufts [kind, dx px, scale], sway deg, duration s
const GRASS = [
  [68.6, 73.6, [[1, 0, .8]], 3, 6.7],
  [74.6, 69.8, [[0, -8, .9], [1, 9, .75]], 2.6, 8.3],
  [80.4, 67.1, [[2, 0, 1.15], [1, 14, .8]], 2.1, 7.1],
  [86.2, 64.3, [[0, -6, 1.1], [2, 10, 1.25]], 1.8, 9.7],
  [92.4, 63.6, [[1, -10, .95], [0, 6, 1.2]], 2.4, 5.9],
  [97.6, 64.9, [[2, 0, 1.2]], 2, 10.9],
]
const DUNE = [[44, 104], [53, 93], [60, 85.5], [66, 78.5], [70.5, 73], [74, 69.6], [78, 67.8], [82, 65.6], [86, 63.8], [91, 63], [96, 64.2], [100, 65.4]]
// foam lip of the shore wash, two held frames: [x, y, thickness] in the surf box (0–100 × 0–10), sloping up toward the dune
const LIPS = [
  [[-2, 9.2, 1.1], [6, 8.6, .7], [12, 8.9, 1.2], [19, 8, .8], [26, 8.2, 1.3], [33, 7.5, .6], [40, 7.6, 1.1], [47, 6.8, .9], [54, 6.6, 1.4],
    [61, 5.9, .7], [68, 5.6, 1.2], [75, 5.1, .8], [82, 5, 1.3], [89, 4.8, .7], [96, 5, 1.1], [102, 4.8, .9]],
  [[-2, 9, .8], [5, 8.9, 1.3], [11, 8.4, .7], [18, 8.4, 1.2], [25, 7.8, .8], [32, 7.8, 1.3], [39, 7.1, .7], [46, 7.1, 1.2], [53, 6.3, .8],
    [60, 6.2, 1.3], [67, 5.4, .7], [74, 5.4, 1.2], [81, 4.8, .8], [88, 5, 1.2], [95, 4.7, .8], [102, 5, 1.2]],
]
const FOAM = [[[10, 7.4, 5], [30, 6.2, 6], [52, 5, 5], [74, 3.9, 6], [90, 3.6, 4]], [[16, 7, 6], [38, 5.8, 5], [60, 4.6, 6], [80, 3.7, 5], [96, 3.5, 4]]]
const r2 = n => Math.round(n * 100) / 100
// a soft line through hand-placed points (midpoint quadratics), and a ragged band along [x, y, thickness] points
const smooth = pts => {
  const m = (a, b) => `${r2((a[0] + b[0]) / 2)} ${r2((a[1] + b[1]) / 2)}`
  let d = `${pts[0][0]} ${pts[0][1]}L${m(pts[0], pts[1])}`
  for (let i = 1; i < pts.length - 1; i++) d += `Q${pts[i][0]} ${pts[i][1]} ${m(pts[i], pts[i + 1])}`
  return d + `L${pts.at(-1)[0]} ${pts.at(-1)[1]}`
}
const lip = pts => `M${smooth(pts)}L${smooth(pts.map(([x, y, t]) => [x, r2(y + t)]).reverse())}Z`

const CLOUDS = {
  big: ['M-140 20C-138 10 -126 4 -112 6C-110 -8 -94 -16 -80 -12C-74 -30 -50 -38 -32 -28C-22 -48 8 -54 26 -40C36 -52 62 -50 72 -34C86 -40 104 -32 106 -18C120 -20 134 -10 134 2C142 6 146 14 140 20C100 26 40 27 -20 26S-110 25 -140 20Z',
    'M-132 18C-110 10 -70 12 -40 8S40 6 80 8S130 10 140 18C100 25 40 27 -20 26S-110 25 -132 18Z'],
  mid: ['M-90 12C-88 2 -76 -2 -66 0C-62 -14 -44 -20 -30 -12C-22 -28 4 -32 16 -18C26 -26 46 -22 50 -8C64 -10 78 -2 80 8C84 12 82 14 78 15C40 18 -10 18 -50 17S-86 15 -90 12Z',
    'M-86 12C-60 6 -30 8 0 6S60 6 80 12C40 18 -10 18 -50 17S-84 15 -86 12Z'],
  small: ['M-54 8C-52 0 -44 -4 -36 -2C-32 -12 -18 -16 -8 -9C0 -20 20 -18 24 -6C34 -8 44 -2 46 6C30 10 0 11 -24 10S-50 10 -54 8Z',
    'M-52 8C-30 4 0 4 20 4S44 4 46 6C30 10 0 11 -24 10S-50 10 -52 8Z'],
}

export default function Beach({ variant = 'room' }) {
  const p = usePaint(6)
  const room = variant === 'room'
  // authored with the horizon at 49%; rooms push it down to 61% so the middle band stays open sky
  const H = room ? 61 : 49
  const Y = y => +(y <= 49 ? y * H / 49 : H + (y - 49) * (100 - H) / 51).toFixed(2)
  const pc = y => `${Y(y)}%`
  return (
    <div className={`v2-beach-root v2-beach-${variant}`}>
      <Canvas p={p}>
        <defs>
          <linearGradient id={p.id + 'bg'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.sky} /><stop offset={H / 100 * .7} stopColor={C.skyHi} /><stop offset={H / 100} stopColor={C.haze} />
            <stop offset={H / 100} stopColor={C.deep} /><stop offset="1" stopColor={C.shallow} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${p.id}bg)`} />
        <Wash f={p.sky} d={band(-8, Y(17), 2.5, 0)} fill={['#86b3cc', '#8fb9cf', '#80adc6']} o={.6} />
        <Wash f={p.sky} d={band(Y(15), Y(36), 3, 1.3)} fill={[C.skyHi, '#bdd3d6', '#b2cbd1']} o={.45} />
        <Wash f={p.sky} d={band(Y(37), Y(50), 1.5, 2.4)} fill={[C.haze, '#f1e9d4', '#e6e2d2']} o={.45} />
        {/* far headland, two lobes, lighter and cooler than anything near */}
        <Wash f={p.haze} fill={[C.far, '#adc0c2', '#a0b4b8']} o={.9}
          d={ridge([[0, Y(44.4)], [4, Y(43.3)], [8.5, Y(42.8)], [13, Y(43.9)], [18, Y(45.5)], [23, Y(47.4)], [29, Y(48.7)], [35, Y(49.3)]])} />
        <Wash f={p.haze} fill={['#94aaae', '#9bb0b3', '#8fa5aa']} o={.85}
          d={ridge([[0, Y(46.6)], [5, Y(45.7)], [10, Y(46.6)], [15, Y(48.3)], [20, Y(49.4)]])} />
        {/* sea: crisp-ish horizon, then broad bands lightening toward the shallows */}
        <Wash f={p.fine} fill={[C.deep, '#558a9b', '#4a7f90']} d={ridge([[0, Y(49)], [50, Y(49.05)], [100, Y(48.95)]], false)} />
        <Wash f={p.brush} d={band(Y(51.5), Y(60), 1, .7)} fill={[C.sea, '#6fa3ab', '#6297a2']} o={.55} />
        <Wash f={p.brush} d={band(Y(57), Y(68), 1.2, 2)} fill={['#7fb1b0', '#86b6b3', '#79abab']} o={.55} />
        <Wash f={p.haze} d={band(Y(64), Y(77), 1, 3.1)} fill={[C.shallow, '#a3cbbd', '#95c0b4']} o={.75} />
        {/* sunlight on the water: stacked horizontal glazes, narrow at the horizon, wider and looser near */}
        {[[75.5, 50.2, 1.6, .5, .4], [76.4, 52.4, 2.6, .6, .34], [75, 55.2, 4, .8, .3], [77.2, 58.4, 5.4, .9, .26], [75.4, 62, 7.5, 1.1, .22], [77.6, 66, 9, 1.2, .16]].map(([x, y, w, h, o], i) =>
          <Wash key={i} f={p.haze} fill={C.sun} o={o} d={`M${x - w} ${Y(y)}C${x - w * .4} ${Y(y - h)} ${x + w * .5} ${Y(y - h * .9)} ${x + w} ${Y(y + .1)}C${x + w * .3} ${Y(y + h * .8)} ${x - w * .5} ${Y(y + h * .7)} ${x - w} ${Y(y)}Z`} />)}
        <Wash f={p.haze} d={band(Y(47.6), Y(50.4), .4, 1)} fill={C.haze} o={.35} />
        {/* sand: dry-brushed, a darker wet margin, sun-bleached streaks, a few clustered pebbles and shells */}
        <Wash f={p.brush} fill={[C.sand, '#e6d0a2', '#dac08f']} d={ridge([[0, Y(78.4)], [18, Y(77.6)], [36, Y(77)], [52, Y(76.1)], [66, Y(75.3)], [80, Y(74.9)], [100, Y(75)]])} />
        <Wash f={p.haze} fill={[C.sandLo, '#ccb28a', '#c2a87e']} o={.6}
          d={`M-3 ${Y(78.6)}C20 ${Y(77.6)} 44 ${Y(76.6)} 66 ${Y(75.5)}S96 ${Y(75)} 103 ${Y(75.2)}V${Y(78.4)}C80 ${Y(78.6)} 50 ${Y(80)} 30 ${Y(81.4)}S2 ${Y(82.6)} -3 ${Y(82.8)}Z`} />
        <Wash f={p.brush} d={`M4 ${Y(88)}C14 ${Y(86.6)} 30 ${Y(86.9)} 42 ${Y(87.8)}C30 ${Y(88.6)} 15 ${Y(88.8)} 4 ${Y(88)}Z`} fill="#efe0be" o={.55} />
        <Wash f={p.brush} d={`M50 ${Y(94)}C62 ${Y(92.8)} 78 ${Y(93.2)} 92 ${Y(94.1)}C78 ${Y(95)} 62 ${Y(95)} 50 ${Y(94)}Z`} fill="#efe0be" o={.45} />
        <g filter={p.fine}>
          {[[12, 84, 21], [44, 91, 33], [57, 82.5, 47], [33, 97, 58]].flatMap(([cx, cy, seed]) => scatter(7, seed).map((q, i) =>
            <ellipse key={seed + '-' + i} cx={`${cx + (q.x - .5) * 4 * q.r}%`} cy={`${Y(cy + (q.y - .5) * 2.4 * q.r)}%`} rx={1 + q.t * 2} ry={.8 + q.t * 1.2}
              fill={i % 3 ? '#bba27a' : '#f2e6cc'} opacity={.75} />))}
          <ellipse cx="24%" cy={pc(89.6)} rx="11" ry="3.4" fill="#a98f68" opacity=".7" />
          <At x="61%" y={pc(87.5)}><path d="M-6 2C-6 -4 6 -4 6 2C4 3 -4 3 -6 2ZM-3 1L-1 -3M0 1V-3.5M3 1L1 -3" fill="#e9c9b4" stroke="#c99a84" strokeWidth=".8" transform="rotate(-14)" /></At>
          <At x="38%" y={pc(80.2)}><path d="M-4 1C-4 -3 4 -3 4 1C2 2 -2 2 -4 1Z" fill="#efd8c6" transform="rotate(9)" /></At>
        </g>
      </Canvas>

      {/* the sun: a painted disc with a slow-breathing halo, a little off the top right */}
      <Pin x="74%" y="calc(13% + var(--sky))" className="a v2-beach-breathe" style={anim(13.7, 4, { '--lo': .55 })}>
        <Glaze r={40} fill="#fff4d2" o={.72} f={p.glow} />
      </Pin>
      <Pin x="74%" y="calc(13% + var(--sky))">
        <Wash px f={p.fine} fill={['#fdf6df', '#fff9e8', '#f6ead0']}
          d="M-22 1C-23 -12 -12 -22 0 -22C13 -23 22 -12 22 0C23 12 12 22 -1 22C-13 22 -22 13 -22 1Z" />
      </Pin>

      {/* clouds: lit cream tops, cool bellies, each on its own slow drift */}
      <Cloud p={p} k="big" x="57%" y="calc(9% + var(--sky))" dr={[71, 18, '44px']} />
      <Cloud p={p} k="small" x="89%" y="calc(23% + var(--sky))" dr={[53, 40, '-26px']} s={.9} />
      <Cloud p={p} k="mid" x="17%" y="calc(15% + var(--sky))" dr={[89, 7, '36px']} />
      <Pin x="40%" y={pc(42)} className="a v2-beach-drift" style={anim(117, 60, { '--x': '-50px' })}>
        <Wash px f={p.haze} o={.5} fill={['#eef0ea', '#f3f1e8', '#e5e8e5']}
          d="M-180 4C-140 -2 -80 -6 -20 -5S100 -4 150 -1S186 4 180 6C130 9 60 9 -10 8S-150 8 -180 4Z" />
      </Pin>

      {/* a far sail, barely moving */}
      <Pin x="33%" y={pc(49.1)} className="a v2-beach-drift" style={anim(97, 30, { '--x': '38px' })}>
        <g filter={p.fine}>
          <path d="M-9 0H9L6 3H-6Z" fill="#5f6d73" />
          <path d="M0 -1V-17C4 -13 7 -7 8 -1Z" fill="#f3ece0" />
          <path d="M-1 -2V-12C-4 -9 -6 -5 -7 -2Z" fill="#e2d6c4" />
        </g>
      </Pin>

      {ROWS.map((r, i) => (
        <div key={i} className="v2-beach-row a v2-beach-drift" style={{ top: pc(r.y), ...anim(r.dr, i * 5.3, { '--x': `${r.x}px` }) }}>
          {[0, 1].map(f => (
            <svg key={f} className="a v2-beach-f2" style={anim(r.d, f * r.d / 2 + i * .37)} opacity={r.o}>
              {r.s.map(([x, y, w], j) => (
                <At key={j} x={`${x + (f ? .9 + (j % 3) * .3 : 0)}%`} y={y + (f ? (j % 2 ? 1 : -1) : 0)}>
                  <path d={stroke(w * (f ? 1 - (j % 3) * .12 : 1), r.h)} fill={r.c} />
                </At>
              ))}
            </svg>
          ))}
        </div>
      ))}

      {GLINTS.map((g, i) => (
        <svg key={i} className="v2-beach-glint pt-canvas a v2-beach-f3" style={anim(2.1, i * .7)} width="100%" height="100%">
          {g.map(([x, y, w], j) => <At key={j} x={`${x.toFixed(2)}%`} y={pc(y)}><path d={stroke(w, w * .22)} fill="#fbf4dc" opacity=".85" /></At>)}
        </svg>
      ))}
      {SPARKS.map(([x, y, s, d], i) => (
        <Pin key={i} x={`${x}%`} y={pc(y)} className="v2-beach-glint a v2-beach-tw" style={anim(d, d * i * .41)}>
          <path d={spark(s)} fill="#fffaea" /><circle r={s * .2} fill="#fff" />
        </Pin>
      ))}

      {/* the shore wash: a thin sheet with a lacy foam lip runs up the sand and slides back; the lace is re-drawn in two held frames */}
      <div className="v2-beach-sheen a" style={{ top: pc(75), height: `${Y(82) - Y(75)}%`, ...anim(9.7, 3) }}>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none">
          <path d="M-2 5C20 4.2 44 3 66 1.2S96 0 102 .2V2.2C80 2.6 50 4.8 30 6.4S2 7.6 -2 7.8Z" fill="#eef0e4" opacity=".5" />
        </svg>
      </div>
      <div className="v2-beach-surf a" style={{ top: pc(71.5), height: `${Y(79) - Y(71.5)}%`, ...anim(9.7, 1) }}>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none">
          <g filter={p.haze}><path d={`M-2 0H102V4.6L${smooth(LIPS[0].map(([x, y]) => [x, y + .3]).reverse())}Z`} fill={C.shallow} opacity=".7" /></g>
        </svg>
        {LIPS.map((pts, f) => (
          <svg key={f} className="a v2-beach-f2" style={anim(1.9, f * .95)} viewBox="0 0 100 10" preserveAspectRatio="none">
            <g filter={p.fine} fill={C.foam}>
              <path d={lip(pts)} opacity=".92" />
              {FOAM[f].map(([x, y, w], j) => <path key={j} opacity=".7"
                d={`M${x - w} ${y}C${x - w / 3} ${y - .35} ${x + w / 3} ${y - .3} ${x + w} ${y + .05}C${x + w / 3} ${y + .2} ${x - w / 3} ${y + .25} ${x - w} ${y}Z`} />)}
            </g>
          </svg>
        ))}
      </div>

      {/* the dune in front: lit along its crest, cooler at its foot, a few weathered fence posts */}
      <Canvas>
        <Wash f={p.brush} fill={['#d9c091', '#e0c899', '#d1b887']} rim={['#ecd9ac', .4, .5]} d={ridge(DUNE.map(([x, y]) => [x, Y(y)]))} />
        <Wash f={p.brush} fill="#f0ddb0" o={.7} d={lip(DUNE.slice(3).map(([x, y], i) => [x, Y(y + .3), 1.2 + (i % 3) * .5]))} />
        <Wash f={p.haze} fill="#b9a587" o={.4} d={lip([[58, Y(92), 3], [63, Y(85), 4], [68, Y(81), 5], [76, Y(79), 6], [88, Y(80), 5], [103, Y(78), 6]])} />
        <g filter={p.fine} fill="#8e7c64">
          {[[71.5, 71.6, -7, 15], [75.2, 69.1, -4, 17], [79, 67.4, -8, 14], [82.8, 65.4, -3, 16]].map(([x, y, r, h], i) => (
            <At key={i} x={`${x}%`} y={pc(y)}><path d={`M-1.6 0L-1 ${-h}L1.2 ${-h - .8}L1.6 0Z`} transform={`rotate(${r})`} /></At>
          ))}
        </g>
      </Canvas>
      {GRASS.map(([x, y, tufts, r, d], i) => (
        <Pin key={i} x={`${x}%`} y={pc(y)} className="a v2-beach-sway" style={anim(d, d * i * .53, { '--r': `${r}deg` })}>
          <g filter={p.fine}>{tufts.map(([k, dx, s], t) => (
            <g key={t} transform={`translate(${dx} 0) scale(${s * 1.3})`}>
              <g fill={C.grassLo}>{TUFTS[k].map((b, j) => <path key={j} d={blade([b[0] - 2, b[1] * .8, b[2] - 3])} />)}</g>
              <g fill={C.grass}>{TUFTS[k].map((b, j) => <path key={j} d={blade(b)} />)}</g>
              <g fill="#cdbd82">{TUFTS[k].filter((_, j) => j % 3 === 1).map((b, j) => <path key={j} d={blade([b[0] + .5, b[1] * .95, b[2]])} opacity=".8" />)}</g>
            </g>))}
          </g>
        </Pin>
      ))}

      {/* the crab: tucked in its hole, peeks out once every couple of minutes */}
      <div className="v2-beach-hole" style={{ left: '24%', top: pc(89.6) }}>
        <Pin className="a v2-beach-peek" style={anim(83, 20)}>
          <g filter={p.fine}>
            <path d="M-6 -2L-11 0M-6 -4L-12 -3M6 -2L11 0M6 -4L12 -3M-2 -8V-11M2 -8V-11" stroke="#8f5543" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M-8 -1C-8 -6 -4 -8 0 -8S8 -6 8 -1C6 1 -6 1 -8 -1Z" fill={C.clay} />
            <path d="M-7 -6C-11 -8 -12 -12 -9 -13C-8 -11 -7 -11 -6 -12C-5 -10 -5 -8 -7 -6ZM7 -6C11 -8 12 -12 9 -13C8 -11 7 -11 6 -12C5 -10 5 -8 7 -6Z" fill="#c98468" />
            <circle cx="-2" cy="-11.5" r="1.1" fill="#3b2a24" /><circle cx="2" cy="-11.5" r="1.1" fill="#3b2a24" />
          </g>
        </Pin>
      </div>

      <Gull p={p} y={room ? 'calc(6% + var(--sky))' : 'calc(19% + var(--sky))'} d={61} dl={9} s={1} />
      <Gull p={p} y={room ? 'calc(10% + var(--sky))' : 'calc(25% + var(--sky))'} d={79} dl={47} s={.7} />
    </div>
  )
}

function Cloud({ p, k, x, y, dr: [d, dl, dx], s = 1 }) {
  const [body, belly] = CLOUDS[k]
  return (
    <Pin x={x} y={y} className="a v2-beach-drift" style={anim(d, dl, { '--x': dx })}>
      <g transform={`scale(${s})`}>
        <Wash px f={p.haze} fill={['#eef0ea', '#f6f3e9', '#e6eae6']} rim={['#fbf6e7', -2, 3]} d={body} />
        <Wash px f={p.haze} fill="#b3c5cb" o={.5} d={belly} />
      </g>
    </Pin>
  )
}

function Gull({ p, y, d, dl, s }) {
  const wings = ['M-13 -1C-10 -6 -5 -7 -1 -1C0 0 1 0 1 -1C5 -7 10 -6 14 -2C10 -4 6 -3 2 2C1 3 -1 3 -2 2C-6 -3 -10 -4 -13 -1Z',
    'M-13 3C-9 0 -5 -1 -1 1C0 2 1 2 2 1C6 -1 10 0 14 3C10 2 6 2 2 4C1 5 -1 5 -2 4C-6 2 -10 2 -13 3Z']
  return (
    <div className="v2-beach-lane a v2-beach-cross" style={{ top: y, ...anim(d, dl) }}>
      <div className="a v2-beach-bob" style={anim(3.7, dl, { '--y': '5px', '--r': '3deg' })}>
        {wings.map((w, i) => (
          <Pin key={i} className={`a v2-beach-flap${i ? ' b' : ''}`} style={anim(2.3, dl)}>
            <path d={w} fill="#5f666b" transform={`scale(${s})`} filter={p.fine} />
          </Pin>
        ))}
      </div>
    </div>
  )
}
