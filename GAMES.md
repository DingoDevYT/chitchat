# Stadium games: plan

Game nights inside a stadium. Everyone's animated PNGtuber avatar sits around a 3D table, talking on voice while they play.
These are original games with our own names and art: card game mechanics are free to use, but names, art and trademarks are not.

## Decided (owner, 2026-11-12)
- **Table:** 3D with three.js. Avatars stand around it as flat standees (Paper Mario style). The 3D code loads only when a game opens.
- **First game:** an Uno-style card game, **Snack Stack** (rules below).
- **Placement:** the game shows in the stage's big screen by default, with a button to switch to full view (per game, remembered per person).
- **Who starts:** anyone in the stadium. Admins can turn games off for a stadium in the room settings.

## How it feels
1. **Opening a lobby.** In a stadium you've joined, a **Games** button sits next to Go live / Camera. Pick a game and a lobby opens in the big screen: an empty table with seats.
2. **Sitting down.** Others click **Sit down**. Their avatar walks from the crowd to a seat. **Stand up** sends them back.
3. **Starting.** The opener (the host) presses **Start** once there are enough players. Anyone still standing becomes a spectator.
4. **Playing.** Your seat is the one nearest the camera, like your corner in the crowd. Your hand is a row of real buttons along the bottom edge. Everyone else's cards are face down in front of them.
5. **Talking.** Seated avatars talk, show expressions and get speech bubbles from the stadium chat, exactly as in the crowd. Spectators stay in the crowd and watch the public table.
6. **Ending.** Results show with a little celebration. **Again?** starts a rematch with the same seats.
7. **Streams** shrink to thumbnails while a game runs in the screen. In full view they hide until you switch back.

## Architecture
**Rules are pure functions.** Each game is one module, `src/games/<id>/rules.js`. It is plain JavaScript with no React or network code. It exports:
- `setup(players, seed)` returns `{ pub, priv: { [playerId]: … }, secret }`.
- `move(state, playerId, action)` returns a new state, or throws if the move isn't allowed.
- `view(state, playerId)` returns what that player may see.
- `over(state)` returns the winners, or null while the game is still going.

The functions are deterministic (seeded shuffle) and unit-tested with `node --test` like the rest of `src/lib`.

**The server referees.** One edge function, `game`, applies moves using the same rules file. This keeps hands hidden and stops cheating, and the game survives the host leaving. Doing it peer-to-peer or with a host's browser in charge can't hide cards, because broadcast reaches everyone.

**Data**, all with RLS:

| Table | What it holds | Who can see it |
|---|---|---|
| `games` | id, channel, game id, status, public state, version, deadline | Anyone who can see the stadium |
| `game_seats` | game, player, seat number | Anyone who can see the stadium |
| `game_private` | One row per player: their hand | That player only |
| `game_secret` | The deck and other hidden state | No client access at all; only the edge function reads it |

**Each move goes the same way:**
1. The client calls `game` with `{ gameId, version, action }`.
2. The function checks the person's login, their seat, whose turn it is and the version, then runs `move`.
3. It writes the new public state, the hands that changed and the secret, in one transaction.
4. Realtime pushes the `games` row to everyone and each player's own `game_private` row to them.

**Timers without a cron job.** State carries a `deadline`. When it passes, any client may call `tick`, and the function checks the clock itself. A player who left the stadium keeps their seat for 2 minutes; after that, their turns auto-draw and pass.

**Cost** stays trivial. A 1-hour game night for 6 people is about 600 moves: 600 function calls plus around 1,200 small writes. The free tier allows 500k function calls and 2M realtime messages a month.

## The 3D table
- **Packages:** `three` plus `@react-three/fiber` (v8, for React 18), split into their own chunk that loads only when a game opens. Small helpers are written by hand rather than adding drei.
- **Scene:**
  - A round wooden table under one warm lamp, in the gouache palette.
  - Seats in a circle, each avatar a flat standee using their current expression image.
  - Avatars bob while talking (the existing `talking` store), and the typing face shows while they type.
  - Cards are planes with faces drawn on a canvas in the doodle style.
  - Cards deal, fly and flip with tweens, and the camera sways gently.
- **Your hand** is an HTML overlay, not 3D, so it's crisp, keyboard playable and screen-reader friendly. Turn changes are announced with `aria-live`.
- **Performance:**
  - Pixel ratio is capped at 1.5, and rendering pauses while the tab is hidden.
  - Reduced motion turns off camera moves and fancy tweens.
  - Without WebGL, the same game falls back to a flat DOM table.

## Game 1: Snack Stack (Uno-style, 2–10 players)
- **Deck:** 108 snack cards in 4 flavours: Berry, Lime, Blueberry and Honey. Each flavour has numbers 0–9, with two of each number from 1 to 9.
- **Action cards:**

  | Card | Effect |
  |---|---|
  | Nap | Skip the next player |
  | U-turn | Reverse the direction of play |
  | Second helping | The next player draws 2 |
  | Chef's choice | Wild: pick the flavour |
  | Feast | Wild: the next player draws 4 |

- **Taking a turn:** play a card that matches the top card's flavour or number, or play a wild. If you can't (or don't want to), draw 1; you may play that card straight away if it fits.
- **Last bite!** When you're down to one card, press **Last bite!**. If someone catches you before you call it, you draw 2.
- **Winning:** the first to empty their hand wins the round. Points mode (first to 200 points) is a later option.
- **House rules,** set in the lobby: stacking draw cards, and draw-until-you-can-play. Both are off by default.
- **Turn timer:** 30 seconds, with a soft tick sound in the last 5.

## Milestones
1. **Engine + table skeleton.**
   - Lobby, seats, sit/stand, start, spectators, the screen/full-view toggle, the edge function, RLS tests.
   - A tiny test game, High card, proves hidden hands and turns.
   - Done when two test accounts can play High card in a stadium, and a third account can't see their hands.
2. **Snack Stack, playable from start to finish.**
   - The rules with full unit tests, timers, rejoining, Last bite!, the results screen and Again?.
3. **Polish.**
   - Card animations, game sounds (with the existing UI-sound toggle), expressions at the table (thinking on your turn, a win/lose face), a per-server leaderboard.
4. **More games,** each the same kind of rules module:
   - **Acorn Hold'em:** poker with pretend acorns. There will never be real money or anything purchasable.
   - A Werewolf-style party game.
   - Doodle guess.
   - Last, a Monopoly-style game. It's a long game with heavy rules, so it needs save-and-resume across nights.

## Risks
- **Bundle:** three.js is about 150 KB gzipped. That's fine because it only loads when a game opens.
- **Latency:** an edge function's first call can take about 0.3 s. The fix is to show the card leaving your hand immediately and roll it back if the server says no.
- **WebGL:** low-end or old devices may lack it; they get the 2D fallback.
- **Interplay:** a game in full view hides streams, and people may still want to watch one. The toggle covers this.
