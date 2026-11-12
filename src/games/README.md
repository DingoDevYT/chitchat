# Stadium games

Plan and decisions: `GAMES.md` in the repo root.

## Layout
- `registry.js` lists every game. Each game is `<id>/rules.js` (pure JS: `meta`, `setup`, `turn`, `move`, `view`, `over`, `timeout`, optional `delay`, and `bot` for Chitbots) plus `<id>/ui.jsx` (your hand, banner text, the flat-table centre).
- `rng.js` is the seeded RNG every rules module uses.
- `useGame.js` holds the feature flag (`GAMES_ON`), the live table hook and the call to the referee.
- `GameScreen.jsx` is the lobby, HUD and hand overlay (lazy). `Table3D.jsx` is the three.js table (its own lazy chunk). `People.jsx` puts the real `<Avatar>`s at the seats.
- Server: `supabase/functions/game/index.ts` (the referee) and `supabase/migrations/036_games.sql` (tables, RLS, RPCs).

## One source of truth: redeploy after any rules change
The `game` edge function imports `../../../src/games/registry.js`, so it runs these exact files. After changing anything under `src/games/**/rules.js`, `rng.js` or `registry.js`, redeploy the function with the rules bundled, keeping the repo paths as file names:

- Supabase MCP `deploy_edge_function`, project `nilludyavkfqwastghmw`, name `game`, `verify_jwt: true`,
  `entrypoint_path: "supabase/functions/game/index.ts"`, and `files`:
  - `supabase/functions/game/index.ts`
  - `src/games/registry.js`, `src/games/rng.js`
  - `src/games/highcard/rules.js`, `src/games/snack/rules.js`, `src/games/poker/rules.js`, `src/games/property/rules.js`, `src/games/isle/rules.js`, `src/games/chitchen/rules.js`, `src/games/chitchen/map.js`
  - `src/games/flyer/rules.js`, `src/games/flyer/course.js`, `src/games/flyer/pilot.js`
  (registry.js imports every game's rules, so any redeploy must bundle all of these files.)
- Or with the CLI from the repo root: copy those files into a temp folder with the same relative paths and run `supabase functions deploy game --project-ref nilludyavkfqwastghmw`.

## Chatterflies (flyer/): a real-time game in a turn-based referee
Everyone flies at once, so the referee only judges the start and each landing. `course.js` is the pure tunnel generator and 60 Hz sim (same input log, same run, on every engine: no Math.sin/sqrt in anything that decides a hit), `pilot.js` the look-ahead search (tests prove every chunk is flyable) and the Chitbot pilots, `rules.js` the referee: bots' runs are flown from the seed when their "turn" comes just after the start, people post `{ type: 'run', ticks, log }` whenever they bonk and the referee replays the log (a few ms) and keeps the replayed distance. The timeout lands someone who vanished on 0 m. The UI brings its own full-screen `Stage` (GameScreen skips the 3D table for any UI module that exports one). Ghosts go over the private realtime topic `fly:<stadium id>`, which needs `supabase/migrations/037_flyer_ghosts.sql` applied. Play it locally: `#/table?g=flyer&n=4` (`&auto=1` lets a bot fly for you, `&veh=trotter`, `&lab=podium`).

A new game: add `<id>/rules.js` + `<id>/ui.jsx`, list it in `registry.js`, `GAME_LIST` (useGame.js) and `UIS` (GameScreen.jsx), add a scene in `Table3D.jsx`, then redeploy with the new file added. `npm test` runs every bot through whole games of every registered rules module.

## Real-time games (Midnight Chitchen, `chitchen/`)
<<<<<<< HEAD
`meta.realtime` games keep a game clock in `pub.clock`. The referee stamps setup (`opts.now`) and every move and tick with `now: Date.now()`, and skips the stale-version 409 for their moves (`game_save` still refuses a racing write). `turn()` names whoever has the next pending decision (a due Chitbot, a bot still to vote, else a clock keeper who can only send the `tick` timeout), and `delay()` is the time to the next scheduled event. Without `now` (tests) a tick jumps to the next event, so bots play whole nights in milliseconds. `meta.devOnly` keeps the referee from opening a table for it until it ships. Hidden information: `games.pub` is readable by everyone in the stadium, so Chitchen keeps people's last reported positions and meeting votes in `secret` (only `pub.voted`, the I-voted list, is public until the count), and where each bot is heading in the bot's priv. Bot walk plans stay public because every client draws bots from them; clients only show what is inside your vision (fog of war, walls block sight).
=======
`meta.realtime` games keep a game clock in `pub.clock`. The referee stamps setup (`opts.now`) and every move and tick with `now: Date.now()`, and skips the stale-version 409 for their moves (`game_save` still refuses a racing write). `turn()` names whoever has the next pending decision (a due Chitbot, a bot still to vote, else a clock keeper who can only send the `tick` timeout), and `delay()` is the time to the next scheduled event. Without `now` (tests) a tick jumps to the next event, so bots play whole nights in milliseconds. `meta.devOnly` keeps the referee from opening a table for it until it ships.

## Starchat (starchat/, dev only): party board game rules engine
Milestone 1 is rules only. `data.js` holds every name and number (Lantern Hollow, spaces, items, mishaps, Tea House wheel, bonus stars, minigame names), `rules.js` the mechanics, `minis/<id>.js` each minigame (the interface is documented at the top of `minis/count.js`; Firefly Count is the placeholder). `ui.jsx` is a text-and-buttons placeholder (`ownScene`, so no 3D table yet). `meta.devOnly` keeps the referee from opening a table; when it ships, add `src/games/starchat/rules.js`, `data.js` and `minis/*.js` to the deploy file list above. Play it locally: `#/table?g=starchat&n=4` (`&opts=quick`, `&steps=200` to fast-forward).
>>>>>>> worktree-agent-a319ae69e122899f4
