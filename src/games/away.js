// Leaving a game (the referee's `quit`). Pure, so the referee, the browser and the tests share it.
// Mid-round, a quitter keeps their seat and pid (every game's state is keyed by pids, so nothing is renamed) and is
// listed in `games.opts.away`, which is public: clients use it to stop treating them as seated, and the referee to
// play their turns with a Normal Chitbot (or let them time out in a game with `meta.noBots`). When the round ends the
// away seats are given up and the list cleared, so they can sit again next round.

export const awayOf = opts => (Array.isArray(opts?.away) ? opts.away.filter(x => typeof x === 'string') : [])
// The house rules alone: without the away list or the "Join next round" queue (src/games/night.js).
export function withoutAway(opts) {
  const { away, queue, ...rest } = opts || {} // eslint-disable-line no-unused-vars
  return rest
}

// Pids whose turns a Chitbot plays: away people, in games that allow Chitbots.
export const standIns = (meta, opts) => (meta?.noBots ? [] : awayOf(opts))

// What `quit` does for `uid`:
//   { kind: 'none' }                  not seated, or already away
//   { kind: 'close' }                 no other present person would be left seated: close the table
//   { kind: 'stand', seats, host? }   lobby or between rounds: same as `stand`
//   { kind: 'away', away, host? }     mid-round: stay seated as a stand-in, marked away
// host: the new host's id when the quitter was the host (the first other present person in seat order).
export function quitPlan({ status, seats, hostId, uid, away = [] }) {
  const mine = seats.find(s => s.user_id === uid)
  if (!mine || away.includes(uid)) return { kind: 'none' }
  const left = seats.filter(s => s.user_id && s.user_id !== uid && !away.includes(s.user_id)).sort((a, b) => a.seat - b.seat)
  if (!left.length) return { kind: 'close' }
  const host = hostId === uid ? left[0].user_id : undefined
  if (status !== 'playing') return { kind: 'stand', seats: seats.filter(s => s !== mine), host }
  return { kind: 'away', away: [...away, uid], host }
}

// The round is over: away people give up their seats and the list is cleared.
export function settleAway(seats, opts) {
  const away = awayOf(opts)
  return { seats: seats.filter(s => !away.includes(s.user_id)), opts: withoutAway(opts) }
}
