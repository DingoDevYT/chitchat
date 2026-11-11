-- Threads: a channel of kind 'thread' hanging off one message in a server text channel.
-- Visibility is inherited from the parent channel; reply_count/last_reply_at are kept by trigger.

alter table public.channels
  add column parent_channel_id uuid references public.channels on delete cascade,
  add column parent_message_id bigint references public.messages on delete set null, -- thread outlives its starter message
  add column archived boolean not null default false,
  add column reply_count int not null default 0,
  add column last_reply_at timestamptz;

alter table public.channels drop constraint channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text','voice','dm','thread'));
alter table public.channels add constraint channels_thread_parent check ((kind = 'thread') = (parent_channel_id is not null));
create unique index channels_parent_message_key on public.channels (parent_message_id);
create index on public.channels (parent_channel_id);

-- A thread is visible exactly when its parent is: resolve to the parent row first (one extra pk lookup).
create or replace function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = (select coalesce(t.parent_channel_id, t.id) from public.channels t where t.id = cid) and (
      case
        when c.server_id is null then
          exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
        when not c.private then public.is_member(c.server_id)
        else public.server_role(c.server_id) in ('owner','admin')
          or (public.is_member(c.server_id)
              and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
      end))
$$;

-- Direct inserts (admins can insert channels) must not point a thread at another server's channel.
create function public.check_thread_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'thread' and not exists (
    select 1 from public.channels p where p.id = new.parent_channel_id and p.server_id = new.server_id
      and p.kind not in ('voice','dm','thread')
      and (new.parent_message_id is null or exists (
        select 1 from public.messages m where m.id = new.parent_message_id and m.channel_id = p.id))) then
    raise exception 'bad thread parent';
  end if;
  return new;
end $$;
create trigger on_thread_insert before insert on public.channels
  for each row when (new.kind = 'thread') execute function public.check_thread_parent();

-- Reply counters for the "N replies · last reply 3m ago" pill. A new reply also un-archives.
create function public.bump_thread_replies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.channels set reply_count = reply_count + 1, last_reply_at = new.created_at, archived = false
    where id = new.channel_id and kind = 'thread';
  else
    update public.channels set reply_count = greatest(reply_count - 1, 0)
    where id = old.channel_id and kind = 'thread';
  end if;
  return null;
end $$;
create trigger on_thread_reply after insert or delete on public.messages
  for each row execute function public.bump_thread_replies();

-- Any member who can see the message may start (or reopen) its thread.
create function public.start_thread(message_id bigint, name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m record; tid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select msg.id, msg.channel_id, msg.content, c.server_id, c.kind into m
  from public.messages msg join public.channels c on c.id = msg.channel_id
  where msg.id = start_thread.message_id;
  if m.id is null or not public.can_view_channel(m.channel_id) then raise exception 'message not found'; end if;
  if m.server_id is null or m.kind in ('voice','dm','thread') then raise exception 'threads only live in server text channels'; end if;
  select id into tid from public.channels where parent_message_id = m.id;
  if tid is not null then return tid; end if;
  insert into public.channels (server_id, kind, parent_channel_id, parent_message_id, name)
  values (m.server_id, 'thread', m.channel_id, m.id, left(coalesce(
    nullif(trim(start_thread.name), ''),
    nullif(regexp_replace(trim(m.content), '\s+', ' ', 'g'), ''),
    'Thread'), 40))
  on conflict (parent_message_id) do nothing
  returning id into tid;
  if tid is null then select id into tid from public.channels where parent_message_id = m.id; end if;
  return tid;
end $$;

grant update (archived) on public.channels to authenticated; -- "admins edit channels" policy still applies

revoke execute on function public.check_thread_parent(), public.bump_thread_replies() from public, anon, authenticated;
revoke execute on function public.start_thread(bigint, text) from public, anon;
grant execute on function public.start_thread(bigint, text) to authenticated;
