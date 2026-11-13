-- 044 Stadium soundboard (src/Soundboard.jsx, src/lib/sfx.js): short clips anyone in a stadium call fires for everyone
-- in that call. (Without this migration the soundboard button simply doesn't show: stadium_sfx is missing.)
--   stadium_sfx     one row per stadium that a mod has touched: the off switch. No row = on.
--   sfx_clips       custom clips per server: a short audio file in the media bucket (<uploader>/<uuid>/<name>), named.
--   sfx_last        when each person last fired a clip (the server-side rate limit). Nobody reads it directly.
--   sfx_do()        every action, checked here: fire · disable / enable (mods) · add / delete a custom clip.
--   can_use_topic   gains 'sfx:<stadium id>': anyone who can see the stadium may listen. Nobody may broadcast on it
--                   directly ("topic write" below): clips only arrive through sfx_do, which applies the rate limit.
-- The built-in clips are synthesised in the browser; the list below must match SFX_IDS in src/lib/sfx.js (a test checks).

create table if not exists public.stadium_sfx (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  disabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.stadium_sfx enable row level security;
drop policy if exists "stadium viewers see the soundboard switch" on public.stadium_sfx;
create policy "stadium viewers see the soundboard switch" on public.stadium_sfx for select to authenticated using (public.can_view_channel(channel_id));
revoke all on public.stadium_sfx from public, anon, authenticated;
grant select on public.stadium_sfx to authenticated;
grant all on public.stadium_sfx to service_role;

create table if not exists public.sfx_clips (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  path text not null check (char_length(path) <= 200),
  dur real not null check (dur > 0 and dur <= 5.05),
  size int not null check (size between 1 and 300000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sfx_clips_server on public.sfx_clips (server_id, created_at);
alter table public.sfx_clips enable row level security;
drop policy if exists "members see the server's clips" on public.sfx_clips;
create policy "members see the server's clips" on public.sfx_clips for select to authenticated using (public.is_member(server_id));
revoke all on public.sfx_clips from public, anon, authenticated;
grant select on public.sfx_clips to authenticated;
grant all on public.sfx_clips to service_role;

create table if not exists public.sfx_last (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  at timestamptz not null
);
alter table public.sfx_last enable row level security;
revoke all on public.sfx_last from public, anon, authenticated;
grant all on public.sfx_last to service_role;

do $$ begin
  alter publication supabase_realtime add table public.stadium_sfx;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sfx_clips;
exception when duplicate_object then null; end $$;

-- act: fire {clip: built-in id | custom clip uuid} · disable · enable · add {name, path, dur} · delete {id}
-- Who: anyone who can talk in the stadium (sees it, not timed out, agreed to the rules) fires and adds clips.
-- Disable / enable: mods (manage_messages / manage_channels). Delete: whoever added the clip, or a mod.
-- fire: refused while the stadium's soundboard is off, and under 1.8 s after your last clip (the app waits 2 s).
--       Broadcasts { by, clip, name?, path? } as event 'sfx' on the private topic 'sfx:<stadium id>'.
-- add:  the file must already be in the media bucket under your own folder, audio, and at most 300 KB (read from the
--       storage object's metadata, so the app's word isn't needed). The length is the app's measurement (≤ 5 s).
--       At most 60 clips per server and 12 per person per server.
-- Returns { row } (disable / enable), { clip } (add), { path, by } (delete), { ok } (fire).
create or replace function public.sfx_do(cid uuid, act text, arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ch public.channels;
  r public.stadium_sfx;
  c public.sfx_clips;
  is_mod boolean;
  builtins text[] := array['honk', 'rimshot', 'crickets', 'applause', 'wahwah', 'boing', 'drumroll', 'ding', 'whoosh',
    'kazoo', 'cheer', 'gasp', 'bonk', 'tada'];
  clip text; nm text; p text; sz bigint; mime text; d double precision; n int; payload jsonb;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into ch from public.channels where id = cid;
  if ch.id is null or ch.kind <> 'voice' or ch.server_id is null or not public.can_view_channel(cid) then
    raise exception 'That stadium isn''t available.' using errcode = '42501';
  end if;
  if public.post_block(ch.server_id) is not null then
    raise exception 'You can listen, but you can''t use the soundboard right now.' using errcode = '42501';
  end if;
  is_mod := public.has_perm(ch.server_id, 'manage_messages') or public.has_perm(ch.server_id, 'manage_channels');
  select * into r from public.stadium_sfx where channel_id = cid;

  if act in ('disable', 'enable') then
    if not is_mod then raise exception 'Only mods can turn the soundboard on or off.' using errcode = '42501'; end if;
    insert into public.stadium_sfx (channel_id, disabled, updated_by) values (cid, act = 'disable', me)
      on conflict (channel_id) do update set disabled = excluded.disabled, updated_by = me, updated_at = now()
      returning * into r;
    return jsonb_build_object('row', to_jsonb(r));
  end if;

  if act = 'fire' then
    if coalesce(r.disabled, false) then raise exception 'The soundboard is turned off in this stadium.' using errcode = '42501'; end if;
    clip := arg->>'clip';
    if clip = any(builtins) then
      payload := jsonb_build_object('by', me, 'clip', clip);
    elsif clip ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into c from public.sfx_clips where id = clip::uuid and server_id = ch.server_id;
      if c.id is null then raise exception 'That clip isn''t on this server any more.' using errcode = '22023'; end if;
      payload := jsonb_build_object('by', me, 'clip', c.id, 'name', c.name, 'path', c.path);
    else
      raise exception 'Unknown clip.' using errcode = '22023';
    end if;
    -- the rate limit: one row per person, moved forward only if the last clip was 1.8 s ago or more
    insert into public.sfx_last (user_id, at) values (me, clock_timestamp())
      on conflict (user_id) do update set at = excluded.at where public.sfx_last.at <= excluded.at - interval '1800 milliseconds';
    if not found then raise exception 'Easy there, one clip every couple of seconds.' using errcode = '22023'; end if;
    perform realtime.send(payload, 'sfx', 'sfx:' || cid::text, true);
    return jsonb_build_object('ok', true);
  end if;

  if act = 'add' then
    nm := btrim(regexp_replace(coalesce(arg->>'name', ''), '\s+', ' ', 'g'));
    p := arg->>'path';
    if char_length(nm) not between 1 and 24 then raise exception 'Clip names are 1 to 24 characters.' using errcode = '22023'; end if;
    if p is null or p !~ ('^' || me::text || '/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$') then
      raise exception 'Upload the clip first.' using errcode = '22023';
    end if;
    select (o.metadata->>'size')::bigint, o.metadata->>'mimetype' into sz, mime
      from storage.objects o where o.bucket_id = 'media' and o.name = p;
    if sz is null then raise exception 'Upload the clip first.' using errcode = '22023'; end if;
    if coalesce(mime, '') not like 'audio/%' then raise exception 'Clips have to be audio.' using errcode = '22023'; end if;
    if sz > 300000 then raise exception 'Clips can be up to 300 KB.' using errcode = '22023'; end if;
    d := case when jsonb_typeof(arg->'dur') = 'number' then (arg->>'dur')::double precision end;
    if d is null or d <= 0 or d > 5.05 then raise exception 'Clips can be up to 5 seconds.' using errcode = '22023'; end if;
    select count(*) into n from public.sfx_clips where server_id = ch.server_id;
    if n >= 60 then raise exception 'This server has 60 clips already. Delete a few first.' using errcode = '22023'; end if;
    select count(*) into n from public.sfx_clips where server_id = ch.server_id and created_by = me;
    if n >= 12 then raise exception 'You have 12 clips on this server already.' using errcode = '22023'; end if;
    insert into public.sfx_clips (server_id, name, path, dur, size, created_by)
      values (ch.server_id, nm, p, round(d::numeric, 2), sz, me) returning * into c;
    return jsonb_build_object('clip', to_jsonb(c));
  end if;

  if act = 'delete' then
    select * into c from public.sfx_clips where id = (arg->>'id')::uuid and server_id = ch.server_id;
    if c.id is null then return jsonb_build_object('path', null, 'by', null); end if;
    if not (is_mod or c.created_by = me) then raise exception 'You can only delete your own clips.' using errcode = '42501'; end if;
    delete from public.sfx_clips where id = c.id;
    -- shortcut: the file stays in storage when a mod deletes someone else's clip (only its owner can remove it through
    -- the Storage API); the app removes its own uploads. A sweep can clear orphans later if storage ever gets tight.
    return jsonb_build_object('path', c.path, 'by', c.created_by);
  end if;

  raise exception 'Unknown soundboard action.' using errcode = '22023';
end $$;

revoke execute on function public.sfx_do(uuid, text, jsonb) from public, anon;
grant execute on function public.sfx_do(uuid, text, jsonb) to authenticated;

-- The live can_use_topic (online, chan/chat, call, and 037_flyer_ghosts' fly:) plus 'sfx:'. If another migration
-- also redefines can_use_topic, merge the branches.
create or replace function public.can_use_topic(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when t = 'online' then auth.uid() is not null
    when t ~ '^(chan|chat):[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 6)::uuid)
      and not (t like 'chan:%' and exists (select 1 from public.channels c
        where c.id = substr(t, 6)::uuid and c.kind = 'voice' and public.post_block(c.server_id) is not null))
    when t ~ '^call:[0-9a-f-]{36}$' then
      exists (select 1 from public.channels c where c.id = substr(t, 6)::uuid and c.kind = 'dm')
      and public.can_view_channel(substr(t, 6)::uuid) and not public.dm_blocks_me(substr(t, 6)::uuid)
    when t ~ '^fly:[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 5)::uuid)
    when t ~ '^sfx:[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 5)::uuid)
    else false end
$$;

-- The realtime policies (set up in the dashboard, not in an earlier migration) are "topic read" (select) and "topic
-- write" (insert), both can_use_topic(realtime.topic()). Listening on sfx: is fine; writing to it is sfx_do's job (it
-- runs as the owner, which bypasses RLS), so clients can't skip the rate limit by broadcasting themselves.
drop policy if exists "topic write" on realtime.messages;
create policy "topic write" on realtime.messages for insert to authenticated
  with check (public.can_use_topic(realtime.topic()) and realtime.topic() not like 'sfx:%');
