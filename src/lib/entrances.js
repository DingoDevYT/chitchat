// Entrance and exit animations: a profile customisation (profiles.entrance_anim / exit_anim, 038_entrances).
// Played on someone's seat when they join or leave a stadium or DM call; everyone there sees the leaver's/joiner's pick.
// Pure: the list, validation and the join/leave bookkeeping. The look lives in styles/entrances.css, the parts in Entrances.jsx.

export const ENTRANCES = [
  { id: 'anvil', name: 'Anvil drop', in: 'Falls from the sky and slams down', out: 'Too heavy: sinks through the floor' },
  { id: 'ufo', name: 'UFO', in: 'Beamed down from a saucer', out: 'Beamed up and flown away' },
  { id: 'firework', name: 'Firework', in: 'Rockets up and pops into view', out: 'Fizzes, then shoots off with a bang' },
  { id: 'plane', name: 'Paper plane', in: 'Delivered by paper plane, unfolded', out: 'Folds up and glides off' },
  { id: 'molehill', name: 'Molehill', in: 'Pops up out of the ground', out: 'Dives back into the dirt' },
  { id: 'bubble', name: 'Bubble', in: 'Floats up in a bubble, pop', out: 'Bubbles up and drifts away' },
  { id: 'teleport', name: 'Teleport', in: 'Sparkles into being', out: 'Zapped up a beam of light' },
  { id: 'pie', name: 'Pie', in: 'Bursts out of a giant pie', out: 'Pie in the face, topples over' },
]
const IDS = new Set(ENTRANCES.map(e => e.id))

// Every animation fits in these, so a leaver's seat is held this long and a joiner's effects are cleared after it.
export const FX_MS = { in: 1500, out: 1400 }
// Ignore joins/leaves right after the stage opens (presence fills in) and mass changes (a presence resync).
export const SETTLE_MS = 2000
export const MAX_AT_ONCE = 4

// The saved value if it's one we know, else null (= the plain default: a soft rise in, a fade out).
export const normAnim = v => (typeof v === 'string' && IDS.has(v) ? v : null)
export const animOf = (profile, phase) => normAnim(phase === 'out' ? profile?.exit_anim : profile?.entrance_anim)

// One step of join/leave bookkeeping.
// prev: { order: ids in seat order (incl. leavers still animating), fx: { id: { phase: 'in'|'out', until, key } } }
// present: who's there now. armed: false while settling (changes just snap).
export function stepArrivals(prev, present, now, armed = true) {
  const here = new Set(present)
  const fx = {}
  for (const [id, f] of Object.entries(prev.fx)) if (f.until > now) fx[id] = f
  const came = present.filter(id => !prev.order.includes(id) || prev.fx[id]?.phase === 'out')
  const went = prev.order.filter(id => !here.has(id) && prev.fx[id]?.phase !== 'out')
  const play = armed && came.length + went.length <= MAX_AT_ONCE
  for (const id of came) if (play) fx[id] = { phase: 'in', until: now + FX_MS.in, key: now }; else delete fx[id]
  for (const id of went) if (play) fx[id] = { phase: 'out', until: now + FX_MS.out, key: now }
  const order = prev.order.filter(id => here.has(id) || fx[id]?.phase === 'out')
  for (const id of present) if (!order.includes(id)) order.push(id)
  return { order, fx }
}

// When the next effect ends (ms from now), or null if none are running.
export function nextEnd(fx, now) {
  const ends = Object.values(fx).map(f => f.until)
  return ends.length ? Math.max(0, Math.min(...ends) - now) : null
}
