// A drawing as wobbly crayon SVG. With `replay` it draws itself stroke by stroke (the reveal), timed by ink used.
import { useId, useMemo } from 'react'
import { COLORS, SIZES, pathOf, unpackPts } from './ink.js'

export const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Doodle({ art, replay = false, dur = 1800, delay = 0, className = '', label }) {
  const fid = 'pcfw' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const strokes = useMemo(() => (art || []).map(s => ({ ...s, pts: unpackPts(s.p) || [] })).filter(s => s.pts.length), [art])
  const total = strokes.reduce((n, s) => n + s.pts.length / 2 + 4, 0) || 1
  const play = replay && !reduced()
  let at = delay
  return (
    <svg className={`pcf-doodle ${className}`} viewBox="0 0 256 256" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <filter id={fid} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>
      <g filter={`url(#${fid})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {strokes.map((s, i) => {
          const len = Math.max(60, (dur * (s.pts.length / 2 + 4)) / total)
          const style = play ? { '--d': `${Math.round(at)}ms`, '--l': `${Math.round(len)}ms` } : undefined
          at += len
          return <path key={i} d={pathOf(s.pts)} stroke={COLORS[s.c]} strokeWidth={SIZES[s.w]} opacity={s.c === 7 ? 1 : 0.94} pathLength={play ? 1 : undefined} className={play ? 'rp' : undefined} style={style} />
        })}
      </g>
    </svg>
  )
}
