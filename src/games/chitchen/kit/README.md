# Midnight Chitchen kit

A drop-in kit for the characters, props and sounds. Nothing here imports the game, and the game doesn't import it yet.
Look at it in dev at `#/bakers` (also `?shot=lineup`, `?shot=walk`, `?shot=death`, `?shot=vent`).

| File | What it is |
| --- | --- |
| `baker3d.js` | `createBaker()`, the character in plain three.js. Use this from the current game loop. |
| `Baker.jsx` | `<Baker>`, `<BakerBody>`, `useBakerTexture(src)`, `useBakerFace(uid)` for @react-three/fiber |
| `Props.jsx` | ovens, flour sacks, work tables, the meeting table with its bell, vents built as oven hatches (factories and R3F components) |
| `sfx.js` | procedural Web Audio cues and the sabotage loop, plus mute and volume |
| `Preview.jsx` | the dev-only `#/bakers` page (routed in `src/main.jsx` under `import.meta.env.DEV`) |

## The baker

```jsx
<Baker texture={tex} color="#e8574f" state="walk" facing={yaw} speed={2.4} talking position={[x, 0, z]} />
```

- `state`: `idle`, `walk`, `task`, `dead`, `ghost`, `ventIn`, `ventOut`, `win` or `lose`.
  - `dead` plays the TV smash: the screen cracks and flickers, sparks fly, the baker topples back, the hat falls off,
    and it stays down as the body. `instant` skips straight to lying there, for a body seen later. `<BakerBody>` does the same.
  - `ghost` is see-through and floating, with a wisp in place of legs. It leans forward when `speed > 0.1`.
  - `ventIn` crouches, hops, then spins down out of sight (hidden after 0.55 s). `ventOut` shoots up and lands with a squash, then idles.
- `facing`: yaw in radians, with 0 facing +Z. It's the same convention as the game's `atan2(dx, dz)`. The baker turns the short way round, smoothly.
- `speed`: units per second. It sets the stride and cadence.
- `talking`: `true`, or a 0..1 voice level. The head bobs and squashes, the screen brightens, and a mint rim glows.
- `onStep`: called on each footfall. Wire it to `play('step')`, but only for your own baker or nearby ones.
- `color`: the body, hat band and TV casing (a lighter tint). The colour is what tells players apart.
- `texture`: any `THREE.Texture`. It's fitted to the screen and bottom-aligned like a PNGtuber. With no texture, the screen shows a simple face on a pastel of `color`.

To show a Chitchat user's live face, use `const { texture, color, talking } = useBakerFace(uid)`. For a bot, use `useBakerTexture(botUrl(char, talk))`.

### From the current plain-three game (Game.jsx)

```js
import { createBaker } from './kit/baker3d.js'
const b = createBaker(); scene.add(b.group)
// each frame:
b.group.position.set(x, 0, z)
b.update(dt, { texture, color, state, facing: yaw, speed, talking })
// on teardown: b.dispose()
```

To replace `tvHead()`, keep the existing `drawScreen()` canvas and pass its `CanvasTexture` as `texture`. Set
`tex.needsUpdate = true` when you redraw it. The kit draws its own crack, so pass the `'live'` screen, not `'broken'`.
Use `state: 'dead'` for bodies (one baker per body, `instant: true` if the body was already there), and `state: 'ghost'`
for the tucked-in player as other ghosts see them. For sitting at the Tea Break, use `idle` and set
`b.group.position.y` to the stool height. There's no sit pose yet.

### Performance

All geometry and colour materials are shared, so 8 bakers in the same colours reuse the same materials. Each baker owns
three small screen materials and one 32-point particle buffer. That's 23 draw calls per baker when nothing is
sparkling, and nothing is allocated per frame. Shading is `MeshToonMaterial` with a 3-step ramp, and the outline is an
inverted hull on the body and TV only. There are no shadow maps; each baker has a soft blob shadow.

## Props

```jsx
<Oven position={[x, 0, z]} />
<FlourSack seed={2} />
<WorkTable />
<MeetingTable ring={bellJustRung} />   // a true pulse shakes the bell and presses the plunger
<Vent open={someoneVenting} />         // the lid flips open and shows a warm glow
```

The plain factories are `makeOven()`, `makeFlourSack(seed)`, `makeWorkTable()`, `makeMeetingTable()` and
`makeVent()`. Each returns `{ group, update?(dt, { ring, open }) }`. The props are sized to the bakers (a baker is
about 1.85 tall).

## Sounds

```js
import { play, startLoop, setMuted, isMuted, setVolume } from './kit/sfx.js'
play('kill')
const stop = startLoop('sabotage'); /* … */ stop()
```

The cues are `step`, `taskBeep`, `taskDone`, `kill`, `report`, `meeting`, `vote`, `eject`, `sting`, `vent`, `win` and
`lose`. Use `eject` then `sting` (`play('sting', { delay: 1.2 })`) for the ejection.

Peak gain is 0.08 at full volume, and the default volume is 0.5, so it sits well under voice chat. Mute and volume are
saved in `localStorage['chitchen:sfx']`. Nothing plays before the first tap or key press, and no AudioContext is
created until then. `unlockSfx()` from a gesture handler starts it early. A mute toggle in the game's settings only
needs `isMuted()` and `setMuted()`.

Suggested hooks: `taskBeep` on each step of a chore and `taskDone` when it's finished. Play `kill` for the killer, and
for anyone who can see it if you like. Play `report` when a body is reported and `meeting` for the bell. `vote` is each
vote click. `vent` goes on both ends of a vent hop. Start `startLoop('sabotage')` while sabotage is active.
`win` and `lose` go with the end screen.
