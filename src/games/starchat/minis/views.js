// Every Starchat minigame's view module, by id (the UI side of the registry; see Stage.jsx for what a view exports).
import * as catchView from './CatchView.jsx'
import * as bun from './BunView.jsx'
import * as count from './CountView.jsx'

export const VIEWS = { catch: catchView, bun, count }

// Lantern Lift, Teacup Tap, Owl Says
import * as liftView from './LiftView.jsx'
import * as tapView from './TapView.jsx'
import * as owlView from './OwlView.jsx'
Object.assign(VIEWS, { lift: liftView, tap: tapView, owl: owlView })
