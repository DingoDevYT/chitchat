import { scatter } from '../lib/themes'

// Building blocks for scenes. All motion is CSS (themes.css): transform/opacity only.
// Durations/delays go in --d/--dl and are scaled by --k (the Subtle setting slows everything down).

// A plane of particles that loops seamlessly: n items scattered over one tile, drawn twice, and the whole plane
// moves by one tile (one composited layer per plane instead of one animation per particle).
// dir: 'down' | 'up' | 'left' | 'right'. item(p, style, key) draws one particle; p = { x, y, r, t } in [0, 1).
export function Plane({ n, seed, dir = 'down', d, className = '', item }) {
  const v = dir === 'down' || dir === 'up'
  const pts = scatter(n, seed)
  return (
    <div className={`tb-plane tb-${dir} a ${className}`} style={{ '--d': d }}>
      {[0, 1].flatMap(k => pts.map((p, i) => item(p, v
        ? { left: `${p.x * 100}%`, top: `${(p.y + k) * 50}%` }
        : { left: `${(p.x + k) * 50}%`, top: `${p.y * 100}%` }, k + '-' + i)))}
    </div>
  )
}

// Seconds helper: tm(4) → '4s'. Delays are negative so a paused/reduced-motion frame is already mid-scene.
export const tm = s => `${s.toFixed(2)}s`

// Inline-style shorthand for an animated element.
export const anim = (d, dl = 0, extra) => ({ '--d': tm(d), '--dl': tm(-Math.abs(dl)), ...extra })

// A wave across a 2400-wide viewBox with n (even) bumps: the left half equals the right half, so sliding -50% loops.
// closeTo: fill down to this y (a body of water) instead of just the crest line.
export function wavePath(n, amp, y, closeTo) {
  const w = 2400 / n
  let d = `M0 ${y}`
  for (let i = 0; i < n; i++) d += ` q${w / 4} ${-amp} ${w / 2} 0 t${w / 2} 0`
  return closeTo == null ? d : d + ` V${closeTo} H0 Z`
}

// A 200%-wide strip holding one wave; give it tb-left/tb-right (+ anim()) to roll it sideways.
export function WaveStrip({ className = '', n = 8, amp = 6, h = 24, fill = 'none', stroke = 'none', sw = 2, style }) {
  return (
    <svg className={`tb-strip ${className}`} viewBox={`0 0 2400 ${h}`} preserveAspectRatio="none" style={style}>
      <path d={wavePath(n, amp, amp + sw, fill === 'none' ? null : h)} fill={fill} stroke={stroke} strokeWidth={sw}
        vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  )
}
