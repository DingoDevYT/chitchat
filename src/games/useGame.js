import { useCallback, useEffect, useRef, useState } from 'react'
import { freshChannel, supabase } from '../lib/supabase'
import { toast } from '../lib/store'

// Feature flag: stadium games show only in dev builds until the owner has tried them. Flip to `true` to ship.
export const GAMES_ON = true
// The Games picker: display name, a one-line "what is it", player count, and a real gameplay banner (public/games/<id>.jpg).
// Kept here so the picker doesn't load the rules; these names win over each rules module's meta.name on screen.
export const GAME_INFO = [
  { id: 'snack', name: 'Chomp Chat', blurb: 'Match snack flavours and numbers, dodge the Feast, and empty your hand first. Say "Last bite!" on your last card.', players: '2–10', kind: 'Card game' },
  { id: 'property', name: 'Chatterton', blurb: 'Roll around a cozy town, buy streets, trade, build cottages and inns, and charge rent until everyone else is broke.', players: '2–6', kind: 'Board game' },
  { id: 'poker', name: 'Chips & Chatter', blurb: "Texas hold'em with pretend acorns: bet, bluff and read your friends. Tips for newcomers built in.", players: '2–8', kind: 'Card game' },
  { id: 'highcard', name: 'Chit Flip', blurb: 'Everyone gets one hidden card: keep it or swap it once. Highest card wins. Thirty seconds of chaos.', players: '2–10', kind: 'Quick game' },
]
export const GAME_LIST = GAME_INFO.map(g => [g.id, g.name])
export const gameName = (id, fallback) => GAME_INFO.find(g => g.id === id)?.name || fallback

// Calls the `game` edge function (the referee). Resolves to its JSON, or null after toasting why it said no.
export async function callGame(body, quiet = false) {
  const { data, error } = await supabase.functions.invoke('game', { body })
  if (!error) return data
  let msg = "Couldn't reach the table. Check your connection."
  try { msg = (await error.context.json()).error || msg } catch { /* network error: keep the default */ }
  if (!quiet) toast(msg)
  return null
}

// The table in a stadium, live: { game, seats, hand, act }. hand is your own game_private row (RLS: nobody else's).
export function useTable(channelId, meId, on = GAMES_ON) {
  const [t, setT] = useState({ game: null, seats: [], hand: null })
  const seq = useRef(0)
  const refresh = useCallback(async () => {
    const n = ++seq.current
    const { data: game } = await supabase.from('games').select('*').eq('channel_id', channelId).maybeSingle()
    const [seats, hand] = game
      ? await Promise.all([
        supabase.from('game_seats').select('*').eq('game_id', game.id).order('seat').then(r => r.data || []),
        supabase.from('game_private').select('hand').eq('game_id', game.id).eq('user_id', meId).maybeSingle().then(r => r.data?.hand ?? null),
      ])
      : [[], null]
    if (n === seq.current) setT({ game, seats, hand })
  }, [channelId, meId])

  useEffect(() => {
    if (!on || !channelId) return
    refresh()
    // Every write bumps games.version, so one subscription is enough to know when to re-read (hands included).
    const ch = freshChannel(`game:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `channel_id=eq.${channelId}` }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'games' }, refresh) // deletes can't be filtered
      .subscribe(st => { if (st === 'SUBSCRIBED') refresh() })
    const onVis = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [on, channelId, refresh])

  const { game, seats } = t
  const act = useCallback(async (action, extra = {}) => {
    const r = await callGame({ action, gameId: game?.id, version: game?.version, ...extra }, action === 'tick')
    if (r) refresh()
    return r
  }, [game?.id, game?.version, refresh])

  // Timers without a cron job: after the deadline someone asks the referee to play the timeout (or a Chitbot's turn).
  // Seated people go first, staggered by seat, so usually only one call is made; watchers back them up later.
  useEffect(() => {
    if (game?.status !== 'playing' || !game.deadline) return
    const humans = seats.filter(s => s.user_id)
    const rank = humans.findIndex(s => s.user_id === meId)
    const wait = Date.parse(game.deadline) - Date.now() + (rank < 0 ? 2500 + Math.random() * 1500 : 150 + rank * 400)
    const tm = setTimeout(() => act('tick'), Math.max(0, wait))
    return () => clearTimeout(tm)
  }, [game?.status, game?.deadline, game?.version, seats, meId, act])

  return { ...t, act, refresh }
}

export const create = (channelId, game) => callGame({ action: 'create', channelId, game })
