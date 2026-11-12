-- 042 Chit Radio: loop modes and an admin off switch (src/Radio.jsx, src/lib/music.js). Builds on 041_stadium_music.sql.
--   state.loop        'off' (missing = off) · 'queue' (finished and skipped songs go to the back of the queue) · 'one'
--                     (the song starts over when it ends; skipping still moves on, and the next song loops instead)
--   disabled          a mod turned the radio off in this stadium: nothing plays, nothing can be queued until they turn it on
-- A song that comes round again gets a fresh id, so every listener's player starts it cleanly and a late "ended" or
-- "skip" from the previous play (which names the old id) is ignored.

alter table public.stadium_music add column if not exists disabled boolean not null default false;

-- act: add {track} · remove {id} · skip {id, listeners} · pause {id} · resume {id} · ended {id} · dur {id, dur} · clear
--      · loop {mode} · disable · enable
-- Who: anyone who can talk in the stadium (sees it, not timed out, agreed to the rules) adds, votes and reports end/duration.
-- Instant skip, pause, resume and loop: whoever queued the current track, or a mod (manage_messages / manage_channels).
-- (With nothing playing, only mods set the loop.) Remove: your own queued entries, or anyone's for mods.
-- Clear, disable, enable: mods. While disabled, everything but enable is refused. Returns { row, now }.
create or replace function public.music_do(cid uuid, act text, arg jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ch public.channels;
  r public.stadium_music;
  st jsonb; q jsonb; cur jsonb; t jsonb;
  done jsonb := null;   -- the song that just finished or was skipped (loop 'queue' sends it to the back)
  lp text; lpj jsonb;   -- loop mode, and it as a state fragment to carry into the next song
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
  lp := coalesce(st->>'loop', 'off');
  if lp not in ('off', 'queue', 'one') then lp := 'off'; end if;

  -- The off switch.
  if act in ('disable', 'enable') then
    if not is_mod then raise exception 'Only mods can turn the radio on or off.' using errcode = '42501'; end if;
    if act = 'disable' then
      update public.stadium_music set disabled = true, state = '{}', queue = '[]', updated_by = me, updated_at = now()
        where channel_id = cid returning * into r;
    else
      update public.stadium_music set disabled = false, updated_by = me, updated_at = now() where channel_id = cid returning * into r;
    end if;
    return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
  end if;
  if r.disabled then raise exception 'The radio is turned off in this stadium.' using errcode = '42501'; end if;

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
      st := jsonb_build_object('track', t, 'started_at', now_ms, 'paused_at', null, 'skips', '[]'::jsonb)
        || case when lp <> 'off' then jsonb_build_object('loop', lp) else '{}'::jsonb end;
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
    -- skipping always moves on (even looping one song: the next song is the one that loops now)
    done := cur;
    st := null; -- advance below

  elsif act = 'ended' then
    elapsed := coalesce((st->>'paused_at')::double precision, now_ms) - (st->>'started_at')::double precision;
    if elapsed < 5000 or (jsonb_typeof(cur->'dur') = 'number' and elapsed < ((cur->>'dur')::double precision - 4) * 1000) then
      return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
    end if;
    if lp = 'one' then
      -- the same song again from the top, as a fresh play (new id, no skip votes)
      st := jsonb_build_object('track', jsonb_set(cur, '{id}', to_jsonb(gen_random_uuid())), 'started_at', now_ms,
        'paused_at', null, 'skips', '[]'::jsonb, 'loop', lp);
    else
      done := cur;
      st := null;
    end if;

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

  elsif act = 'loop' then
    if not (is_mod or (cur is not null and cur->>'by' = me::text)) then
      raise exception 'Only whoever queued this song (or a mod) can change the loop.' using errcode = '42501';
    end if;
    if coalesce(arg->>'mode', '') not in ('off', 'queue', 'one') then
      raise exception 'Loop can be off, queue or one.' using errcode = '22023';
    end if;
    st := case when arg->>'mode' = 'off' then st - 'loop' else st || jsonb_build_object('loop', arg->>'mode') end;

  elsif act = 'clear' then
    if not is_mod then raise exception 'Only mods can clear the radio.' using errcode = '42501'; end if;
    st := '{}'; q := '[]';

  else
    raise exception 'Unknown radio action.' using errcode = '22023';
  end if;

  -- Advance: looping the queue sends the finished song to the back (fresh id), then the next queued song starts now,
  -- or the radio goes quiet. The loop mode carries over either way.
  if st is null then
    lpj := case when lp <> 'off' then jsonb_build_object('loop', lp) else '{}'::jsonb end;
    if lp = 'queue' and done is not null then
      q := q || jsonb_build_array(jsonb_set(done, '{id}', to_jsonb(gen_random_uuid())));
    end if;
    if jsonb_array_length(q) > 0 then
      st := jsonb_build_object('track', q->0, 'started_at', now_ms, 'paused_at', null, 'skips', '[]'::jsonb) || lpj;
      q := q - 0;
    else
      st := lpj;
    end if;
  end if;

  update public.stadium_music set state = st, queue = q, updated_by = me, updated_at = now() where channel_id = cid returning * into r;
  return jsonb_build_object('row', to_jsonb(r), 'now', now_ms);
end $$;

revoke execute on function public.music_do(uuid, text, jsonb) from public, anon;
grant execute on function public.music_do(uuid, text, jsonb) to authenticated;
