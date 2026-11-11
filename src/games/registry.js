// Every game's rules module, by id. Shared by the browser and the `game` edge function (see README.md here).
import * as highcard from './highcard/rules.js'
import * as snack from './snack/rules.js'
import * as poker from './poker/rules.js'
import * as property from './property/rules.js'

export const GAMES = { snack, property, poker, highcard }
