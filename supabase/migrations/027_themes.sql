-- 027: animated themes for servers, categories and rooms/stadiums.
-- null = inherit (channel → category → server → none). Ids must match THEME_IDS in src/lib/themes.js.
-- Edits stay gated by the existing update policies (server owner / manage_channels); UPDATE is column-granted on these tables.

create or replace function public.valid_theme(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t is null or t in ('none', 'gradient', 'beach', 'night', 'rain', 'forest', 'snow', 'sakura', 'sea', 'synthwave', 'campfire')
$$;

alter table public.servers add column if not exists theme text check (public.valid_theme(theme));
alter table public.categories add column if not exists theme text check (public.valid_theme(theme));
alter table public.channels add column if not exists theme text check (public.valid_theme(theme));

grant update (theme) on public.servers to authenticated;
grant update (theme) on public.categories to authenticated;
grant update (theme) on public.channels to authenticated;
