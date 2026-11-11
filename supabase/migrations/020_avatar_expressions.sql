-- Optional extra PNGtuber images: { typing|muted|deafened|away|live: { url, crop } }
alter table public.profiles add column if not exists avatar_states jsonb not null default '{}'::jsonb;
alter table public.profiles add constraint avatar_states_shape check (
  jsonb_typeof(avatar_states) = 'object'
  and avatar_states - array['typing','muted','deafened','away','live'] = '{}'::jsonb
  and pg_column_size(avatar_states) < 8192);
grant update (avatar_states) on public.profiles to authenticated;

-- 021: blink images
alter table public.profiles drop constraint avatar_states_shape;
alter table public.profiles add constraint avatar_states_shape check (
  jsonb_typeof(avatar_states) = 'object'
  and avatar_states - array['typing','muted','deafened','away','live','blink','talk_blink'] = '{}'::jsonb
  and pg_column_size(avatar_states) < 8192);
