import { usePaint, Canvas, Wash, Glaze, Pin, At, ridge, band, anim } from '../paint'
import { scatter } from '../../lib/themes'
import './snow.css'

// Snowfall, gouache: a pale low sun through snow cloud, far blue ranges, a cabin on the hill with a lit window and
// chimney smoke, three snow-laden pines nodding in the wind, snow falling in three depths and in gusty streams, and
// now and then a clump sliding off a bough or a veil of powder lifting off the crest.

// palette: periwinkle sky, warm peach light, cool blue shadow, blue-green pine, umber wood, one amber window
const C = {
  sky: '#8396b8', skyHi: '#a9b6cf', low: '#d9d3d7', peach: '#efd8c3', far: '#a7b3ca', snow: '#f3efe9', shade: '#c4cee0',
  pine: '#3f5862', pineHi: '#5a737b', wood: '#86604f', amber: '#f3c46c',
}

// flakes gather in loose streams (gusts) rather than spreading evenly
const STREAMS = [.05, .17, .3, .52, .69, .83, .95]
const flakes = (n, seed, spread) => scatter(n, seed).map((q, i) =>
  ({ x: q.r < .3 ? q.x : STREAMS[i % STREAMS.length] + (q.x - .5) * spread, y: q.y, s: q.t, r: q.r }))
// near flakes, one by one: x %, size px, fall s, flutter s, flutter px
const NEAR = [[3, 9, 13.1, 3.7, 12], [9.5, 6, 17.9, 4.3, 9], [21, 11, 11.3, 2.9, 15], [33, 7, 19.7, 5.1, 10], [46, 8, 15.7, 3.3, 14],
  [57, 6, 21.1, 4.9, 8], [63.5, 10, 12.7, 3.9, 13], [74, 7, 18.3, 4.1, 11], [81, 12, 10.9, 3.1, 16], [88.5, 6, 16.3, 5.3, 9], [94, 9, 14.3, 3.5, 12], [99, 7, 20.3, 4.7, 10]]
const NEAR_ROOM = [0, 2, 8, 10, 11]
const flake = 'M-1 -4C2 -4.2 4 -2 4 .3S2 4 -.8 4 -4 2 -4 -.6 -3 -4 -1 -4Z'

// one hand-drawn pine (base at 0, 0): ragged tiers, and snow lying on each tier's sunlit side
const PINE = 'M0 -170L4 -156 2 -155 9 -140 4 -139 13 -122 6 -121 18 -102 9 -101 23 -80 12 -79 28 -56 15 -55 33 -30 18 -29 36 -4 4 -2 4 0H-4V-2L-35 -5-17 -30-31 -32-14 -55-27 -57-11 -79-22 -81-8 -101-17 -103-5 -121-12 -123-3 -139-8 -141-2 -155-4 -157Z'
const PINE_SNOW = 'M0 -170L3 -160-1 -157-3 -161ZM-3 -139C-1 -142 3 -141 6 -137L1 -136-4 -134-8 -137ZM-5 -121C-2 -125 5 -123 9 -119L2 -117-6 -116-12 -119ZM-8 -101C-3 -105 6 -103 12 -99L3 -97-8 -96-17 -99ZM-11 -79C-5 -84 8 -82 16 -77L4 -75-10 -74-22 -77ZM-14 -55C-6 -60 10 -58 20 -53L5 -51-12 -50-27 -53ZM-17 -30C-8 -35 12 -33 24 -28L6 -26-15 -25-31 -28Z'
const PINE_SHADE = 'M2 -155L9 -140 4 -139 13 -122 6 -121 18 -102 9 -101 23 -80 12 -79 28 -56 15 -55 33 -30 18 -29 36 -4 4 -2C8 -40 6 -100 2 -155Z'
// near pines: x %, y % (stadium space), scale, lean deg, sway deg, sway s
const PINES = [[5, 83.5, 1.18, -1.5, .7, 11.3], [11.5, 81.6, .86, 1, .9, 9.1], [16.2, 83.2, .62, -.5, 1.1, 7.7]]
// tiny far pines along the ridges: x %, y %, scale
const FAR_PINES = [[24, 57.6, .9], [25.6, 57.3, 1.2], [27, 57.5, .8], [28.8, 57.1, 1.1], [30.4, 56.8, .7], [31.5, 56.9, 1],
  [36, 56.3, .8], [37.3, 56.1, 1.1], [85, 58.9, 1], [86.6, 58.6, .8], [88, 58.7, 1.3], [89.6, 58.9, .9], [91, 59.2, 1.1], [93.8, 59.5, .8]]
const farPine = 'M0 -17L3 -10 1.6 -10 5 -3 1 -2.6V0H-1V-2.6L-5 -3-1.6 -10-3 -10Z'

export default function Snow({ variant = 'room' }) {
  const p = usePaint(8)
  const room = variant === 'room'
  // authored with the land starting near 50%; rooms push it down so the middle band stays quiet sky
  const Y = y => +(!room || y <= 30 ? y : y <= 50 ? 30 + (y - 30) * 1.5 : 60 + (y - 50) * .8).toFixed(2)
  const pc = y => `${Y(y)}%`
  const ps = room ? .62 : 1, cs = room ? .8 : 1.35
  return (
    <div className={`v2-snow-root v2-snow-${variant}`}>
      <Canvas p={p}>
        <defs>
          <linearGradient id={p.id + 'bg'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.sky} /><stop offset={Y(30) / 100} stopColor={C.skyHi} /><stop offset={Y(52) / 100} stopColor={C.low} /><stop offset="1" stopColor={C.snow} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${p.id}bg)`} />
        <Wash f={p.sky} d={band(-8, Y(16), 2.5, .3)} fill={['#7b8fb3', '#8396b8', '#7689ad']} o={.6} />
        <Wash f={p.sky} d={band(Y(14), Y(34), 3, 1.6)} fill={[C.skyHi, '#afbbd2', '#a2b0ca']} o={.5} />
        <Wash f={p.sky} d={band(Y(30), Y(50), 2.5, 2.7)} fill={['#cdc8d3', '#d6d0d6', '#c6c4d2']} o={.55} />
        {/* the low sun warms the haze on the left */}
        <Wash f={p.sky} d={`M-6 ${Y(18)}C12 ${Y(14)} 36 ${Y(17)} 50 ${Y(26)}S46 ${Y(46)} 22 ${Y(48)}L-6 ${Y(46)}Z`} fill={C.peach} o={.28} />
        {/* far ranges: light and cool, sunlit snow faces turned left */}
        <Wash f={p.haze} fill={[C.far, '#adb8ce', '#a0adc5']} d={ridge([[0, Y(47)], [5, Y(42.5)], [9, Y(44)], [15, Y(37.5)], [19, Y(39.5)], [25, Y(35.6)], [31, Y(40.2)], [37, Y(43.6)], [44, Y(42.2)],
          [52, Y(45.6)], [61, Y(44.4)], [70, Y(47.6)], [80, Y(46.6)], [90, Y(48.8)], [100, Y(48)]], false)} />
        <Wash f={p.haze} fill={["#9aa8c1", "#a0adc5", "#93a2bc"]} d={ridge([[50, Y(52)], [58, Y(48.4)], [64, Y(49.4)], [72, Y(45.4)], [78, Y(47.2)], [86, Y(45.9)], [93, Y(48.4)], [100, Y(47.6)]], false)} />
        <g filter={p.fine} fill="#e8e2e1" opacity=".7">
          <path d={`M12.4 ${Y(40)}L15 ${Y(37.5)} 16.6 ${Y(38.6)} 15.4 ${Y(39.2)} 14.6 ${Y(40.8)} 13.6 ${Y(39.8)}Z`} />
          <path d={`M22 ${Y(38.2)}L25 ${Y(35.6)} 27.4 ${Y(37.4)} 25.8 ${Y(37.8)} 24.8 ${Y(39.6)} 23.4 ${Y(38.6)}Z`} />
          <path d={`M3.4 ${Y(44)}L5 ${Y(42.5)} 6.4 ${Y(43.4)} 5.2 ${Y(43.8)} 4.6 ${Y(44.8)}Z`} />
          <path d={`M70 ${Y(46.8)}L72 ${Y(45.4)} 73.4 ${Y(46.3)} 72.4 ${Y(46.6)} 71.6 ${Y(47.6)}Z`} />
        </g>
        <Wash f={p.haze} d={band(Y(47), Y(53), 1, .8)} fill="#dcd8de" o={.6} />
        {/* mid hills with a dark fringe of far pines */}
        <Wash f={p.brush} fill={['#e3e3e9', '#e8e7eb', '#dcdde6']} rim={['#f1ebe5', .3, .4]}
          d={ridge([[0, Y(58)], [10, Y(56.4)], [22, Y(57.6)], [34, Y(55.8)], [46, Y(57.2)], [58, Y(59)], [68, Y(61.6)], [78, Y(60.6)], [88, Y(58.4)], [100, Y(59.4)]])} />
        <Wash f={p.haze} d={band(Y(60), Y(66), .8, 1.9)} fill={C.shade} o={.55} />
        <g filter={p.fine}>{FAR_PINES.map(([x, y, s], i) =>
          <At key={i} x={`${x}%`} y={pc(y)}><path d={farPine} fill={i % 3 ? '#7f90a6' : '#8a9aae'} transform={`scale(${s * ps})`} /></At>)}</g>
        {/* the cabin's hill, warm on top, blue in its hollows */}
        <Wash f={p.brush} fill={[C.snow, '#f5f1eb', '#ebe8e4']} rim={['#fbf5ec', .3, .4]}
          d={ridge([[0, Y(74)], [14, Y(71)], [30, Y(69.5)], [46, Y(68.8)], [58, Y(66.8)], [66, Y(65)], [74, Y(64.6)], [84, Y(66.2)], [94, Y(68.6)], [100, Y(69.6)]])} />
        <Wash f={p.haze} fill={C.shade} o={.6}
          d={`M76 ${Y(68)}C84 ${Y(67.4)} 94 ${Y(70.4)} 104 ${Y(71)}V${Y(76)}C92 ${Y(75)} 82 ${Y(72)} 76 ${Y(68)}Z`} />
        <Wash f={p.haze} fill={C.shade} o={.45} d={`M-4 ${Y(76)}C10 ${Y(73.4)} 26 ${Y(73)} 40 ${Y(74.2)}S30 ${Y(79)} 10 ${Y(80)}L-4 ${Y(79)}Z`} />
        {/* small pines by the cabin, and a fence wandering down toward it */}
        {[[79.6, 65.9, .5], [83, 66.7, .66], [85.8, 67.5, .42]].map(([x, y, s], i) => (
          <At key={i} x={`${x}%`} y={pc(y)}><g transform={`scale(${s * ps})`}>
            <Wash px f={p.fine} d={PINE} fill={['#4b636d', '#526b74', '#465e68']} />
            <path d={PINE_SNOW} fill="#eef0f1" filter={p.fine} opacity=".9" />
          </g></At>))}
        <g filter={p.fine}>{[[60.6, 69.4], [56.4, 70.4], [52, 71.5], [47.4, 72.8], [42.6, 74.4]].map(([x, y], i) => (
          <At key={i} x={`${x}%`} y={pc(y)}><g transform={`scale(${cs})`}>
            <path d={`M-1.4 0L-1 -${13 - i}H1.3L1.6 0Z`} fill="#6e5448" />
            <path d={`M-2.2 -${13 - i}C-1.4 -${15.4 - i} 1.6 -${15.4 - i} 2.4 -${13 - i}Z`} fill="#f4f0ea" />
          </g></At>))}</g>
        {/* cabin: lit gable end facing the sun, shaded side, snow on the roof */}
        <At x="68%" y={pc(65.6)}>
          <g filter={p.fine} transform={`scale(${cs})`}>
            <path d="M8 0V-25H42V-2Z" fill="#6c5045" />
            <path d="M-27 0V-26L-9 -42 9 -26V0Z" fill="#8f6853" />
            <path d="M-9 -44L9 -27 45 -25 29 -42Z" fill="#cfd8e5" />
            <path d="M-31 -24L-9 -47 11 -25 7 -24-9 -40-27 -23Z" fill="#f5f1ea" />
            <path d="M24 -37V-51H31V-34Z" fill="#664a40" />
            <path d="M22.6 -51C25 -54.4 30 -54.4 32.4 -51Z" fill="#f5f1ea" />
            <path d="M-16 -18H-3V-7H-16Z" fill={C.amber} />
            <path d="M-9.5 -18V-7M-16 -12.5H-3" stroke="#6c5045" strokeWidth="1.2" />
            <path d="M19 0V-15H26V-1Z" fill="#54403a" />
            <path d="M-36 1C-26 -4 -10 -3 0 -2S30 -5 48 -1V3H-36Z" fill="#eeeff1" />
          </g>
        </At>
        {/* foreground drift, dry-brushed blue shadows under its lips */}
        <Wash f={p.brush} fill={['#f6f3ee', '#f8f5f0', '#efede9']} rim={['#fcf8f1', .3, .4]}
          d={ridge([[0, Y(80)], [8, Y(78)], [18, Y(80.5)], [30, Y(84)], [48, Y(86)], [66, Y(85)], [82, Y(83)], [100, Y(84.5)]])} />
        <Wash f={p.brush} fill={C.shade} o={.55} d={`M20 ${Y(82)}C30 ${Y(85.4)} 44 ${Y(87.4)} 60 ${Y(87)}C46 ${Y(88.6)} 32 ${Y(88)} 20 ${Y(82)}Z`} />
        <Wash f={p.brush} fill={C.shade} o={.45} d={`M64 ${Y(86.4)}C74 ${Y(85.6)} 86 ${Y(84.4)} 98 ${Y(85.6)}C86 ${Y(86.8)} 76 ${Y(87.6)} 64 ${Y(86.4)}Z`} />
        <Wash f={p.brush} fill={C.shade} o={.35} d={`M8 ${Y(93)}C20 ${Y(91.6)} 36 ${Y(92)} 52 ${Y(93.4)}C36 ${Y(94.2)} 20 ${Y(94.4)} 8 ${Y(93)}Z`} />
      </Canvas>

      {/* the sun behind snow cloud: no edge, just a warm breath of light */}
      <Pin x="21%" y="calc(21% + var(--sky))" className="a v2-snow-breathe" style={anim(15.1, 6, { '--lo': .6 })}>
        <Glaze r={46} fill="#f6e2cc" o={.55} f={p.glow} />
      </Pin>
      <Pin x="21%" y="calc(21% + var(--sky))">
        <g filter={p.haze}><circle r="15" fill="#f9efe2" opacity=".85" /></g>
      </Pin>
      {/* slow snow-cloud banks */}
      <Pin x="58%" y="calc(5% + var(--sky) * .5)" className="a v2-snow-drift" style={anim(89, 20, { '--x': '46px' })}>
        <Wash px f={p.haze} o={.55} fill={['#7d90b2', '#8698b8', '#7689ab']} rim={['#b4bfd5', 0, -3]}
          d="M-260 6C-210 -10 -150 -16 -90 -12S10 -20 80 -16 200 -12 270 4C210 16 120 20 20 18S-180 18 -260 6Z" />
      </Pin>
      <Pin x="88%" y="calc(17% + var(--sky) * .5)" className="a v2-snow-drift" style={anim(113, 71, { '--x': '-34px' })}>
        <Wash px f={p.haze} o={.4} fill={['#97a6c2', '#9dabc6', '#909fbd']}
          d="M-170 4C-130 -6 -70 -10 -10 -8S110 -6 170 2C120 10 50 12 -20 11S-140 10 -170 4Z" />
      </Pin>

      {/* far snow, then gusty mid snow, each plane leaning on its own slow wind */}
      <div className="v2-snow-sway a v2-snow-drift" style={anim(13.1, 2, { '--x': '18px' })}>
        <div className="v2-snow-plane a" style={anim(47)}>
          {[0, 1].flatMap(k => flakes(room ? 60 : 92, 3, .14).map((f, i) =>
            <i key={k + '-' + i} style={{ left: `${(f.x * 100).toFixed(2)}%`, top: `${((f.y + k) * 50).toFixed(2)}%`, width: 1.8 + f.s * 2.4, height: 1.6 + f.s * 2.2, opacity: .55 + f.r * .45 }} />))}
        </div>
      </div>

      {/* chimney smoke: soft puffs, never in step */}
      {[[0, 7.9, '26px'], [2.3, 7.9, '34px'], [4.1, 7.9, '22px'], [6.4, 7.9, '30px']].map(([dl, d, x], i) => (
        <Pin key={i} x={`calc(68% + ${27.5 * cs}px)`} y={`calc(${pc(65.6)} - ${52 * cs}px)`} className="a v2-snow-puff" style={anim(d, dl, { '--x': x })}>
          <g filter={p.haze}><path d="M-7 1C-8 -4 -3 -8 1 -7S8 -3 7 1 2 7 -2 6 -6 4 -7 1Z" fill="#e3e6ec" /></g>
        </Pin>
      ))}
      {/* the window's warm spill, flickering in held steps */}
      <Pin x={`calc(68% - ${9.5 * cs}px)`} y={`calc(${pc(65.6)} - ${12.5 * cs}px)`} className="a v2-snow-flicker" style={anim(6.7, 2)}>
        <Glaze r={9 * cs} fill="#f6c873" o={.6} f={p.glow} />
      </Pin>

      {/* a veil of powder lifting off the crest now and then */}
      <Pin x="34%" y={pc(68.4)} className="a v2-snow-gust" style={anim(29, 11)}>
        <Wash px f={p.haze} o={.9} fill={['#fbf8f3', '#f6f4f0', '#ffffff']} d="M-90 2C-60 -6 -20 -10 20 -8S70 -4 96 -1C60 4 20 6 -20 5S-76 6 -90 2Z" />
      </Pin>

      <div className="v2-snow-sway a v2-snow-drift" style={anim(9.7, 5, { '--x': '26px' })}>
        <div className="v2-snow-plane a" style={anim(29)}>
          {[0, 1].flatMap(k => flakes(room ? 28 : 46, 7, .1).map((f, i) =>
            <i key={k + '-' + i} style={{ left: `${(f.x * 100).toFixed(2)}%`, top: `${((f.y + k) * 50).toFixed(2)}%`, width: 3.6 + f.s * 3.2, height: 3.2 + f.s * 3, opacity: .6 + f.r * .4, transform: `rotate(${(f.r * 90).toFixed(0)}deg)` }} />))}
        </div>
      </div>

      {/* near pines, each nodding on its own; one holds a clump of snow that slides off once in a while */}
      {PINES.map(([x, y, s, lean, r, d], i) => (
        <div key={i} className="v2-snow-tree a v2-snow-sway-r" style={{ left: `${x}%`, top: pc(y), ...anim(d, d * i * .61, { '--r': `${r}deg` }) }}>
          <Pin>
            <g transform={`rotate(${lean}) scale(${s * ps})`}>
              <Wash px f={p.fine} d={PINE} fill={[C.pine, '#435c66', '#3a525c']} />
              <path d={PINE_SHADE} fill="#2f444e" opacity=".45" filter={p.fine} />
              <path d={PINE_SNOW} fill="#f3f1ee" filter={p.fine} />
              <path d={PINE_SNOW} fill={C.shade} opacity=".35" transform="translate(1.5 1.6)" />
            </g>
          </Pin>
          {i === 0 && (
            <Pin x={`${-14 * s * ps}px`} y={`${-56 * s * ps}px`} className="a v2-snow-clump" style={anim(41, 17)}>
              <path d="M-7 1C-7 -3 -3 -5 0 -4S7 -3 7 0 3 3 0 3-6 3-7 1Z" fill="#f6f4f0" transform={`scale(${s * ps})`} filter={p.fine} />
            </Pin>
          )}
        </div>
      ))}

      {/* near flakes, big and soft, each falling and fluttering at its own pace */}
      {NEAR.filter((_, i) => !room || NEAR_ROOM.includes(i)).map(([x, s, d, fd, fx], i) => (
        <div key={i} className="v2-snow-col a" style={{ left: `${x}%`, ...anim(d, d * ((i * .37) % 1)) }}>
          <Pin className="a v2-snow-drift" style={anim(fd, i * 1.3, { '--x': `${fx}px` })}>
            <g transform={`scale(${s / 8})`}>
              <path d={flake} fill="#ffffff" opacity=".35" transform="scale(1.6)" />
              <path d={flake} fill="#fbfaf7" opacity=".9" />
            </g>
          </Pin>
        </div>
      ))}
    </div>
  )
}
