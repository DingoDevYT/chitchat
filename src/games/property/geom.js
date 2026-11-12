// The board is an 11×11 ring: space i → [col, row]. Start is the bottom-right corner; play runs clockwise (left along the bottom).
export function cell(i) {
  if (i <= 10) return [10 - i, 10]
  if (i <= 20) return [0, 20 - i]
  if (i <= 30) return [i - 20, 0]
  return [10, i - 30]
}
// Corners are 1.6 tiles wide, like a real board: 2 corners + 9 tiles a side.
export const CORNER = 1.6, SIDE = 2 * CORNER + 9
export const along = c => (c === 0 ? CORNER / 2 : c === 10 ? SIDE - CORNER / 2 : CORNER + c - 0.5)
export const span = c => (c === 0 || c === 10 ? CORNER : 1)
