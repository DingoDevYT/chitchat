-- 043 Game results and leaderboards. The game-<id> referees (supabase/functions/_shared/record.ts) write one row per
-- person when a round finishes (status 'done'), with the service role; Chitbots are never recorded. Clients only read,
-- and only rows from stadiums they can see. Leaderboards come from game_leaderboard / game_records /
-- game_player_stats, which run as the caller (security invoker), so the same RLS applies to every aggregate.

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete cascade,   -- null for a stadium outside a server
  channel_id uuid references public.channels(id) on delete set null, -- the stadium (kept on the board if it goes)
  game_id uuid not null,  -- the games row (no FK: tables are deleted when closed, results stay)
  round int not null,     -- the version the round's done save landed on: (game_id, round) names the round
  game text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  placing smallint not null check (placing between 1 and 10),
  won boolean not null default false,
  score numeric,
  stats jsonb not null default '{}',
  finished_at timestamptz not null default now()
);
-- Never record a round twice (the referee upserts with ignoreDuplicates on this key).
create unique index if not exists game_results_once on public.game_results (game_id, round, user_id);
create index if not exists game_results_board on public.game_results (server_id, game, finished_at desc);
create index if not exists game_results_server_time on public.game_results (server_id, finished_at desc);
create index if not exists game_results_user on public.game_results (user_id, server_id);
create index if not exists game_results_channel on public.game_results (channel_id);

alter table public.game_results enable row level security;

-- Members who can view the stadium can read its results; once the stadium is gone, any member of the server.
drop policy if exists "see game results" on public.game_results;
create policy "see game results" on public.game_results for select to authenticated using (
  case when channel_id is not null then public.can_view_channel(channel_id)
       else server_id is not null and public.is_member(server_id) end
);

-- Nobody writes directly: no insert/update/delete policies, and no grants beyond select.
revoke all on public.game_results from public, anon, authenticated;
grant select on public.game_results to authenticated;
grant all on public.game_results to service_role;

-- ───────── leaderboards (security invoker: RLS above decides which rows count) ─────────

-- Rows for one server, one game (null = every game) and one period ('week' = the last 7 days, else all time).
create or replace function public.game_results_in(sid uuid, gkind text, period text)
returns setof public.game_results
language sql stable security invoker set search_path = '' as $$
  select * from public.game_results r
  where r.server_id = sid
    and (gkind is null or r.game = gkind)
    and (coalesce(period, 'all') <> 'week' or r.finished_at >= now() - interval '7 days')
$$;

-- Top players: wins, games played, win rate, best score (lowest for Card Rush, where fewer cards left is better;
-- null across every game) and best win streak. Ordered by wins, then win rate, then games played.
create or replace function public.game_leaderboard(sid uuid, gkind text default null, period text default 'all', lim int default 10)
returns table (user_id uuid, wins int, played int, win_rate numeric, best_score numeric, best_streak int, last_played timestamptz)
language sql stable security invoker set search_path = '' as $$
  with base as (select * from public.game_results_in(sid, gkind, period)),
  seq as (
    select b.user_id, b.won,
      row_number() over (partition by b.user_id order by b.finished_at, b.id)
        - row_number() over (partition by b.user_id, b.won order by b.finished_at, b.id) as grp
    from base b
  ),
  streaks as (
    select s.user_id, max(s.n)::int as best_streak
    from (select seq.user_id, count(*) as n from seq where seq.won group by seq.user_id, seq.grp) s
    group by s.user_id
  ),
  totals as (
    select b.user_id,
      count(*) filter (where b.won)::int as wins,
      count(*)::int as played,
      case when gkind is null then null when gkind = 'snack' then min(b.score) else max(b.score) end as best_score,
      max(b.finished_at) as last_played
    from base b group by b.user_id
  )
  select t.user_id, t.wins, t.played, round(t.wins::numeric / greatest(t.played, 1), 3), t.best_score,
    coalesce(st.best_streak, 0), t.last_played
  from totals t left join streaks st on st.user_id = t.user_id
  order by t.wins desc, (t.wins::numeric / greatest(t.played, 1)) desc, t.played desc, t.last_played desc
  limit greatest(1, least(coalesce(lim, 10), 50))
$$;

-- Per-game records: the top value of every numeric stats key (longest Jetpack Dash run, most Star Party stars, …),
-- who holds it and when (the earliest wins a tie). The browser picks which ones to show (RECORDS in results.js).
create or replace function public.game_records(sid uuid, period text default 'all')
returns table (game text, key text, user_id uuid, value numeric, finished_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select distinct on (r.game, e.key) r.game, e.key, r.user_id, (e.value #>> '{}')::numeric, r.finished_at
  from public.game_results_in(sid, null, period) r, jsonb_each(r.stats) e
  where jsonb_typeof(e.value) = 'number'
  order by r.game, e.key, (e.value #>> '{}')::numeric desc, r.finished_at
$$;

-- One person's games in a server, per game, for the profile card.
create or replace function public.game_player_stats(sid uuid, uid uuid)
returns table (game text, played int, wins int, best_score numeric, last_played timestamptz)
language sql stable security invoker set search_path = '' as $$
  select r.game, count(*)::int, count(*) filter (where r.won)::int,
    case when r.game = 'snack' then min(r.score) else max(r.score) end, max(r.finished_at)
  from public.game_results r
  where r.server_id = sid and r.user_id = uid
  group by r.game
$$;

revoke execute on function public.game_results_in(uuid, text, text), public.game_leaderboard(uuid, text, text, int),
  public.game_records(uuid, text), public.game_player_stats(uuid, uuid) from public, anon;
grant execute on function public.game_results_in(uuid, text, text), public.game_leaderboard(uuid, text, text, int),
  public.game_records(uuid, text), public.game_player_stats(uuid, uuid) to authenticated;
