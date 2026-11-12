// Proximity voice: a game (Midnight Chitchen) can shape how loud each person in the call sounds to you.
// Off unless a game sets a rule, so normal voice is untouched: no filter in the chain, no timer running.
// The rule: id → { gain: 0..1, lp: low-pass Hz }. Voice.jsx calls attach() once per connection.
let rule = null
const subs = new Set()
export function setProximity(fn) { rule = fn; for (const s of subs) s() }

// peers: Map(id → { vol: GainNode }), master: where p.vol normally connects, base(id): the person's usual volume.
export function attach(ctx, peers, master, base) {
  let timer = null
  const apply = () => {
    for (const [id, p] of peers) {
      if (!p.lp) { // insert a low-pass after this person's volume, only while the game runs
        p.lp = ctx.createBiquadFilter(); p.lp.type = 'lowpass'; p.lp.frequency.value = 20000
        p.vol.disconnect(); p.vol.connect(p.lp); p.lp.connect(master)
      }
      const r = rule(id) || { gain: 1, lp: 20000 }
      p.vol.gain.setTargetAtTime(base(id) * r.gain, ctx.currentTime, 0.08)
      p.lp.frequency.setTargetAtTime(r.lp, ctx.currentTime, 0.1)
    }
  }
  const restore = () => {
    for (const p of peers.values()) {
      if (!p.lp) continue
      p.vol.disconnect(); p.lp.disconnect(); p.vol.connect(master); p.lp = null
    }
    for (const [id, p] of peers) p.vol.gain.value = base(id)
  }
  const sync = () => {
    if (rule && !timer) { apply(); timer = setInterval(apply, 150) }
    else if (!rule && timer) { clearInterval(timer); timer = null; restore() }
  }
  subs.add(sync); sync()
  return () => { subs.delete(sync); if (timer) clearInterval(timer); timer = null }
}
