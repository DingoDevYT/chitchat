-- Custom server emoji. In message content: <:name:id> (animated: <a:name:id>).

create function public.can_manage_emoji(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.server_role(sid) in ('owner','admin'), false)
$$;

create table public.server_emoji (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  -- only our own public bucket, so an emoji can't be a third-party tracking pixel
  url text not null check (url like 'https://nilludyavkfqwastghmw.supabase.co/storage/v1/object/public/media/%'),
  animated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

alter table public.server_emoji enable row level security;
create policy "members see emoji" on public.server_emoji for select to authenticated using (public.is_member(server_id));
create policy "managers add emoji" on public.server_emoji for insert to authenticated
  with check (public.can_manage_emoji(server_id) and created_by = (select auth.uid()));
create policy "managers rename emoji" on public.server_emoji for update to authenticated
  using (public.can_manage_emoji(server_id)) with check (public.can_manage_emoji(server_id));
create policy "managers delete emoji" on public.server_emoji for delete to authenticated using (public.can_manage_emoji(server_id));
-- renaming is the only edit
revoke update on public.server_emoji from anon, authenticated;
grant update (name) on public.server_emoji to authenticated;

create function public.server_emoji_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.servers where id = new.server_id for update; -- serialize concurrent uploads
  if (select count(*) from public.server_emoji where server_id = new.server_id) >= 100 then
    raise exception 'This server already has 100 emoji';
  end if;
  return new;
end $$;
create trigger server_emoji_limit before insert on public.server_emoji
  for each row execute function public.server_emoji_limit();

-- Emoji used in messages can come from servers you're not in; their image URL is public anyway,
-- so anyone signed in can resolve ids they already have (uuids aren't guessable).
create function public.emoji_lookup(ids uuid[]) returns table (id uuid, name text, url text, animated boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.url, e.animated from public.server_emoji e where e.id = any(ids[1:200])
$$;

revoke execute on function public.can_manage_emoji(uuid), public.server_emoji_limit(), public.emoji_lookup(uuid[]) from public, anon;
grant execute on function public.can_manage_emoji(uuid), public.emoji_lookup(uuid[]) to authenticated;

-- reactions can hold <a:name:uuid> (up to 73 chars)
alter table public.reactions drop constraint reactions_emoji_check;
alter table public.reactions add constraint reactions_emoji_check check (char_length(emoji) <= 80);
