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
  - `src/games/highcard/rules.js`, `src/games/snack/rules.js`, `src/games/poker/rules.js`, `src/games/property/rules.js`, `src/games/isle/rules.js`
  (registry.js imports Chitter Cove's rules, so any redeploy must bundle that file too, even while the game is dev-only in GAME_INFO.)
  - `src/games/flyer/rules.js`, `src/games/flyer/course.js`, `src/games/flyer/pilot.js` (Chatterflies; registry.js imports it, so these three are needed by any redeploy from now on)
- Or with the CLI from the repo root: copy those files into a temp folder with the same relative paths and run `supabase functions deploy game --project-ref nilludyavkfqwastghmw`.

## Chatterflies (flyer/): a real-time game in a turn-based referee
Everyone flies at once, so the referee only judges the start and each landing. `course.js` is the pure tunnel generator and 60 Hz sim (same input log, same run, on every engine: no Math.sin/sqrt in anything that decides a hit), `pilot.js` the look-ahead search (tests prove every chunk is flyable) and the Chitbot pilots, `rules.js` the referee: bots' runs are flown from the seed when their "turn" comes just after the start, people post `{ type: 'run', ticks, log }` whenever they bonk and the referee replays the log (a few ms) and keeps the replayed distance. The timeout lands someone who vanished on 0 m. The UI brings its own full-screen `Stage` (GameScreen skips the 3D table for any UI module that exports one). Ghosts go over the private realtime topic `fly:<stadium id>`, which needs `supabase/migrations/037_flyer_ghosts.sql` applied. Play it locally: `#/table?g=flyer&n=4` (`&auto=1` lets a bot fly for you, `&veh=trotter`, `&lab=podium`).

A new game: add `<id>/rules.js` + `<id>/ui.jsx`, list it in `registry.js`, `GAME_LIST` (useGame.js) and `UIS` (GameScreen.jsx), add a scene in `Table3D.jsx`, then redeploy with the new file added. `npm test` runs every bot through whole games of every registered rules module.
