// Starchat: every name, number and bit of flavour lives here, so the festival can be renamed or rebalanced without
// touching the mechanics in rules.js. Plain data only (no imports): the `game` edge function bundles this file.
//
// Lantern Hollow during the Wishfall Festival: a 36-space loop round a moonlit pond, walked one way, plus the
// one-way Firefly Bridge straight across the pond from the west bank to the Tea House on the east bank.

export const NAME = 'Starchat'
export const BOARD_NAME = 'Lantern Hollow'

// Space kinds. `k` is what rules.js switches on; the rest is for the UI and the news log.
export const KINDS = {
  glow: { name: 'Glow', color: '#f2c14e', text: 'Collect coins.' },
  drizzle: { name: 'Drizzle', color: '#7fa7d9', text: 'Lose coins.' },
  firefly: { name: 'Firefly', color: '#8fcf7a', text: 'A free item (coins if your satchel is full).' },
  bramble: { name: 'Bramble', color: '#c0704a', text: 'Draw a mishap card.' },
  stall: { name: 'Lantern Stall', color: '#ef8b74', host: 'Marzipan', text: 'Shop for items. Opens when you pass it.' },
  tea: { name: 'Tea House', color: '#5fb3a8', host: 'Juniper', text: 'Spin the event wheel.' },
  owl: { name: 'Owl Post', color: '#b49ad8', host: 'Inkwell', text: 'Duels arrive later in the festival.' },
  post: { name: 'Wishing Post', color: '#efe2c4', host: 'Chit', text: 'Where the star lands. An unlit post gives a few coins.' },
}

// The board graph. Each space: k (kind), next (the spaces you can step to; two = a fork), optional name.
// A fork entry `{ to, toll, even }` is a gated path: pay `toll` coins, only open on even rounds when `even`.
const L = (k, extra) => ({ k, ...extra })
export const SPACES = [
  L('glow', { name: 'Festival Gate' }), // 0: start
  L('glow'), L('drizzle'), L('firefly'),
  L('post', { name: 'Hilltop Post' }), // 4
  L('glow'), L('stall', { name: "Marzipan's Stall" }), L('glow'),
  L('post', { name: 'East Bank Post' }), // 8
  L('tea', { name: "Juniper's Tea House" }), // 9: where the bridge comes ashore
  L('glow'), L('drizzle'),
  L('post', { name: 'Willow Post' }), // 12
  L('bramble'), L('glow'), L('owl', { name: "Inkwell's Owl Post" }), L('firefly'), L('glow'), L('drizzle'), L('glow'),
  L('post', { name: 'Observatory Post' }), // 20
  L('glow'), L('stall', { name: 'Lantern Stall' }), L('firefly'), L('drizzle'),
  L('post', { name: 'West Bank Post' }), // 25
  L('glow', { name: 'Bridge Gate' }), // 26: the fork onto the Firefly Bridge
  L('bramble'),
  L('post', { name: 'Lily Post' }), // 28
  L('glow'), L('owl', { name: 'Owl Post' }), L('glow'), L('firefly'), L('drizzle'), L('glow'), L('glow'),
  // 36-40: the Firefly Bridge, one way across the pond
  L('glow', { name: 'Firefly Bridge', bridge: true }), L('firefly', { bridge: true }), L('glow', { bridge: true }),
  L('drizzle', { bridge: true }), L('glow', { bridge: true }),
]
export const LOOP = 36
export const START = 0
export const BRIDGE = { from: 26, to: 36, toll: 10, even: true, name: 'Firefly Bridge' }
for (let i = 0; i < LOOP; i++) SPACES[i].next = [(i + 1) % LOOP]
for (let i = 36; i < 40; i++) SPACES[i].next = [i + 1]
SPACES[40].next = [9]
SPACES[BRIDGE.from].next = [27, BRIDGE.to]

// The star can only ever sit on one of these.
export const POSTS = [4, 8, 12, 20, 25, 28]
export const FIRST_POST = 20

export const START_COINS = 10
export const STAR = { price: 20, cheap: 10, dear: 30, rising: 5, idleRounds: 3, notWithin: 8 }
export const COINS = { glow: 3, drizzle: 3, post: 2, fireflyFull: 5, trap: 10, teaPot: 5, lastPlace: 10 }
export const SATCHEL = 3
export const ROUNDS = { quick: 8, standard: 12, festival: 16, lastLanterns: 3 }
export const MINI_PRIZES = [10, 5, 2] // 1st, 2nd, 3rd

// Items. `use`: what rules.js does with it. `from`: the first round the stall stocks it. `max`: most you can hold.
export const ITEMS = {
  jar: { name: 'Firefly Jar', price: 6, use: 'dice', dice: 2, text: 'Roll two dice.' },
  bigjar: { name: 'Big Firefly Jar', price: 12, use: 'dice', dice: 3, text: 'Roll three dice.' },
  boat: { name: 'Paper Boat', price: 10, use: 'pick', text: 'Pick your roll, 1-6.' },
  trap: { name: 'Honey Trap', price: 8, use: 'trap', text: 'Set it on a space: whoever lands there pays you 10.' },
  snail: { name: 'Snail Shell', price: 7, use: 'snail', text: 'Someone rolls only 1-3 next turn.' },
  gust: { name: 'Pocket Gust', price: 15, use: 'gust', text: 'Blow the star to a different post.' },
  umbrella: { name: 'Umbrella', price: 5, use: 'passive', text: 'Blocks one Drizzle or Bramble (used automatically).' },
  comet: { name: 'Comet Ticket', price: 30, use: 'warp', from: 5, max: 1, text: "Ride a comet straight to the star's post." },
}
export const STALL_STOCK = 3

// Bramble mishap cards (drawn at random).
export const MISHAPS = [
  { text: 'Snagged your scarf on the brambles. Lose 5 coins.', lose: 5 },
  { text: 'A hedgehog ran off with your purse. Lose 10 coins.', lose: 10 },
  { text: 'Turned the wrong way in the dark. Walk back 3.', back: 3 },
  { text: 'Tripped into the cake stall. Give everyone a coin.', each: 1 },
  { text: 'Phew, only a moth. Nothing happens.', none: true },
]

// Juniper's Tea House wheel.
export const TEA_EVENTS = [
  { id: 'ferry', text: 'A lily-pad ferry carries you to a Wishing Post.' },
  { id: 'swap', text: 'You swap places with someone across the hollow.' },
  { id: 'pot', text: 'Everyone pays into the tea pot. The next Glow lander takes it.' },
  { id: 'drift', text: 'A breeze sends the star drifting to another post.' },
]

// End-of-game bonus stars: 3 drawn from this pool. `stat`: which counter in pub.stats wins it (highest, ties share).
export const BONUS = [
  { id: 'firefly', name: 'Firefly Star', stat: 'mini', text: 'Most coins won in minigames.' },
  { id: 'wanderer', name: 'Wanderer Star', stat: 'walked', text: 'Most spaces walked.' },
  { id: 'chatterbox', name: 'Chatterbox Star', stat: 'talk', text: 'Most time talking in voice.' },
  { id: 'glow', name: 'Glow Star', stat: 'glow', text: 'Most Glow spaces landed on.' },
  { id: 'bramble', name: 'Bramble Star', stat: 'mishaps', text: 'Most mishaps suffered.' },
  { id: 'spender', name: 'Big Spender Star', stat: 'spent', text: 'Most coins spent at stalls and on stars.' },
]
export const BONUS_DRAWN = 3

// Minigames, by id (mechanics in minis/<id>.js, listed in minis/index.js). min/max: the table sizes it plays at.
// turnMs: a turn game's per-decision timer.
export const MINIGAMES = {
  catch: { name: 'Wishfall Catch', text: 'Slide your jam jar to catch falling stars. Big stars +3, stardust +1, dud clouds knock off 2.', min: 1, max: 8 },
  bun: { name: 'Hot Bun', text: 'Puff 1-3 steam into the bun and pass it on. It pops somewhere from 10 to 20; whoever holds it then is out.', min: 2, max: 8, lo: 10, hi: 20, bonus: [0, 1, 2], turnMs: 12000 },
  count: { name: 'Firefly Count', text: 'Fireflies blink in a jar for 6 seconds. Guess how many; closest wins, an exact guess earns a bonus.', min: 1, max: 8, lo: 5, hi: 30, exact: 5, showMs: 6000, pickMs: 15000 },
}
export const MINI_LEAD_MS = 6500 // from the minigame starting to "go": the intro card, then 3-2-1
export const MINI_GRACE_MS = 8000 // slack after a timed minigame before anyone still out gets timed out
export const MINI_RESULTS_MS = 6000 // the results reveal before the board carries on

// The news log's cast.
export const HOSTS = { star: 'Chit', stall: 'Marzipan', tea: 'Juniper', owl: 'Inkwell', rounds: 'Biscuit' }

// More minigames (min/max: Three Lanterns needs a hider and at least two seekers to bluff).
Object.assign(MINIGAMES, {
  lanterns: { name: 'Three Lanterns', text: 'One player hides the star under a lantern (and may point, honestly or not). Everyone else picks one. Find it for 2 points; the hider scores 1 for every seeker fooled.', min: 3, max: 8, rounds: 4, find: 2, fool: 1, foolMax: 3, turnMs: 15000 },
  standing: { name: 'Last Lantern Standing', text: 'Everyone secretly lights a lantern from 1 to 5. Lanterns lit twice blow out; the highest one left standing scores its number. Five rounds.', min: 2, max: 8, rounds: 5, top: 5, turnMs: 12000 },
  pond: { name: 'Pond Skippers', text: 'Flick three stones across the pond. Skips, lily-pad bounces and distance score; reaching the far bank earns a bonus.', min: 1, max: 8 },
})
