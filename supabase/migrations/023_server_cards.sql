-- Server rail cards: banner (cropped to 2.5:1), accent colour and a short message of the day.
-- servers updates are column-granted; the existing "admins edit server" policy (has_perm manage_server) still applies.
alter table public.servers
  add column if not exists banner_url text,
  add column if not exists banner_crop jsonb,
  add column if not exists accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists motd text check (char_length(motd) <= 80);
grant update (banner_url, banner_crop, accent, motd) on public.servers to authenticated;
