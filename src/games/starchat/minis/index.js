// Every Starchat minigame's pure module, by id (the rules side of the registry; the edge function bundles these).
// A new minigame: its module here, its name and numbers in data.js MINIGAMES, and its view in views.js.
import * as catchMini from './catch.js'
import * as bun from './bun.js'
import * as count from './count.js'

export const MINIS = { catch: catchMini, bun, count }

// Lantern Lift, Teacup Tap, Owl Says
import * as lift from './lift.js'
import * as tap from './tap.js'
import * as owl from './owl.js'
Object.assign(MINIS, { lift, tap, owl })

// Three Lanterns, Last Lantern Standing, Pond Skippers
import * as lanterns from './lanterns.js'
import * as standing from './standing.js'
import * as pond from './pond.js'
Object.assign(MINIS, { lanterns, standing, pond })
