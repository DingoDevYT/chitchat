import { scatter } from '../../lib/themes'
import { anim } from '../parts'

// Synthwave: a striped neon sun sinking behind wireframe mountains, palm silhouettes and a grid rushing toward you.
const stars = scatter(40, 61)

export default function Synthwave() {
  return <>
    {stars.map((p, i) => <i key={i} className={`syn-star${i % 4 ? '' : ' a tb-tw'}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 45}%`, opacity: .3 + p.r * .6, ...(i % 4 ? null : anim(2 + p.t * 3, p.r * 4)) }} />)}
    <div className="syn-sun-glow a tb-pulse" style={anim(5)} />
    <div className="syn-sun" />
    <svg className="syn-mtns" viewBox="0 0 1200 160" preserveAspectRatio="none">
      <path d="M0 160L0 90 90 40 170 100 260 30 360 120 430 160zM770 160L840 110 930 30 1010 90 1100 20 1200 80V160z" fill="#2a0f4a" stroke="#ff5fc8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path d="M90 40L120 160M260 30L240 160M930 30L960 160M1100 20L1080 160" stroke="#ff5fc855" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="syn-grid"><div className="syn-plane"><div className="syn-lines a" style={anim(1.4)} /></div></div>
    <div className="syn-horizon" />
    {[[5, 1, false], [91, .85, true]].map(([x, s, flip], i) => (
      <svg key={i} className="syn-palm" viewBox="0 0 80 140" style={{ left: `${x}%`, width: 80 * s, transform: flip ? 'scaleX(-1)' : undefined }}>
        <path d="M40 140C42 100 38 70 44 40" stroke="#12051f" strokeWidth="6" fill="none" strokeLinecap="round" />
        <g className="syn-fronds a" style={anim(3.5, i * 1.3)}>
          <path d="M44 40C30 30 14 34 2 46C18 38 32 38 44 42zM44 40C56 26 72 28 80 38C66 32 54 36 44 42zM44 40C40 22 28 12 14 10C28 18 38 28 42 42zM44 40C52 22 62 14 74 12C62 22 52 30 46 42zM44 40C34 44 24 56 22 70C30 56 38 48 46 42z" fill="#12051f" />
        </g>
      </svg>
    ))}
  </>
}
