import { usePaint, Canvas, Wash, Glaze, At, Pin, ridge, band, anim } from '../paint'
import './night.css'

// Starry night, painted: a fat crescent moon over three ranges of hills, a loose milky way, and a cabin on a knoll
// whose lamp is the one warm note. Painted layers are static (filtered once); everything that moves is small and
// unfiltered: stars twinkle on held frames, wisps and mist drift, pines lean, smoke curls from the chimney, two moths
// circle the window, someone walks past the lamp now and then, and once in a long while a star falls.

const r2 = n => Math.round(n * 100) / 100
// closed smooth outline through hand-placed points
const loop = pts => {
  const n = pts.length, P = i => pts[(i + n) % n]
  let d = `M${P(0)}`
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), e = P(i + 2)
    d += `C${r2(b[0] + (c[0] - a[0]) / 6)} ${r2(b[1] + (c[1] - a[1]) / 6)} ${r2(c[0] - (e[0] - b[0]) / 6)} ${r2(c[1] - (e[1] - b[1]) / 6)} ${c}`
  }
  return d + 'Z'
}
// a lopsided halo blob (radius ~10), scaled per use
const HALO = loop([[0, -10], [7.6, -6.8], [10.4, .6], [7, 7.8], [-.8, 10.2], [-7.4, 7], [-10, -.4], [-6.6, -7.6]])
// four-point glint, taller than wide
const glint = (s, w = s * .72) => `M0 ${-s}Q${r2(s * .12)} ${r2(-s * .12)} ${r2(w)} 0Q${r2(s * .12)} ${r2(s * .12)} 0 ${s}Q${r2(-s * .12)} ${r2(s * .12)} ${r2(-w)} 0Q${r2(-s * .12)} ${r2(-s * .12)} 0 ${-s}Z`

// x %, y %, r px: a loose milky way from lower left up to the top centre, a few strays, the middle left calm
const STARS = [
  [2.5, 41, .6], [5.5, 37.5, .9], [7.8, 42.6, .5], [9.6, 34.2, .7], [12.4, 36.8, .5], [14.8, 30.6, 1.1], [16.6, 33.4, .5],
  [19, 28.4, .6], [21.6, 26.8, .8], [23.8, 30.2, .5], [25.6, 22.6, .6], [27.8, 25, .9], [30.8, 19.6, .5], [32.6, 22.4, .6],
  [34.8, 16.8, .8], [37.6, 14.6, .5], [39.8, 18.2, .6], [42.6, 10.8, .9], [45.4, 8.6, .5], [47.6, 12.4, .6], [51.8, 5.6, .7],
  [54.6, 8.2, .5], [18.2, 23.4, .4], [29.4, 28.6, .4], [36.4, 21.8, .4], [44.6, 15.6, .4], [11.4, 40.2, .4],
  [4.6, 11.8, .8], [11.8, 6.4, .5], [64.2, 31.4, .5], [71.6, 41.8, .6], [86.4, 5.6, .5], [93.2, 13.2, 1], [97.4, 31.6, .6],
  [89.6, 42.4, .5], [61.4, 21.2, .4], [58.2, 44.6, .4],
]
// x %, y %, r px, duration s: the ones that twinkle
const TWINKLES = [
  [9.2, 23.4, 1.1, 5.3], [20.4, 14.2, .9, 7.1], [30.2, 32.6, .8, 4.6], [37.4, 9.2, 1, 8.3], [49.6, 20.6, .8, 6.2],
  [58.6, 12.8, .9, 9.1], [66.4, 22.4, .8, 3.9], [88.2, 30.2, 1, 6.7], [95.4, 7.8, .8, 5.8], [83.2, 44.4, .7, 7.7],
  [13.6, 46.4, .7, 4.3], [42.2, 29.6, .7, 8.9], [24.6, 4.8, .8, 6.9], [4.2, 27.6, .9, 5.1],
]
// x %, y %, size, tilt, duration s: four-point glints, held frames
const GLINTS = [[16.6, 21, 7, 6, 7.3], [44.6, 5.2, 5.5, -10, 9.7], [62.4, 9.6, 5, 14, 11.3], [93.6, 24.2, 6.5, 3, 6.1],
  [26.2, 40.4, 4.5, -4, 12.9], [86.2, 51.4, 4, 9, 8.9]]

// three hand-drawn pines (base centre at 0, 0), ragged and lopsided on purpose
const PINES = [
  'M1 -74L5 -60 2 -59 9 -46 5 -45 13 -31 7 -30 16 -15 9 -14 18 0H-17L-9 -14-15 -16-7 -30-12 -32-4 -45-8 -47-2 -59-4 -61Z',
  'M0 -52L6 -40 3 -39 11 -27 6 -26 15 -12 9 -11 19 0H-18L-10 -11-16 -13-7 -26-12 -27-4 -39-7 -41Z',
  'M-2 -90L3 -76 1 -75 7 -62 3 -61 10 -46 5 -45 13 -30 7 -29 16 -14 10 -13 19 0H-19L-11 -13-17 -15-8 -29-13 -31-5 -45-9 -47-3 -61-6 -63-1 -75-4 -77Z',
]
const PINE_FILL = ['#13143a', '#17183f', '#111234']
// x %, y %, pine, scale, lean, sway duration (0 = still)
const TREES = [[2.6, 77.4, 2, 1.35, -2, 10.3], [6.6, 76.4, 0, 1.1, 2, 0], [9.9, 76, 1, .85, -1, 13.7], [13.1, 76.4, 1, .6, 1, 0],
  [80.2, 70.6, 1, .7, 2, 0], [83.6, 71.8, 0, 1, -2, 12.1], [90.4, 73.6, 2, 1.3, 1, 7.9], [96.6, 73.2, 0, .95, -2, 0]]

const Pine = ({ k, s, lean }) => <g transform={`rotate(${lean}) scale(${s})`}><Wash px d={PINES[k]} fill={PINE_FILL} /></g>

// cabin on the knoll (x %, y %); window centre in its px space
const CAB = ['70.6%', '68.4%'], CS = 1.3, WIN = [-11.5 * CS, -12 * CS]
const atCab = (dx, dy) => [`calc(${CAB[0]} + ${dx}px)`, `calc(${CAB[1]} + ${dy}px)`]

export default function Night() {
  const p = usePaint(4)
  return <>
    <Canvas p={p} className="v2-night-canvas">
      <Wash f={p.sky} d={band(-8, 30, 2.5, 0)} fill={['#10153a', '#13183e', '#0e1333']} o={.8} />
      <Wash f={p.sky} d={band(26, 56, 3, 1.4)} fill={['#262a5c', '#2a2d61', '#232756']} o={.55} />
      <Wash f={p.sky} d={band(50, 80, 2.5, 2.9)} fill={['#56507e', '#5d5683', '#4f4a78']} o={.5} />
      {/* the milky way: two soft lavender glazes on a diagonal */}
      <Wash f={p.haze} d="M-6 50C8 40 22 30 34 21S54 4 64 -6H50C42 4 30 13 20 21S2 36 -6 40Z" fill="#c2bce6" o={.09} />
      <Wash f={p.haze} d="M-6 45C10 36 20 28 31 20S48 6 56 -4H50C40 6 28 15 18 22S0 34 -6 38Z" fill="#ddd4f0" o={.06} />
      <g fill="#f1ead6">{STARS.map(([x, y, r], i) =>
        <circle key={i} cx={`${x}%`} cy={`${y}%`} fill={i % 7 ? undefined : '#cdd3f6'} r={r2(r + .25)} opacity={r2(.5 + Math.min(r, 1) * .45)} />)}</g>
    </Canvas>

    {/* moon: painted halo + fat crescent with the dark side faintly lit */}
    <Pin x="78%" y="calc(17% + var(--sky))" className="v2-night-pin">
      <Glaze r={40} fill="#e6dcba" o={.26} f={p.glow} />
    </Pin>
    <Pin x="78%" y="calc(17% + var(--sky))" className="v2-night-pin a v2-night-breathe" style={anim(13.7, 4, { '--lo': .35 })}>
      <path d={HALO} transform="scale(4.4)" fill="#efe4c4" opacity=".07" />
      <path d={HALO} transform="rotate(40) scale(6.6)" fill="#cfc7ea" opacity=".045" />
    </Pin>
    <Pin x="78%" y="calc(17% + var(--sky))" className="v2-night-pin a v2-night-breathe" style={anim(19.3, 11, { '--lo': .2 })}>
      <path d={HALO} transform="translate(3 -2) rotate(-70) scale(9.5)" fill="#bfb8e2" opacity=".035" />
    </Pin>
    <Pin x="78%" y="calc(17% + var(--sky))" className="v2-night-pin">
      <g filter={p.fine} transform="scale(1.22)">
        <path d="M0 -25C14 -25 25 -14 25 0S14 25 0 25-25 14-25 0-14 -25 0 -25Z" fill="#3a3c6c" opacity=".45" />
        <Wash px d="M1 -25.5C15 -24 25.5 -13 25 1S13.5 25 -1 25.5C9 18 13 9 12.5 -1S8 -19 1 -25.5Z" fill={['#f0e4c3', '#ecdcb6', '#f6edd4']} />
        <path d="M9 -10C13 -11 15 -7 13 -4S8 -3 8 -6Z" fill="#cfbe95" opacity=".55" />
        <path d="M15 6C18 5 20 8 18 11S13 11 14 8Z" fill="#cfbe95" opacity=".45" />
        <path d="M1 -25.5C9 -19 12.5 -9 12.5 -1S9 18 -1 25.5C4 20 7 10 7 0S5 -18 1 -25.5Z" fill="#d9c79c" opacity=".4" />
      </g>
    </Pin>

    {/* moonlit wisps drifting past */}
    <Pin x="58%" y="calc(24% + var(--sky))" className="v2-night-pin a v2-night-drift" style={anim(61, 23, { '--x': '38px' })}>
      <Wash px o={.42} rim={['#8682b0', 1.5, 2.4]} fill={['#3f4277', '#45477c', '#3b3e70']}
        d="M-132 8C-116 2 -100 1 -88 -3S-62 -10 -46 -7-20 -14 0 -11 28 -9 40 -6 70 -9 86 -4 112 1 136 7C110 12 64 12 22 11S-54 12 -92 11-124 11 -132 8Z" />
    </Pin>
    <Pin x="92%" y="calc(31% + var(--sky))" className="v2-night-pin a v2-night-drift" style={anim(83, 52, { '--x': '-30px' })}>
      <Wash px o={.36} rim={['#78759f', 1.2, 2]} fill={['#3b3d71', '#414377', '#37396b']}
        d="M-88 6C-74 1 -58 -1 -46 -5S-22 -9 -6 -6 18 -10 32 -6 64 -2 90 5C60 9 18 9 -22 9S-74 9 -88 6Z" />
    </Pin>
    <Pin x="21%" y="calc(13% + var(--sky))" className="v2-night-pin a v2-night-drift" style={anim(47, 9, { '--x': '24px' })}>
      <Wash px o={.32} rim={['#6e6c98', 1, 1.8]} fill={['#262a5c', '#2b2e61', '#232756']}
        d="M-72 5C-58 0 -44 -3 -30 -5S-6 -8 10 -5 40 -6 54 -2 70 3 74 5C50 8 10 9 -26 8S-64 7 -72 5Z" />
    </Pin>

    {TWINKLES.map(([x, y, r, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-night-pin a v2-night-tw" style={anim(d, d * i * .41)}>
        <circle r={r2(r * 2.8)} cx=".4" cy="-.3" fill="#d9d3f2" opacity=".12" />
        <circle r={r} fill="#f6efdb" />
      </Pin>
    ))}
    {GLINTS.map(([x, y, s, t, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-night-pin a v2-night-glint" style={anim(d, d * i * .37)}>
        <g transform={`rotate(${t})`}>
          <path d={glint(s)} fill="#f4ecd4" opacity=".8" />
          <path d={glint(s * .55)} transform="rotate(45)" fill="#f4ecd4" opacity=".35" />
          <circle r={r2(s * .2)} fill="#fffaf0" />
        </g>
      </Pin>
    ))}

    {/* falling stars: rare, quick, faint */}
    <div className="v2-night-fall" style={{ left: '46%', top: 'calc(9% + var(--sky))', transform: 'rotate(-17deg)' }}>
      <Pin className="v2-night-pin a v2-night-shoot" style={anim(43, 31)}>
        <path d="M0 0C24 -.9 60 -1.3 96 -.4L98 0 96 .4C60 1.3 24 .9 0 0Z" fill="#f4eedb" opacity=".8" />
      </Pin>
    </div>
    <div className="v2-night-fall" style={{ left: '22%', top: 'calc(29% + var(--sky))', transform: 'rotate(-31deg) scaleX(-1)' }}>
      <Pin className="v2-night-pin a v2-night-shoot" style={anim(71, 12)}>
        <path d="M0 0C18 -.6 42 -.9 66 -.3L68 0 66 .3C42 .9 18 .6 0 0Z" fill="#e8e2f6" opacity=".6" />
      </Pin>
    </div>

    <div className="v2-night-land">
      <Canvas className="v2-night-canvas">
        <Wash f={p.haze} fill={['#4c4d7d', '#525283', '#474877']} d={ridge([[0, 58.5], [5, 57.2], [9, 58.4], [15, 55.8], [19, 56.9],
          [24, 58.8], [31, 57.4], [36, 55.1], [40, 56.2], [46, 58.6], [53, 57.8], [59, 55.9], [63, 56.8], [70, 58.9], [77, 57.6],
          [83, 55.4], [88, 56.7], [94, 58.1], [100, 57.3]], false)} />
        <Wash f={p.haze} d={band(59.5, 64, 1.2, .7)} fill="#8d88b6" o={.14} />
        <Wash f={p.brush} fill={['#2d2e5d', '#323261', '#292a57']} rim={['#3f4078', -.4, .6]}
          d={ridge([[0, 65], [8, 63.4], [17, 64.8], [27, 62.6], [37, 64.9], [47, 63.8], [56, 65.6], [66, 63.2], [76, 64.4], [86, 62.8], [100, 64.6]])} />
        <Wash f={p.brush} fill={['#1b1c42', '#1f1f46', '#18193d']} rim={['#33356a', -.35, .55]}
          d={ridge([[0, 76], [10, 74.4], [20, 75.6], [31, 76.8], [42, 75.2], [52, 73.6], [60, 70.8], [66, 68.6], [71, 67.8],
            [77, 68.8], [84, 71.4], [92, 73.6], [100, 72.8]])} />
        <Wash f={p.brush} fill={['#121331', '#141535', '#10112d']} d={ridge([[0, 90], [20, 88.6], [45, 90.4], [70, 89], [100, 90.6]])} />
        {TREES.map(([x, y, k, s, lean, d], i) => !d &&
          <At key={i} x={`${x}%`} y={`${y}%`}><Pine k={k} s={s} lean={lean} /></At>)}
        <At x={CAB[0]} y={CAB[1]}>
          <g transform={`translate(${WIN[0]} 2)`}><Glaze r={13} fill="#f2bd6a" o={.22} f={p.glow} /></g>
          {/* a worn path winding up to the door */}
          <Wash px f={p.fine} o={.5} fill={['#2b2b5a', '#302f60', '#282856']}
            d="M14 1C20 8 18 16 4 26S-40 44 -70 58C-60 58 -46 57 -38 54C-14 42 18 30 26 18S24 5 20 1Z" />
          <g filter={p.fine} transform={`scale(${CS})`}>
            <path d="M12 -38V-49.5H18.5V-33Z" fill="#1c1b3f" />
            <path d="M-26 0L-25.4 -24H22.6L22 0Z" fill="#1e1d44" />
            <path d="M-31 -22L-3 -44.5 27.5 -21.5Z" fill="#2a2958" />
            <path d="M-3 -44.5L27.5 -21.5H12Z" fill="#45437a" opacity=".85" />
            <path d="M-31 -22L-3 -44.5-1 -42-27 -20.6Z" fill="#14143a" opacity=".7" />
            <path d="M-17 -17.5H-6V-6.6H-17.2Z" fill="#f2bd6a" />
            <path d="M-11.6 -17.5V-6.6M-17 -12H-6" stroke="#5a3f3a" strokeWidth=".9" opacity=".6" />
            <path d="M5 0V-15.4H13.2V0Z" fill="#131334" />
            <path d="M-17 -5.2C-14 -4.4-9 -4.6-5.4 -5.4" stroke="#f2bd6a" strokeWidth=".8" opacity=".35" fill="none" />
          </g>
        </At>
      </Canvas>

      <div className="v2-night-mist a v2-night-drift" style={anim(37, 14, { top: '57.5%', left: '6%', '--x': '26px' })}>
        <svg width="460" height="20" viewBox="0 0 460 20"><Wash px fill={['#9c97c4', '#a7a1cc', '#928ebc']} o={.16}
          d="M0 12C40 6 110 4 190 6S330 3 400 7 450 11 460 13C400 16 300 16 220 15S60 16 0 12Z" /></svg>
      </div>
      <div className="v2-night-mist a v2-night-drift" style={anim(53, 40, { top: '61.5%', left: '52%', '--x': '-34px' })}>
        <svg width="380" height="18" viewBox="0 0 380 18"><Wash px fill={['#8a85b3', '#958fbd', '#817cab']} o={.13}
          d="M0 10C30 5 90 3 160 5S280 4 340 7 372 9 380 11C330 14 250 14 180 13S50 14 0 10Z" /></svg>
      </div>

      {TREES.map(([x, y, k, s, lean, d], i) => !!d && (
        <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-night-pin a v2-night-sway" style={anim(d, d * .6 + i, { '--r': `${r2(.9 / s)}deg` })}>
          <Pine k={k} s={s} lean={lean} />
        </Pin>
      ))}

      {/* the lamp: held-frame flicker, a slow glow, and now and then someone crossing in front of it */}
      <Pin x={atCab(...WIN)[0]} y={atCab(...WIN)[1]} className="v2-night-pin a v2-night-breathe" style={anim(8.7, 2, { '--lo': .5 })}>
        <path d={HALO} transform="scale(1.6 1.3)" fill="#f2bd6a" opacity=".18" />
        <path d={HALO} transform="rotate(30) scale(2.8 2.2)" fill="#f2bd6a" opacity=".07" />
      </Pin>
      <Pin x={atCab(...WIN)[0]} y={atCab(...WIN)[1]} className="v2-night-pin a v2-night-lamp" style={anim(5.3, 1)}>
        <path d="M-5 -5.2H5.2V5H-5.2Z" transform={`scale(${CS})`} fill="#ffd690" opacity=".55" />
      </Pin>
      <Pin x={atCab(...WIN)[0]} y={atCab(...WIN)[1]} className="v2-night-pin a v2-night-pass" style={anim(37, 20)}>
        <path d="M-5.4 -5.4H5.4V5.2H-5.4Z" transform={`scale(${CS})`} fill="#2a2140" />
      </Pin>
      {[[3.7, 0, 1.1], [5.9, 2.3, .8]].map(([d, dl, r], i) => (
        <Pin key={i} x={atCab(WIN[0] + 3 - i * 7, WIN[1] - 6 + i * 3)[0]} y={atCab(WIN[0] + 3 - i * 7, WIN[1] - 6 + i * 3)[1]}
          className={`v2-night-pin a v2-night-moth m${i}`} style={anim(d, dl)}>
          <circle r={r} fill="#f6e2b4" opacity=".8" />
        </Pin>
      ))}
      {[[10.4, 0], [11.7, 3.1], [9.6, 5.6], [12.9, 8.8]].map(([d, dl], i) => (
        <Pin key={i} x={atCab(15.5 * CS, -50 * CS)[0]} y={atCab(15.5 * CS, -50 * CS)[1]} className="v2-night-pin a v2-night-puff" style={anim(d, dl)}>
          <path d={HALO} transform={`rotate(${i * 50}) scale(.7 .45)`} fill="#8d8ab5" opacity=".32" />
          <path d={HALO} transform={`translate(2 -1) rotate(${i * 50 + 90}) scale(.45 .3)`} fill="#a9a6cc" opacity=".22" />
        </Pin>
      ))}
    </div>
  </>
}
