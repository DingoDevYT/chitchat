-- 032: community & moderation — invite links, bans, timeouts, server nicknames, private notes, audit log, rules screening.
-- Writes that need rules (ban, timeout, nickname, invites, agreeing to rules) go through security-definer RPCs;
-- the audit log is written only by triggers and those RPCs, never by the client.

-- ── new permissions ──
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'manage_server','manage_channels','manage_roles','kick_members','manage_messages','pin_messages','mention_everyone',
  'ban_members','timeout_members','manage_nicknames','manage_invites','view_audit_log']);

create or replace function public.my_perms(sid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when m.role in ('owner','admin') then array['manage_server','manage_channels','manage_roles',
      'kick_members','manage_messages','pin_messages','mention_everyone',
      'ban_members','timeout_members','manage_nicknames','manage_invites','view_audit_log']
    else coalesce((select array_agg(distinct p) from public.member_roles mr
                   join public.roles r on r.id = mr.role_id, unnest(r.permissions) p
                   where mr.server_id = sid and mr.user_id = auth.uid()), '{}')
  end
  from public.members m where m.server_id = sid and m.user_id = auth.uid()
$$;

-- ── columns ──
alter table public.servers
  add column if not exists members_can_invite boolean not null default true,
  add column if not exists rules text check (char_length(rules) <= 2000),
  add column if not exists screening_at timestamptz; -- null = screening off; members who joined after it must agree
alter table public.members
  add column if not exists nickname text check (char_length(nickname) between 1 and 32),
  add column if not exists timeout_until timestamptz,
  add column if not exists rules_agreed_at timestamptz;

-- Same rank rule as the "leave or kick" policy: owner acts on anyone; admins on plain members;
-- role holders on plain members ranked below them. Non-members (ban by id) count as plain, unranked members.
create or replace function public.can_moderate(sid uuid, uid uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  with t as (select coalesce((select role from public.members where server_id = sid and user_id = uid), 'member') r)
  select uid is not null and auth.uid() is not null and uid <> auth.uid() and (select r from t) <> 'owner'
    and (public.server_role(sid) = 'owner'
      or ((select r from t) = 'member' and public.has_perm(sid, perm)
          and (public.server_role(sid) = 'admin' or public.member_rank(sid, uid) < public.member_rank(sid, auth.uid()))))
$$;

-- Why the signed-in user can't post in a server right now: 'timeout', 'rules' or null.
create or replace function public.post_block(sid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when m.timeout_until > now() then 'timeout'
    when s.screening_at is not null and coalesce(s.rules, '') <> '' and m.role <> 'owner'
      and m.rules_agreed_at is null and m.joined_at >= s.screening_at
      and not public.has_perm(sid, 'manage_server') then 'rules'
  end
  from public.members m join public.servers s on s.id = m.server_id
  where m.server_id = sid and m.user_id = auth.uid()
$$;

-- Blocks sending messages, reacting and starting threads while timed out or before agreeing to the rules.
create or replace function public.moderation_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; why text;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'channels' then
    if new.kind <> 'thread' then return new; end if;
    sid := new.server_id;
  elsif tg_table_name = 'poll_votes' then
    select c.server_id into sid from public.polls p join public.channels c on c.id = p.channel_id where p.id = new.poll_id;
  else
    select c.server_id into sid from public.channels c where c.id = new.channel_id;
  end if;
  if sid is null then return new; end if;
  why := public.post_block(sid);
  if why = 'timeout' then
    raise exception 'You''re in a timeout here. You can read along, and post again once it ends.' using errcode = 'P0001', hint = 'timeout';
  elsif why = 'rules' then
    raise exception 'Agree to the server rules first, then you can post.' using errcode = 'P0001', hint = 'rules';
  end if;
  return new;
end $$;
drop trigger if exists mod_guard on public.messages;
create trigger mod_guard before insert on public.messages for each row execute function public.moderation_guard();
drop trigger if exists mod_guard on public.reactions;
create trigger mod_guard before insert on public.reactions for each row execute function public.moderation_guard();
drop trigger if exists mod_guard on public.channels;
create trigger mod_guard before insert on public.channels for each row execute function public.moderation_guard();
drop trigger if exists mod_guard on public.poll_votes;
create trigger mod_guard before insert on public.poll_votes for each row execute function public.moderation_guard();

-- Stadiums: a timed-out (or not-yet-agreed) member can't join a stadium's voice topic.
create or replace function public.can_use_topic(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when t = 'online' then auth.uid() is not null
    when t ~ '^(chan|chat):[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 6)::uuid)
      and not (t like 'chan:%' and exists (select 1 from public.channels c
        where c.id = substr(t, 6)::uuid and c.kind = 'voice' and public.post_block(c.server_id) is not null))
    else false end
$$;

-- ── audit log ──
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_server_idx on public.audit_log (server_id, id desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
drop policy if exists "audit log readers" on public.audit_log;
create policy "audit log readers" on public.audit_log for select to authenticated using (public.has_perm(server_id, 'view_audit_log'));

-- Internal: skipped for service/migration writes, while an RPC logs a summary itself, and once the server is gone (cascades).
create or replace function public.audit(sid uuid, act text, target uuid, det jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (server_id, actor_id, action, target_id, details)
  select sid, auth.uid(), act, target, coalesce(det, '{}')
  where auth.uid() is not null and coalesce(current_setting('chitchat.quiet_audit', true), '') <> 'on'
    and exists (select 1 from public.servers where id = sid)
$$;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  verb text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
  ch text[];
  sid uuid;
  nm text;
begin
  if auth.uid() is null or coalesce(current_setting('chitchat.quiet_audit', true), '') = 'on' then return null; end if;
  if tg_op = 'UPDATE' then
    -- bookkeeping columns bumped by other triggers or drag-reordering aren't settings changes
    select coalesce(array_agg(e.key order by e.key), '{}') into ch from jsonb_each(n) e
     where e.value is distinct from o -> e.key
       and e.key <> all (array['last_message_id','reply_count','last_reply_at','position','category_id','created_at']);
    if ch = '{}' then return null; end if;
  end if;

  if tg_table_name = 'members' then
    if tg_op = 'DELETE' and (o->>'user_id')::uuid <> auth.uid() then
      perform public.audit((o->>'server_id')::uuid, 'member_kick', (o->>'user_id')::uuid, '{}');
    elsif tg_op = 'UPDATE' and 'role' = any(ch) then
      perform public.audit((n->>'server_id')::uuid, 'member_update', (n->>'user_id')::uuid, jsonb_build_object('role', n->>'role'));
    end if;
  elsif tg_table_name = 'member_roles' then
    sid := (r->>'server_id')::uuid;
    select name into nm from public.roles where id = (r->>'role_id')::uuid;
    -- skip the cascade when a role is deleted or the member leaves
    if nm is not null and exists (select 1 from public.members where server_id = sid and user_id = (r->>'user_id')::uuid) then
      perform public.audit(sid, case tg_op when 'INSERT' then 'member_role_add' else 'member_role_remove' end,
        (r->>'user_id')::uuid, jsonb_build_object('role', nm));
    end if;
  elsif tg_table_name = 'roles' then
    perform public.audit((r->>'server_id')::uuid, 'role_' || verb, null,
      jsonb_strip_nulls(jsonb_build_object('name', r->>'name', 'from', case when 'name' = any(ch) then o->>'name' end, 'changed', ch)));
  elsif tg_table_name = 'channels' then
    if r->>'server_id' is null or r->>'kind' in ('thread', 'dm') then return null; end if;
    sid := (r->>'server_id')::uuid;
    -- the starter rooms a new server comes with aren't news
    if tg_op = 'INSERT' and (select created_at from public.servers where id = sid) = now() then return null; end if;
    perform public.audit(sid, 'channel_' || verb, null,
      jsonb_strip_nulls(jsonb_build_object('name', r->>'name', 'kind', r->>'kind', 'from', case when 'name' = any(ch) then o->>'name' end, 'changed', ch)));
  elsif tg_table_name = 'servers' then
    perform public.audit((r->>'id')::uuid, 'server_update', null, jsonb_build_object('changed', ch));
  elsif tg_table_name = 'invites' then
    perform public.audit((r->>'server_id')::uuid, 'invite_delete', null, jsonb_build_object('code', r->>'code'));
  elsif tg_table_name = 'messages' then
    if (o->>'author_id')::uuid is distinct from auth.uid() then
      select c.server_id, coalesce(p.name, c.name) into sid, nm
        from public.channels c left join public.channels p on p.id = c.parent_channel_id where c.id = (o->>'channel_id')::uuid;
      if sid is not null then
        perform public.audit(sid, 'message_delete', (o->>'author_id')::uuid, jsonb_build_object('room', nm));
      end if;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists audit_members on public.members;
create trigger audit_members after update or delete on public.members for each row execute function public.audit_trigger();
drop trigger if exists audit_member_roles on public.member_roles;
create trigger audit_member_roles after insert or delete on public.member_roles for each row execute function public.audit_trigger();
drop trigger if exists audit_roles on public.roles;
create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.audit_trigger();
drop trigger if exists audit_channels on public.channels;
create trigger audit_channels after insert or update or delete on public.channels for each row execute function public.audit_trigger();
drop trigger if exists audit_servers on public.servers;
create trigger audit_servers after update on public.servers for each row execute function public.audit_trigger();
drop trigger if exists audit_messages on public.messages;
create trigger audit_messages after delete on public.messages for each row execute function public.audit_trigger();

-- ── invites ──
create table if not exists public.invites (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{4,32}$'),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  max_uses int check (max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invites_server_idx on public.invites (server_id);
alter table public.invites enable row level security;
revoke all on public.invites from anon;
revoke insert, update, truncate on public.invites from authenticated;
drop policy if exists "see invites" on public.invites;
create policy "see invites" on public.invites for select to authenticated
  using (public.has_perm(server_id, 'manage_invites') or (created_by = (select auth.uid()) and public.is_member(server_id)));
drop policy if exists "revoke invites" on public.invites;
create policy "revoke invites" on public.invites for delete to authenticated
  using (public.has_perm(server_id, 'manage_invites') or created_by = (select auth.uid()));
drop trigger if exists audit_invites on public.invites;
create trigger audit_invites after delete on public.invites for each row execute function public.audit_trigger();

-- The old single servers.invite_code becomes a permanent invite (listed and revocable like any other).
insert into public.invites (code, server_id, created_by, created_at)
select invite_code, id, owner_id, created_at from public.servers where invite_code is not null
on conflict do nothing;

create or replace function public.add_server_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invite_code is not null then
    insert into public.invites (code, server_id, created_by) values (new.invite_code, new.id, new.owner_id) on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists on_server_created_invite on public.servers;
create trigger on_server_created_invite after insert on public.servers for each row execute function public.add_server_invite();

-- ttl in seconds (null/0 = never), cap = max uses (null/0 = unlimited). reuse: hand back my newest unlimited invite
-- with at least a day left instead of making another (the "Copy invite link" default).
create or replace function public.create_invite(sid uuid, ttl int default 604800, cap int default null, reuse boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not (public.has_perm(sid, 'manage_invites')
          or (public.is_member(sid) and coalesce((select members_can_invite from public.servers where id = sid), false))) then
    raise exception 'You can''t create invites for this server.';
  end if;
  ttl := nullif(ttl, 0); cap := nullif(cap, 0);
  if ttl is not null and ttl not in (1800, 3600, 21600, 43200, 86400, 604800) then raise exception 'Pick one of the listed expiry times.'; end if;
  if cap is not null and cap not in (1, 5, 10, 25, 50, 100) then raise exception 'Pick one of the listed use limits.'; end if;
  if reuse then
    select i.code into c from public.invites i
     where i.server_id = sid and i.created_by = auth.uid() and i.max_uses is null
       and (i.expires_at is null or i.expires_at > now() + interval '1 day')
     order by (i.expires_at is null) desc, i.created_at desc limit 1;
    if c is not null then return c; end if;
  end if;
  loop
    c := left(replace(gen_random_uuid()::text, '-', ''), 10);
    begin
      insert into public.invites (code, server_id, created_by, max_uses, expires_at)
      values (c, sid, auth.uid(), cap, now() + make_interval(secs => ttl));
      exit;
    exception when unique_violation then -- astronomically rare; try another code
    end;
  end loop;
  perform public.audit(sid, 'invite_create', null, jsonb_strip_nulls(jsonb_build_object('code', c, 'ttl', ttl, 'cap', cap)));
  return c;
end $$;

-- Validates expiry, use limit and bans, and counts the use, all in one atomic step.
create or replace function public.join_server(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from public.invites i where i.code = trim(join_server.code);
  if inv.code is null then raise exception 'invite not found'; end if;
  if exists (select 1 from public.members where server_id = inv.server_id and user_id = auth.uid()) then return inv.server_id; end if;
  if exists (select 1 from public.bans where server_id = inv.server_id and user_id = auth.uid()) then
    raise exception 'You can''t join this server.';
  end if;
  update public.invites i set uses = i.uses + 1
   where i.code = inv.code and (i.expires_at is null or i.expires_at > now()) and (i.max_uses is null or i.uses < i.max_uses);
  if not found then raise exception 'This invite has expired or been used up.'; end if;
  insert into public.members (server_id, user_id) values (inv.server_id, auth.uid()) on conflict do nothing;
  return inv.server_id;
end $$;

-- ── bans ──
create table if not exists public.bans (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text check (char_length(reason) <= 512),
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.bans enable row level security;
revoke all on public.bans from anon;
revoke insert, update, delete, truncate on public.bans from authenticated;
drop policy if exists "ban managers see bans" on public.bans;
create policy "ban managers see bans" on public.bans for select to authenticated using (public.has_perm(server_id, 'ban_members'));

-- purge: delete their messages from the last 0 / 1 h / 24 h / 7 days (seconds).
create or replace function public.ban_member(sid uuid, uid uuid, reason text default null, purge int default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare n int := 0; why text := nullif(left(trim(reason), 512), '');
begin
  if not public.can_moderate(sid, uid, 'ban_members') then raise exception 'You can''t ban this person.'; end if;
  if coalesce(purge, 0) not in (0, 3600, 86400, 604800) then raise exception 'Pick one of the listed time ranges.'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'user not found'; end if;
  insert into public.bans (server_id, user_id, banned_by, reason) values (sid, uid, auth.uid(), why)
  on conflict (server_id, user_id) do update set banned_by = excluded.banned_by, reason = excluded.reason, created_at = now();
  perform set_config('chitchat.quiet_audit', 'on', true); -- one "ban" entry instead of a kick plus every deleted message
  if purge > 0 then
    delete from public.messages m using public.channels c
     where c.id = m.channel_id and c.server_id = sid and m.author_id = uid and m.created_at > now() - make_interval(secs => purge);
    get diagnostics n = row_count;
  end if;
  delete from public.members where server_id = sid and user_id = uid;
  perform set_config('chitchat.quiet_audit', '', true);
  perform public.audit(sid, 'member_ban', uid, jsonb_strip_nulls(jsonb_build_object('reason', why, 'deleted', nullif(n, 0))));
end $$;

create or replace function public.unban_member(sid uuid, uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm(sid, 'ban_members') then raise exception 'You can''t lift bans here.'; end if;
  delete from public.bans where server_id = sid and user_id = uid;
  if not found then raise exception 'They aren''t banned.'; end if;
  perform public.audit(sid, 'member_unban', uid, '{}');
end $$;

-- ── timeouts ── secs = 0 lifts the timeout
create or replace function public.timeout_member(sid uuid, uid uuid, secs int, reason text default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t timestamptz; why text := nullif(left(trim(reason), 512), '');
begin
  if not public.can_moderate(sid, uid, 'timeout_members') then raise exception 'You can''t time out this person.'; end if;
  if secs not in (0, 60, 300, 600, 3600, 86400, 604800) then raise exception 'Pick one of the listed lengths.'; end if;
  update public.members set timeout_until = case when secs > 0 then now() + make_interval(secs => secs) end
   where server_id = sid and user_id = uid returning timeout_until into t;
  if not found then raise exception 'They aren''t in this server.'; end if;
  perform public.audit(sid, case when secs > 0 then 'member_timeout' else 'member_timeout_remove' end, uid,
    jsonb_strip_nulls(jsonb_build_object('secs', nullif(secs, 0), 'reason', why)));
  return t;
end $$;

-- ── nicknames ── your own, or someone else's with manage_nicknames (rank rules apply); '' clears it
create or replace function public.set_nickname(sid uuid, uid uuid, nick text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(trim(nick), '');
begin
  if char_length(v) > 32 then raise exception 'Nicknames can be up to 32 characters.'; end if;
  if uid is distinct from auth.uid() and not public.can_moderate(sid, uid, 'manage_nicknames') then
    raise exception 'You can''t change their nickname.';
  end if;
  update public.members set nickname = v where server_id = sid and user_id = uid;
  if not found then raise exception 'They aren''t in this server.'; end if;
  if uid <> auth.uid() then perform public.audit(sid, 'member_nickname', uid, jsonb_strip_nulls(jsonb_build_object('nickname', v))); end if;
end $$;

-- ── rules screening ──
create or replace function public.agree_to_rules(sid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.members set rules_agreed_at = now() where server_id = sid and user_id = auth.uid() and rules_agreed_at is null
$$;

-- ── private notes (only the writer ever sees them) ──
create table if not exists public.user_notes (
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 256),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_id)
);
alter table public.user_notes enable row level security;
revoke all on public.user_notes from anon;
drop policy if exists "own notes" on public.user_notes;
create policy "own notes" on public.user_notes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ── function privileges ──
revoke execute on function public.can_moderate(uuid, uuid, text), public.post_block(uuid), public.can_use_topic(text),
  public.my_perms(uuid), public.create_invite(uuid, int, int, boolean), public.join_server(text),
  public.ban_member(uuid, uuid, text, int), public.unban_member(uuid, uuid), public.timeout_member(uuid, uuid, int, text),
  public.set_nickname(uuid, uuid, text), public.agree_to_rules(uuid) from public, anon;
grant execute on function public.can_moderate(uuid, uuid, text), public.post_block(uuid), public.can_use_topic(text),
  public.my_perms(uuid), public.create_invite(uuid, int, int, boolean), public.join_server(text),
  public.ban_member(uuid, uuid, text, int), public.unban_member(uuid, uuid), public.timeout_member(uuid, uuid, int, text),
  public.set_nickname(uuid, uuid, text), public.agree_to_rules(uuid) to authenticated;
-- internal: triggers and RPCs only
revoke execute on function public.audit(uuid, text, uuid, jsonb), public.audit_trigger(), public.moderation_guard(),
  public.add_server_invite() from public, anon, authenticated;
