import { usePaint, Canvas, Wash, Glaze, Pct, At, Pin, ridge, band, anim } from '../paint'
import './forest.css'

// Firefly forest, painted: a moonlit clearing seen between two old trunks, rows of pines fading into mist behind it,
// a ring of mushrooms glowing at its edge. Painted layers are static (filtered once); everything that moves is small and
// unfiltered: two swarms of fireflies wander, flutter and blink on their own beats, grass and ferns lean, mist drifts,
// the moonlight breathes, boughs stir, leaves let go now and then, and once in a long while an owl opens its eyes.

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

// the same three hand-drawn pines the other painted scenes use (base centre at 0, 0)
const PINES = [
  'M1 -74L5 -60 2 -59 9 -46 5 -45 13 -31 7 -30 16 -15 9 -14 18 0H-17L-9 -14-15 -16-7 -30-12 -32-4 -45-8 -47-2 -59-4 -61Z',
  'M0 -52L6 -40 3 -39 11 -27 6 -26 15 -12 9 -11 19 0H-18L-10 -11-16 -13-7 -26-12 -27-4 -39-7 -41Z',
  'M-2 -90L3 -76 1 -75 7 -62 3 -61 10 -46 5 -45 13 -30 7 -29 16 -14 10 -13 19 0H-19L-11 -13-17 -15-8 -29-13 -31-5 -45-9 -47-3 -61-6 -63-1 -75-4 -77Z',
]
// x %, y %, pine, scale: a far misty row and a nearer row with a gap where the clearing opens
const FAR = [[12.6, 58, 0, 1.1], [16.8, 57.4, 2, .9], [21.4, 58.2, 1, 1.25], [25.8, 57.6, 0, .8], [32.8, 58.2, 2, 1], [37.4, 57.4, 1, .9],
  [43.8, 58, 0, 1.3], [48.6, 57.8, 2, .85], [53.8, 58.4, 1, 1.1], [59.4, 57.6, 0, .95], [65.8, 58, 2, 1.25], [70.6, 57.4, 1, .8],
  [76.4, 58.2, 0, 1.05], [81.2, 57.8, 2, .9], [86.2, 58.4, 1, 1.15], [7.8, 57.6, 1, .95], [91.8, 57.8, 0, 1]]
const MID = [[10.4, 65.6, 2, 1.9], [17.6, 65, 0, 1.55], [26.8, 65.8, 1, 2.1], [38.6, 65.2, 2, 1.45], [46.4, 65.6, 0, 1.2],
  [73.4, 65, 1, 1.65], [79.6, 65.8, 2, 2.2], [86.2, 65.2, 0, 1.45]]

// grass and fern clumps (base at 0, 0), hand-drawn blade by blade
const CLUMP = [
  'M0 0C-1 -9 -4 -18 -9 -26C-4 -19 -1 -10 2 0ZM2 0C2 -10 1 -20 3 -32C4 -20 5 -10 5 0ZM4 0C6 -8 10 -15 16 -21C11 -14 8 -7 7 0ZM-2 0C-5 -6 -10 -11 -16 -14C-10 -9 -6 -5 -4 0ZM6 0C7 -6 9 -12 9 -18C10 -11 9 -5 8 0Z',
  'M-1 0C-2 -7 -2 -15 -5 -22C-1 -15 0 -8 1 0ZM1 0C3 -9 7 -17 6 -27C9 -17 6 -8 4 0ZM3 0C6 -5 11 -9 18 -11C12 -7 8 -4 6 0ZM-3 0C-6 -4 -11 -7 -14 -7C-10 -5 -7 -2 -5 0Z',
  'M0 0C-3 -6 -8 -12 -14 -16L-12 -13 -17 -17 -15 -13 -21 -18 -18 -14 -25 -19C-17 -11 -8 -5 -3 0ZM2 0C4 -7 9 -13 16 -17L14 -14 19 -18 17 -14 23 -18 20 -14 27 -17C19 -10 10 -5 5 0ZM0 0C0 -8 1 -16 -1 -24L1 -21 1 -26 2 -20 3 -24C4 -16 3 -8 2 0Z',
]
// x %, y %, clump, scale, flip, sway duration
const CLUMPS = [[9.2, 69, 0, 1.4, 1, 5.3], [12.6, 68.4, 2, 1.2, -1, 7.1], [16.2, 69.2, 1, 1, 1, 6.2], [30.4, 67.2, 0, .9, -1, 8.3],
  [34.2, 67.6, 1, 1.1, 1, 5.9], [46.2, 66.8, 0, .8, 1, 7.7], [57.4, 67.6, 2, 1, 1, 6.6], [60.2, 68.8, 1, 1.2, -1, 4.9],
  [67.6, 68.2, 0, 1.1, -1, 7.3], [70.4, 67.4, 2, .9, 1, 8.9], [80.2, 68.8, 1, 1.3, 1, 6.9], [85.8, 70, 0, 1.5, -1, 5.6],
  [94.2, 71, 2, 1.3, 1, 7.9], [97.4, 70.4, 1, 1.1, -1, 6.4]]

// fireflies: x %, y %, size, wander path, wander s, blink s, flutter s. Two swarms (the clearing, the left trunk), a few strays.
const FLIES = [
  [52.4, 52.6, 1.1, 0, 17.3, 4.1, 1.7], [56.8, 47.2, .8, 1, 21.1, 5.3, 2.3], [61.4, 55.8, 1.3, 2, 14.9, 3.7, 1.4], [64.2, 49.4, .9, 3, 19.7, 6.1, 1.9],
  [58.8, 60.4, 1, 1, 16.1, 2.9, 2.1], [67.6, 57.2, .7, 0, 23.3, 4.7, 1.6], [70.2, 51.6, 1.2, 2, 18.5, 3.3, 2.6], [55.2, 42.4, .7, 3, 22.7, 5.9, 1.3],
  [62.8, 44.6, .9, 0, 15.7, 4.4, 2], [49.6, 58.8, .8, 2, 20.3, 6.7, 1.8], [73.6, 59.4, 1, 1, 17.9, 3.9, 2.4], [66.4, 62.4, .7, 3, 24.1, 5.1, 1.5],
  [59.6, 51.2, .6, 1, 13.9, 3.1, 2.2], [53.8, 63.2, 1.1, 0, 19.1, 4.9, 1.9],
  [16.4, 41.2, 1, 2, 18.7, 4.3, 2.1], [20.8, 36.4, .8, 0, 22.1, 5.7, 1.6], [24.2, 44.8, 1.2, 1, 16.3, 3.5, 2.5], [18.6, 49.6, .7, 3, 20.9, 6.3, 1.4],
  [27.4, 39.2, .9, 2, 15.1, 4.5, 1.8], [22.6, 53.4, 1, 1, 23.7, 3.3, 2.3], [14.2, 46.4, .6, 0, 19.3, 5.5, 1.7],
  [84.6, 34.2, .9, 3, 21.5, 6.9, 2], [88.4, 41.6, .7, 1, 17.1, 4.2, 1.5], [40.6, 31.4, .8, 2, 25.3, 5.4, 2.2], [35.2, 55.6, .7, 0, 18.1, 3.8, 1.9],
  [78.4, 46.2, 1, 3, 16.7, 4.6, 2.7], [44.2, 47.8, .6, 1, 20.5, 6.4, 1.6], [31.6, 47.2, .8, 3, 22.9, 3.6, 2.1], [91.6, 52.4, .9, 0, 19.9, 5.2, 1.8],
  [47.4, 38.6, .7, 2, 24.5, 4.8, 2.4]]

// leaves that let go now and then: start x %, y %, drift px, fall px, duration, delay
const LEAVES = [[22, 12, 90, 300, 23, 4], [80, 15, -70, 260, 29, 17], [64, 6, 50, 320, 37, 9]]

export default function Forest() {
  const p = usePaint(6)
  return <>
    <Canvas p={p} className="v2-forest-canvas">
      <Wash f={p.sky} d={band(-8, 26, 2.5, .9)} fill={['#0c1c1e', '#0f2022', '#0a191b']} o={.88} />
      <Wash f={p.sky} d={band(22, 50, 3, 2.2)} fill={['#16302b', '#1a342e', '#142b27']} o={.6} />
      <Wash f={p.sky} d={band(44, 64, 2.5, 3.4)} fill={['#2f4a40', '#344f44', '#2b453b']} o={.5} />
      {/* moonlight behind the canopy, and its shaft falling into the clearing */}
      <At x="39%" y="9%"><Glaze r={58} fill="#c9d8bd" o={.24} f={p.glow} /></At>
      <Wash f={p.haze} d="M33 -4H47C52 18 58 42 66 66H50C44 44 38 20 33 -4Z" fill="#cfdcc2" o={.05} />
      <Wash f={p.haze} d="M38 -4H45C49 18 53 40 58 64H52C47 42 42 18 38 -4Z" fill="#e0e9d2" o={.04} />
      {FAR.map(([x, y, k, s], i) => (
        <At key={i} x={`${x}%`} y={`${y}%`}><g transform={`scale(${s})`}><Wash px f={p.fine} d={PINES[k]} fill={['#46625b', '#4c6861', '#415d56']} o={.85} /></g></At>
      ))}
      <Wash f={p.haze} d={band(55, 62.5, 1.4, .3)} fill="#a8c0b2" o={.14} />
      {MID.map(([x, y, k, s], i) => (
        <At key={i} x={`${x}%`} y={`${y}%`}><g transform={`scale(${s})`}>
          <Wash px f={p.fine} d={PINES[k]} fill={['#132824', '#162c28', '#112421']} rim={['#33544a', -.8, .2]} />
        </g></At>
      ))}
    </Canvas>

    <Canvas className="v2-forest-canvas">
      <Wash f={p.brush} fill={['#183028', '#1b342b', '#162c25']} rim={['#2d4c3d', 0, .5]}
        d={ridge([[0, 66.6], [9, 65.6], [20, 66.4], [32, 65.2], [44, 65.8], [55, 64.8], [66, 65.6], [78, 64.9], [90, 66.2], [100, 65.4]])} />
      {/* where the moonlight lands */}
      <At x="58%" y="67%"><g transform="scale(2.4 .5)"><Glaze r={36} fill="#9fbf9a" o={.3} f={p.glow} /></g></At>
      <Wash f={p.brush} fill={['#0f201b', '#11231e', '#0d1d18']} d={ridge([[0, 80], [16, 78.4], [34, 79.6], [55, 78.2], [76, 79.8], [100, 78.6]])} />
      {/* two old trunks framing the clearing, roots flaring into the moss */}
      <Wash f={p.brush} fill={['#0b1916', '#0d1c19', '#0a1614']} rim={['#2c4a3f', -.45, 0]}
        d="M3.4 -4H8.8C8.6 6 8.9 16 9.4 22C10.6 20.6 12.6 19.4 14.4 19.2C12.8 20.6 11 22.6 9.6 25.4C9.8 34 10 44 10.4 52C10.8 60 11.6 65 14.6 70.6C12 70.2 10.4 69.6 9 70.8C7.4 69.6 4.8 70 2.4 71.2C3.4 64 3.2 56 2.9 48C2.6 32 2.9 14 3.4 -4Z" />
      <Wash f={p.brush} fill={['#0b1916', '#0d1c19', '#0a1614']} rim={['#28443a', .45, 0]}
        d="M90.2 -4H95.2C95 10 95.2 26 95.6 40C95.9 52 96.4 62 99.6 71.8C97.6 71.4 95.8 71.2 94.4 72.2C92.8 71.2 90.4 71.4 87.8 72.6C89.2 66 89.6 58 89.6 50C89.5 30 89.8 12 90.2 -4Z" />
      <g filter={p.fine} stroke="#1f3830" strokeWidth="1.1" fill="none" opacity=".7" strokeLinecap="round">
        <Pct><path d="M5 8C5.2 16 4.8 26 5.4 34M7.4 30C7.2 38 7.6 46 7.2 54M4.4 44C4.2 50 4.6 58 4.2 64M8.2 4C8 10 8.4 14 8.2 18" vectorEffect="non-scaling-stroke" />
          <path d="M92 6C91.8 16 92.2 24 91.8 34M94 20C94.2 30 93.8 40 94.2 50M91.4 44C91.2 52 91.6 60 91.2 66" vectorEffect="non-scaling-stroke" /></Pct>
      </g>
      <Wash f={p.fine} d="M5.2 28.4C5.8 27 7.2 27 7.6 28.6S7.6 32.8 6.4 33 4.8 30 5.2 28.4Z" fill="#060e0c" o={.9} />
      {/* canopy: dark foliage closing over the top corners */}
      <Wash f={p.brush} fill={['#0d1d1b', '#10211e', '#0b1918']} rim={['#20372f', .4, .5]}
        d="M-4 -4H34C33 2 29 4 25 4.6C27 7 24 10 19 9.4C18 13 13 14.6 9 12.6C7 16 2 17.4 -4 15.6Z" />
      <Wash f={p.brush} fill={['#0d1d1b', '#10211e', '#0b1918']} rim={['#20372f', -.4, .5]}
        d="M68 -4H104V18.6C99 20 95 18.4 93.4 15.6C90 17.6 85 16.4 84 13C80 13.6 76 11 77 7.6C72.6 7.4 69.4 4 68 -4Z" />
      {/* mushrooms at the clearing's edge */}
      <At x="63.2%" y="68.2%">
        <Glaze r={12} fill="#e9a07c" o={.24} f={p.glow} />
        <g filter={p.fine} transform="scale(1.7)">
          <path d="M-2 0C-2.6 -6 -2.2 -12 -1.2 -16.4H4C4.4 -10 5 -5 5.2 0Z" fill="#e2d6c2" />
          <path d="M-10.5 -15C-9.4 -22.4 -2.4 -26.4 3 -26.4S16.4 -22.4 16.2 -15C10 -13 -4 -13 -10.5 -15Z" fill="#cf7f68" />
          <path d="M-10.5 -15C-9.4 -22.4 -2.4 -26.4 3 -26.4C-2 -24 -6 -20 -7.4 -14.6Z" fill="#e39a7e" opacity=".8" />
          <path d="M-15.6 0C-15.8 -4 -15 -7.6 -13.6 -10H-10.6C-10.8 -6 -10.6 -3 -10 0Z" fill="#d9ccb6" />
          <path d="M-20 -9C-19 -14 -15 -16.4 -12 -16.2S-5 -13.6 -5.6 -9.4C-9.6 -8.4 -16 -8.2 -20 -9Z" fill="#c4705c" />
          <path d="M12 0C12.2 -3 12.8 -5 13.6 -6.8H15.8C15.8 -4.6 16 -2 16.4 0Z" fill="#d9ccb6" />
          <path d="M10.4 -6.4C11 -9.4 13 -10.6 15 -10.6S19.4 -9.2 19.2 -6.4C16.6 -5.8 13 -5.8 10.4 -6.4Z" fill="#c97862" />
          <g fill="#f3e9da"><circle cx="-4" cy="-20" r="1.3" /><circle cx="3.6" cy="-23" r="1" /><circle cx="9" cy="-19" r="1.4" />
            <circle cx="-15" cy="-12.6" r=".9" /><circle cx="-10" cy="-13.8" r=".7" /><circle cx="15" cy="-8.6" r=".6" /></g>
        </g>
      </At>
    </Canvas>

    <Pin x="63.2%" y="calc(68.2% - 26px)" className="v2-forest-pin a v2-forest-breathe" style={anim(6.3, 2, { '--lo': .45 })}>
      <Halo k={2} sx={1.3} fill="#f0b08a" o={.1} n={4} />
    </Pin>
    <Pin x="calc(63.2% - 24px)" y="calc(68.2% - 17px)" className="v2-forest-pin a v2-forest-breathe" style={anim(9.1, 5, { '--lo': .3 })}>
      <Halo k={1.1} fill="#e8a07e" o={.08} n={3} />
    </Pin>

    {/* moonlight falling into the clearing, breathing */}
    <i className="v2-forest-shaft a v2-forest-breathe" style={anim(12.7, 3, { left: '40%', '--lo': .35 })} />
    <i className="v2-forest-shaft thin a v2-forest-breathe" style={anim(17.9, 11, { left: '44.5%', '--lo': .2 })} />
    {/* drifting mist: plain soft air, no edge to see */}
    <i className="v2-forest-mist a v2-forest-drift" style={anim(41, 13, { top: '57.5%', left: '2%', width: '58%', '--x': '30px' })} />
    <i className="v2-forest-mist a v2-forest-drift" style={anim(59, 33, { top: '61.5%', left: '44%', width: '54%', '--x': '-36px' })} />
    <i className="v2-forest-mist low a v2-forest-drift" style={anim(73, 51, { top: '67%', left: '14%', width: '50%', '--x': '24px' })} />

    {CLUMPS.map(([x, y, k, s, fl, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-forest-pin a v2-forest-sway" style={anim(d, d * i * .29, { '--r': `${r2(4 / s)}deg` })}>
        <g transform={`scale(${s * fl} ${s})`}>
          <path d={CLUMP[k]} fill={i % 3 ? '#26493a' : '#2e5644'} />
          <path d={CLUMP[k]} transform="translate(1.2 .4) scale(.86)" fill="#3c6a50" opacity=".55" />
        </g>
      </Pin>
    ))}

    {/* the owl: once in a long while its eyes open in the hollow, it blinks, and they close again */}
    <Pin x="6.4%" y="30.4%" className="v2-forest-pin a v2-forest-owl" style={anim(47, 30)}>
      <g fill="#e8d48e"><path d="M-2.6 -1C-2.6 -2.2 -1.6 -2.8 -.9 -2.4S.2 -.6 -.6 .2-2.6 .2-2.6 -1Z" /><path d="M.8 -1.2C.9 -2.4 2 -2.8 2.6 -2.2S3.2 -.4 2.4 .2 .7 0 .8 -1.2Z" /></g>
      <circle cx="-1.5" cy="-1.1" r=".5" fill="#1a1608" /><circle cx="1.8" cy="-1.1" r=".5" fill="#1a1608" />
    </Pin>

    {/* boughs hanging into the top corners, stirring */}
    <Pin x="100%" y="1%" className="v2-forest-pin a v2-forest-bough" style={anim(11.7, 4)}>
      <path d="M2 0C-30 8 -70 14 -118 30" stroke="#0e1f1c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M-40 10C-46 18 -50 28 -52 40L-47 34 -46 42 -42 33 -38 40 -38 28C-36 22 -36 16 -34 10ZM-82 20C-88 28 -92 38 -92 50L-88 43 -86 52 -83 42 -78 48 -79 36C-78 30 -77 24 -76 18ZM-112 28C-118 34 -122 42 -122 52L-118 47 -116 55 -113 46 -109 51 -110 41C-109 36 -108 32 -106 26Z"
        fill="#10221e" />
    </Pin>
    <Pin x="0%" y="3%" className="v2-forest-pin a v2-forest-bough b" style={anim(14.3, 9)}>
      <path d="M-2 0C24 6 56 10 96 22" stroke="#0e1f1c" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <path d="M38 8C44 16 47 26 48 36L43 31 43 39 39 30 35 37 35 26C34 20 34 14 33 8ZM74 16C80 24 83 33 84 44L80 38 79 46 76 37 72 43 72 31C72 26 71 21 70 15Z" fill="#10221e" />
    </Pin>

    {LEAVES.map(([x, y, dx, dy, d, dl], i) => (
      <Pin key={i} x={`${x}%`} y={`calc(${y}% + var(--sky))`} className="v2-forest-pin a v2-forest-leaf" style={anim(d, dl, { '--x': `${dx}px`, '--y': `${dy}px` })}>
        <path d="M-4 0C-3 -3 1 -4 4 -1C3 2 -1 3 -4 0Z" fill={i % 2 ? '#8a9a5a' : '#b0935a'} opacity=".85" />
      </Pin>
    ))}

    <div className="v2-forest-swarm">
      {FLIES.map(([x, y, s, w, dw, db, df], i) => (
        <Pin key={i} x={`${x}%`} y={`${y}%`} className={`v2-forest-pin a v2-forest-fly w${w}`}
          style={{ '--d': `${dw}s`, '--dl': `${-r2(dw * ((i * .37) % 1))}s`, '--d2': `${db}s`, '--dl2': `${-r2(db * ((i * .61) % 1))}s`, '--d3': `${df}s`, '--dl3': `${-r2(df * ((i * .23) % 1))}s` }}>
          <g transform={`scale(${s})`}>
            <path d={HALO} transform={`rotate(${i * 29}) scale(1.6)`} fill="#d2e477" opacity=".07" />
            <path d={HALO} transform={`rotate(${i * 47}) scale(.7)`} fill="#dcec88" opacity=".14" />
            <path d={HALO} transform={`rotate(${i * 61}) scale(.38)`} fill="#e6f29a" opacity=".45" />
            <path d={HALO} transform={`rotate(${i * 13}) scale(.26)`} fill="#fbfcd2" />
          </g>
        </Pin>
      ))}
    </div>
  </>
}
