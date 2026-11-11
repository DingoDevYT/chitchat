import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'
import { scatter } from '../../lib/themes'
import './sakura.css'

// Sakura breeze, gouache: a blossoming branch reaching in from the top right, nodding twig by twig, letting petals go
// on the breeze; below it a far snow-capped mountain off to the left with mist drifting across its waist, a shore of
// blossom trees and a still lake that glints in held frames. Once in a long while a small bird crosses.

// palette: warm rose-cream paper, lilac distance, plum-umber bark, three blossom pinks, a sage hint of new leaves
const C = {
  sky: '#e9d6d3', skyHi: '#f1e2da', haze: '#e2d8e1', far: '#b7b1c9', mid: '#a397b1', lake: '#c5cdd9', bark: '#5a3f45',
  barkHi: '#77585a', pink: ['#f0c0cc', '#e9afbf', '#f5d0d8'], rose: '#c46a84', leaf: '#9cab8c', bank: '#b4b29c',
}
const r2 = n => Math.round(n * 100) / 100

// a soft line through hand-placed points (midpoint quadratics)
const smooth = pts => {
  const m = (a, b) => `${r2((a[0] + b[0]) / 2)} ${r2((a[1] + b[1]) / 2)}`
  let d = `${pts[0][0]} ${pts[0][1]}L${m(pts[0], pts[1])}`
  for (let i = 1; i < pts.length - 1; i++) d += `Q${pts[i][0]} ${pts[i][1]} ${m(pts[i], pts[i + 1])}`
  return d + `L${pts.at(-1)[0]} ${pts.at(-1)[1]}`
}
// a tapering limb along hand-placed centreline points [x, y, width]
const limb = (pts, k0 = 1.45) => {
  const side = k => pts.map(([x, y, w], i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [r2(x - dy / l * w * k0 / 2 * k), r2(y + dx / l * w * k0 / 2 * k)]
  })
  return `M${smooth(side(1))}L${smooth(side(-1).reverse())}Z`
}
// one notched sakura petal (base at the centre), turned and sized; a flower is five of them, a side view three
const PETAL = [[0, 0], [-3, -1], [-5, -5], [-3.8, -8.4], [-3, -10.2], [-1.4, -10.6], [-.4, -9.4], [0, -8.6], [.6, -9.6], [1.8, -10.6], [3.4, -10], [4, -8.2], [5, -5], [3, -1], [0, 0]]
const petal = (a, s, k = .8) => {
  const c = Math.cos(a * Math.PI / 180) * s, n = Math.sin(a * Math.PI / 180) * s
  const f = PETAL.map(([x, y]) => `${r2(x * k * c - y * n)} ${r2(x * k * n + y * c)}`)
  return `M${f[0]}C${f[1]} ${f[2]} ${f[3]}C${f[4]} ${f[5]} ${f[6]}L${f[7]}L${f[8]}C${f[9]} ${f[10]} ${f[11]}C${f[12]} ${f[13]} ${f[14]}Z`
}
const OPEN = [[0, 1], [71, .94], [145, 1.04], [217, .97], [289, 1.02]]
const SIDE = [[-48, .82], [0, 1], [46, .86]]
const bloom = (a, side) => (side ? SIDE : OPEN).map(([r, s]) => petal(a + r, s)).join('')

// the branch, in its own box (x -440…40, y -30…250; the top-right corner sits on the scene's corner)
const LIMB = [[34, -8, 19], [-10, 6, 16], [-40, 18, 15], [-70, 22, 13], [-95, 32, 12.5], [-124, 46, 11], [-150, 58, 10], [-178, 64, 9], [-205, 74, 8],
  [-232, 90, 7], [-260, 100, 6.2], [-288, 106, 5.4], [-312, 114, 4.6], [-350, 134, 3.6], [-372, 142, 2.6], [-394, 148, 1.6]]
const TWIG_A = [[-95, 30, 6], [-108, 16, 5], [-122, 8, 4], [-150, -4, 3], [-180, -4, 1.6]]
const TWIG_D = [[-40, 18, 6], [-46, 34, 4.6], [-56, 48, 3.6], [-70, 64, 2.6], [-76, 82, 1.4]]
// twigs that nod on their own: joint, centreline, flowers [x, y, scale, turn, side?], buds [x, y, turn]
const TWIGS = [
  { at: [-205, 74], pts: [[-205, 74, 5], [-208, 90, 4], [-216, 106, 3.2], [-234, 124, 2.4], [-246, 150, 1.4]], r: 2.2, d: 6.3,
    fl: [[-213, 104, 1, 10], [-228, 118, .9, 40, 1], [-240, 140, 1.05, -20], [-252, 156, .75, 70], [-222, 138, .8, 120], [-200, 96, .7, -60, 1]],
    bud: [[-246, 128, 30], [-236, 156, -20]] },
  { at: [-260, 100], pts: [[-260, 100, 4.6], [-274, 92, 3.8], [-292, 84, 3], [-320, 82, 2.2], [-346, 70, 1.4]], r: 2.8, d: 5.1,
    fl: [[-282, 86, .95, 0], [-300, 76, 1.1, 50], [-322, 90, .85, -30, 1], [-338, 66, 1, 20], [-354, 80, .8, 90], [-312, 70, .7, 140]],
    bud: [[-356, 64, -40], [-328, 102, 10]] },
  { at: [-350, 134], pts: [[-350, 134, 3.4], [-364, 148, 2.4], [-380, 160, 1.6], [-392, 176, 1]], r: 3.4, d: 4.3,
    fl: [[-368, 152, .9, 30], [-388, 168, .85, -10], [-358, 166, .7, 80, 1], [-396, 150, 1, 60]],
    bud: [[-400, 180, 20]] },
]
const FLOWERS = [[-126, 6, 1, 0], [-142, -6, .85, 40, 1], [-160, -2, 1.1, -14], [-178, -10, .8, 66], [-168, 12, .9, 100], [-102, 42, 1.05, 30],
  [-82, 24, .8, -40, 1], [-50, 40, .9, 12], [-64, 58, 1.1, -24], [-80, 80, .85, 50], [-60, 74, .7, 160, 1], [-150, 68, 1, 20], [-176, 56, .85, -50],
  [-190, 82, 1.15, 76], [-130, 58, .75, 130, 1], [-26, 30, .8, -70],
  [-112, 26, .9, 80], [-140, 50, .8, -10, 1], [-210, 60, .9, 33], [-232, 82, .8, -45, 1], [-270, 112, .85, 15], [-296, 104, .75, 70, 1],
  [-318, 124, .9, -5], [-336, 118, .7, 110, 1], [-14, 22, .7, 40, 1]]
const BUDS = [[-188, -14, -30], [-114, 4, 20], [-84, 92, 40], [-166, 78, -10], [-30, 46, 60], [-200, 50, -60]]
const LEAVES = [[-136, -8, -20], [-72, 70, 40], [-196, 92, 110], [-46, 30, 150]]

// the far shore: blossom crowns (and a few dark evergreens) bunched in uneven groups: x %, y %, crown, scale
const CROWNS = [
  'M-17 2C-20 -6 -14 -14 -6 -14C-3 -20 6 -21 10 -15C17 -15 21 -8 18 -2C20 2 16 5 10 4C2 6 -10 6 -17 2Z',
  'M-12 3C-16 -4 -12 -12 -6 -13C-6 -22 4 -26 9 -19C15 -19 17 -11 14 -5C18 -1 15 4 9 4C2 5 -6 6 -12 3Z',
  'M-22 2C-24 -4 -18 -9 -11 -8C-8 -13 0 -14 5 -10C11 -13 19 -10 20 -4C25 -2 23 4 16 4C4 6 -12 6 -22 2Z',
  'M0 -22C3 -16 5 -10 6 -4C7 0 5 3 0 3C-5 3 -7 0 -6 -4C-5 -10 -3 -16 0 -22Z',
]
const SHORE = [[2.5, 58.4, 2, .9], [6, 58.1, 1, .8], [9, 58.5, 3, .7], [11.5, 58.6, 0, .6],
  [57, 58.9, 0, .6], [60.5, 58.4, 1, .9], [63, 58.7, 3, .8], [65.5, 58.5, 2, 1.1], [70.5, 58.2, 0, 1.25], [73.8, 58.6, 3, .9], [75.8, 58.5, 1, .8],
  [82, 58.7, 2, .7], [86.5, 58.1, 0, 1.15], [89.4, 58.4, 3, 1], [92, 58.3, 1, 1.05], [96.5, 58.6, 2, 1.2]]
// near petals let go by the branch: start (fraction of branch box from its right, from its top), travel (cqw, cqh), blow s, tumble s
const GONE = [[.32, .3, -46, 70, 17.3, 3.1], [.42, .52, -58, 62, 21.7, 4.3], [.55, .34, -40, 80, 15.1, 2.7], [.63, .62, -66, 58, 23.9, 5.3],
  [.71, .44, -52, 74, 19.3, 3.7], [.78, .7, -38, 66, 13.9, 4.9], [.86, .5, -60, 84, 25.1, 3.3], [.22, .18, -70, 76, 27.7, 5.9],
  [.48, .22, -34, 88, 18.1, 2.9], [.9, .62, -44, 60, 16.7, 4.1], [.36, .46, -76, 70, 29.3, 6.1], [.6, .2, -50, 92, 20.9, 3.5],
  [.74, .3, -30, 72, 14.3, 4.7], [.82, .38, -64, 64, 22.3, 2.6], [.28, .4, -42, 82, 24.7, 5.1], [.52, .7, -56, 56, 12.9, 3.9],
  [.68, .54, -72, 80, 26.3, 4.5], [.95, .44, -36, 70, 17.9, 3.2]]
const petalShape = 'M0 5C-3 4 -5 0 -3.8 -3.4C-3 -5.2 -1.4 -5.6 -.4 -4.4L0 -3.6 .6 -4.6C1.8 -5.6 3.4 -5 4 -3.2C5 0 3 4 0 5Z'

export default function Sakura({ variant = 'room' }) {
  const p = usePaint(12)
  const room = variant === 'room'
  const Y = y => +(!room || y <= 30 ? y : y <= 50 ? 30 + (y - 30) * 1.5 : 60 + (y - 50) * .8).toFixed(2)
  const pc = y => `${Y(y)}%`
  // the branch box scales with the scene so it reads the same in the picker thumb
  const bw = room ? 'min(460px, 52cqw)' : 'min(620px, 72cqw)'
  const bt = 'calc(var(--sky) * .5 - 14px)'
  return (
    <div className={`v2-sakura-root v2-sakura-${variant}`} style={{ '--bw': bw }}>
      <Canvas p={p}>
        <defs>
          <linearGradient id={p.id + 'bg'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.sky} /><stop offset={Y(36) / 100} stopColor={C.skyHi} /><stop offset={Y(56) / 100} stopColor={C.haze} />
            <stop offset={Y(60) / 100} stopColor={C.lake} /><stop offset="1" stopColor={C.bank} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${p.id}bg)`} />
        <Wash f={p.sky} d={band(-8, Y(14), 2.5, .6)} fill={['#e4cdcc', '#e8d3d0', '#dfc8c9']} o={.6} />
        <Wash f={p.sky} d={band(Y(12), Y(34), 3, 2)} fill={[C.skyHi, '#f3e6de', '#ecdcd6']} o={.55} />
        <Wash f={p.sky} d={band(Y(32), Y(56), 2.5, 3.3)} fill={['#e6dce2', '#ebe1e3', '#ddd5e0']} o={.5} />
        {/* the far mountain, off to the left: a long gentle right shoulder, snow streaking down its gullies */}
        <Wash f={p.haze} fill={[C.far, '#bcb6cd', '#b0abc4']}
          d={ridge([[0, Y(50.5)], [8, Y(46.6)], [16, Y(41.8)], [23, Y(37)], [28, Y(33.8)], [31, Y(32.9)], [34, Y(33.5)], [40, Y(36.8)], [49, Y(41.5)], [58, Y(45.4)], [68, Y(49)], [80, Y(51.6)], [100, Y(52.6)]])} />
        <Wash f={p.fine} fill={['#f4eeea', '#f7f2ee', '#ece5e4']} o={.9}
          d={`M24.6 ${Y(36)}C26.6 ${Y(34.4)} 29 ${Y(33.1)} 31 ${Y(32.9)}S35.6 ${Y(34)} 38.4 ${Y(35.8)}L37 ${Y(36.4)} 36.2 ${Y(38.6)} 34.8 ${Y(36.4)} 33.6 ${Y(37.2)} 32.6 ${Y(40)} 31.4 ${Y(36.6)} 29.8 ${Y(38.4)} 28.6 ${Y(36.3)} 27 ${Y(37.8)} 26.2 ${Y(36.2)}Z`} />
        <Wash f={p.haze} fill="#a49eb9" o={.35} d={`M31 ${Y(33.2)}C34 ${Y(35)} 40 ${Y(38)} 48 ${Y(42)}S62 ${Y(48)} 72 ${Y(50.6)}L60 ${Y(51)}C52 ${Y(46)} 42 ${Y(42)} 31 ${Y(33.2)}Z`} />
        <Wash f={p.haze} d={band(Y(47), Y(54), 1, 1.2)} fill={C.haze} o={.55} />
        {/* mid hills and the far shore of blossom trees */}
        <Wash f={p.brush} fill={[C.mid, '#a99db6', '#9d91ab']} o={.9}
          d={ridge([[0, Y(55.4)], [10, Y(53.6)], [20, Y(55.2)], [32, Y(54.4)], [44, Y(56.6)], [56, Y(55.2)], [68, Y(56.4)], [82, Y(54.8)], [100, Y(56)]])} />
        <g filter={p.haze}>
          {SHORE.map(([x, y, k, s], i) => (
            <At key={i} x={`${x}%`} y={pc(y)}>
              <g transform={`scale(${s * (room ? .8 : 1)})`}>
                <path d={CROWNS[k]} fill={k === 3 ? '#8c8299' : i % 3 ? '#dfaebd' : '#d7a2b3'} opacity=".9" />
                {k < 3 && <path d={CROWNS[k]} fill="#efd0d8" opacity=".6" transform="translate(-2 -3) scale(.78)" />}
                {k < 3 && <path d={CROWNS[k]} fill="#b48ea4" opacity=".35" transform="translate(1 3) scale(.9 .5)" />}
              </g>
            </At>))}
        </g>
        {/* the lake: still, a faint upside-down mountain, a pale line where it meets the shore */}
        <Wash f={p.fine} fill={[C.lake, '#cad2dd', '#bfc8d5']} d={ridge([[0, Y(59.8)], [30, Y(60.1)], [60, Y(59.9)], [100, Y(60)]], false)} />
        <Wash f={p.haze} fill="#b4b2c8" o={.35}
          d={`M14 ${Y(60.2)}C20 ${Y(62.4)} 26 ${Y(65.6)} 31 ${Y(67)}C36 ${Y(66)} 44 ${Y(63.6)} 54 ${Y(61.6)}S66 ${Y(60.4)} 70 ${Y(60.2)}Z`} />
        <Wash f={p.haze} d={band(Y(59.6), Y(61), .3, .5)} fill="#ece6ea" o={.6} />
        <Wash f={p.brush} d={band(Y(64), Y(71), .8, 1.7)} fill="#d3d9e2" o={.5} />
        <Wash f={p.brush} d={band(Y(72), Y(81), .8, 2.9)} fill="#b9c3d1" o={.45} />
        {/* near bank: soft spring grass with fallen petals gathered in drifts */}
        <Wash f={p.brush} fill={[C.bank, '#b8b5a0', '#aaa892']} rim={['#cdc8b2', .3, .4]}
          d={ridge([[0, Y(80)], [12, Y(78.8)], [26, Y(79.6)], [42, Y(81.2)], [60, Y(80.6)], [78, Y(79)], [100, Y(80.2)]])} />
        <Wash f={p.haze} fill="#9c9c86" o={.35} d={band(Y(88), Y(97), 1.5, 2.4)} />
        <g filter={p.fine}>
          {[[18, 85, 3], [46, 88, 9], [72, 84, 15], [88, 92, 27], [30, 95, 33], [8, 91, 41]].flatMap(([cx, cy, seed]) => scatter(9, seed).map((q, i) =>
            <ellipse key={seed + '-' + i} cx={`${r2(cx + (q.x - .5) * 7 * q.r)}%`} cy={`${Y(cy + (q.y - .5) * 3 * q.r)}%`} rx={1.6 + q.t * 2} ry={1 + q.t}
              fill={C.pink[i % 3]} opacity=".85" transform={`rotate(${(q.r * 60 - 30).toFixed(0)})`} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />))}
        </g>
      </Canvas>

      {/* a pale sun over the mountain's shoulder */}
      <Pin x="17%" y="calc(15% + var(--sky))" className="a v2-sakura-breathe" style={anim(14.3, 5, { '--lo': .6 })}>
        <Glaze r={40} fill="#fbeedd" o={.6} f={p.glow} />
      </Pin>
      <Pin x="17%" y="calc(15% + var(--sky))">
        <Wash px f={p.fine} fill={['#fcf3e6', '#fff7ec', '#f6eadc']} d="M-17 1C-18 -9 -9 -17 1 -17C10 -17 18 -9 17 0C17 10 9 17 -1 17C-10 17 -17 10 -17 1Z" o={.9} />
      </Pin>
      {/* mist across the mountain's waist, drifting slowly */}
      <Pin x="30%" y={pc(43)} className="a v2-sakura-drift" style={anim(79, 23, { '--x': '42px' })}>
        <Wash px f={p.haze} o={.7} fill={['#f1e8ea', '#f5eded', '#ebe2e6']} d="M-200 4C-150 -4 -90 -8 -30 -6S90 -6 150 -2 210 6 196 8C140 12 60 12 -20 10S-170 10 -200 4Z" />
      </Pin>
      <Pin x="64%" y={pc(52)} className="a v2-sakura-drift" style={anim(103, 61, { '--x': '-36px' })}>
        <Wash px f={p.haze} o={.55} fill={['#eee5e9', '#f2eaec', '#e7dfe5']} d="M-160 3C-120 -4 -60 -6 0 -5S110 -3 160 2C110 8 40 9 -30 8S-140 8 -160 3Z" />
      </Pin>

      {/* the lake glints in three held frames */}
      {[3, 17, 29].map((seed, f) => (
        <svg key={f} className="pt-canvas a v2-sakura-f3" style={anim(2.7, f * .9)} width="100%" height="100%">
          {scatter(12, seed).map((q, i) => {
            const x = 8 + (q.x * .7 + (i % 3) * .1) * 84, y = 61 + q.y * q.y * 16, w = 4 + q.y * 14 * (.5 + q.r)
            return <At key={i} x={`${r2(x)}%`} y={pc(y)}><path d={`M${-w} 0C${-w * .4} -1.2 ${w * .5} -1.1 ${w} .2C${w * .3} .6 ${-w * .5} .5 ${-w} 0Z`} fill="#f4f1f2" opacity=".75" /></At>
          })}
        </svg>
      ))}

      {/* far petals: a drifting veil, each petal turning over on its own */}
      <div className="v2-sakura-wind a v2-sakura-drift" style={anim(8.9, 3, { '--x': '34px' })}>
        <div className="v2-sakura-plane a" style={anim(31)}>
          {[0, 1].flatMap(k => scatter(20, 41).map((q, i) => (
            <svg key={k + '-' + i} className="a v2-sakura-tumble"
              style={{ left: `${r2((q.x * .8 + (q.y > .5 ? .2 : 0)) * 100)}%`, top: `${r2((q.y + k) * 50)}%`, ...anim(3.3 + q.r * 4.1, q.t * 7) }}>
              <path d={petalShape} fill={C.pink[i % 3]} opacity={r2(.55 + q.t * .3)} transform={`scale(${r2(.62 + q.r * .45)})`} />
            </svg>
          )))}
        </div>
      </div>

      {/* the branch: the whole limb sways from the corner, three twigs nod on their own */}
      <div className="v2-sakura-branch a v2-sakura-sway" style={{ top: bt, ...anim(9.7, 2, { '--r': '1.2deg' }) }}>
        <Branch p={p} />
      </div>

      {/* petals let go from the branch, riding the breeze down and across */}
      {GONE.map(([fx, fy, x, y, d, t], i) => (
        <div key={i} className="v2-sakura-lane a v2-sakura-blow"
          style={{ left: `calc(100% - var(--bw) * ${fx})`, top: `calc(${bt} + var(--bw) * ${r2(fy * .58)})`, ...anim(d, d * ((i * .43) % 1), { '--x': x, '--y': y }) }}>
          <svg className="a v2-sakura-tumble" style={anim(t, i * .7)}>
            <g transform={`scale(${r2(.8 + (i % 4) * .14)})`}>
              <path d={petalShape} fill={C.pink[i % 3]} />
              <path d={petalShape} fill="#fbe6eb" opacity=".6" transform="translate(-.6 -.8) scale(.6)" />
            </g>
          </svg>
        </div>
      ))}

      {/* rare: a small bird crossing toward the mountain */}
      <div className="v2-sakura-crossing a v2-sakura-cross" style={{ top: room ? 'calc(10% + var(--sky))' : pc(27), ...anim(97, 31) }}>
        <div className="a v2-sakura-drift" style={anim(4.1, 1, { '--x': '0px' })}>
          {['M-9 0C-6 -4 -3 -4 0 0C3 -5 6 -6 10 -3C6 -2 3 0 1 2C0 3 -1 3 -2 2C-4 0 -6 -1 -9 0Z',
            'M-9 2C-6 1 -3 1 0 1C3 0 6 1 10 3C6 3 3 3 1 4C0 5 -1 5 -2 4C-4 3 -6 3 -9 2Z'].map((w, i) => (
            <Pin key={i} className={`a v2-sakura-flap${i ? ' b' : ''}`} style={anim(1.7, 1)}>
              <path d={w} fill="#6e5a63" filter={p.fine} />
            </Pin>
          ))}
        </div>
      </div>
    </div>
  )
}

const BOX = '-440 -30 480 280'
function Flowers({ fl, bud }) {
  return <>
    {fl.map(([x, y, s, a, side], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${r2(s * 1.35)})`}>
        <path d={bloom(a, side)} fill={C.pink[i % 3]} opacity=".95" />
        <path d={bloom(a + 8, side)} fill="#fae4ea" opacity=".55" transform="translate(-.8 -1) scale(.82)" />
        <circle r={side ? 1.2 : 1.8} cy={side ? 2 : 0} fill={C.rose} />
        {!side && <path d="M-2.6 -1.2h.01M2.2 -1.8h.01M.4 2.6h.01" stroke="#a9506d" strokeWidth="1.4" strokeLinecap="round" />}
      </g>
    ))}
    {bud.map(([x, y, a], i) => (
      <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
        <path d="M0 -4.4C2.6 -4.4 3.2 -1 2.1 1.6C1.3 3.1 -1.3 3.1 -2.1 1.6C-3.2 -1 -2.6 -4.4 0 -4.4Z" fill="#dc93a8" />
        <path d="M-2.2 1.4C-1 4.2 1 4.2 2.2 1.4C1 2.4 -1 2.4 -2.2 1.4Z" fill="#86675e" />
      </g>
    ))}
  </>
}

function Branch({ p }) {
  return <>
    <svg className="v2-sakura-part" viewBox={BOX} preserveAspectRatio="xMaxYMin meet">
      <g filter={p.fine}>
        <path d={limb(LIMB)} fill={C.bark} />
        <path d={limb(TWIG_A)} fill={C.bark} />
        <path d={limb(TWIG_D)} fill={C.bark} />
        <path d={limb(LIMB.slice(0, 9).map(([x, y, w]) => [x - .5, y - w * .22, w * .3]))} fill={C.barkHi} opacity=".7" />
      </g>
      <g filter={p.fine}>
        {LEAVES.map(([x, y, a], i) => <path key={i} d="M0 0C2 -3 6 -4 9 -3C7 0 3 1 0 0Z" fill={C.leaf} transform={`translate(${x} ${y}) rotate(${a})`} />)}
        <Flowers fl={FLOWERS} bud={BUDS} />
      </g>
    </svg>
    {TWIGS.map((t, i) => (
      <div key={i} className="v2-sakura-twig a v2-sakura-sway"
        style={{ '--r': `${t.r}deg`, transformOrigin: `${r2((t.at[0] + 440) / 4.8)}% ${r2((t.at[1] + 30) / 2.8)}%`, ...anim(t.d, t.d * i * .57) }}>
        <svg viewBox={BOX} preserveAspectRatio="xMaxYMin meet">
          <g filter={p.fine}><path d={limb(t.pts)} fill={C.bark} /><Flowers fl={t.fl} bud={t.bud} /></g>
        </svg>
      </div>
    ))}
  </>
}
