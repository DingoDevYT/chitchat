-- Avatar setups: several named PNGtuber setups per person, one (or none) active.
-- NOT APPLIED YET: apply before shipping the "My avatars" client.
--
-- The active setup's look is copied into the existing profile avatar columns (avatar_idle, avatar_crop, avatar_talk,
-- avatar_talk_crop, avatar_states), so every renderer and the profiles realtime feed keep working unchanged.
-- profiles.avatar_setup says which setup that is; profiles.avatar_base keeps the plain profile picture ({url, crop})
-- while a setup is active, so switching to "no setup" puts it back. With no setup, avatar_idle is the picture.
-- Images live in the existing public 'media' bucket under the owner's folder, like every other upload.

create table public.avatar_setups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- credit for imported setups (from the .chitpal file); null = made by the owner
  creator text check (char_length(creator) <= 64),
  -- same keys as the profile columns it is copied into
  look jsonb not null default '{}'::jsonb check (
    jsonb_typeof(look) = 'object'
    and look - array['avatar_idle','avatar_crop','avatar_talk','avatar_talk_crop','avatar_states'] = '{}'::jsonb
    and pg_column_size(look) < 12288),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index avatar_setups_owner on public.avatar_setups (owner_id, position);

alter table public.avatar_setups enable row level security;
-- Members read (any signed-in person, same as profiles, which carry the active look anyway); only the owner writes.
create policy "setups readable" on public.avatar_setups for select to authenticated using (true);
create policy "own setups insert" on public.avatar_setups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own setups update" on public.avatar_setups for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own setups delete" on public.avatar_setups for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.avatar_setups from anon;
grant select, insert, delete on public.avatar_setups to authenticated;
grant update (name, creator, look, position, updated_at) on public.avatar_setups to authenticated;

-- At most 30 setups each (images are the real cost; this keeps one account from hoarding).
create function public.avatar_setups_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.avatar_setups where owner_id = new.owner_id) >= 30 then
    raise exception 'You can keep up to 30 avatars. Delete one to make room.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger avatar_setups_cap before insert on public.avatar_setups for each row execute function public.avatar_setups_cap();

-- Profile side
alter table public.profiles
  add column if not exists avatar_setup uuid references public.avatar_setups on delete set null,
  add column if not exists avatar_base jsonb check (avatar_base is null or (jsonb_typeof(avatar_base) = 'object'
    and avatar_base - array['url','crop'] = '{}'::jsonb and pg_column_size(avatar_base) < 2048));
grant update (avatar_setup, avatar_base) on public.profiles to authenticated;

-- Existing PNGtubers (a talking image or any extra expression) get their current look as a first, active setup.
-- Plain one-picture profiles are left alone: that picture is just their profile picture.
insert into public.avatar_setups (owner_id, name, look)
select id, 'My avatar', jsonb_strip_nulls(jsonb_build_object(
    'avatar_idle', avatar_idle, 'avatar_crop', avatar_crop, 'avatar_talk', avatar_talk,
    'avatar_talk_crop', avatar_talk_crop, 'avatar_states', avatar_states))
from public.profiles
where avatar_talk is not null or avatar_states <> '{}'::jsonb;
update public.profiles p set avatar_setup = s.id,
  avatar_base = case when p.avatar_idle is null then null
    else jsonb_strip_nulls(jsonb_build_object('url', p.avatar_idle, 'crop', p.avatar_crop)) end
from public.avatar_setups s where s.owner_id = p.id;

-- You can only wear your own setup. (After the backfill so it doesn't run for it.)
create function public.avatar_setup_owned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_setup is not null and not exists (
    select 1 from public.avatar_setups where id = new.avatar_setup and owner_id = new.id) then
    raise exception 'That avatar is not yours.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger avatar_setup_owned before insert or update of avatar_setup on public.profiles
  for each row execute function public.avatar_setup_owned();
revoke execute on function public.avatar_setups_cap(), public.avatar_setup_owned() from public, anon, authenticated;
