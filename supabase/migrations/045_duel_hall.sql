-- 045 Drawing Duel Hall of Fame: winning champions kept per server, so people can replay the funniest ones later.
--
-- Who saves: the artist's own client, right after their champion wins a bout (src/games/pillow/hallApi.js). It uploads
-- a PNG thumbnail and, for a recorded battle cry, a copy of the clip (the `battle-cries` bucket from 040 is wiped when
-- the table closes), then calls save_duel_champion(). The RPC trusts nothing else from the client: the drawing, name,
-- prompt, votes, wins and streak are all read from the referee-written games.pub, and the caller must be the artist of
-- a champion that won at least one bout there. A defending champion's later wins update the same row.
--
--   duel_hall          read: members of the server · insert/update: only via save_duel_champion · delete: the artist,
--                      or anyone with Manage messages in that server
--   duel_hall_optout   "Don't save my champions": your own row only; save_duel_champion refuses while it exists
--   bucket duel-hall   private; <server id>/<artist id>/<game id>_<round>.<png|wav|webm|ogg|mp4>
--                      read: server members · write: the artist into their own folder, for a Drawing Duel table in that
--                      server · delete: the artist, or Manage messages in that server
-- Storage objects can only be removed through the Storage API, so the client deleting a row removes its files too.

-- ── the bucket ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('duel-hall', 'duel-hall', false, 400000, array['image/png', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/ogg', 'audio/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The server a hall file belongs to, from the first folder of its path (null for anything malformed).
create or replace function public.duel_hall_server(name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then (split_part(name, '/', 1))::uuid end
$$;

-- May the caller write this path? Their own folder, in a server they're in, for a Drawing Duel table of that server.
create or replace function public.can_post_duel_hall(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}_[0-9]{1,2}\.(png|wav|webm|ogg|mp4)$'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and public.is_member(public.duel_hall_server(name))
    and exists (
      select 1 from public.games g join public.channels c on c.id = g.channel_id
      where g.id::text = split_part(split_part(name, '/', 3), '_', 1) and g.game = 'pillow'
        and c.server_id = public.duel_hall_server(name))
$$;

create or replace function public.can_drop_duel_hall(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(name, '/', 2) = (select auth.uid())::text
    or coalesce(public.has_perm(public.duel_hall_server(name), 'manage_messages'), false)
$$;

drop policy if exists "see duel hall files" on storage.objects;
create policy "see duel hall files" on storage.objects for select to authenticated
  using (bucket_id = 'duel-hall' and public.is_member(public.duel_hall_server(name)));
drop policy if exists "post duel hall files" on storage.objects;
create policy "post duel hall files" on storage.objects for insert to authenticated
  with check (bucket_id = 'duel-hall' and public.can_post_duel_hall(name));
drop policy if exists "redo duel hall files" on storage.objects;
create policy "redo duel hall files" on storage.objects for update to authenticated
  using (bucket_id = 'duel-hall' and public.can_post_duel_hall(name))
  with check (bucket_id = 'duel-hall' and public.can_post_duel_hall(name));
drop policy if exists "drop duel hall files" on storage.objects;
create policy "drop duel hall files" on storage.objects for delete to authenticated
  using (bucket_id = 'duel-hall' and public.can_drop_duel_hall(name));

-- ── the opt-out ──
create table if not exists public.duel_hall_optout (
  user_id uuid primary key references public.profiles on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.duel_hall_optout enable row level security;
revoke all on public.duel_hall_optout from anon, authenticated;
grant select, insert, delete on public.duel_hall_optout to authenticated;
drop policy if exists "own duel opt-out" on public.duel_hall_optout;
create policy "own duel opt-out" on public.duel_hall_optout for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── the hall ──
create table if not exists public.duel_hall (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  channel_id uuid references public.channels on delete set null,   -- the stadium it was fought in
  channel_name text not null default '' check (char_length(channel_name) <= 100),
  game_id uuid not null,                                            -- the table (gone soon after; kept for the unique key)
  champ text not null check (char_length(champ) <= 60),             -- the champion's key in games.pub: <artist id>#<round>
  artist_id uuid not null references public.profiles on delete cascade,
  name text not null default '' check (char_length(name) <= 40),
  prompt text not null check (char_length(prompt) between 1 and 300),
  art jsonb not null check (jsonb_typeof(art) = 'array' and pg_column_size(art) <= 24000),
  thumb text check (thumb is null or char_length(thumb) <= 200),     -- path in duel-hall
  cry jsonb check (cry is null or (jsonb_typeof(cry) = 'object' and pg_column_size(cry) <= 1000)), -- {path, ext, ms} or {text, synth}
  round smallint not null check (round between 1 and 99),           -- the round it was drawn in
  votes int not null default 0 check (votes >= 0),                  -- votes it got across all its bouts
  wins int not null default 1 check (wins >= 1),
  streak int not null default 1 check (streak >= 0),                -- its best run of wins in a row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, champ)
);
create index if not exists duel_hall_newest on public.duel_hall (server_id, created_at desc);
create index if not exists duel_hall_votes on public.duel_hall (server_id, votes desc, created_at desc);
create index if not exists duel_hall_artist on public.duel_hall (artist_id);
create index if not exists duel_hall_channel on public.duel_hall (channel_id);

alter table public.duel_hall enable row level security;
revoke all on public.duel_hall from anon, authenticated;
grant select, delete on public.duel_hall to authenticated;
drop policy if exists "members see the duel hall" on public.duel_hall;
create policy "members see the duel hall" on public.duel_hall for select to authenticated
  using (public.is_member(server_id));
drop policy if exists "artists and mods remove duel hall entries" on public.duel_hall;
create policy "artists and mods remove duel hall entries" on public.duel_hall for delete to authenticated
  using (artist_id = (select auth.uid()) or public.has_perm(server_id, 'manage_messages'));

-- Saves (or refreshes) one of the caller's winning champions from a Drawing Duel table. `thumb` and `cry_path` are the
-- files the client uploaded; each must be exactly the expected path and already exist. Everything else comes from games.pub.
-- Mirrors canSave/hallRecord in src/games/pillow/hall.js.
create or replace function public.save_duel_champion(gid uuid, champ text, thumb text default null, cry_path text default null)
returns public.duel_hall
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g record;
  c jsonb;
  rnd int;
  base text;
  n_votes int; n_wins int; first_prompt text;
  saved_cry jsonb;
  row_ public.duel_hall;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.duel_hall_optout o where o.user_id = uid) then
    raise exception 'You chose not to save your champions.' using errcode = 'P0001', hint = 'opted_out';
  end if;
  select gm.id, gm.pub, gm.channel_id, ch.server_id, ch.name into g
    from public.games gm join public.channels ch on ch.id = gm.channel_id
   where gm.id = gid and gm.game = 'pillow';
  if g.id is null or g.server_id is null or not public.can_view_channel(g.channel_id) then raise exception 'That table is gone.'; end if;
  -- your own champion: its key is <your id>#<round> and the referee recorded you as its owner
  if champ !~ ('^' || uid::text || '#[0-9]{1,2}$') then raise exception 'That is not your champion.' using errcode = '42501'; end if;
  c := g.pub->'champs'->champ;
  if c is null or c->>'owner' is distinct from uid::text then raise exception 'That is not your champion.' using errcode = '42501'; end if;
  if jsonb_typeof(c->'art') is distinct from 'array' then raise exception 'That champion has no drawing left.'; end if;
  rnd := split_part(champ, '#', 2)::int;
  -- its record, from the bout log: votes for its side in every bout it fought, and the bouts it won
  select coalesce(sum(case when l->>'a' = champ then (l->>'va')::int when l->>'b' = champ then (l->>'vb')::int
                           when l->>'c' = champ then coalesce((l->>'vc')::int, 0) else 0 end), 0),
         count(*) filter (where l->>(l->>'w') = champ)
    into n_votes, n_wins
    from jsonb_array_elements(coalesce(g.pub->'log', '[]')) l
   where champ in (l->>'a', l->>'b', coalesce(l->>'c', ''));
  if coalesce(n_wins, 0) < 1 then raise exception 'Only winning champions go in the Hall of Fame.' using errcode = 'P0001', hint = 'not_a_winner'; end if;
  -- the title it was drawn for: its first bout
  select l->>'prompt' into first_prompt
    from jsonb_array_elements(g.pub->'log') with ordinality as x(l, i)
   where champ in (l->>'a', l->>'b', coalesce(l->>'c', ''))
   order by x.i limit 1;
  base := g.server_id::text || '/' || uid::text || '/' || gid::text || '_' || rnd::text;
  if thumb is not null and (thumb <> base || '.png'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'duel-hall' and o.name = thumb)) then
    raise exception 'That thumbnail did not upload.' using errcode = '22023';
  end if;
  if c->'cry'->>'ext' is not null then
    if cry_path is not null and (cry_path <> base || '.' || (c->'cry'->>'ext')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'duel-hall' and o.name = cry_path)) then
      raise exception 'That battle cry did not upload.' using errcode = '22023';
    end if;
    saved_cry := case when cry_path is not null
      then jsonb_build_object('path', cry_path, 'ext', c->'cry'->>'ext', 'ms', (c->'cry'->>'ms')::int)
      else jsonb_build_object('synth', coalesce((c->'cry'->>'synth')::int, 0)) end;
  elsif c->'cry' is not null then
    saved_cry := jsonb_strip_nulls(jsonb_build_object('text', left(c->'cry'->>'text', 200), 'synth', coalesce((c->'cry'->>'synth')::int, 0)));
  end if;

  insert into public.duel_hall as h (server_id, channel_id, channel_name, game_id, champ, artist_id, name, prompt, art, thumb, cry,
                                     round, votes, wins, streak)
  values (g.server_id, g.channel_id, left(coalesce(g.name, ''), 100), gid, champ, uid, left(coalesce(c->>'name', ''), 40),
          left(coalesce(first_prompt, 'A mystery title'), 300), c->'art', thumb, saved_cry,
          rnd, n_votes, n_wins, greatest(coalesce((c->>'best')::int, 1), 1))
  on conflict (game_id, champ) do update set
    votes = excluded.votes, wins = excluded.wins, streak = excluded.streak,
    thumb = coalesce(excluded.thumb, h.thumb), cry = case when excluded.cry ? 'path' then excluded.cry else coalesce(h.cry, excluded.cry) end, updated_at = now()
  returning * into row_;
  return row_;
end $$;

revoke execute on function public.duel_hall_server(text), public.can_post_duel_hall(text), public.can_drop_duel_hall(text),
  public.save_duel_champion(uuid, text, text, text) from public, anon;
grant execute on function public.duel_hall_server(text), public.can_post_duel_hall(text), public.can_drop_duel_hall(text),
  public.save_duel_champion(uuid, text, text, text) to authenticated;
