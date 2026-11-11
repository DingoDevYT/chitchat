import { scatter } from '../../lib/themes'
import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'
import './sea.css'

// Under the sea: light comes in from the upper left in slow-swaying shafts; a rocky outcrop with a warm sea fan
// (the focal point) holds the left, kelp clusters sway at the edges, a small school of fish idles across, bubbles
// wobble up from two vents and marine snow sinks. Now and then a bigger fish passes, and far off a ray glides by.
// Palette: pale surface aqua, teal, deep blue-green, abyss, warm sand, terracotta, olive kelp.
const C = { light: '#cfe6dc', teal: '#4f8f93', deep: '#1d4656', sand: '#b39d7b', coral: '#c47d62', kelp: '#5e7f55', ink: '#1d2b33' }

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

// light shafts (top-left x, top width, bottom-left x, bottom width, bottom y, opacity, duration)
const RAYS = [[14, 5, 22, 14, 82, .2, 11.3], [24.5, 2.6, 34, 9, 70, .15, 7.9], [33, 5.5, 48, 14, 86, .17, 13.7], [47, 2, 58, 6, 62, .12, 9.1]]
// the underside of the surface, one seamless half (y in a 0–10 box)
const SURF = [[0, 5], [9, 6.4], [17, 4.8], [26, 6.8], [36, 5.2], [44, 6], [53, 4.4], [63, 6.6], [72, 5], [81, 6.2], [90, 4.6], [100, 5]]
// kelp: two hand-drawn fronds (base at 0, 0)
const KELP = {
  A: { stalk: 'M-2 0C-6 -40 4 -80 -2 -120C-6 -160 2 -190 -1 -220L1.5 -220C5 -190 -2 -160 2 -120C7 -80 -3 -40 3 0Z',
    leaves: 'M-1 -40C-14 -50 -22 -66 -20 -80C-12 -68 -6 -56 0 -46ZM1 -70C14 -80 20 -96 18 -112C10 -98 6 -86 1 -76ZM-1 -110C-12 -122 -18 -138 -14 -152C-8 -140 -4 -128 0 -116ZM1 -150C12 -160 16 -176 12 -188C8 -178 4 -168 1 -156ZM-1 -186C-8 -196 -10 -208 -6 -218C-3 -210 -1 -202 0 -192Z' },
  B: { stalk: 'M-2 0C-5 -30 3 -60 -1 -96C-4 -124 1 -142 0 -158L2 -158C4 -140 0 -122 2.5 -96C6 -60 -1 -30 2.5 0Z',
    leaves: 'M0 -28C10 -36 16 -50 14 -62C8 -52 4 -42 0 -34ZM-1 -58C-11 -66 -17 -80 -15 -92C-9 -82 -5 -72 -1 -64ZM1 -92C10 -100 13 -114 10 -124C6 -116 3 -106 1 -98ZM-1 -122C-8 -130 -10 -142 -7 -152C-4 -144 -2 -136 0 -128Z' },
}
// x %, y %, frond, scale, colours [base, tint], duration, sway: far ones paler and cooler, the near one dark
const KELPS = [
  [61, 87.5, 'B', .75, ['#4b766d', '#58837a'], 9.7, 1.6], [92, 88, 'B', .9, ['#4b766d', '#58837a'], 11.3, 1.8],
  [4, 92, 'A', 1, ['#5a7b52', '#6b8c5e'], 7.9, 2.4], [7.5, 93.5, 'B', 1.1, ['#5e7f55', '#718f62'], 6.7, 2.8],
  [11, 91, 'A', .78, ['#557650', '#66875c'], 8.9, 2], [86.5, 92.5, 'A', .95, ['#5a7b52', '#6b8c5e'], 7.3, 2.2],
  [96.5, 93.5, 'B', 1.05, ['#5e7f55', '#718f62'], 10.1, 2.6], [.5, 104, 'A', 1.75, ['#243c31', '#2c4739'], 12.7, 1.3],
]
// a painted fish facing right (nose at +14); the tail is drawn apart so it can flick between two frames
const Body = ({ c, belly }) => <>
  <path d="M-13 0C-8 -7.5 5 -8.5 14 -1.2C10.5 3.5 4 6.4 -2 6.2C-8 6 -11.5 3 -13 0Z" fill={c} />
  <path d="M-9 2.4C-3 5.6 6 5 11.5 1.2C7 4.4 1 5.9 -4 5.4Z" fill={belly} opacity=".75" />
  <path d="M-4 -5.6C-1 -9.6 4 -9.8 6 -7.4C2 -7.4 -1 -6.6 -4 -5.6Z" fill={c} opacity=".85" />
  <circle cx="8.6" cy="-1.6" r="1.05" fill={C.ink} />
</>
const TAIL = ['M-12 0L-20.5 -7.5C-18.6 -3 -18.8 1.5 -19.8 5.2Z', 'M-12 .5L-20 -4.6C-18.8 -1 -19 3.6 -20.6 7.8Z']
const SCHOOL = [[0, 0, 1], [22, -9, .85], [38, 6, .9], [14, 14, .75], [54, -4, .8], [-19, 10, .7], [31, 23, .65]]

// a group of fish in one lane: bodies in one layer, tails in two held frames per half of the group (so they never flick together)
function Fish({ p, top, cls, d, dl, fish, c, belly, flip, bob }) {
  const at = (x, y, s) => `translate(${x} ${y}) scale(${flip ? -s : s} ${s})`
  return (
    <div className={`v2-sea-lane a ${cls}`} style={{ top, ...anim(d, dl) }}>
      <div className="a v2-sea-bob" style={anim(bob, dl * .3)}>
        <svg className="v2-sea-pin"><g filter={p.fine}>{fish.map(([x, y, s], i) => <g key={i} transform={at(x, y, s)}><Body c={c} belly={belly} /></g>)}</g></svg>
        {[0, 1].map(g => [0, 1].map(k => (
          <svg key={g + '' + k} className={`v2-sea-pin a v2-sea-t${k ? 'b' : 'a'}`} style={anim(g ? .61 : .47, g * .2)}>
            <g filter={p.fine}>{fish.map(([x, y, s], i) => i % 2 === g && <path key={i} transform={at(x, y, s)} d={TAIL[k]} fill={c} />)}</g>
          </svg>
        )))}
      </div>
    </div>
  )
}

// caustic rings for one held frame: some on the sand, a few on the lit rock tops
const caustics = seed => scatter(18, seed).map((q, i) => i < 12
  ? [r2(q.x * 100), r2(88 + q.y * 10), r2(5 + q.r * 9), seed * 31 + i]
  : i < 15 ? [r2(2 + q.x * 22), r2(59 + q.y * 9), r2(4 + q.r * 6), seed * 31 + i] : [r2(82 + q.x * 18), r2(69 + q.y * 7), r2(4 + q.r * 6), seed * 31 + i])
const glints = seed => scatter(16, seed).map(q => [r2(q.x * 100), r2(1 + q.y * 5), r2(.5 + q.r * .9)])
// bubbles up a column: px offset from the column's centre line, % height in the tile, radius
const column = seed => scatter(9, seed).map((q, i) => [r2(35 + Math.sin(i * 1.9 + seed) * 7 + (q.x - .5) * 6), r2((i + q.y * .7) / 9 * 100), r2(2 + q.r * q.t * 5)])
const SNOW = [{ pts: scatter(26, 5), d: 47, r: [.6, 1.5], o: .35 }, { pts: scatter(12, 9), d: 31, r: [1.1, 2.3], o: .45 }]

export default function Sea() {
  const p = usePaint(9)
  return <>
    <Canvas p={p} className="v2-sea-canvas">
      <defs><linearGradient id={`${p.id}ray`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2f2e8" /><stop offset="1" stopColor="#e2f2e8" stopOpacity="0" /></linearGradient></defs>
      <Wash f={p.sky} d={band(-10, 22, 2.5, .4)} fill={['#5f9b9b', '#66a19f', '#5a9597']} o={.88} />
      <Wash f={p.sky} d={band(17, 48, 3, 1.7)} fill={['#3c7a84', '#407e87', '#38747f']} o={.82} />
      <Wash f={p.sky} d={band(44, 76, 2.5, 2.9)} fill={['#2a5f6d', '#2d6370', '#285b69']} o={.82} />
      <Wash f={p.sky} d={band(72, 106, 2.5, 4.2)} fill={['#1e4858', '#214b5b', '#1c4454']} o={.88} />
      <At x="20%" y="-6%"><Glaze r={150} fill="#d8ece2" o={.26} f={p.glow} /></At>
    </Canvas>

    <div className="v2-sea-lane a v2-sea-glide" style={{ top: '35%', ...anim(73.3, 9) }}>
      <div><svg className="v2-sea-pin">
        <Wash px f={p.fine} o={.42} fill={['#2a5d69', '#2e616d', '#285965']}
          d="M-6 0C-4 -6 4 -8 10 -6C24 -14 38 -22 52 -24C44 -12 34 -4 28 0C34 4 44 12 52 24C38 22 24 14 10 6C4 8 -4 6 -6 0ZM28 -.6L74 .4 28 1.6Z" />
      </svg></div>
    </div>

    <Canvas className="v2-sea-canvas">
      <Wash f={p.haze} o={.6} fill={['#336c79', '#37707c', '#306875']}
        d={ridge([[0, 80], [8, 78], [18, 79.5], [30, 77], [42, 79], [55, 74], [62, 70.5], [68, 69], [74, 71.5], [80, 67.5], [86, 66], [92, 69], [100, 68]])} />
    </Canvas>

    {RAYS.map(([x, w, bx, bw, by, o, d], i) => (
      <svg key={i} className="v2-sea-full a v2-sea-ray" width="100%" height="100%" style={anim(d, d * ((i * .43) % 1), { '--lo': .45, transformOrigin: `${x + w / 2}% 0%` })}>
        <Wash f={p.haze} o={o} fill={`url(#${p.id}ray)`}
          d={`M${x} -2L${x + w} -2C${x + w + (bx + bw - x - w) * .4} ${by * .4} ${bx + bw - 1} ${by * .8} ${bx + bw} ${by}L${bx} ${by}C${bx - 1} ${by * .7} ${x + (bx - x) * .3} ${by * .3} ${x} -2Z`} />
      </svg>
    ))}

    <div className="v2-sea-surf a" style={anim(41.9)}>
      {[0, 50].map(x => (
        <svg key={x} style={{ left: `${x}%` }}><g filter={p.fine}>
          <svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none" overflow="visible">
            <path d={ridge(SURF, true, -2)} fill={C.light} opacity=".42" />
            <path d={ridge(SURF.map(([a, b]) => [a, b - 2.2]), true, -2)} fill="#e6f2ea" opacity=".22" />
          </svg>
        </g></svg>
      ))}
    </div>
    {[0, 1, 2].map(k => (
      <svg key={k} className={`v2-sea-full a v2-sea-h${k}`} width="100%" height="100%" style={anim(2.4)}>
        <g filter={p.fine}>{glints(70 + k).map(([x, y, s], i) => (
          <At key={i} x={`${x}%`} y={`${y}%`}><path transform={`scale(${s * 1.4})`} d="M-6 0C-2 -1.3 3 -1.3 7 0C3 .9 -2 .9 -6 0Z" fill="#eef6ef" opacity=".7" /></At>
        ))}</g>
      </svg>
    ))}

    <Canvas className="v2-sea-canvas">
      <Wash f={p.brush} fill={['#244f5c', '#27535f', '#224b58']} rim={['#4f8a8e', .35, .7]}
        d="M-3 102L-3 64C1 61 4 58 8 57.2C11 56.6 14 58 16 60.5C18.5 63.5 20 66 23 69C26 72 29 76 32 80C35 84 38 88 41 94L42 102Z" />
      <Wash f={p.brush} fill={['#22495a', '#254d5d', '#204555']} rim={['#4a8389', -.35, .7]}
        d="M103 102L103 70C100 67 97 66 94 67.5C91 69 88.5 69 86 71.5C83 74.5 80 78 77 82C74 86 71 90 69 96L68 102Z" />
      <Wash f={p.brush} fill={['#a08b6c', '#a69071', '#9b876a']} rim={['#cbb893', 0, .7]}
        d={ridge([[0, 89], [12, 87.6], [25, 88.6], [38, 86], [52, 86.8], [66, 85.2], [80, 87], [92, 86.2], [100, 87]])} />
      <Wash f={p.brush} fill="#6f6758" o={.45} d={ridge([[0, 94.5], [30, 93.2], [60, 94.8], [100, 93.6]])} />
      <Wash f={p.haze} fill="#16394a" o={.3} d="M-3 102L-3 84C6 83 14 86 22 89C26 92 29 96 30 102Z" />
      {[[9, 57.6, 1.5, 0], [4.2, 60.4, .9, -14]].map(([x, y, s, rot], i) => (
        <At key={i} x={`${x}%`} y={`${y}%`}><g filter={p.fine} fill="none" strokeLinecap="round" transform={`rotate(${rot}) scale(${s})`}>
          <path d="M0 0C-1 -10 -6 -18 -12 -26M-3 -12C2 -20 4 -28 2 -36M-8 -20C-14 -24 -18 -30 -19 -36M1 -22C8 -26 12 -32 13 -40M-1 -30C-4 -36 -6 -42 -5 -48M6 -30C10 -34 15 -36 19 -35M-12 -26C-14 -32 -13 -38 -10 -42" stroke={i ? '#b06f5a' : C.coral} strokeWidth="2.2" />
          <path d="M-2 -12C2 -20 4 -28 2 -36M1 -22C8 -26 12 -32 13 -40M6 -30C10 -34 15 -36 19 -35" stroke="#e0a689" strokeWidth="1" opacity=".7" transform="translate(-.6 -.6)" />
        </g></At>
      ))}
      <g filter={p.fine}>{[[12.6, 58.4, 5, '#c99a66'], [13.8, 59.2, 3.4, '#d8ad78'], [6.6, 58.6, 3, '#b8835f'], [17.6, 62.4, 4, '#a9785c']].map(([x, y, r, c], i) =>
        <At key={i} x={`${x}%`} y={`${y}%`}><path d={blob(r, 120 + i, 6, .25, .7)} fill={c} opacity=".85" /><path d={blob(r * .5, 130 + i, 5, .2, .6)} transform={`translate(${-r * .25} ${-r * .3})`} fill="#ecc89a" opacity=".5" /></At>)}</g>
      <At x="22%" y="89%"><g filter={p.fine}>
        <path d="M-9 0C-8 -7 -4 -10 0 -10C4 -10 8 -7 9 0C5 1.6 -5 1.6 -9 0Z" fill="#c9ae95" />
        <path d="M0 -9.5V0M-4.5 -8L-2.5 0M4.5 -8L2.5 0M-7.5 -4.5L-5.5 .4M7.5 -4.5L5.5 .4" stroke="#9d8571" strokeWidth=".9" />
      </g></At>
      <At x="79%" y="76.5%"><Wash px f={p.fine} fill="#173a47" d="M-6 0C-5 -3 -2 -4 0 -4C3 -4 6 -2 7 0C3 1.5 -3 1.5 -6 0Z" /></At>
    </Canvas>
    {[0, 1, 2].map(k => (
      <svg key={k} className={`v2-sea-full a v2-sea-h${k}`} width="100%" height="100%" style={anim(3.3, 1.1)}>
        <g filter={p.fine} fill="none" stroke="#efe2bf" strokeWidth="1.1">{caustics(80 + k).map(([x, y, r, s], i) => (
          <At key={i} x={`${x}%`} y={`${y}%`}><path d={blob(r, s, 6, .3, .42)} opacity={y > 80 ? .22 : .16} /></At>
        ))}</g>
      </svg>
    ))}

    <Pin x="15%" y="61%" className="v2-sea-pin a v2-sea-sway" style={anim(5.3, 2, { '--r': '4deg' })}>
      <g filter={p.fine} fill="none" strokeLinecap="round">
        <path d="M-4 0C-6 -6 -9 -9 -11 -14M-2 0C-2 -7 -4 -11 -4 -16M0 0C1 -7 1 -12 3 -17M2 0C4 -6 6 -10 9 -14M3 0C6 -4 9 -7 12 -9" stroke="#d6a07e" strokeWidth="2" />
        <path d="M-6 1C-3 -2 3 -2 6 1Z" fill="#b8735b" stroke="none" />
      </g>
    </Pin>
    {KELPS.map(([x, y, k, s, [c, t], d, r], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-sea-pin a v2-sea-sway" style={anim(d, d * ((i * .53) % 1), { '--r': `${r}deg` })}>
        <g transform={`scale(${i % 2 ? -s : s} ${s})`}>
          <Wash px f={p.fine} d={KELP[k].stalk} fill={[c, t, c]} />
          <Wash px f={p.fine} d={KELP[k].leaves} fill={[c, t, c]} o={.9} />
        </g>
      </Pin>
    ))}

    <Fish p={p} top="63%" cls="v2-sea-swim" d={37.3} dl={11} fish={[[0, 0, 1.2]]} c="#86a99c" belly="#c5d8cc" bob={3.7} />
    <Fish p={p} top="44%" cls="v2-sea-swim" d={61.7} dl={24} fish={SCHOOL} c="#d29f6c" belly="#ecd3a8" bob={4.3} />
    <Fish p={p} top="27%" cls="v2-sea-back" d={53.9} dl={40} fish={[[0, 0, 2.1]]} c={C.coral} belly="#e8b79c" flip bob={5.9} />

    {[[22, 88, 7.3, 15.7], [79, 76, 9.1, 19.3]].map(([x, y, w, d], i) => (
      <div key={i} className="v2-sea-col" style={{ left: `${x}%`, height: `${y}%` }}>
        <div className="v2-sea-wob a" style={anim(w, i * 2)}>
          <div className="v2-sea-plane a v2-sea-up" style={anim(d, i * 5)}>
            <svg width="100%" height="100%">{[0, 1].flatMap(t => column(90 + i).map(([bx, by, r], j) => (
              <svg key={t + '-' + j} x={bx} y={`${r2((by / 100 + t) * 50)}%`}>
                <circle r={r} fill={C.light} opacity=".22" />
                <path d={`M${r2(-r * .8)} ${r2(-r * .1)}A${r * .82} ${r * .82} 0 0 1 ${r2(r * .3)} ${r2(-r * .78)}`} fill="none" stroke="#eef6f0" strokeWidth="1.1" opacity=".85" />
                <circle cx={r2(r * .35)} cy={r2(r * .4)} r={r2(r * .22)} fill="#eef6f0" opacity=".35" />
              </svg>
            )))}</svg>
          </div>
        </div>
      </div>
    ))}
    {SNOW.map(({ pts, d, r, o }, i) => (
      <div key={i} className="v2-sea-plane a v2-sea-down" style={anim(d, i * 13)}>
        <svg width="100%" height="100%">{[0, 1].flatMap(t => pts.map((q, j) =>
          <circle key={t + '-' + j} cx={`${r2(q.x * 100)}%`} cy={`${r2((q.y + t) * 50)}%`} r={r2(r[0] + q.r * (r[1] - r[0]))} fill="#d7ebe2" opacity={r2(o * (.5 + q.t))} />))}</svg>
      </div>
    ))}
  </>
}
