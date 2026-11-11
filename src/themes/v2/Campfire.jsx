import { usePaint, Canvas, Wash, Glaze, At, Pin, ridge, band, anim } from '../paint'
import './campfire.css'

// Campfire, painted: a clearing ringed by pines, a tent and a log seat catching the firelight, smoke curling up into a
// plum night. The fire is a flipbook (three held frames for the flames, two for the core, each on its own beat) so it
// crackles like hand-drawn animation; the light it throws flickers on the ground, the tent and the log; embers drift up
// at all sizes and speeds; now and then a log settles with a burst of sparks, and once in a long while a star falls.

const r2 = n => Math.round(n * 100) / 100
const loop = pts => {
  const n = pts.length, P = i => pts[(i + n) % n]
  let d = `M${P(0)}`
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), e = P(i + 2)
    d += `C${r2(b[0] + (c[0] - a[0]) / 6)} ${r2(b[1] + (c[1] - a[1]) / 6)} ${r2(c[0] - (e[0] - b[0]) / 6)} ${r2(c[1] - (e[1] - b[1]) / 6)} ${c}`
  }
  return d + 'Z'
}
const HALO = loop([[0, -10], [7.6, -6.8], [10.4, .6], [7, 7.8], [-.8, 10.2], [-7.4, 7], [-10, -.4], [-6.6, -7.6]])
// a soft glaze: several lopsided blobs, each larger, fainter and turned, so no edge lines up (no filter: it may animate)
const Halo = ({ k, fill, o, sx = 1, n = 4 }) => Array.from({ length: n }, (_, i) =>
  <path key={i} d={HALO} transform={`rotate(${i * 67}) scale(${r2(k * (1 + i * .45) * sx)} ${r2(k * (1 + i * .45))})`} fill={fill} opacity={r2(o / (1 + i * .7))} />)

// x %, y %, r px: two loose clusters either side of the smoke, none over the fire
const STARS = [
  [27.6, 6.2, .9], [31.4, 11.8, .5], [34.2, 4.4, .6], [36.8, 15.6, 1], [39.4, 8.8, .5], [42.6, 19.4, .6], [44.2, 5.6, .8],
  [33.2, 23.8, .5], [47.6, 12.6, .4], [38.6, 28.4, .5], [29.8, 17.4, .4], [25.4, 12.4, .5],
  [66.4, 9.6, .7], [70.2, 5.2, .5], [72.8, 14.4, .9], [76.6, 8.6, .5], [79.4, 18.6, .6], [74.4, 24.2, .4], [82.6, 4.8, .8],
  [68.2, 20.8, .5], [86.4, 12.2, .5], [91.2, 6.6, .6], [57.6, 4.2, .4], [52.4, 9.6, .5], [96.4, 18.4, .5], [8.4, 5.6, .6], [15.6, 9.8, .5],
]
const TWINKLES = [[35.4, 9.6, 1, 4.9], [41.2, 24.6, .8, 6.7], [30.6, 2.8, .8, 8.3], [71.4, 11.2, 1, 5.6], [78.2, 3.4, .8, 7.4],
  [84.4, 21.6, .7, 3.9], [64.2, 16.8, .8, 9.2], [12.4, 3.4, .8, 6.1], [93.6, 11.4, .8, 5.2]]
const GLINTS = [[38.2, 12.8, 5.5, 8, 8.7], [75.8, 17.2, 5, -6, 11.9], [46.4, 2.6, 4.2, 12, 7.1]]
const glint = (s, w = s * .72) => `M0 ${-s}Q${r2(s * .12)} ${r2(-s * .12)} ${r2(w)} 0Q${r2(s * .12)} ${r2(s * .12)} 0 ${s}Q${r2(-s * .12)} ${r2(s * .12)} ${r2(-w)} 0Q${r2(-s * .12)} ${r2(-s * .12)} 0 ${-s}Z`

// the same three hand-drawn pines the other painted scenes use (base centre at 0, 0)
const PINES = [
  'M1 -74L5 -60 2 -59 9 -46 5 -45 13 -31 7 -30 16 -15 9 -14 18 0H-17L-9 -14-15 -16-7 -30-12 -32-4 -45-8 -47-2 -59-4 -61Z',
  'M0 -52L6 -40 3 -39 11 -27 6 -26 15 -12 9 -11 19 0H-18L-10 -11-16 -13-7 -26-12 -27-4 -39-7 -41Z',
  'M-2 -90L3 -76 1 -75 7 -62 3 -61 10 -46 5 -45 13 -30 7 -29 16 -14 10 -13 19 0H-19L-11 -13-17 -15-8 -29-13 -31-5 -45-9 -47-3 -61-6 -63-1 -75-4 -77Z',
]
// x %, y %, pine, scale, lean, rim side toward the fire (+1 right, -1 left), sway duration (0 = still)
const TREES = [[2.4, 63, 2, 2.7, -1, 1, 0], [8.6, 62, 0, 2.3, 2, 1, 0], [14.2, 62.4, 1, 2, -2, 1, 0], [18.8, 62.8, 2, 1.45, 1, 1, 13.3],
  [22.6, 63, 1, 1.05, 0, 1, 0], [84.4, 62.2, 1, 1.5, 2, -1, 11.1], [89.2, 61.8, 2, 2.4, -1, -1, 0], [95.2, 62.4, 0, 2.8, 1, -1, 0],
  [99.4, 62.6, 1, 2, 0, -1, 0]]
const Pine = ({ k, s, lean, side, f }) => (
  <g transform={`rotate(${lean}) scale(${s})`}>
    <Wash px f={f} d={PINES[k]} fill={['#140f1c', '#17121f', '#120d19']} rim={['#3c2226', -side * .7, .2]} />
  </g>
)

// flames: base centre at (0, 0). Three held frames of outer + middle tongues, and two of the core on another beat.
const FLAMES = [
  ['M-24 0C-30 -8 -26 -20 -18 -28C-17 -21 -13 -18 -10 -21C-12 -34 -6 -48 0 -64C2 -50 8 -42 12 -38C13 -44 16 -48 20 -52C21 -38 30 -24 27 -10C25 -2 18 1 8 1C-4 2 -18 2 -24 0Z',
    'M-15 0C-20 -8 -16 -18 -9 -26C-8 -18 -4 -16 -2 -20C-2 -30 2 -38 5 -46C6 -36 12 -28 14 -20C17 -10 14 -2 6 0C-2 1 -10 1 -15 0Z'],
  ['M-25 0C-29 -10 -24 -24 -14 -34C-14 -26 -10 -22 -7 -24C-6 -36 -10 -46 -6 -56C0 -46 6 -44 8 -50C10 -56 10 -62 14 -68C16 -54 26 -40 28 -24C30 -10 24 -1 12 1C0 2 -16 2 -25 0Z',
    'M-16 0C-20 -10 -16 -20 -8 -28C-6 -22 -3 -20 0 -22C2 -30 4 -38 8 -46C10 -34 18 -24 18 -14C18 -4 12 0 4 1C-4 1 -12 1 -16 0Z'],
  ['M-26 0C-31 -12 -22 -26 -16 -36C-14 -28 -12 -26 -9 -28C-10 -40 -6 -50 -2 -58C2 -50 4 -46 6 -44C10 -50 14 -56 16 -62C18 -50 22 -46 24 -40C30 -28 30 -10 22 -2C16 2 0 2 -26 0Z',
    'M-17 0C-21 -10 -14 -20 -9 -28C-7 -22 -4 -20 -2 -22C-1 -30 2 -36 6 -42C8 -34 14 -28 15 -18C16 -8 12 -1 4 1C-4 1 -12 1 -17 0Z'],
]
const CORES = ['M-9 0C-12 -6 -8 -14 -3 -20C-2 -14 1 -14 2 -18C4 -12 9 -6 8 -2C7 1 2 1 -2 1C-5 1 -8 1 -9 0Z',
  'M-8 0C-11 -8 -6 -12 -1 -24C0 -16 4 -14 6 -12C9 -8 8 -2 5 0C2 1 -4 1 -8 0Z']
const FLIP = .54, CORE = .42 // s per cycle
const FS = 1.35 // fire scale

// fire and friends in backdrop % (the stones and logs are px art around the fire's base)
const FIRE = ['60%', '66%'], TENT = ['33%', '65.6%']
const at = ([x, y], dx, dy) => ({ x: `calc(${x} + ${dx}px)`, y: `calc(${y} + ${dy}px)` })

// embers: drift x, rise y (px), size, duration, delay
const EMBERS = [[-30, -210, 2.6, 4.1, 0], [22, -260, 1.8, 5.3, 1.2], [-8, -170, 3.2, 3.6, 2.9], [46, -300, 1.4, 6.7, .6],
  [-52, -240, 2, 5.9, 3.8], [12, -320, 1.6, 7.3, 5.1], [-18, -140, 2.8, 3.2, 1.9], [34, -200, 2.2, 4.6, 4.4], [-40, -280, 1.5, 6.2, 2.2],
  [4, -230, 2.4, 4.9, 6.3], [58, -250, 1.7, 5.6, .3], [-26, -330, 1.3, 7.9, 3.1], [18, -160, 3, 3.9, 5.7], [-62, -190, 1.8, 5.1, 1.5],
  [28, -350, 1.2, 8.6, 6.9], [-4, -270, 2, 5.4, 4.8], [40, -150, 2.6, 3.5, 2.6], [-34, -360, 1.4, 9.1, 7.7]]
// the burst when a log settles: drift x, rise y
const SPARKS = [[-26, -120], [8, -160], [30, -110], [-6, -90], [18, -140]]

export default function Campfire() {
  const p = usePaint(9)
  return <>
    <Canvas p={p} className="v2-campfire-canvas">
      <Wash f={p.sky} d={band(-8, 30, 2.5, .4)} fill={['#120f22', '#151126', '#100d1e']} o={.75} />
      <Wash f={p.sky} d={band(26, 52, 3, 1.8)} fill={['#211a33', '#251d37', '#1e172f']} o={.55} />
      <Wash f={p.sky} d={band(46, 66, 2.5, 3.1)} fill={['#3d2734', '#432a36', '#382331']} o={.5} />
      <g fill="#efe3cf">{STARS.map(([x, y, r], i) =>
        <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r2(r + .25)} fill={i % 6 ? undefined : '#d6d0ee'} opacity={r2(.45 + Math.min(r, 1) * .45)} />)}</g>
    </Canvas>

    <div className="v2-campfire-land">
      <Canvas className="v2-campfire-canvas">
        {/* firelight on the smoke above the clearing */}
        <At x={FIRE[0]} y="48%"><g transform="scale(1.6 1)"><Glaze r={70} fill="#8a4430" o={.3} f={p.glow} /></g></At>
        <Wash f={p.haze} fill={['#272039', '#2b233e', '#241d35']} d={ridge([[0, 56], [4, 53.6], [7, 55.2], [11, 52.8], [15, 55.4],
          [20, 54], [26, 56.2], [31, 53.4], [35, 55], [40, 52.6], [45, 54.8], [50, 53.2], [55, 55.6], [61, 53.8], [66, 55.4], [71, 52.4],
          [76, 54.6], [81, 53], [86, 55.2], [92, 53.6], [100, 55]], false)} />
        <Wash f={p.brush} fill={['#2a191d', '#2e1c20', '#26161a']} rim={['#55302a', 0, .5]}
          d={ridge([[0, 62.6], [12, 61.4], [26, 62.2], [40, 61], [52, 61.8], [62, 60.8], [74, 61.6], [88, 60.6], [100, 61.8]])} />
        {/* the lit ground around the fire, and the darker foreground */}
        <At x={FIRE[0]} y={FIRE[1]}><g transform="scale(2.6 .62)"><Glaze r={44} fill="#c25a34" o={.36} f={p.glow} /></g></At>
        <Wash f={p.brush} fill={['#1a0f12', '#1d1115', '#170d10']} d={ridge([[0, 80], [18, 78.6], [38, 80.4], [58, 79.2], [80, 80.8], [100, 79.4]])} />
        {TREES.map(([x, y, k, s, lean, side, d], i) => !d &&
          <At key={i} x={`${x}%`} y={`${y}%`}><Pine k={k} s={s} lean={lean} side={side} f={p.fine} /></At>)}

        {/* tent: the side facing the fire is lit, the front is in shade */}
        <At x={TENT[0]} y={TENT[1]}>
          <g filter={p.fine}>
            <path d="M-50 1C-40 -2 -26 -14 -1 -58" stroke="#2a1d2a" strokeWidth=".8" fill="none" opacity=".7" />
            <path d="M0 -58L63 -50.5 76 .6 40 0Z" fill="#6e3f36" />
            <path d="M0 -58L63 -50.5 66 -38 22 -30Z" fill="#8a503c" opacity=".6" />
            <path d="M31 -54L52 1" stroke="#4a2a2c" strokeWidth=".8" opacity=".6" />
            <path d="M40 0L22 -30 34 -31 52 0Z" fill="#a0603f" opacity=".45" />
            <path d="M0 -58L40 0H-46.5Z" fill="#4a3046" />
            <path d="M0 -58L-46.5 0H-30L-1 -50Z" fill="#3a2539" opacity=".8" />
            <path d="M0 -40L15 0H-14Z" fill="#1b1220" />
            <path d="M0 -58L-3 -66M0 -58L4 -65.5M63 -50.5L65 -57" stroke="#2a1d2a" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </At>
        {/* stones and crossed logs under the fire */}
        <At x={FIRE[0]} y={FIRE[1]}>
          <g filter={p.fine} transform={`scale(${FS})`}>
            <path d="M-30 -2L26 -14 30 -9 -27 4Z" fill="#4a2d26" />
            <path d="M-28 -12L30 2 26 7 -31 -6Z" fill="#5c3828" />
            <path d="M-28 -12L30 2 30 -1 -27 -14Z" fill="#a0603a" opacity=".7" />
            <path d="M-30 -2L26 -14 26 -16 -30 -5Z" fill="#8a4f32" opacity=".7" />
            <path d="M-46 4C-46 -1 -40 -3 -35 -2S-28 3 -30 6-44 8-46 4Z" fill="#3e2c30" />
            <path d="M-32 7C-33 2 -26 0 -20 1S-12 6 -15 9-30 11-32 7Z" fill="#4a3436" />
            <path d="M-14 9C-15 4 -7 2 0 3S8 8 5 11-12 13-14 9Z" fill="#3e2c30" />
            <path d="M5 9C4 4 12 2 18 3S26 7 23 10-1 12 5 9Z" fill="#4a3436" />
            <path d="M22 6C22 1 29 -1 35 0S42 4 39 7-20 9 22 6Z" fill="#3e2c30" />
            <path d="M34 2C35 -2 41 -3 45 -1S48 4 45 5-34 6 34 2Z" fill="#46333a" />
            <path d="M-42 -1.5C-39 -3 -36 -2.6 -34 -1.8M-29 1.6C-25 .2 -20 .4 -17 2M-11 3.6C-6 2.4 0 2.6 3 4M8 3.6C12 2.6 17 2.8 19 4M25 .8C29 -.6 33 -.2 36 1"
              stroke="#b27148" strokeWidth="1.4" opacity=".55" fill="none" strokeLinecap="round" />
          </g>
        </At>
      </Canvas>

      {/* light thrown by the fire, flickering on its own beats */}
      {/* plain light, not a shape: its edge is never seen */}
      <i className="v2-campfire-light a v2-campfire-flick" style={anim(2.9, 1, { left: FIRE[0], top: FIRE[1] })} />
      <i className="v2-campfire-light sky a v2-campfire-flick f2" style={anim(4.7, 2.3, { left: FIRE[0], top: FIRE[1] })} />
      <Pin x={TENT[0]} y={TENT[1]} className="v2-campfire-pin a v2-campfire-lit" style={anim(3.7, .8)}>
        <path d="M0 -58L63 -50.5 76 .6 40 0Z" fill="#e0905a" opacity=".14" />
      </Pin>
      <Pin {...at(TENT, 0, -40)} className="v2-campfire-pin a v2-campfire-flap" style={anim(6.1, 2)}>
        <path d="M0 0L15 40 22 38C16 26 8 12 0 0Z" fill="#6d4458" />
      </Pin>

      {TREES.map(([x, y, k, s, lean, side, d], i) => !!d && (
        <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-campfire-pin a v2-campfire-sway" style={anim(d, d * .4, { '--r': `${r2(.8 / s)}deg` })}>
          <Pine k={k} s={s} lean={lean} side={side} />
        </Pin>
      ))}

      {[[11.3, 0], [12.9, 3.4], [10.1, 6.6], [13.7, 9.1]].map(([d, dl], i) => (
        <Pin key={i} {...at(FIRE, 2, -78)} className="v2-campfire-pin a v2-campfire-smoke" style={anim(d, dl)}>
          <path d={HALO} transform={`rotate(${i * 53}) scale(.9 .55)`} fill="#6c5d78" opacity=".16" />
          <path d={HALO} transform={`translate(3 -2) rotate(${i * 53 + 80}) scale(1.6 .8)`} fill="#7c6c86" opacity=".08" />
        </Pin>
      ))}

      {EMBERS.map(([x, y, s, d, dl], i) => (
        <Pin key={i} {...at(FIRE, (i % 5 - 2) * 5, -28)} className="v2-campfire-pin a v2-campfire-ember"
          style={anim(d, dl, { '--x': `${x}px`, '--y': `${y}px`, '--mx': `${r2(-x * .35)}px` })}>
          <circle r={r2(s * 2.2)} fill="#f0a050" opacity=".18" />
          <path d={HALO} transform={`rotate(${i * 41}) scale(${r2(s * .1)})`} fill={i % 3 ? '#f6c26e' : '#fbe2a8'} />
        </Pin>
      ))}
      {SPARKS.map(([x, y], i) => (
        <Pin key={i} {...at(FIRE, 0, -20)} className="v2-campfire-pin a v2-campfire-spark" style={anim(31, 17, { '--x': `${x}px`, '--y': `${y}px` })}>
          <path d={HALO} transform={`scale(${.16 + (i % 2) * .06})`} fill="#fde6b0" />
        </Pin>
      ))}

      {/* the fire itself: the frames sit in a body that leans and breathes */}
      <div className="v2-campfire-fire a" style={{ left: FIRE[0], top: FIRE[1], ...anim(2.3, .7) }}>
        <Pin className="v2-campfire-pin">
          <g transform="translate(0 -14)"><Halo k={3.4} sx={1.1} fill="#f0a050" o={.06} n={4} /></g>
        </Pin>
        {FLAMES.map(([outer, mid], i) => (
          <Pin key={i} className="v2-campfire-pin a v2-campfire-frame" style={anim(FLIP, FLIP * (3 - i) / 3)}>
            <g transform={`scale(${FS}) translate(0 -4)`}>
              <Wash px d={outer} fill={['#d36a3a', '#dc7840', '#c95f36']} />
              <Wash px d={mid} fill={['#eea04f', '#f2ae5a', '#e89446']} />
            </g>
          </Pin>
        ))}
        {CORES.map((d, i) => (
          <Pin key={i} className="v2-campfire-pin a v2-campfire-core" style={anim(CORE, CORE * (2 - i) / 2)}>
            <g transform={`scale(${FS}) translate(1 -4)`}><Wash px d={d} fill={['#f8dca0', '#fbe6b8', '#f4d090']} /></g>
          </Pin>
        ))}
      </div>
    </div>

    {TWINKLES.map(([x, y, r, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-campfire-pin a v2-campfire-tw" style={anim(d, d * i * .43)}>
        <circle r={r2(r * 2.8)} cx=".4" cy="-.3" fill="#ddd3ea" opacity=".12" />
        <circle r={r} fill="#f4ead6" />
      </Pin>
    ))}
    {GLINTS.map(([x, y, s, t, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-campfire-pin a v2-campfire-glint" style={anim(d, d * i * .37)}>
        <g transform={`rotate(${t})`}>
          <path d={glint(s)} fill="#f2e8d2" opacity=".8" />
          <circle r={r2(s * .2)} fill="#fff8ea" />
        </g>
      </Pin>
    ))}
    <div className="v2-campfire-fall" style={{ left: '82%', top: 'calc(7% + var(--sky))', transform: 'rotate(-14deg)' }}>
      <Pin className="v2-campfire-pin a v2-campfire-shoot" style={anim(53, 38)}>
        <path d="M0 0C20 -.7 50 -1.1 80 -.3L82 0 80 .3C50 1.1 20 .7 0 0Z" fill="#f2eadb" opacity=".75" />
      </Pin>
    </div>
  </>
}
