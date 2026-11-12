// Prints the files a referee function bundles (its import closure, repo-relative), for deploy_edge_function's `files`.
// node scripts/fnfiles.mjs <game id>        (no id: the all-games `game` fallback)
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const id = process.argv[2]
const seen = new Set()
const walk = file => {
  if (seen.has(file)) return
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  for (const [, spec] of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) walk(join(dirname(file), spec))
}
walk(join('supabase/functions', id ? `game-${id}` : 'game', 'index.ts'))
for (const f of seen) console.log(relative('.', f).replaceAll('\\', '/'))
