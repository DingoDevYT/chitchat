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
- Or with the CLI from the repo root: copy those files into a temp folder with the same relative paths and run `supabase functions deploy game --project-ref nilludyavkfqwastghmw`.

A new game: add `<id>/rules.js` + `<id>/ui.jsx`, list it in `registry.js`, `GAME_LIST` (useGame.js) and `UIS` (GameScreen.jsx), add a scene in `Table3D.jsx`, then redeploy with the new file added. `npm test` runs every bot through whole games of every registered rules module.
