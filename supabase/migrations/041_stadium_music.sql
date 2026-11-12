-- 041 Chit Radio: a synced listen-along music player per stadium (src/Radio.jsx, src/lib/music.js).
-- Nothing is re-streamed: the row holds what is playing and since when (server clock), and every listener's own
-- browser plays the same track at the same spot (YouTube IFrame player, SoundCloud widget, or an <audio> element).
--   stadium_music   one row per stadium: state (the current track, started_at/paused_at in server epoch ms, skip votes)
--                   and the upcoming queue. Anyone who can see the stadium reads it; nobody writes it directly.
--   music_do()      every change, checked here: who may do what, URL/field validation, queue limits, vote-to-skip.
--   music_now()     server clock in epoch ms, so clients with skewed clocks still line up.

create table if not exists public.stadium_music (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  -- { track: {id,kind,src,title,art,dur,by,at} | null, started_at: ms, paused_at: ms | null, skips: [uid] }
  state jsonb not null default '{}' check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 8000),
  queue jsonb not null default '[]' check (jsonb_typeof(queue) = 'array' and jsonb_array_length(queue) <= 50 and pg_column_size(queue) < 64000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.stadium_music enable row level security;
drop policy if exists "stadium viewers see the radio" on public.stadium_music;
create policy "stadium viewers see the radio" on public.stadium_music for select to authenticated using (public.can_view_channel(channel_id));
revoke all on public.stadium_music from public, anon, authenticated;
grant select on public.stadium_music to authenticated;
grant all on public.stadium_music to service_role;
alter publication supabase_realtime add table public.stadium_music;

create or replace function public.music_now() returns double precision
language sql stable set search_path = '' as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::double precision
$$;

-- What a client may put in a track (the rest is filled in by music_do). Mirrors validTrack() in src/lib/music.js.
--   yt: an 11-character video id · sc: a soundcloud.com track/set page · audio: any https URL (uploads land in the media bucket)
create or replace function public.music_track_ok(t jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(t) = 'object'
    and case t->>'kind'
      when 'yt' then (t->>'src') ~ '^[A-Za-z0-9_-]{11}$'
      when 'sc' then (t->>'src') ~ '^https://(www\.|m\.)?soundcloud\.com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)?$'
      when 'audio' then (t->>'src') ~ '^https://[^\s"''<>\\]+$'
      else false end
    and char_length(t->>'src') <= 500
    and char_length(btrim(t->>'title')) between 1 and 200
    and (t->'art' is null or jsonb_typeof(t->'art') = 'null'
      or ((t->>'art') ~ '^https://(i\.ytimg\.com|[a-z0-9-]+\.sndcdn\.com)/[^\s"''<>\\]+$' and char_length(t->>'art') <= 500))
    and (t->'dur' is null or jsonb_typeof(t->'dur') = 'null'
      or (jsonb_typeof(t->'dur') = 'number' and (t->>'dur')::numeric between 1 and 43200)), false)
$$;

-- act: add {track} · remove {id} · skip {id, listeners} · pause {id} · resume {id} · ended {id} · dur {id, dur} · clear
-- Who: anyone who can talk in the stadium (sees it, not timed out, agreed to the rules) adds, votes and reports end/duration.
-- Instant skip, pause and resume: whoever queued the current track, or a mod (manage_messages / manage_channels).
-- Remove: your own queued entries, or anyone's for mods. Clear: mods. Returns { row, now }.
create or replace function public.music_do(cid uuid, act text, arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ch public.channels;
  r public.stadium_music;
  st jsonb; q jsonb; cur jsonb; t jsonb;
  now_ms double precision := public.music_now();
  is_mod boolean;
  n int; listeners int; elapsed double precision;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into ch from public.channels where id = cid;
  if ch.id is null or ch.kind <> 'voice' or ch.server_id is null or not public.can_view_channel(cid) then
    raise exception 'That stadium isn''t available.' using errcode = '42501';
  end if;
  if public.post_block(ch.server_id) is not null then
    raise exception 'You can listen along, but you can''t change the music right now.' using errcode = '42501';
  end if;
  is_mod := public.has_perm(ch.server_id, 'manage_messages') or public.has_perm(ch.server_id, 'manage_channels');

  insert into public.stadium_music (channel_id) values (cid) on conflict do nothing;
  select * into r from public.stadium_music where channel_id = cid for update;
  st := r.state; q := r.queue; cur := st->'track';
  if jsonb_typeof(cur) <> 'object' then cur := null; end if;

  -- Most actions name the track they mean, so a stale click (it already moved on) does nothing.
  if act in ('skip', 'pause', 'resume', 'ended', 'dur') and (cur is null or cur->>'id' is distinct from arg->>'id') then
    return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
  end if;

  if act = 'add' then
    t := arg->'track';
    if not public.music_track_ok(t) then raise exception 'That link can''t be played here.' using errcode = '22023'; end if;
    select count(*) into n from jsonb_array_elements(q) as x(e) where e->>'by' = me::text;
    if n >= 10 then raise exception 'You already have 10 songs queued. Let a few play first.' using errcode = '22023'; end if;
    if jsonb_array_length(q) >= 50 then raise exception 'The queue is full (50 songs).' using errcode = '22023'; end if;
    t := jsonb_build_object('id', gen_random_uuid(), 'kind', t->>'kind', 'src', t->>'src', 'title', btrim(t->>'title'),
      'art', t->'art', 'dur', t->'dur', 'by', me, 'at', now_ms);
    if cur is null then
      st := jsonb_build_object('track', t, 'started_at', now_ms, 'paused_at', null, 'skips', '[]'::jsonb);
    else
      q := q || jsonb_build_array(t);
    end if;

  elsif act = 'remove' then
    select coalesce(jsonb_agg(e order by i), '[]') into q from jsonb_array_elements(r.queue) with ordinality as x(e, i)
      where not (e->>'id' = arg->>'id' and (is_mod or e->>'by' = me::text));
    if jsonb_array_length(q) = jsonb_array_length(r.queue) then
      raise exception 'You can only take your own songs out of the queue.' using errcode = '42501';
    end if;

  elsif act = 'skip' then
    if not (is_mod or cur->>'by' = me::text) then
      if not coalesce(st->'skips', '[]') ? me::text then
        st := jsonb_set(st, '{skips}', coalesce(st->'skips', '[]') || to_jsonb(me::text));
      end if;
      -- shortcut: the listener count comes from the voter's own presence view (the database can't see who's in voice);
      -- clamped so it can't be under the votes already in. Worst case someone skips a song alone. Fine for a cozy server.
      listeners := least(99, greatest(1, coalesce((arg->>'listeners')::int, 1), jsonb_array_length(st->'skips')));
      if jsonb_array_length(st->'skips') * 2 <= listeners then
        update public.stadium_music set state = st, updated_by = me, updated_at = now() where channel_id = cid returning * into r;
        return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
      end if;
    end if;
    st := null; -- advance below

  elsif act = 'ended' then
    elapsed := coalesce((st->>'paused_at')::double precision, now_ms) - (st->>'started_at')::double precision;
    if elapsed < 5000 or (jsonb_typeof(cur->'dur') = 'number' and elapsed < ((cur->>'dur')::double precision - 4) * 1000) then
      return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
    end if;
    st := null;

  elsif act = 'dur' then
    if jsonb_typeof(cur->'dur') = 'number' or jsonb_typeof(arg->'dur') <> 'number'
      or (arg->>'dur')::numeric not between 1 and 43200 then
      return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
    end if;
    st := jsonb_set(st, '{track,dur}', to_jsonb(round((arg->>'dur')::numeric, 1)));

  elsif act in ('pause', 'resume') then
    if not (is_mod or cur->>'by' = me::text) then
      raise exception 'Only whoever queued this song (or a mod) can pause it.' using errcode = '42501';
    end if;
    if act = 'pause' and jsonb_typeof(st->'paused_at') is distinct from 'number' then
      st := jsonb_set(st, '{paused_at}', to_jsonb(now_ms));
    elsif act = 'resume' and jsonb_typeof(st->'paused_at') = 'number' then
      st := jsonb_set(jsonb_set(st, '{started_at}', to_jsonb(now_ms - ((st->>'paused_at')::double precision - (st->>'started_at')::double precision))),
        '{paused_at}', 'null');
    end if;

  elsif act = 'clear' then
    if not is_mod then raise exception 'Only mods can clear the radio.' using errcode = '42501'; end if;
    st := '{}'; q := '[]';

  else
    raise exception 'Unknown radio action.' using errcode = '22023';
  end if;

  -- Advance: the next queued song starts now, or the radio goes quiet.
  if st is null then
    if jsonb_array_length(q) > 0 then
      st := jsonb_build_object('track', q->0, 'started_at', now_ms, 'paused_at', null, 'skips', '[]'::jsonb);
      q := q - 0;
    else
      st := '{}';
    end if;
  end if;

  update public.stadium_music set state = st, queue = q, updated_by = me, updated_at = now() where channel_id = cid returning * into r;
  return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
end $$;

revoke execute on function public.music_do(uuid, text, jsonb), public.music_now(), public.music_track_ok(jsonb) from public, anon;
grant execute on function public.music_do(uuid, text, jsonb), public.music_now() to authenticated;
