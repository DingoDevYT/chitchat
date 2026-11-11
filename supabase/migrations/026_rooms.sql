-- Rooms (text channels) and stadiums get their own look: icon, name font, banner, accent, topic, background,
-- welcome message and slowmode. Categories get icon, accent and banner. Edits stay gated by the existing RLS
-- policies (manage_channels); channels/categories updates are column-granted, so the new columns are granted here.

-- Images must come from this project's public media bucket (no third-party hotlinks / tracking pixels).
create or replace function public.is_media_url(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u ~ '^https://nilludyavkfqwastghmw\.supabase\.co/storage/v1/object/public/media/[^\s"''()<>]+$' and char_length(u) <= 500
$$;

-- icon: a short emoji, a custom server emoji token (<:name:id> / <a:name:id>) or an uploaded image.
create or replace function public.valid_room_icon(i text) returns boolean
language sql immutable set search_path = '' as $$
  select i is null
    or i ~* '^<a?:[a-z0-9_]{2,32}:[0-9a-f-]{36}>$'
    or public.is_media_url(i)
    or (char_length(i) between 1 and 16 and i !~ '[\s<>:/]')
$$;

alter table public.channels
  add column if not exists icon text check (public.valid_room_icon(icon)),
  add column if not exists font text check (font in ('Nunito', 'Fredoka', 'Baloo 2', 'Comfortaa', 'Patrick Hand', 'Caveat', 'Pacifico',
    'Lobster', 'Righteous', 'Bungee', 'Press Start 2P', 'Silkscreen', 'Space Grotesk', 'Playfair Display')),
  add column if not exists banner_url text check (banner_url is null or public.is_media_url(banner_url)),
  add column if not exists banner_crop jsonb check (banner_crop is null or (jsonb_typeof(banner_crop) = 'object' and pg_column_size(banner_crop) < 400)),
  add column if not exists accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists topic text check (char_length(topic) <= 200),
  add column if not exists background_url text check (background_url is null or public.is_media_url(background_url)),
  add column if not exists background_dim smallint not null default 70 check (background_dim between 0 and 90),
  add column if not exists welcome text check (char_length(welcome) <= 500),
  add column if not exists slowmode_sec int not null default 0 check (slowmode_sec between 0 and 21600);

alter table public.categories
  add column if not exists icon text check (public.valid_room_icon(icon)),
  add column if not exists accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists banner_url text check (banner_url is null or public.is_media_url(banner_url)),
  add column if not exists banner_crop jsonb check (banner_crop is null or (jsonb_typeof(banner_crop) = 'object' and pg_column_size(banner_crop) < 400));

grant update (icon, font, banner_url, banner_crop, accent, topic, background_url, background_dim, welcome, slowmode_sec)
  on public.channels to authenticated;
grant update (icon, accent, banner_url, banner_crop) on public.categories to authenticated;

-- Slowmode: one message per slowmode_sec per person per channel, unless you can manage messages/channels or own the server.
create index if not exists messages_slowmode_idx on public.messages (channel_id, author_id, id desc);

create or replace function public.enforce_slowmode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  last timestamptz;
  left_s int;
begin
  select ch.slowmode_sec, ch.server_id, s.owner_id into c
    from public.channels ch left join public.servers s on s.id = ch.server_id where ch.id = new.channel_id;
  if coalesce(c.slowmode_sec, 0) = 0 or c.server_id is null or c.owner_id = new.author_id
     or public.has_perm(c.server_id, 'manage_messages') or public.has_perm(c.server_id, 'manage_channels') then
    return new;
  end if;
  select m.created_at into last from public.messages m
   where m.channel_id = new.channel_id and m.author_id = new.author_id order by m.id desc limit 1;
  if last is not null and last > now() - make_interval(secs => c.slowmode_sec) then
    left_s := ceil(extract(epoch from (last + make_interval(secs => c.slowmode_sec) - now())))::int;
    raise exception 'Slowmode is on here. You can send again in %s.', left_s
      using errcode = 'P0001', hint = 'slowmode:' || left_s;
  end if;
  return new;
end $$;

drop trigger if exists enforce_slowmode on public.messages;
create trigger enforce_slowmode before insert on public.messages for each row execute function public.enforce_slowmode();
revoke execute on function public.enforce_slowmode() from public, anon, authenticated;
