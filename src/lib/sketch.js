// Hand-drawn wobble for clean icon paths (absolute M/L/Q/C/Z only, numbers in x y pairs).
// Deterministic per seed: points nudged, straight lines bowed into gentle curves, and closed
// shapes run a little past their start, like a pen closing a loop.
const rng = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

const r2 = n => Math.round(n * 100) / 100
const P = p => `${r2(p[0])} ${r2(p[1])}`

export function sketch(d, seed, amp = 0.4) {
  const rand = rng(seed), n = () => (rand() * 2 - 1) * amp
  const toks = d.match(/[a-z]|-?\d*\.?\d+/gi) || []
  let i = 0, cmd, cur, start, dir, out = ''
  const pt = () => {
    const x = +toks[i++], y = +toks[i++]
    if (Number.isNaN(x + y)) throw new Error(`sketch: expected an x y pair in "${d}"`)
    return [x + n(), y + n()]
  }
  const aim = p => { if (!dir) { const dx = p[0] - start[0], dy = p[1] - start[1], l = Math.hypot(dx, dy); if (l > 0.01) dir = [dx / l, dy / l] } }
  const line = p => {
    const dx = p[0] - cur[0], dy = p[1] - cur[1], l = Math.hypot(dx, dy) || 1
    const bow = (rand() * 2 - 1) * Math.min(l * 0.07, 0.9)
    out += `Q${P([(cur[0] + p[0]) / 2 - dy / l * bow, (cur[1] + p[1]) / 2 + dx / l * bow])} ${P(p)}`
    cur = p
  }
  while (i < toks.length) {
    if (/[a-z]/i.test(toks[i])) cmd = toks[i++] // lowercase (relative) commands fall through to the throw
    if (cmd === 'M') { cur = start = pt(); dir = null; out += `M${P(cur)}`; cmd = 'L' }
    else if (cmd === 'L') { const p = pt(); aim(p); line(p) }
    else if (cmd === 'Q') { const c = pt(), p = pt(); aim(c); out += `Q${P(c)} ${P(p)}`; cur = p }
    else if (cmd === 'C') { const a = pt(), b = pt(), p = pt(); aim(a); out += `C${P(a)} ${P(b)} ${P(p)}`; cur = p }
    else if (cmd === 'Z') {
      line(start)
      if (dir) { const ov = 0.7 + rand() * 0.6; out += `L${P([start[0] + dir[0] * ov + n(), start[1] + dir[1] * ov + n()])}` }
      cmd = null // numbers straight after Z are malformed: throw below instead of looping
    } else throw new Error(`sketch: unsupported path data near "${toks[i]}"`)
  }
  return out
}
