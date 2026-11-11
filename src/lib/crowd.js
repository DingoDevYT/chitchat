// Stadium crowd seating. You stand in the bottom-right corner (meW wide); everyone else fills rows from there to the left.
// Each extra row stands further back, half a seat over, so people peek out between the heads in front.
// x: px from the crowd's right edge to the seat's right edge; row: 0 = front.
export const STEP = 0.82 // horizontal spacing as a share of seat size (neighbours overlap a little)
export const ROW = 0.6 // how far up each row behind stands, as a share of seat size
export const NAME_H = 22 // name pill height under/over a seat

export function crowdLayout(n, width, s, meW = 0) {
  const step = s * STEP, seats = []
  for (let row = 0; seats.length < n; row++) {
    const start = row ? (row % 2) * step / 2 : meW
    const fit = Math.max(1, Math.floor((width - start - s) / step) + 1)
    for (let k = 0; k < fit && seats.length < n; k++) seats.push({ x: Math.round(start + k * step), row })
  }
  return seats
}

// Largest seat size whose crowd fits in maxH; the crowd's height and the "floor" band under the screen
// (the screen ends 2/3 of the way up the front row's faces, so only their top third stands in front of it).
export function fitCrowd(n, width, maxH, hasMe, sizes = [116, 100, 88, 76, 64, 56]) {
  for (const s of sizes) {
    const me = hasMe ? Math.round(s * 1.2) : 0
    const seats = crowdLayout(n, width, s, me && me * 0.9)
    const rows = seats.length ? seats.at(-1).row + 1 : 0
    const h = Math.max(me, rows ? (rows - 1) * s * ROW + s + NAME_H : 0)
    if (h <= maxH || s === sizes.at(-1)) return { s, me, seats, height: h, floor: Math.round(NAME_H + s * 2 / 3) }
  }
}
