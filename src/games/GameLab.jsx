// Dev only (#/table?g=property&n=4&steps=200&seed=3): a game played locally, no server. You sit in seat 0 against
// Chitbots; `steps` fast-forwards bot play to get a mid-game board. For checking boards and controls by eye.
// `opts=quick,friendly` sets house rules; `lab=…` hands the game's UI module a named test situation (UI.lab).
import { useEffect, useMemo, useState } from 'react'
import { GAMES } from './registry.js'
import GameScreen, { UIS } from './GameScreen'

const q = new URLSearchParams(location.hash.split('?')[1] || '')
const G = q.get('g') || 'property', n = +q.get('n') || 4, seed = +q.get('seed') || 3, steps = +q.get('steps') || 0
const ME = '00000000-0000-0000-0000-00000000000a'
const players = [ME, ...Array.from({ length: n - 1 }, (_, i) => `bot:${i + 1}`)]
const levels = ['normal', 'normal', 'hard', 'easy', 'hard', 'normal']

export default function GameLab() {
  const R = GAMES[G]
  const [s, setS] = useState(() => {
    const opts = Object.fromEntries((q.get('opts') || '').split(',').filter(Boolean).map(k => [k, true]))
    let st = R.setup(players, seed, { full: q.has('full'), ...opts })
    for (let k = 0; k < steps && !R.over(st); k++) {
      const who = R.turn(st)
      const a = R.bot(R.view(st, who), who, who === ME ? 'hard' : levels[players.indexOf(who)], Math.random)
      st = R.move(st, who, a ?? R.timeout(st))
    }
    return q.get('lab') && UIS[G].lab ? UIS[G].lab(st, ME, q.get('lab')) : st
  })
  const [v, setV] = useState(0)
  const apply = (who, m) => { try { setS(st => R.move(st, who, m)); setV(x => x + 1) } catch (e) { alert(e.message) } }
  const who = R.over(s) ? null : R.turn(s)
  useEffect(() => {
    if (!who || who === ME) return
    const t = setTimeout(() => apply(who, R.bot(R.view(s, who), who, levels[players.indexOf(who)], Math.random) ?? R.timeout(s)), 900)
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps
  const seats = useMemo(() => players.map((p, i) => ({ seat: i, user_id: p === ME ? ME : null, bot: p === ME ? null : levels[i] })), [])
  const deadline = useMemo(() => new Date(Date.now() + (who === ME ? 45000 : 900)).toISOString(), [v, who]) // looks like the real timer
  const game = { id: 'lab', game: G, status: R.over(s) ? 'done' : 'playing', pub: s.pub, version: v, deadline, host_id: ME, opts: {} }
  const table = { game, seats, hand: s.priv[ME] ?? null, act: async (action, extra) => { if (action === 'move') apply(ME, extra.move) } }
  return <div style={{ position: 'fixed', inset: 0, display: 'flex' }}><GameScreen table={table} meId={ME} joined full onFull={() => {}} channelName="Lab" /></div>
}
