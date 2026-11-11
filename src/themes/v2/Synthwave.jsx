import { scatter } from '../../lib/themes'
import { usePaint, Canvas, Wash, Pin, At, ridge, band, anim } from '../paint'
import './synthwave.css'

// Synthwave, painted: a gouache sunset with a banded sun (the focal point, a little right of centre) sinking behind
// dusty violet ranges, its bands drifting down through the disc, over a hand-drawn grid gliding toward you. Lit cloud
// streaks drift, palms sway, the sun's light shimmers on the floor in held frames, and now and then three birds cross.
// Palette: indigo night, plum, dusty rose, coral, apricot, butter, aubergine ink.
const C = { night: '#2b2350', plum: '#5a2f63', rose: '#b4587a', coral: '#e08a6e', peach: '#f2c08a', butter: '#f6dfa4', ink: '#1e1430' }

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

// stars: x %, y %, radius, hand-placed and bunched toward the upper corners
const STARS = [[4, 6, 1.1], [9, 12, .7], [13.5, 4.5, .9], [7, 21, .6], [18, 9, .5], [22, 16, .7], [3, 30, .5], [27, 5, .6], [16, 26, .5],
  [33, 11, .5], [41, 4, .7], [47, 15, .4], [38, 22, .4], [61, 7, .5], [66, 14, .6], [72, 4, .9], [77, 11, .6], [83, 6.5, 1], [88, 15, .7],
  [93, 4, .8], [96, 19, .6], [80, 23, .5], [91, 28, .5], [70, 25, .4], [99, 10, .5]]
const TWINKLES = [[11, 8, 5.5, 8, 7.3], [86, 10, 6.5, -10, 9.1], [24, 22, 4, 14, 6.2], [69, 9, 4.5, 20, 11.4], [95, 24, 4, -6, 8.6]]
const glint = s => `M0 ${-s}Q${r2(s * .14)} ${r2(-s * .14)} ${s} 0Q${r2(s * .14)} ${r2(s * .14)} 0 ${s}Q${r2(-s * .14)} ${r2(s * .14)} ${-s} 0Q${r2(-s * .14)} ${r2(-s * .14)} 0 ${-s}Z`
// the sun's bands fade in from the middle of the disc down (a painted mask, not a hard cut)
const SUN_MASK = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='.22' stop-color='#fff' stop-opacity='0'/><stop offset='.6' stop-color='#fff'/></linearGradient></defs><circle cx='50' cy='50' r='49.6' fill='url(#g)'/></svg>")}")`
// a palm leaf pointing right from the crown, with ragged leaflets underneath
const LEAF = 'M0 0C18 -13 44 -15 72 2L67 1.5L65 6L60 1L56 7.5L51 .5L46 7L41 -.5L35 6L30 -1.5L24 4.5L18 -2L12 2.5Z'
const FRONDS = [[-172, .9], [-141, 1], [-104, .78], [-63, .85], [-27, 1], [7, .95], [39, .8], [152, .75], [188, .82]]
const BIRD = ['M-6 -1Q-3 -5.5 0 0Q3 -5.5 6 -1Q3 -3 0 1.2Q-3 -3 -6 -1Z', 'M-6 2.2Q-3 -.6 0 0Q3 -.6 6 2.2Q3 1.4 0 1.6Q-3 1.4 -6 2.2Z']
const FLOCK = [[0, 0, 1], [15, -6, .8], [27, 3, .7]]

const Crown = ({ p, c, rim }) => (
  <g filter={p.fine}>
    {FRONDS.map(([a, s], i) => {
      const left = a < -90 || a > 90
      return <g key={i} transform={`rotate(${a}) scale(${s} ${left ? -s : s})`}><Wash px d={LEAF} fill={c} rim={[rim, 0, 1]} /></g>
    })}
    <path d={blob(5, 300, 6, .2)} fill={c} />
  </g>
)

export default function Synthwave({ variant }) {
  const p = usePaint(5)
  const room = variant === 'room', k = variant === 'thumb' ? .55 : 1
  const H = room ? 64 : 60, R = room ? 84 : variant === 'thumb' ? 66 : 120
  const sunY = `calc(${H}% - ${r2(R * .5)}px)`
  const DISC = blob(R, 200, 12, .02)
  // palms: base x %, base y (CSS), trunk, crown offset px, scale, colours, sway duration
  const PALMS = [
    ['6%', '100%', 'M-9 0C-7 -100 4 -200 35 -298L42 -295C12 -198 6 -100 9 0Z', [38, -298], k, [C.ink, '#2a1a3a'], '#6e3550', 6.3],
    ['21%', '101%', 'M-7 0C-5 -60 -8 -120 -24 -170L-18 -172C-3 -120 1 -60 7 0Z', [-21, -171], k * .9, ['#22173a', '#2c1c40'], '#73395a', 8.1],
    ['90%', `${H + 9}%`, 'M-5 0C-4 -50 3 -100 14 -149L19 -148C8 -100 4 -50 5 0Z', [16, -149], k * .9, ['#4a2b52', '#54325a'], '#a5546a', 7.4],
  ]
  return <>
    <Canvas p={p} className="v2-syn-canvas">
      <Wash f={p.sky} d={band(-10, 22, 2.5, .2)} fill={['#231c45', '#271f4a', '#201a41']} o={.85} />
      <Wash f={p.sky} d={band(18, 38, 3, 1.5)} fill={['#3d2a5c', '#412d60', '#3a2858']} o={.8} />
      <Wash f={p.sky} d={band(34, H - 10, 2.5, 2.8)} fill={['#6e3a6a', '#733d6d', '#6a3767']} o={.75} />
      <Wash f={p.sky} d={band(H - 14, H - 3, 2, 3.9)} fill={['#b2587a', '#b85d7d', '#ad5477']} o={.72} />
      <Wash f={p.sky} d={band(H - 7, H + 2, 1.5, 5.1)} fill={['#de866d', '#e38c6f', '#d9816a']} o={.75} />
      <g fill="#f3e6d0">{STARS.map(([x, y, r], i) => <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} opacity={r2(.4 + r * .45)} fill={i % 5 ? undefined : '#d9d2f2'} />)}</g>
    </Canvas>

    {TWINKLES.map(([x, y, s, t, d], i) => (
      <Pin key={i} x={`${x}%`} y={`${y}%`} className="v2-syn-pin a v2-syn-tw" style={anim(d, d * i * .37)}>
        <g transform={`rotate(${t})`} filter={p.fine}><path d={glint(s)} fill="#f6ead2" opacity=".85" /><circle r={r2(s * .22)} fill="#fff8ec" /></g>
      </Pin>
    ))}
    <Pin x="22%" y="19%" className="v2-syn-pin a v2-syn-drift" style={anim(71.3, 30, { '--x': '34px' })}>
      <Wash px f={p.haze} o={.8} fill={['#3f2959', '#432c5d', '#3b2755']} rim={['#8f4f74', 0, -2]}
        d="M-140 4C-120 -2 -100 0 -86 -6C-64 -14 -40 -6 -24 -10C0 -15 30 -8 50 -10C80 -12 110 -4 140 3C110 8 76 6 44 9C10 11 -24 7 -60 9C-96 10 -124 8 -140 4Z" />
    </Pin>
    <Pin x="83%" y="31%" className="v2-syn-pin a v2-syn-drift" style={anim(57.7, 12, { '--x': '-26px' })}>
      <Wash px f={p.haze} o={.75} fill={['#5b3165', '#603569', '#562e60']} rim={['#c46a7a', 0, -2]}
        d="M-110 3C-92 -3 -76 -1 -62 -7C-44 -13 -26 -5 -10 -8C12 -12 36 -6 56 -7C80 -8 98 -2 110 3C86 7 60 6 34 8C6 10 -24 7 -54 8C-80 9 -100 7 -110 3Z" />
    </Pin>

    <div className="v2-syn-sun" style={{ left: '57%', top: sunY }}>
      <Pin x={0} y={0} className="v2-syn-pin a v2-syn-breathe" style={anim(9.7, 3, { '--lo': .55 })}>
        <g filter={p.glow}>
          <path d={blob(R * 1.75, 210, 9, .14, .8)} fill="#c8607a" opacity=".22" />
          <path d={blob(R * 1.22, 211, 9, .1)} fill="#f2a27d" opacity=".3" />
        </g>
      </Pin>
      <Pin x={0} y={0} className="v2-syn-pin">
        <defs><clipPath id={`${p.id}sun`}><path d={DISC} /></clipPath></defs>
        <g filter={p.fine}>
          <path d={DISC} fill="#f1b07f" />
          <g clipPath={`url(#${p.id}sun)`}>
            <path d={`M${-R - 4} ${-R - 4}H${R + 4}V${r2(-R * .2)}C${r2(R * .4)} ${r2(-R * .26)} ${r2(-R * .3)} ${r2(-R * .1)} ${-R - 4} ${r2(-R * .18)}Z`} fill={C.butter} opacity=".75" />
            <path d={`M${-R - 4} ${r2(-R * .5)}C${r2(-R * .2)} ${r2(-R * .56)} ${r2(R * .3)} ${r2(-R * .44)} ${R + 4} ${r2(-R * .52)}V${r2(-R * .3)}C${r2(R * .2)} ${r2(-R * .26)} ${r2(-R * .4)} ${r2(-R * .36)} ${-R - 4} ${r2(-R * .3)}Z`} fill="#fbecc0" opacity=".45" />
            <path d={`M${-R - 4} ${r2(R * .22)}C${r2(-R * .3)} ${r2(R * .16)} ${r2(R * .3)} ${r2(R * .3)} ${R + 4} ${r2(R * .2)}V${R + 4}H${-R - 4}Z`} fill="#e48a70" opacity=".6" />
          </g>
        </g>
      </Pin>
      <div className="v2-syn-bandclip" style={{ left: -R, top: -R, width: R * 2, height: R * 2, maskImage: SUN_MASK, WebkitMaskImage: SUN_MASK, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}>
        <div className="v2-syn-bands a" style={anim(7.3)}>
          <svg width="100%" height="100%">
            <defs><pattern id={`${p.id}bd`} patternUnits="userSpaceOnUse" width="240" height="44">
              <path d="M0 6C60 5 120 7.6 240 6V15.5C120 16.4 60 14.4 0 15.5Z" fill="#d97a6d" />
              <path d="M0 30C80 29.2 160 31 240 30V36.5C160 37.2 80 35.8 0 36.5Z" fill="#d97a6d" />
            </pattern></defs>
            <rect width="100%" height="100%" fill={`url(#${p.id}bd)`} filter={p.fine} />
          </svg>
        </div>
      </div>
    </div>
    <Pin x="61%" y={`calc(${H}% - ${r2(R * .9)}px)`} className="v2-syn-pin a v2-syn-drift" style={anim(47.9, 21, { '--x': '22px' })}>
      <Wash px f={p.haze} o={.85} fill={['#7b3f6a', '#81446e', '#763b66']} rim={['#f2a882', 0, -2.4]}
        d="M-175 4C-150 -2 -128 0 -110 -6C-86 -13 -60 -5 -40 -9C-14 -14 20 -7 44 -9C80 -12 120 -5 175 3C140 8 104 7 70 9C30 11 -10 7 -50 9C-96 11 -140 8 -175 4Z" />
    </Pin>

    <Canvas className="v2-syn-canvas">
      <Wash f={p.haze} o={.9} fill={['#8b5678', '#90597b', '#865274']}
        d={ridge([[0, H - 9], [5, H - 12], [9, H - 10.5], [14, H - 15], [19, H - 11], [24, H - 13.5], [29, H - 8], [34, H - 6], [40, H - 4],
          [46, H - 2.5], [52, H - 1.4], [64, H - 1.4], [70, H - 4.5], [75, H - 9], [80, H - 7.5], [85, H - 12.5], [90, H - 10], [95, H - 14], [100, H - 11]], true, H + .3)} />
      <Wash f={p.brush} fill={['#40244a', '#44274e', '#3c2246']} rim={['#c96d70', -.35, .3]}
        d={ridge([[0, H - 6], [4, H - 8.5], [8, H - 7], [13, H - 11], [17, H - 7.5], [22, H - 5], [27, H - 6.5], [32, H - 3.5], [38, H - 1.2], [44, H]], false, H + .3)} />
      <Wash f={p.brush} fill={['#3d2247', '#41254b', '#391f43']} rim={['#d0766f', .35, .3]}
        d={ridge([[56, H], [62, H - 1.5], [68, H - 4], [73, H - 3], [78, H - 7], [83, H - 5.5], [88, H - 9.5], [93, H - 7], [97, H - 8], [100, H - 6]], false, H + .3)} />
      <Wash f={p.fine} d={`M-3 ${H}H103V103H-3Z`} fill={['#2a1838', '#2e1a3c', '#271634']} o={.96} />
      <Wash f={p.haze} d={band(H + 22, 108, 2, 2.2)} fill="#1c1029" o={.5} />
    </Canvas>

    <div className="v2-syn-floor" style={{ top: `${H}%` }}>
      <div className="v2-syn-plane"><div className="v2-syn-lines a" style={anim(2.6)}>
        <svg width="100%" height="100%">
          <defs><pattern id={`${p.id}gr`} patternUnits="userSpaceOnUse" width="192" height="84">
            <g fill="none" strokeLinecap="round">
              <path d="M0 81C48 79.8 96 82.6 144 80.6S180 81.4 192 81M30 0C31.5 28 28.5 56 30 84M95 0C93.8 30 96.4 58 95 84M158 0C159 26 157 60 158 84" stroke="#e3897a" strokeWidth="2.6" opacity=".75" />
              <path d="M0 80C60 79 120 81 192 80M29 0C30 30 28 60 29 84M157 0C158 30 156 60 157 84" stroke="#f6b991" strokeWidth="1" opacity=".45" />
            </g>
          </pattern></defs>
          <rect width="100%" height="100%" fill={`url(#${p.id}gr)`} filter={p.fine} />
        </svg>
      </div></div>
    </div>

    <svg className="v2-syn-canvas a v2-syn-breathe" width="100%" height="100%" style={anim(13.1, 5, { '--lo': .4 })}>
      <defs><linearGradient id={`${p.id}fl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8657a" stopOpacity=".5" /><stop offset=".8" stopColor="#c8657a" stopOpacity="0" /></linearGradient></defs>
      <Wash f={p.haze} d={band(H + .5, 106, 2, 1.2)} fill={`url(#${p.id}fl)`} o={.6} />
    </svg>
    <Canvas className="v2-syn-canvas">
      <defs><linearGradient id={`${p.id}hz`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e6966f" stopOpacity=".9" /><stop offset=".3" stopColor="#e18f6f" stopOpacity=".55" /><stop offset="1" stopColor="#d9816a" stopOpacity="0" />
      </linearGradient></defs>
      <Wash f={p.haze} d={band(H - 1.2, H + 13, 1.2, .6)} fill={`url(#${p.id}hz)`} o={.6} />
      <Wash f={p.haze} d={band(H + 29, 110, 2, 3.4)} fill="#1a0f27" o={.55} />
      <Wash f={p.fine} d={`M-3 ${H - .25}C30 ${H - .4} 70 ${H - .1} 103 ${H - .3}L103 ${H + .35}C70 ${H + .45} 30 ${H + .2} -3 ${H + .4}Z`} fill="#f6c99a" o={.55} />
    </Canvas>
    {[0, 1, 2].map(f => (
      <Pin key={f} x="57%" y={`${H}%`} className={`v2-syn-pin a v2-syn-h${f}`} style={anim(2.7)}>
        <g filter={p.fine}>{scatter(7, 400 + f).map((q, j) => {
          const y = r2(5 + j * j * 2.6 * k + q.y * 2), w = r2(R * (.8 - j * .09) * (.75 + q.r * .5)), x = r2((q.x - .5) * 12), t = r2(2.2 + j * .5)
          return <path key={j} d={`M${r2(x - w)} ${y}C${r2(x - w / 2)} ${r2(y - t)} ${r2(x + w / 2)} ${r2(y - t * .8)} ${r2(x + w)} ${y}C${r2(x + w / 2)} ${r2(y + t)} ${r2(x - w / 2)} ${r2(y + t * .9)} ${r2(x - w)} ${y}Z`}
            fill={j < 2 ? C.butter : C.peach} opacity={r2(.6 - j * .065)} />
        })}</g>
      </Pin>
    ))}

    <div className="v2-syn-lane a" style={{ top: '21%', ...anim(49.3, 8) }}>
      {BIRD.map((b, f) => (
        <svg key={f} className={`v2-syn-pin a v2-syn-w${f ? 'b' : 'a'}`} style={anim(.83)}>
          <g fill="#2c1d40" opacity=".75" filter={p.fine}>{FLOCK.map(([x, y, s], i) => <path key={i} d={b} transform={`translate(${x} ${y}) scale(${s})`} />)}</g>
        </svg>
      ))}
    </div>

    <Canvas className="v2-syn-canvas">
      {PALMS.map(([x, y, trunk, , s, [c, t], rim], i) => (
        <At key={i} x={x} y={y}><g transform={`scale(${s})`}><Wash px f={p.fine} d={trunk} fill={[c, t, c]} rim={[rim, -1.4, 0]} /></g></At>
      ))}
    </Canvas>
    {PALMS.map(([x, y, , [cx, cy], s, [c], rim, d], i) => (
      <Pin key={i} x={`calc(${x} + ${r2(cx * s)}px)`} y={`calc(${y} - ${r2(-cy * s)}px)`} className="v2-syn-pin a v2-syn-sway" style={anim(d, d * i * .41, { '--r': `${2.4 - i * .4}deg` })}>
        <g transform={`scale(${s})`}><Crown p={p} c={c} rim={rim} /></g>
      </Pin>
    ))}
  </>
}
