-- Entrance and exit animations: a per-user pick played on your seat when you join or leave a stadium or DM call.
-- Ids are short lowercase words (anvil, ufo, firework, plane, molehill, bubble, teleport, pie: src/lib/entrances.js);
-- the client treats anything it doesn't know as the plain default, so new ones need no migration. null = default.
-- Other members read them with the rest of the profile (select '*', plus the profiles UPDATE realtime feed).
-- NOT APPLIED YET. Until it is, the app works as before and picking one in Settings just shows "couldn't save".
alter table public.profiles
  add column if not exists entrance_anim text check (entrance_anim ~ '^[a-z]{1,20}$'),
  add column if not exists exit_anim text check (exit_anim ~ '^[a-z]{1,20}$');
grant update (entrance_anim, exit_anim) on public.profiles to authenticated;
