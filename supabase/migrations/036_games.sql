-- 036 Stadium games (GAMES.md). The `game` edge function referees every write with the service role;
-- clients only read, and only what they may see:
--   games, game_seats   anyone who can view the stadium
--   game_private        one row per human player (their hand): that player only
--   game_secret         deck, dice seed, bots' hands: no client access at all
--   game_rate           per-user call window for the edge function: no client access
-- Bots (Chitbots) sit in seats with user_id null and a difficulty; their hands live in game_secret.

alter table public.channels add column if not exists games_enabled boolean not null default true;
grant update (games_enabled) on public.channels to authenticated; -- "admins edit channels" policy still applies

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'done')),
  opts jsonb not null default '{}',
  pub jsonb,
  version int not null default 0,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists games_one_per_channel on public.games (channel_id);

create table if not exists public.game_seats (
  game_id uuid not null references public.games(id) on delete cascade,
  seat smallint not null check (seat between 0 and 9),
  user_id uuid references auth.users(id) on delete cascade,
  bot text check (bot in ('easy', 'normal', 'hard')),
  primary key (game_id, seat),
  unique (game_id, user_id),
  check ((user_id is null) <> (bot is null))
);

create table if not exists public.game_private (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hand jsonb,
  primary key (game_id, user_id)
);
create index if not exists game_private_user on public.game_private (user_id);

create table if not exists public.game_secret (
  game_id uuid primary key references public.games(id) on delete cascade,
  data jsonb not null default '{}'
);

create table if not exists public.game_rate (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  n int not null default 0
);

alter table public.games enable row level security;
alter table public.game_seats enable row level security;
alter table public.game_private enable row level security;
alter table public.game_secret enable row level security;
alter table public.game_rate enable row level security;

drop policy if exists "see games" on public.games;
create policy "see games" on public.games for select to authenticated using (public.can_view_channel(channel_id));
drop policy if exists "see seats" on public.game_seats;
create policy "see seats" on public.game_seats for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and public.can_view_channel(g.channel_id)));
drop policy if exists "see own hand" on public.game_private;
create policy "see own hand" on public.game_private for select to authenticated using (user_id = (select auth.uid()));

-- No client writes anywhere; secrets not even readable.
revoke all on public.games, public.game_seats, public.game_private, public.game_secret, public.game_rate from public, anon, authenticated;
grant select on public.games, public.game_seats, public.game_private to authenticated;
grant all on public.games, public.game_seats, public.game_private, public.game_secret, public.game_rate to service_role;

-- ───────── service-role RPCs (the `game` edge function) ─────────

-- Rate limit (40 calls / 10 s per person) + everything the referee needs, in one round trip.
create or replace function public.game_load(uid uuid, gid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_ int; g public.games;
begin
  insert into public.game_rate as r (user_id, at, n) values (uid, now(), 1)
  on conflict (user_id) do update set
    n = case when r.at > now() - interval '10 seconds' then r.n + 1 else 1 end,
    at = case when r.at > now() - interval '10 seconds' then r.at else now() end
  returning r.n into n_;
  if n_ > 40 then raise exception 'Easy there! Try again in a few seconds.' using errcode = 'P0001', hint = 'rate_limited'; end if;
  if gid is null then return null; end if;
  select * into g from public.games where id = gid;
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'game', to_jsonb(g),
    'seats', coalesce((select jsonb_agg(to_jsonb(s) order by s.seat) from public.game_seats s where s.game_id = gid), '[]'),
    'priv', coalesce((select jsonb_object_agg(p.user_id, p.hand) from public.game_private p where p.game_id = gid), '{}'),
    'secret', (select data from public.game_secret where game_id = gid));
end $$;

-- Opens a lobby with the host in seat 0. A table left alone for 20 minutes is cleared away first.
create or replace function public.game_create(uid uuid, cid uuid, gkind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare id_ uuid;
begin
  if not coalesce((select games_enabled from public.channels where id = cid and channels.kind = 'voice'), false) then
    raise exception 'Games are turned off in this stadium.' using errcode = '42501';
  end if;
  delete from public.games where channel_id = cid and updated_at < now() - interval '20 minutes';
  if exists (select 1 from public.games where channel_id = cid) then
    raise exception 'There''s already a table in this stadium.' using errcode = 'P0001', hint = 'busy';
  end if;
  insert into public.games (channel_id, game, host_id) values (cid, gkind, uid) returning id into id_;
  insert into public.game_seats (game_id, seat, user_id) values (id_, 0, uid);
  return id_;
end $$;

-- One move, atomically. Fails with 'conflict' unless the table is still at version `ver`.
-- p: { status?, opts?, pub?, deadline? (iso or null), seats?: [{seat,user_id,bot}], privs?: {uid: hand}, privs_reset?, secret? }
create or replace function public.game_save(gid uuid, ver int, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.games set
    status = coalesce(p->>'status', status),
    opts = coalesce(p->'opts', opts),
    pub = case when p ? 'pub' then p->'pub' else pub end,
    deadline = case when p ? 'deadline' then (p->>'deadline')::timestamptz else deadline end,
    version = version + 1, updated_at = now()
  where id = gid and version = ver
  returning version into v;
  if v is null then raise exception 'conflict' using errcode = 'P0001', hint = 'conflict'; end if;
  if p ? 'seats' then
    delete from public.game_seats where game_id = gid;
    insert into public.game_seats (game_id, seat, user_id, bot)
      select gid, (x->>'seat')::smallint, (x->>'user_id')::uuid, x->>'bot' from jsonb_array_elements(p->'seats') x;
  end if;
  if coalesce((p->>'privs_reset')::boolean, false) then delete from public.game_private where game_id = gid; end if;
  if p ? 'privs' then
    insert into public.game_private (game_id, user_id, hand)
      select gid, k::uuid, val from jsonb_each(p->'privs') e(k, val)
    on conflict (game_id, user_id) do update set hand = excluded.hand;
  end if;
  if p ? 'secret' then
    insert into public.game_secret (game_id, data) values (gid, p->'secret')
    on conflict (game_id) do update set data = excluded.data;
  end if;
  return v;
end $$;

revoke execute on function public.game_load(uuid, uuid), public.game_create(uuid, uuid, text), public.game_save(uuid, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.game_load(uuid, uuid), public.game_create(uuid, uuid, text), public.game_save(uuid, int, jsonb)
  to service_role;

-- ───────── realtime (RLS applies: each person only receives their own hand) ─────────
do $$
declare t text;
begin
  foreach t in array array['games', 'game_seats', 'game_private'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
