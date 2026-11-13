// Every game's seat limits and name, without its rules: the referee of the game now on the table checks the NEXT game of
// a game night with this (src/games/night.js), so no function has to bundle another game's rules. meta.test.js keeps
// it equal to each rules module's own meta. hidden: no longer listed (High Card), so it can't be queued.
export const META = {
  snack: { name: 'Card Rush', min: 2, max: 10 },
  property: { name: 'Property Tycoon', min: 2, max: 6 },
  poker: { name: 'Poker', min: 2, max: 8 },
  isle: { name: 'Island Builders', min: 2, max: 4 },
  chitchen: { name: 'Impostor', min: 4, max: 8 },
  flyer: { name: 'Jetpack Dash', min: 1, max: 8, noBots: true },
  pillow: { name: 'Drawing Duel', min: 2, max: 8 },
  starchat: { name: 'Star Party', min: 2, max: 8 },
  highcard: { name: 'High Card', min: 2, max: 10, hidden: true },
}

// The games a host may queue for a night, in picker order.
export const QUEUEABLE = Object.keys(META).filter(id => !META[id].hidden)
