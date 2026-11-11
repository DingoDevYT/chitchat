-- Custom roles: colours, hoisting and simple permissions on top of members.role.
-- members.role stays: 'owner' = everything, legacy 'admin' = every permission (but role edits obey hierarchy).

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0, -- higher = more senior
  permissions text[] not null default '{}' check (permissions <@ array['manage_server','manage_channels','manage_roles',
    'kick_members','manage_messages','pin_messages','mention_everyone']),
  hoist boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create index on public.roles (server_id);

create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  primary key (server_id, user_id, role_id),
  foreign key (server_id, user_id) references public.members on delete cascade,
  foreign key (role_id, server_id) references public.roles (id, server_id) on delete cascade
);
create index on public.member_roles (role_id);

-- ───────── helpers ─────────

-- Everything the caller may do in a server.
create function public.my_perms(sid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when m.role in ('owner','admin') then array['manage_server','manage_channels','manage_roles',
      'kick_members','manage_messages','pin_messages','mention_everyone']
    else coalesce((select array_agg(distinct p) from public.member_roles mr
                   join public.roles r on r.id = mr.role_id, unnest(r.permissions) p
                   where mr.server_id = sid and mr.user_id = auth.uid()), '{}')
  end
  from public.members m where m.server_id = sid and m.user_id = auth.uid()
$$;

create function public.has_perm(sid uuid, perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(perm = any(public.my_perms(sid)), false)
$$;

-- Highest role position of a member (owner outranks everything, no roles = bottom).
create function public.member_rank(sid uuid, uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.members where server_id = sid and user_id = uid and role = 'owner') then 2147483647
    else coalesce((select max(r.position) from public.member_roles mr join public.roles r on r.id = mr.role_id
                   where mr.server_id = sid and mr.user_id = uid), -2147483648)
  end
$$;

-- May the caller create/edit/assign a role at this position with these permissions?
-- Owner always; otherwise manage_roles, strictly below your own highest role, and no permissions you don't have.
create function public.can_set_role(sid uuid, pos int, perms text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.server_role(sid) = 'owner'
    or (public.has_perm(sid, 'manage_roles')
        and pos < public.member_rank(sid, auth.uid())
        and perms <@ public.my_perms(sid))
$$;

create function public.can_edit_role(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_set_role(server_id, position, permissions) from public.roles where id = rid), false)
$$;

revoke execute on function public.my_perms(uuid), public.has_perm(uuid, text), public.member_rank(uuid, uuid),
  public.can_set_role(uuid, int, text[]), public.can_edit_role(uuid) from public, anon;
grant execute on function public.my_perms(uuid), public.has_perm(uuid, text), public.member_rank(uuid, uuid),
  public.can_set_role(uuid, int, text[]), public.can_edit_role(uuid) to authenticated;

-- ───────── RLS for the new tables ─────────

alter table public.roles enable row level security;
alter table public.member_roles enable row level security;

create policy "members see roles" on public.roles for select to authenticated using (public.is_member(server_id));
create policy "create roles" on public.roles for insert to authenticated
  with check (public.can_set_role(server_id, position, permissions));
create policy "edit roles" on public.roles for update to authenticated
  using (public.can_edit_role(id)) with check (public.can_set_role(server_id, position, permissions));
create policy "delete roles" on public.roles for delete to authenticated using (public.can_edit_role(id));
revoke update on public.roles from authenticated;
grant update (name, color, position, permissions, hoist) on public.roles to authenticated;

create policy "members see role assignments" on public.member_roles for select to authenticated using (public.is_member(server_id));
create policy "assign roles" on public.member_roles for insert to authenticated with check (public.can_edit_role(role_id));
create policy "unassign roles" on public.member_roles for delete to authenticated using (public.can_edit_role(role_id));
revoke update on public.member_roles from authenticated;

-- ───────── existing checks → has_perm ─────────

-- Private channels: anyone who manages channels sees them (owner/admin as before).
create or replace function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and (
      case
        when c.server_id is null then
          exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
        when not c.private then public.is_member(c.server_id)
        else public.has_perm(c.server_id, 'manage_channels')
          or (public.is_member(c.server_id)
              and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
      end))
$$;

alter policy "admins edit server" on public.servers using (public.has_perm(id, 'manage_server'));

alter policy "see channels" on public.channels using (
  (server_id is not null and public.has_perm(server_id, 'manage_channels')) or public.can_view_channel(id));
alter policy "admins add channels" on public.channels
  with check (server_id is not null and public.has_perm(server_id, 'manage_channels'));
alter policy "admins edit channels" on public.channels
  using (server_id is not null and public.has_perm(server_id, 'manage_channels'));
alter policy "admins delete channels" on public.channels
  using (server_id is not null and public.has_perm(server_id, 'manage_channels'));
alter policy "admins manage private access" on public.channel_members
  with check (exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
                      and public.has_perm(c.server_id, 'manage_channels')));
alter policy "admins revoke private access" on public.channel_members
  using (exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
                 and public.has_perm(c.server_id, 'manage_channels')));

alter policy "delete own or moderate" on public.messages using (
  author_id = (select auth.uid())
  or exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null
             and public.has_perm(c.server_id, 'manage_messages')));

-- Kicking: owner kicks anyone; legacy admins kick plain members; role-based kickers kick plain members ranked below them.
alter policy "leave or kick" on public.members using (
  role <> 'owner' and (
    user_id = (select auth.uid())
    or public.server_role(server_id) = 'owner'
    or (role = 'member' and public.has_perm(server_id, 'kick_members')
        and (public.server_role(server_id) = 'admin'
             or public.member_rank(server_id, user_id) < public.member_rank(server_id, (select auth.uid()))))));

alter publication supabase_realtime add table public.roles, public.member_roles;

-- ───────── other features' helpers → has_perm (applied as custom_roles_015b_pin_channels_use_has_perm) ─────────
create or replace function public.can_manage_channels(sid uuid) returns boolean
language sql stable set search_path = '' as $$
  select public.has_perm(sid, 'manage_channels')
$$;

create or replace function public.can_pin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and case
      when c.server_id is null then
        exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
      else public.has_perm(c.server_id, 'pin_messages') and public.can_view_channel(c.id)
    end)
$$;

-- Server emoji are part of managing the server (applied as custom_roles_015c_emoji_uses_has_perm).
create or replace function public.can_manage_emoji(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_perm(sid, 'manage_server')
$$;
