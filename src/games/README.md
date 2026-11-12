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
`meta.realtime` games keep a game clock in `pub.clock`. The referee stamps setup (`opts.now`) and every move and tick with `now: Date.now()`, and skips the stale-version 409 for their moves (`game_save` still refuses a racing write). `turn()` names whoever has the next pending decision (a due Chitbot, a bot still to vote, else a clock keeper who can only send the `tick` timeout), and `delay()` is the time to the next scheduled event. Without `now` (tests) a tick jumps to the next event, so bots play whole nights in milliseconds. `meta.devOnly` keeps the referee from opening a table for it until it ships. Hidden information: `games.pub` is readable by everyone in the stadium, so Chitchen keeps people's last reported positions and meeting votes in `secret` (only `pub.voted`, the I-voted list, is public until the count), and where each bot is heading in the bot's priv. Bot walk plans stay public because every client draws bots from them; clients only show what is inside your vision (fog of war, walls block sight).

## Starchat (starchat/, dev only): party board game
`data.js` holds every name and number (Lantern Hollow, spaces, items, mishaps, Tea House wheel, bonus stars, minigames), `rules.js` the mechanics. The board is Table3D's `StarchatScene` (an outdoor layout: no room or table, everyone walks the lantern path as their own cut-out; `geom.js` lays the board out, `boardArt.js` paints the meadow), the HUD is `hud.jsx` + `hud.css` (news lines from `news.js`, icons in `icons.js`, phones get a ticket strip and a bottom sheet), and the minigame Stage is mounted from the HUD. Lab moments: `lab=star|shop|fork|items|last`. `meta.devOnly` keeps the referee from opening a table; when it ships, add `src/games/starchat/rules.js`, `data.js`, `minis/index.js` and the minigame modules (`minis/catch.js`, `bun.js`, `count.js`) to the deploy file list above (the UI files stay client-only). Play it locally: `#/table?g=starchat&n=4` (`&opts=quick`, `&steps=200` to fast-forward, `&mini=catch|bun|count&lab=mini` to jump to a minigame, `lab=results` for its reveal).

Minigames (`minis/`): the interface is at the top of `minis/count.js` (turn games add `whose` / `act` / `timeoutMove`, see `bun.js`). Three kinds: `pick` (one secret entry each: Firefly Count), `sim` (one replayed run each, the Chatterflies pattern: Wishfall Catch posts `{ log, score }`, the referee replays the integer-only sim and keeps its own score; bot runs follow from seed, seat and level so every client draws the same ghosts) and `turn` (short referee turns: Hot Bun, whose pop number stays in `secret`). `pub.mini.startAt` is the referee clock plus the intro and 3-2-1, and `delay()` sets the deadlines from it. The UI is one overlay, `minis/Stage.jsx` (intro card, countdown, play area, waiting for others, results), which the board UI mounts all game long; it draws nothing outside a minigame. A new minigame: its pure module in `minis/index.js`, its numbers in `data.js` MINIGAMES, its view (`how`, `Play`, `detail`, optional `Reveal`) in `minis/views.js`.
