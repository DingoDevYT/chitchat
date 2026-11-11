# Overnight backlog

Working list while the owner sleeps. Agents pick from the top; finished items move to the bottom with a date.
Ship rule: every push goes through `.claude/ship.ps1` (tests + production build must pass).

## In progress
- Cozy island restyle (night default / cream day, chunky type, speech-bubble dialogs, paper + patterns, "You got…" pop-ups, UI sounds)
- Hand-drawn doodle icon set (single colour, no fills), replacing UI emoji
- Gouache theme rework (all 9 scenes)
- Galleries (new room type) + removing threads
- Plugins platform: bots, slash commands, bot API, docs, The Chef, Automod, custom commands
- Discord parity: favourite GIFs, voice messages, forwarding, polls, markdown extras, upload progress
- Discord parity: desktop notifications, notification levels, @everyone/@here/@role, inbox, shortcuts sheet
- Discord parity: invites, bans, timeouts, nicknames, notes, audit log, rules screening
- DM and group calls
- QA: visual noise + obvious-state gaps
- Responsive layout pass across window sizes

## Next up
- More built-in plugins: Jukebox (listen-together music in stadiums via YouTube/SoundCloud embeds, synced queue), Welcome, Reminders, Role picker (react for roles), Starboard (best messages → a gallery), Fun (dice, 8-ball, coin flip)
- Full regression QA after the big merges (every screen, night/day, desktop/phone)
- Performance pass: bundle size, code-splitting heavy screens, realtime subscription count, image loading
- Accessibility pass: keyboard-only use, screen reader labels, focus order, contrast in both looks
- Copy pass: friendly, consistent wording everywhere (Rooms/Stadiums/Galleries, Chit's voice)
- Cost review: realtime/egress/storage usage, orphaned uploads cleanup job

## Big one the owner really wants (planned in GAMES.md, not started)
- Stadium games: built-in game nights inside a stadium, way beyond Discord's activities. Original takes on card/board/party games (an Uno-like, a Monopoly-like, poker), with everyone's animated PNGtuber avatars sitting around a table (three.js or 2D), reacting as they talk and play. Use what we already have: stadium presence/voice, realtime broadcast for game state, server roles for hosts. Start with one small game to prove the table + turn sync, then grow.

## Parked (owner's ideas, not started)
- See IDEAS.md
