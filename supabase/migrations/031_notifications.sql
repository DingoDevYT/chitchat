-- 031: Notifications. Per-user notification levels (synced across devices), @everyone / @here / @role pings
-- (only effective for people with the mention_everyone permission, enforced here), and a pings table that
-- feeds mention badges, desktop notifications and the inbox.

-- ── notification levels: one row per server, category, room or DM you've changed ──
create table if not exists public.notify_settings (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_id uuid not null,                                      -- server, category, room or DM id
  level text check (level in ('all', 'mentions', 'none')),      -- null = inherit (room → category → server → default)
  suppress_everyone boolean not null default false,             -- servers only: @everyone / @here don't count
  suppress_roles boolean not null default false,                -- servers only: @role pings don't count
  primary key (user_id, target_id)
);
alter table public.notify_settings enable row level security;
drop policy if exists "own notify settings" on public.notify_settings;
create policy "own notify settings" on public.notify_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notify_settings from public, anon;
grant select, insert, update, delete on public.notify_settings to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notify_settings') then
    alter publication supabase_realtime add table public.notify_settings;
  end if;
end $$;

-- ── messages.mentions_everyone: true only when the author may ping everyone (clients can't write it) ──
alter table public.messages add column if not exists mentions_everyone boolean not null default false;

-- ── pings: who a message notifies; one row per person, the most direct reason wins ──
create table if not exists public.message_pings (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('user', 'reply', 'role', 'here', 'everyone')),
  primary key (message_id, user_id)
);
create index if not exists message_pings_user_idx on public.message_pings (user_id, message_id desc);
alter table public.message_pings enable row level security;
drop policy if exists "see own pings" on public.message_pings;
create policy "see own pings" on public.message_pings for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.message_pings from public, anon;
grant select on public.message_pings to authenticated; -- written only by the trigger below

-- Role @handle: lower case, runs of anything else become _, trimmed. Mirrors roleHandle() in src/lib/notify.js.
create or replace function public.role_handle(name text) returns text
language sql immutable set search_path = '' as $$
  select left(trim(both '_.' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9_.]+', '_', 'g')), 32)
$$;

-- Distinct @handles in a message (trailing dots dropped). Same word boundary as src/lib/cues.js mentionRx.
create or replace function public.mention_handles(body text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct rtrim(lower(x[1]), '.')), '{}')
  from regexp_matches(coalesce(body, ''), '(?:^|[^a-z0-9_@])@([a-z0-9_.]{2,32})', 'gi') x
$$;

-- Pings for one message: @username, reply to you, and (when `allowed`) @role, @here, @everyone.
-- Only people who can see the room are pinged (can_view_channel, for anyone). Stadium chats don't ping.
create or replace function public.insert_pings(m public.messages, allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  hs text[] := public.mention_handles(m.content);
begin
  -- forwards (030_messaging_plus) never ping; to_jsonb so this works with or without that column
  if (cardinality(hs) = 0 and m.reply_to is null) or to_jsonb(m) ->> 'forward' is not null then return; end if;
  select ch.server_id, ch.kind, r.id as root, r.private into c
    from public.channels ch join public.channels r on r.id = coalesce(ch.parent_channel_id, ch.id)
   where ch.id = m.channel_id;
  if not found or c.kind = 'voice' then return; end if;
  insert into public.message_pings (message_id, user_id, kind)
  select distinct on (v.user_id) m.id, v.user_id, h.kind
  from (
    select mb.user_id from public.members mb
     where c.server_id is not null and mb.server_id = c.server_id
       and (not c.private or mb.role in ('owner', 'admin')
            or exists (select 1 from public.channel_members cm where cm.channel_id = c.root and cm.user_id = mb.user_id))
    union
    select cm.user_id from public.channel_members cm where c.server_id is null and cm.channel_id = c.root
  ) v
  join lateral (
    select 1 as rank, 'user' as kind from public.profiles p where p.id = v.user_id and p.username = any(hs)
    union all
    select 2, 'reply' from public.messages o where o.id = m.reply_to and o.author_id = v.user_id
    union all
    select 3, 'role' from public.member_roles mr join public.roles r on r.id = mr.role_id
     where allowed and mr.server_id = c.server_id and mr.user_id = v.user_id and public.role_handle(r.name) = any(hs)
    union all
    -- shortcut: "online" = wrote last_seen_at in the last 7 minutes (the app does every 5) and not invisible;
    -- move to a server-side presence table if @here needs to be exact.
    select 4, 'here' from public.profiles p
     where allowed and 'here' = any(hs) and p.id = v.user_id
       and p.last_seen_at > now() - interval '7 minutes' and coalesce(p.status, 'online') <> 'invisible'
    union all
    select 5, 'everyone' where allowed and 'everyone' = any(hs)
  ) h on true
  where v.user_id <> m.author_id
  order by v.user_id, h.rank
  on conflict do nothing;
end $$;

-- BEFORE INSERT: whatever the client sent, mentions_everyone is computed here.
create or replace function public.message_mentions_everyone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.mentions_everyone := coalesce(
    new.author_id = (select auth.uid()) and to_jsonb(new) ->> 'forward' is null
    and public.has_perm((select ch.server_id from public.channels ch where ch.id = new.channel_id), 'mention_everyone')
    and new.content ~* '(^|[^a-z0-9_@])@(everyone|here)([^a-z0-9_.]|\.([^a-z0-9_]|$)|$)', false);
  return new;
end $$;
drop trigger if exists messages_mentions_everyone on public.messages;
create trigger messages_mentions_everyone before insert on public.messages
  for each row execute function public.message_mentions_everyone();

-- AFTER INSERT: write the pings.
create or replace function public.message_pings_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.insert_pings(new, coalesce(new.author_id = (select auth.uid())
    and public.has_perm((select ch.server_id from public.channels ch where ch.id = new.channel_id), 'mention_everyone'), false));
  return null;
end $$;
drop trigger if exists messages_pings on public.messages;
create trigger messages_pings after insert on public.messages
  for each row execute function public.message_pings_on_insert();

revoke execute on function public.role_handle(text) from public, anon, authenticated;
revoke execute on function public.mention_handles(text) from public, anon, authenticated;
revoke execute on function public.insert_pings(public.messages, boolean) from public, anon, authenticated;
revoke execute on function public.message_mentions_everyone() from public, anon, authenticated;
revoke execute on function public.message_pings_on_insert() from public, anon, authenticated;

-- Existing messages: @username mentions and replies (nobody could ping everyone before this).
select public.insert_pings(m, false) from public.messages m;

-- Red badge counts, per channel you can see:
--   DMs: every unread message from someone else; other channels: unread pings (@you, replies to you, and
--   @everyone / @here / @role unless that server suppresses them). Blocked people never count.
-- security invoker: RLS on channels/messages/read_states/message_pings decides what is counted.
create or replace function public.mention_counts()
returns table (channel_id uuid, count bigint)
language sql stable security invoker set search_path = ''
as $$
  select m.channel_id, count(*)
  from public.channels c
  left join public.read_states rs on rs.channel_id = c.id and rs.user_id = (select auth.uid())
  left join public.notify_settings ns on ns.user_id = (select auth.uid()) and ns.target_id = c.server_id
  join public.messages m on m.channel_id = c.id and m.id > coalesce(rs.last_read_id, 0)
  where c.kind <> 'voice'
    and c.last_message_id > coalesce(rs.last_read_id, 0)
    and m.author_id <> (select auth.uid())
    and not exists (select 1 from public.blocks b where b.blocker = (select auth.uid()) and b.blocked = m.author_id)
    and (c.kind = 'dm' or exists (
      select 1 from public.message_pings p
       where p.message_id = m.id and p.user_id = (select auth.uid())
         and (p.kind in ('user', 'reply')
           or (p.kind in ('everyone', 'here') and not coalesce(ns.suppress_everyone, false))
           or (p.kind = 'role' and not coalesce(ns.suppress_roles, false)))))
  group by m.channel_id
$$;
revoke execute on function public.mention_counts() from public, anon;
grant execute on function public.mention_counts() to authenticated;
