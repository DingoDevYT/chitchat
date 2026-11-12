// game: the all-games referee (fallback). Live tables use one small function per game, game-<id>: see src/games/README.md.
import { GAMES } from '../../../src/games/registry.js'
import { serveReferee } from '../_shared/referee.ts'

serveReferee(GAMES)
