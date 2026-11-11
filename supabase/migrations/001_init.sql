-- Chitchat core schema. All access goes through RLS; the anon key in the client is safe.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[a-z0-9_.]{2,32}$'),
  display_name text check (char_length(display_name) <= 48),
  bio text check (char_length(bio) <= 300),
  color text not null default ((array['#ff9f6b','#e76f51','#ff6b8b','#c77dff','#7b9cff','#4cc9f0','#7ed6b1','#b5e48c','#ffd166'])[floor(random()*9)::int + 1]),
  avatar_idle text,   -- PNGtuber: mouth closed
  avatar_talk text,   -- PNGtuber: mouth open
  voice jsonb not null default '{"pitch":1,"speed":1,"wave":"square"}',
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (username);

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 64),
  icon_url text,
  owner_id uuid not null references public.profiles on delete cascade,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table public.members (
  server_id uuid references public.servers on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index on public.members (user_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers on delete cascade, -- null = DM / group DM
  name text not null default '' check (char_length(name) <= 64),
  kind text not null default 'text' check (kind in ('text','voice','dm')),
  private boolean not null default false,
  position int not null default 0,
  last_message_id bigint,
  created_at timestamptz not null default now(),
  check ((kind = 'dm') = (server_id is null))
);
create index on public.channels (server_id);

-- Who can see a private channel, and who is in a DM.
create table public.channel_members (
  channel_id uuid references public.channels on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (channel_id, user_id)
);
create index on public.channel_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  content text not null default '' check (char_length(content) <= 4000),
  reply_to bigint references public.messages on delete set null,
  attachments jsonb not null default '[]',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.messages (channel_id, id desc);

create table public.reactions (
  message_id bigint references public.messages on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 32),
  channel_id uuid not null references public.channels on delete cascade, -- denormalised so RLS + realtime filters stay cheap
  primary key (message_id, user_id, emoji)
);
create index on public.reactions (channel_id);

create table public.read_states (
  user_id uuid references public.profiles on delete cascade,
  channel_id uuid references public.channels on delete cascade,
  last_read_id bigint not null default 0,
  primary key (user_id, channel_id)
);

-- ───────── helpers (security definer so policies don't recurse) ─────────

create function public.server_role(sid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where server_id = sid and user_id = auth.uid()
$$;

create function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where server_id = sid and user_id = auth.uid())
$$;

create function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and (
      case
        when c.server_id is null then
          exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
        when not c.private then public.is_member(c.server_id)
        else public.server_role(c.server_id) in ('owner','admin')
          or (public.is_member(c.server_id)
              and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
      end))
$$;

-- ───────── triggers ─────────

-- Create a profile on signup. Username comes from signup metadata, OAuth name, or email.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; uname text;
begin
  base := lower(regexp_replace(coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'chatter'), '[^a-zA-Z0-9_.]', '', 'g'));
  if char_length(base) < 2 then base := 'chatter'; end if;
  base := left(base, 26);
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    uname := base || floor(random() * 10000)::int;
  end loop;
  insert into public.profiles (id, username, display_name, avatar_idle)
  values (new.id, uname,
          coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', uname),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- New server: owner becomes a member, and gets starter channels.
create function public.handle_new_server() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (server_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.channels (server_id, name, kind, position) values
    (new.id, 'general', 'text', 0),
    (new.id, 'Hangout', 'voice', 1);
  return new;
end $$;
create trigger on_server_created after insert on public.servers
  for each row execute function public.handle_new_server();

-- Keep channels.last_message_id fresh so unread dots are one cheap comparison.
create function public.bump_last_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.channels set last_message_id = new.id where id = new.channel_id;
  return new;
end $$;
create trigger on_message_created after insert on public.messages
  for each row execute function public.bump_last_message();

-- ───────── RPCs ─────────

create function public.join_server(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into sid from public.servers where invite_code = trim(code);
  if sid is null then raise exception 'invite not found'; end if;
  insert into public.members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

-- Opens (or reuses) the DM between the caller and the given users.
create function public.open_dm(user_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  ids := array(select distinct u from unnest(user_ids || auth.uid()) u
               where exists (select 1 from public.profiles p where p.id = u) order by 1);
  if coalesce(array_length(ids, 1), 0) < 2 or array_length(ids, 1) > 10 then
    raise exception 'a DM needs 2 to 10 people';
  end if;
  select c.id into cid from public.channels c
  where c.kind = 'dm'
    and (select array_agg(m.user_id order by m.user_id) from public.channel_members m where m.channel_id = c.id) = ids
  limit 1;
  if cid is null then
    insert into public.channels (kind) values ('dm') returning id into cid;
    insert into public.channel_members (channel_id, user_id) select cid, unnest(ids);
  end if;
  return cid;
end $$;

-- ───────── RLS ─────────

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.members enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.read_states enable row level security;

create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- owner check: INSERT ... RETURNING runs before the trigger adds the owner as a member
create policy "members see server" on public.servers for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_member(id));
create policy "create server" on public.servers for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "admins edit server" on public.servers for update to authenticated
  using (public.server_role(id) in ('owner','admin'));
create policy "owner deletes server" on public.servers for delete to authenticated using (owner_id = (select auth.uid()));

create policy "see co-members" on public.members for select to authenticated using (public.is_member(server_id));
create policy "owner sets roles" on public.members for update to authenticated
  using (public.server_role(server_id) = 'owner' and user_id <> (select auth.uid()))
  with check (role in ('admin','member'));
create policy "leave or kick" on public.members for delete to authenticated using (
  role <> 'owner' and (
    user_id = (select auth.uid())
    or public.server_role(server_id) = 'owner'
    or (public.server_role(server_id) = 'admin' and role = 'member')));

-- admin check first: a STABLE function can't see a row inserted by the same statement (INSERT ... RETURNING)
create policy "see channels" on public.channels for select to authenticated using (
  (server_id is not null and public.server_role(server_id) in ('owner','admin')) or public.can_view_channel(id));
create policy "admins add channels" on public.channels for insert to authenticated
  with check (server_id is not null and public.server_role(server_id) in ('owner','admin'));
create policy "admins edit channels" on public.channels for update to authenticated
  using (server_id is not null and public.server_role(server_id) in ('owner','admin'));
create policy "admins delete channels" on public.channels for delete to authenticated
  using (server_id is not null and public.server_role(server_id) in ('owner','admin'));

create policy "see channel members" on public.channel_members for select to authenticated
  using (public.can_view_channel(channel_id));
create policy "admins manage private access" on public.channel_members for insert to authenticated
  with check (exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
                      and public.server_role(c.server_id) in ('owner','admin')));
create policy "admins revoke private access" on public.channel_members for delete to authenticated
  using (exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
                 and public.server_role(c.server_id) in ('owner','admin')));

create policy "read messages" on public.messages for select to authenticated using (public.can_view_channel(channel_id));
create policy "send messages" on public.messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_view_channel(channel_id));
create policy "edit own messages" on public.messages for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete own or moderate" on public.messages for delete to authenticated using (
  author_id = (select auth.uid())
  or exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
             and public.server_role(c.server_id) in ('owner','admin')));

create policy "read reactions" on public.reactions for select to authenticated using (public.can_view_channel(channel_id));
create policy "react" on public.reactions for insert to authenticated with check (
  user_id = (select auth.uid()) and public.can_view_channel(channel_id)
  and exists (select 1 from public.messages m where m.id = message_id and m.channel_id = reactions.channel_id));
create policy "unreact" on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy "own read states" on public.read_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Column-level guard: nobody can rewrite who sent a message or move it.
revoke update on public.messages from authenticated;
grant update (content, edited_at) on public.messages to authenticated;
revoke update on public.servers from authenticated;
grant update (name, icon_url) on public.servers to authenticated;
revoke update on public.channels from authenticated;
grant update (name, private, position) on public.channels to authenticated;
revoke update on public.members from authenticated;
grant update (role) on public.members to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name, bio, color, avatar_idle, avatar_talk, voice) on public.profiles to authenticated;

-- ───────── realtime ─────────
-- shortcut: postgres_changes re-checks RLS per subscriber; fine for hundreds of users, move to realtime.broadcast_changes when it isn't.
alter publication supabase_realtime add table public.messages, public.reactions, public.channels, public.members;

-- ───────── storage ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 26214400);
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────── function grants ─────────
revoke execute on function public.server_role(uuid), public.is_member(uuid), public.can_view_channel(uuid),
  public.join_server(text), public.open_dm(uuid[]),
  public.handle_new_user(), public.handle_new_server(), public.bump_last_message() from public, anon;
revoke execute on function public.handle_new_user(), public.handle_new_server(), public.bump_last_message() from authenticated;
grant execute on function public.server_role(uuid), public.is_member(uuid), public.can_view_channel(uuid),
  public.join_server(text), public.open_dm(uuid[]) to authenticated;

-- ───────── friends ─────────
create table public.friendships (
  user_a uuid not null references public.profiles on delete cascade, -- who asked
  user_b uuid not null references public.profiles on delete cascade, -- who was asked
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a <> user_b)
);
create unique index friendships_pair on public.friendships (least(user_a, user_b), greatest(user_a, user_b));
create index on public.friendships (user_b);
alter table public.friendships enable row level security;
create policy "see own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "accept requests to me" on public.friendships for update to authenticated
  using (user_b = (select auth.uid()) and status = 'pending') with check (status = 'accepted');
create policy "decline, cancel or unfriend" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- Send a request by username. If they already asked you, it becomes a friendship.
create function public.add_friend(uname text) returns text
language plpgsql security definer set search_path = '' as $$
declare target uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into target from public.profiles where username = lower(trim(both '@ ' from uname));
  if target is null then raise exception 'No one with that username.'; end if;
  if target = me then raise exception 'That''s you!'; end if;
  if exists (select 1 from public.friendships where user_a = me and user_b = target) then
    return (select status from public.friendships where user_a = me and user_b = target);
  end if;
  if exists (select 1 from public.friendships where user_a = target and user_b = me) then
    update public.friendships set status = 'accepted' where user_a = target and user_b = me;
    return 'accepted';
  end if;
  insert into public.friendships (user_a, user_b) values (me, target);
  return 'pending';
end $$;
revoke execute on function public.add_friend(text) from public, anon;
grant execute on function public.add_friend(text) to authenticated;
alter publication supabase_realtime add table public.friendships;
