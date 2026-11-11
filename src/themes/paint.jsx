import { useId } from 'react'

// Soft-gouache kit shared by every scene, so the whole set reads as one painter's work: one brush (dry-brush edges +
// streaky pigment), one fine brush for small things, one haze (lost edges for distance), one glow (painted halos),
// one sky wash. Shapes are laid as 2–3 offset translucent washes of related tints instead of one flat fill.
// Big forms are drawn in percent space (<Pct>: x, y in 0–100 of the backdrop) and stretch with it; objects (trees,
// cabins, clouds…) are px-space art placed at a point (<At> inside a canvas, <Pin> as their own element), so they keep
// their shape at any size. Filters always run in px space, so the brush never stretches.
// Static layers are composited once (.pt-canvas in themes.css); only small separate roots animate (transform/opacity).

export function usePaint(seed = 3) {
  const id = 'pt' + useId().replace(/\W/g, '')
  const u = k => `url(#${id}${k})`
  return { id, seed, brush: u('b'), fine: u('f'), haze: u('h'), glow: u('g'), sky: u('s') }
}

// low-frequency multi-octave noise pushes the outline around (sRGB so the push stays centred)
const rough = (f, k, o, seed) => [
  <feTurbulence key="t" type="fractalNoise" baseFrequency={f} numOctaves={o} seed={seed} result="n" />,
  <feDisplacementMap key="d" in="SourceGraphic" in2="n" scale={k} xChannelSelector="R" yChannelSelector="G" result="d" />,
]
// dry brush: stretched streak noise thins the pigment along the stroke direction
const streak = (f, seed, a, b) => [
  <feTurbulence key="st" type="fractalNoise" baseFrequency={f} numOctaves="2" seed={seed} result="s" />,
  <feColorMatrix key="sm" in="s" values={`0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${a} 0 0 0 ${b}`} result="m" />,
  <feComposite key="sc" in="d" in2="m" operator="in" />,
]

function Defs({ p }) {
  const s = p.seed, cs = 'sRGB'
  return (
    <defs>
      <filter id={p.id + 'b'} x="-3%" y="-8%" width="106%" height="116%" colorInterpolationFilters={cs}>
        {rough('.013 .032', 15, 3, s)}{streak('.0035 .07', s + 7, 1.25, .32)}<feGaussianBlur stdDeviation=".7" />
      </filter>
      <filter id={p.id + 'f'} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters={cs}>
        {rough('.05', 5, 2, s + 1)}<feGaussianBlur stdDeviation=".5" />
      </filter>
      <filter id={p.id + 'h'} x="-8%" y="-30%" width="116%" height="160%" colorInterpolationFilters={cs}>
        {rough('.009 .024', 26, 2, s + 2)}<feGaussianBlur stdDeviation="2.8" />
      </filter>
      <filter id={p.id + 'g'} x="-70%" y="-70%" width="240%" height="240%" colorInterpolationFilters={cs}>
        {rough('.022', 18, 2, s + 3)}<feGaussianBlur stdDeviation="9" />
      </filter>
      <filter id={p.id + 's'} x="-4%" y="-25%" width="108%" height="150%" colorInterpolationFilters={cs}>
        {rough('.003 .014', 50, 2, s + 4)}{streak('.0018 .045', s + 9, 1.1, .3)}<feGaussianBlur stdDeviation="4" />
      </filter>
    </defs>
  )
}

// A static painting filling the backdrop; the first canvas of a scene carries the filter defs (pass p).
export const Canvas = ({ p, className = '', children }) => (
  <svg className={`pt-canvas ${className}`} width="100%" height="100%">{p && <Defs p={p} />}{children}</svg>
)

// Percent space: children draw in a 100 × 100 box stretched over the whole canvas.
export const Pct = ({ children }) => (
  <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">{children}</svg>
)

// Inside a canvas: px-space art whose (0, 0) sits at (x, y) of the backdrop.
export const At = ({ x = '50%', y = '0%', children }) => <svg x={x} y={y} overflow="visible">{children}</svg>

// Its own element (so it can animate): px-space art drawn around (0, 0), placed at CSS lengths x, y.
export const Pin = ({ x, y, className = '', style, children }) => (
  <svg className={`pt-pin ${className}`} style={{ left: x, top: y, ...style }}>{children}</svg>
)

// A shape laid as three offset washes (fill: one colour or [base, tint, tint]). rim: [colour, dx, dy] paints a lit edge:
// the rim colour goes down first and the washes are shifted by (dx, dy), so it peeks out on the side facing the light.
// px: d is px-space art (offsets scaled up to match).
const LAYERS = [[0, 0, .86], [-.5, .45, .5], [.6, -.3, .42]]
export function Wash({ d, fill, f, o, rim, px }) {
  const c = [].concat(fill), k = px ? 5 : 1
  const [rc, rx = 0, ry = 0] = rim || []
  const body = <>
    {rim && <path d={d} fill={rc} />}
    {LAYERS.map(([dx, dy, a], i) => <path key={i} d={d} fill={c[i % c.length]} opacity={a}
      transform={`translate(${r2(dx * k + rx)} ${r2(dy * k + ry)})`} />)}
  </>
  return <g filter={f} opacity={o}>{px ? body : <Pct>{body}</Pct>}</g>
}

// A painted halo: a few concentric glazes, each larger and fainter and slightly off-centre (never a clean gradient).
export const Glaze = ({ r, fill, o = .5, n = 3, f }) => (
  <g filter={f}>{Array.from({ length: n }, (_, i) =>
    <circle key={i} cx={r2(i * r * .07)} cy={r2(-i * r * .05)} r={r2(r * (1 + i * .8))} fill={fill} opacity={r2(o / (1 + i * 1.4))} />)}</g>
)

const r2 = n => Math.round(n * 100) / 100

// Inline style for an animated element: duration d (s) and a negative delay dl, so a frozen frame is already mid-scene.
export const anim = (d, dl = 0, extra) => ({ '--d': `${d}s`, '--dl': `${-Math.abs(dl)}s`, ...extra })

// Silhouette through hand-placed [x, y] points (percent space), closed down past the bottom edge.
// smooth: Catmull-Rom curves (hills); otherwise straight runs (peaks, rooftops).
export function ridge(pts, smooth = true, base = 102) {
  const p = [[-3, pts[0][1]], ...pts, [103, pts.at(-1)[1]]]
  let d = `M-3 ${base}L${p[0]}`
  for (let i = 1; i < p.length; i++) {
    if (!smooth) { d += `L${p[i]}`; continue }
    const a = p[i - 2] || p[i - 1], b = p[i - 1], c = p[i], e = p[i + 1] || c
    d += `C${r2(b[0] + (c[0] - a[0]) / 6)} ${r2(b[1] + (c[1] - a[1]) / 6)} ${r2(c[0] - (e[0] - b[0]) / 6)} ${r2(c[1] - (e[1] - b[1]) / 6)} ${c}`
  }
  return d + `L103 ${base}Z`
}

// A soft horizontal band of sky (percent space) between y0 and y1 whose edges wander by w; t shifts the wander.
export function band(y0, y1, w = 2, t = 0) {
  const xs = [-4, 18, 41, 63, 84, 104], wob = (i, k) => r2(Math.sin(i * 1.7 + t + k) * w)
  const top = xs.map((x, i) => [x, r2(y0 + wob(i, 0))]), bot = xs.map((x, i) => [x, r2(y1 + wob(i, 2.1))]).reverse()
  const curve = pts => pts.slice(1).map((q, i) => `S${r2((pts[i][0] + q[0]) / 2)} ${r2((pts[i][1] + q[1]) / 2 + wob(i, 4) / 2)} ${q}`).join('')
  return `M${top[0]}${curve(top)}L${bot[0]}${curve(bot)}Z`
}

// Soft gouache wash for the "Soft gradient" theme: two broad strokes of the app's accent and leaf colours.
export function GradientWash() {
  const p = usePaint(11)
  return (
    <Canvas p={p}>
      <g style={{ color: 'var(--accent)' }} opacity=".2"><Wash f={p.sky} fill="currentColor" d="M-6 -4H72C60 6 48 10 40 20S20 40 -6 46Z" /></g>
      <g style={{ color: 'var(--mint)' }} opacity=".16"><Wash f={p.sky} fill="currentColor" d="M106 104H30C44 96 56 92 64 82S86 66 106 60Z" /></g>
      <g style={{ color: 'var(--accent)' }} opacity=".08"><Wash f={p.haze} fill="currentColor" d={band(52, 64, 3, 1)} /></g>
    </Canvas>
  )
}
