-- 017: blocking users, link preview cache, per-message embed suppression.

-- ── blocks: visible only to the blocker ──
create table public.blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "see own blocks" on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy "block someone" on public.blocks for insert to authenticated with check (blocker = (select auth.uid()));
create policy "unblock someone" on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

-- Blocking ends any friendship or pending request between the two.
create function public.block_ends_friendship() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (user_a = new.blocker and user_b = new.blocked) or (user_a = new.blocked and user_b = new.blocker);
  return new;
end $$;
revoke execute on function public.block_ends_friendship() from public, anon, authenticated;
create trigger on_block after insert on public.blocks for each row execute function public.block_ends_friendship();

-- add_friend: silently pretend to send when the target has blocked the caller.
create or replace function public.add_friend(uname text) returns text
language plpgsql security definer set search_path = '' as $function$
declare target uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into target from public.profiles where username = lower(trim(both '@ ' from uname));
  if target is null then raise exception 'No one with that username.'; end if;
  if target = me then raise exception 'That''s you!'; end if;
  if exists (select 1 from public.blocks where blocker = target and blocked = me) then return 'pending'; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = target) then raise exception 'Unblock them first.'; end if;
  if exists (select 1 from public.friendships where user_a = me and user_b = target) then
    return (select status from public.friendships where user_a = me and user_b = target);
  end if;
  if exists (select 1 from public.friendships where user_a = target and user_b = me) then
    update public.friendships set status = 'accepted' where user_a = target and user_b = me;
    return 'accepted';
  end if;
  insert into public.friendships (user_a, user_b) values (me, target);
  return 'pending';
end $function$;

-- open_dm: existing DMs still open; a new one is refused when the caller and anyone in it have a block either way.
create or replace function public.open_dm(user_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare ids uuid[]; cid uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  ids := array(select distinct u from unnest(user_ids || me) u
               where exists (select 1 from public.profiles p where p.id = u) order by 1);
  if coalesce(array_length(ids, 1), 0) < 2 or array_length(ids, 1) > 10 then
    raise exception 'a DM needs 2 to 10 people';
  end if;
  select c.id into cid from public.channels c
  where c.kind = 'dm'
    and (select array_agg(m.user_id order by m.user_id) from public.channel_members m where m.channel_id = c.id) = ids
  limit 1;
  if cid is null then
    if exists (select 1 from public.blocks b
               where (b.blocker = me and b.blocked = any(ids)) or (b.blocked = me and b.blocker = any(ids))) then
      raise exception 'You can''t start a conversation with this person.';
    end if;
    insert into public.channels (kind) values ('dm') returning id into cid;
    insert into public.channel_members (channel_id, user_id) select cid, unnest(ids);
  end if;
  return cid;
end $function$;
revoke execute on function public.add_friend(text) from public, anon;
revoke execute on function public.open_dm(uuid[]) from public, anon;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.open_dm(uuid[]) to authenticated;

-- ── link previews: cache readable by signed-in users, written only by the link-preview edge function (service role) ──
create table public.link_previews (
  url text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.link_previews enable row level security;
create policy "read previews" on public.link_previews for select to authenticated using (true);

-- Per-user fetch counter for rate limiting (no policies: service role only).
create table public.link_preview_usage (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null default now(),
  n int not null default 0
);
alter table public.link_preview_usage enable row level security;

-- Counts one request in the user's current 1-minute window and returns the count so far.
create function public.link_preview_hit(uid uuid) returns int
language sql security definer set search_path = '' as $$
  insert into public.link_preview_usage as u (user_id, window_start, n) values (uid, now(), 1)
  on conflict (user_id) do update set
    n = case when u.window_start < now() - interval '1 minute' then 1 else u.n + 1 end,
    window_start = case when u.window_start < now() - interval '1 minute' then now() else u.window_start end
  returning n;
$$;
revoke execute on function public.link_preview_hit(uuid) from public, anon, authenticated;
grant execute on function public.link_preview_hit(uuid) to service_role;

-- ── authors can hide link embeds on their own message (the "edit own messages" RLS policy limits rows to the author) ──
alter table public.messages add column suppress_embeds boolean not null default false;
grant update (suppress_embeds) on public.messages to authenticated;
