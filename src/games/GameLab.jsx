// Dev only (#/table?g=property&n=4&steps=200&seed=3): a game played locally, no server. You sit in seat 0 against
// Chitbots; `steps` fast-forwards bot play to get a mid-game board. For checking boards and controls by eye.
// `opts=quick,friendly` sets house rules; `lab=…` hands the game's UI module a named test situation (UI.lab).
// `cam=1` / `cam=all` turns on a webcam for you / every seat.
// Star Party: `mini=catch|bun|count` plays only that minigame (`lab=mini` jumps to it, `lab=results` to its reveal).
import { useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './registry.js'
import GameScreen, { UIS } from './GameScreen'
import { cams } from '../lib/store'

const q = new URLSearchParams(location.hash.split('?')[1] || '')
const G = q.get('g') || 'property', n = +q.get('n') || 4, seed = +q.get('seed') || 3, steps = +q.get('steps') || 0
const ME = '00000000-0000-0000-0000-00000000000a'
const players = [ME, ...Array.from({ length: n - 1 }, (_, i) => `bot:${i + 1}`)]
const levels = ['normal', 'normal', 'hard', 'easy', 'hard', 'normal', 'easy', 'hard']
const RT = !!GAMES[G]?.meta.realtime

export default function GameLab() {
  const R = GAMES[G]
  const [s, setS] = useState(() => {
    const opts = Object.fromEntries((q.get('opts') || '').split(',').filter(Boolean).map(k => [k, true]))
    let st = R.setup(players, seed, { full: q.has('full'), ...opts, ...(q.get('mini') ? { mini: q.get('mini') } : {}), ...(RT ? { now: Date.now() } : {}) })
    for (let k = 0; k < steps && !R.over(st); k++) {
      const who = R.turn(st)
      const a = R.bot(R.view(st, who), who, who === ME ? 'hard' : levels[players.indexOf(who)], Math.random)
      // A Star Party minigame refuses a run posted before its play window ends, so fast-forward the clock to the deadline.
      const t = Date.now(), at = !RT && st.pub?.phase === 'mini' && R.delay ? t + (R.delay(st, t) ?? 0) : t
      st = R.move(st, who, a ?? R.timeout(st), at)
    }
    if (q.get('lab') && UIS[G].lab) st = UIS[G].lab(st, ME, q.get('lab'))
    if (RT) st = { ...st, pub: { ...st.pub, epoch: Date.now() - st.pub.clock } } // fast-forwarded: carry on from here in real time
    return st
  })
  // `cam=1` turns on your camera like the stadium does (into the cams store); `cam=all` hands the Chitbots it too,
  // so every seat shows a live feed.
  useEffect(() => {
    if (!q.has('cam')) return
    let s = null, off = false
    navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 } } }).then(ms => {
      if (off) return ms.getTracks().forEach(t => t.stop())
      s = ms
      cams.set(Object.fromEntries((q.get('cam') === 'all' ? players : [ME]).map(p => [p, ms])))
    }, e => console.warn('lab camera:', e.message))
    return () => { off = true; s?.getTracks().forEach(t => t.stop()); cams.set({}) }
  }, [])
  const [v, setV] = useState(0)
  // Real-time games (Impostor) get the referee's clock stamp, like the edge function adds.
  // Moves run against the latest state right away (a refused move shows its reason instead of breaking the page).
  const cur = useRef(s)
  cur.current = s
  const apply = (who, m) => {
    try { cur.current = R.move(cur.current, who, RT ? { ...m, now: Date.now() } : m); setS(cur.current); setV(x => x + 1) } catch (e) { console.warn(e.message); if (!RT) alert(e.message) }
  }
  const who = R.over(s) ? null : R.turn(s)
  useEffect(() => {
    if (RT && who) { // real-time: the clock keeper's timer, or the next due Chitbot, when the rules ask (delay)
      const t = setTimeout(() => apply(who, who === ME ? R.timeout(s) : R.bot(R.view(s, who), who, levels[players.indexOf(who)], Math.random) ?? R.timeout(s)), Math.max(150, R.delay(s) ?? 1000))
      return () => clearTimeout(t)
    }
    if (!who || who === ME) return
    const t = setTimeout(() => apply(who, R.bot(R.view(s, who), who, levels[players.indexOf(who)], Math.random) ?? R.timeout(s)), Math.min(15000, Math.max(300, R.delay?.(s) ?? 900))) // the rules pace bots when they say (delay)
    return () => clearTimeout(t)
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps
  const seats = useMemo(() => players.map((p, i) => ({ seat: i, user_id: p === ME ? ME : null, bot: p === ME ? null : levels[i] })), [])
  const deadline = useMemo(() => new Date(Date.now() + (who === ME ? 45000 : 900)).toISOString(), [v, who]) // looks like the real timer
  const game = { id: 'lab', game: G, status: R.over(s) ? 'done' : 'playing', pub: s.pub, version: v, deadline, host_id: ME, opts: {} }
  const table = { game, seats, hand: s.priv[ME] ?? null, act: async (action, extra) => { if (action === 'move') apply(ME, extra.move) } }
  return <div style={{ position: 'fixed', inset: 0, display: 'flex' }}><GameScreen table={table} meId={ME} joined full onFull={() => {}} channelName="Lab" /></div>
}
