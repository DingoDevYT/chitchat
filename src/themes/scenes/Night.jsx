import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'

// Starry night: a painted moon over three ranges of hills, a cabin with a lit window, hand-placed stars (a few
// twinkle, slowly), two moonlit wisps drifting past, and once in a long while a shooting star.

// x %, y %, radius px: clustered toward the corners, sparse over the middle where messages sit
const STARS = [
  [5, 13, 1.2], [10.5, 8, .8], [21, 6.5, 1], [8, 28, .7], [25.5, 15.5, .6], [18, 44, .8], [11, 34, .5], [27, 30, .5],
  [33, 10, .9], [40, 25, .5], [55, 16, .6], [38.5, 41, .6], [59, 34, .5], [29, 52, .6], [49, 47, .5], [44, 12, .4],
  [69.5, 25, .7], [92, 7, 1], [88.5, 41, .6], [74, 45, .8], [63, 53, .5], [95, 51, .7], [71, 9, .5], [99, 33, .5],
]
// x %, y %, size, tilt, twinkle duration
const TWINKLES = [[14.5, 21, 7, 8, 7.3], [65, 7.5, 5.5, -12, 9.1], [96.5, 23, 6.5, 4, 6.2], [48, 5, 4.5, 20, 11.4], [3.5, 38, 4, -6, 8.6]]

const glint = s => `M0 ${-s}Q${s * .14} ${-s * .14} ${s} 0Q${s * .14} ${s * .14} 0 ${s}Q${-s * .14} ${s * .14} ${-s} 0Q${-s * .14} ${-s * .14} 0 ${-s}Z`

// three hand-drawn pines (base centre at 0, 0), ragged and lopsided on purpose
const PINES = [
  'M1 -74L5 -60 2 -59 9 -46 5 -45 13 -31 7 -30 16 -15 9 -14 18 0H-17L-9 -14-15 -16-7 -30-12 -32-4 -45-8 -47-2 -59-4 -61Z',
  'M0 -52L6 -40 3 -39 11 -27 6 -26 15 -12 9 -11 19 0H-18L-10 -11-16 -13-7 -26-12 -27-4 -39-7 -41Z',
  'M-2 -90L3 -76 1 -75 7 -62 3 -61 10 -46 5 -45 13 -30 7 -29 16 -14 10 -13 19 0H-19L-11 -13-17 -15-8 -29-13 -31-5 -45-9 -47-3 -61-6 -63-1 -75-4 -77Z',
]
// x %, y %, pine, scale, lean
const TREES = [[3.5, 90.6, 2, 1, -2], [8, 89.6, 0, .85, 3], [11.5, 89.4, 1, .7, -1], [84.5, 83.6, 1, .62, 2], [93.5, 84.6, 0, 1.05, -3], [97.5, 85.6, 2, .8, 1]]

export default function Night() {
  const p = usePaint(4)
  return <>
    <Canvas p={p}>
      <Wash f={p.sky} d={band(-8, 26, 2.5, 0)} fill={['#0e132e', '#111736', '#0d112a']} o={.6} />
      <Wash f={p.sky} d={band(24, 52, 3, 1.4)} fill={['#2b3166', '#2e336a', '#272d60']} o={.45} />
      <Wash f={p.sky} d={band(50, 78, 2.5, 2.9)} fill={['#57507f', '#5e5584', '#514b7b']} o={.55} />
      <Wash f={p.haze} d="M-5 46C20 36 46 23 105 5V13C56 29 26 41 -5 55Z" fill="#b7b3e2" o={.08} />
      <g fill="#f3ecd8">{STARS.map(([x, y, r], i) =>
        <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill={i % 6 ? undefined : '#cdd5ff'} opacity={r2(.45 + Math.min(r, 1) * .45)} />)}</g>
    </Canvas>

    <Pin x="80%" y="calc(15% + var(--sky))" className="a pt-breathe" style={anim(15, 4, { '--lo': .7 })}>
      <Glaze r={44} fill="#e9dfb9" o={.32} f={p.glow} />
    </Pin>
    <Pin x="80%" y="calc(15% + var(--sky))">
      <Wash px f={p.fine} d="M-27 0A27 27 0 1 0 27 0A27 27 0 1 0 -27 0Z" fill={['#f2e6c6', '#efdfb8', '#f7eed6']} />
      <g filter={p.fine} fill="#cdbd96">
        <path d="M-14 -9C-8 -13 0 -10 -2 -4S-12 2 -15 -2Z" opacity=".5" />
        <path d="M4 4C10 2 14 7 11 12S2 14 2 9Z" opacity=".4" />
        <path d="M-6 10C-3 9 0 12 -2 14S-8 14 -6 10Z" opacity=".35" />
        <path d="M-27 0A27 27 0 0 0 4 27C-14 22 -24 10 -24 -6Z" opacity=".35" />
      </g>
    </Pin>

    <Pin x="64%" y="calc(20% + var(--sky))" className="a pt-drift" style={anim(83, 31, { '--x': '46px' })}>
      <Wash px f={p.haze} o={.75} rim={['#7d7aa6', 0, 3]} fill={['#44467a', '#4a4b80', '#3f4274']}
        d="M-130 4C-96 -6 -46 -9 6 -6S92 -3 136 3C84 9 22 10 -40 9S-108 8 -130 4Z" />
    </Pin>
    <Pin x="91%" y="calc(29% + var(--sky))" className="a pt-drift" style={anim(109, 70, { '--x': '-34px' })}>
      <Wash px f={p.haze} o={.6} rim={['#6d6b98', 0, 2.5]} fill={['#3e4074', '#44457a', '#3a3c6e']}
        d="M-80 2C-56 -5 -14 -7 28 -4S74 0 86 3C54 8 2 8 -42 6S-74 5 -80 2Z" />
    </Pin>

    {TWINKLES.map(([x, y, s, t, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="a pt-twinkle" style={anim(d, d * i * .37)}>
        <g transform={`rotate(${t})`} filter={p.fine}>
          <path d={glint(s)} fill="#f6efd9" opacity=".85" />
          <circle r={s * .22} fill="#fffaf0" />
        </g>
      </Pin>
    ))}
    <div className="ngt-shoot" style={{ left: '38%', top: 'calc(11% + var(--sky))' }}>
      <Pin className="a" style={anim(71, 52)}>
        <path d="M0 0L92 -1.4 96 0 92 1.4Z" fill="#f4eedb" opacity=".8" filter={p.fine} />
      </Pin>
    </div>

    <Canvas>
      <Wash f={p.haze} fill={['#3c3d6f', '#413f73', '#383a69']} d={ridge([[0, 72.5], [6, 70.5], [11, 71.8], [18, 68.6], [25, 71.2],
        [31, 69.8], [38, 72.4], [47, 70.2], [55, 71.6], [63, 69.2], [71, 71.4], [80, 70], [89, 72.2], [96, 70.8], [100, 71.6]], false)} />
      <Wash f={p.brush} fill={['#25275a', '#2a2a5e', '#222657']} rim={['#3a3d78', -.4, .6]}
        d={ridge([[0, 80], [9, 77.6], [21, 79.6], [33, 76.8], [45, 80.2], [57, 78.2], [69, 80.8], [83, 78.4], [100, 80.4]])} />
      <Wash f={p.brush} fill={['#17183b', '#1a1a40', '#151638']} rim={['#2b2c5c', -.35, .55]}
        d={ridge([[0, 90.5], [12, 88.6], [25, 90.4], [39, 89], [52, 87.6], [62, 84.8], [71, 82.6], [79, 82.1], [87, 83.4], [100, 86.2]])} />
      {TREES.map(([x, y, k, s, lean], i) => (
        <At key={i} x={`${x}%`} y={`${y}%`}>
          <g transform={`rotate(${lean}) scale(${s})`}><Wash px f={p.fine} d={PINES[k]} fill={['#121331', '#15163a', '#10112c']} /></g>
        </At>
      ))}
      <At x="75%" y="82.7%">
        <g filter={p.fine}>
          <path d="M12 -38V-49H18V-33Z" fill="#1c1b3e" />
          <path d="M-26 0V-24H22V0Z" fill="#1d1c42" />
          <path d="M-31 -22L-3 -44 27 -22Z" fill="#2a2957" />
          <path d="M-3 -44L27 -22H11Z" fill="#3b3a72" opacity=".85" />
          <path d="M-17 -17H-6V-7H-17Z" fill="#ffcf7a" />
          <path d="M5 0V-15H13V0Z" fill="#131333" />
        </g>
      </At>
    </Canvas>
    <Pin x="75%" y="82.7%" className="a pt-breathe" style={anim(9.7, 3, { '--lo': .55 })}>
      <g transform="translate(-11.5 -12)"><Glaze r={7} fill="#ffc96a" o={.55} f={p.glow} /></g>
    </Pin>
  </>
}

const r2 = n => Math.round(n * 100) / 100
