-- 040 Pillow Chit Fight battle cries: a private storage bucket for the short baked voice clips each champion shouts
-- in the battle. Path: <game id>/<owner user id>/<round>.<ext> (ext wav, webm, ogg or mp4; the app sends 16 kHz WAV).
--   read     anyone who can view the stadium the table is in (same rule as the games row)
--   write    a seated player of that Pillow table, into their own folder only (upsert needs insert + update)
--   delete   your own clips
-- Clips are temporary: the `game` edge function removes a table's clips when the host closes it or starts a new
-- game, and sweeps folders of tables that no longer exist whenever a Pillow table opens or closes (storage objects
-- can only be deleted through the Storage API, so there's no SQL trigger for it).
-- Drawings are not stored here: they are small stroke data in games.pub (capped by src/games/pillow/ink.js).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('battle-cries', 'battle-cries', false, 400000, array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/ogg', 'audio/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The table a clip belongs to, from the first folder of its path (null for anything malformed).
create or replace function public.battle_cry_game(name text) returns uuid
language sql stable set search_path = '' as $$
  select case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[1])::uuid end
$$;

-- May the caller upload into this path? Their own folder, at a Pillow table they're seated at.
create or replace function public.can_post_battle_cry(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (storage.foldername(name))[2] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,2}\.(wav|webm|ogg|mp4)$'
    and exists (
      select 1 from public.games g join public.game_seats s on s.game_id = g.id
      where g.id = public.battle_cry_game(name) and g.game = 'pillow' and s.user_id = (select auth.uid()))
$$;

-- May the caller hear this clip? Anyone who can see the stadium the table is in.
create or replace function public.can_hear_battle_cry(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.games g where g.id = public.battle_cry_game(name) and public.can_view_channel(g.channel_id))
$$;

revoke execute on function public.can_post_battle_cry(text), public.can_hear_battle_cry(text) from public, anon;
grant execute on function public.can_post_battle_cry(text), public.can_hear_battle_cry(text) to authenticated;

drop policy if exists "hear battle cries" on storage.objects;
create policy "hear battle cries" on storage.objects for select to authenticated
  using (bucket_id = 'battle-cries' and public.can_hear_battle_cry(name));

drop policy if exists "post battle cries" on storage.objects;
create policy "post battle cries" on storage.objects for insert to authenticated
  with check (bucket_id = 'battle-cries' and public.can_post_battle_cry(name));

drop policy if exists "redo battle cries" on storage.objects;
create policy "redo battle cries" on storage.objects for update to authenticated
  using (bucket_id = 'battle-cries' and public.can_post_battle_cry(name))
  with check (bucket_id = 'battle-cries' and public.can_post_battle_cry(name));

drop policy if exists "drop own battle cries" on storage.objects;
create policy "drop own battle cries" on storage.objects for delete to authenticated
  using (bucket_id = 'battle-cries' and (storage.foldername(name))[2] = (select auth.uid())::text);
