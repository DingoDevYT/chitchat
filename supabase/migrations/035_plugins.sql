-- 035: plugins (bots). Catalog, per-server installs, bot identities, slash-command interactions,
-- Automod (enforced right here in the database), and event dispatch to the plugin-runtime edge function.
-- Docs for maintainers: docs/MAINTAINING.md. Rolled-back RLS tests: supabase/tests/035_plugins_rls.sql.
--
-- Who writes what:
--   members (manage_server)  → install_plugin / configure_plugin / uninstall_plugin / create_webhook_bot /
--                              regenerate_bot_secrets / save_custom_commands      (security definer RPCs)
--   anyone in the server     → server_commands (registry), begin_interaction (via the plugin-runtime function)
--   bots (service role only) → bot_* functions, called by the plugin-runtime and bot-api edge functions
--   the database itself      → Automod (BEFORE INSERT on messages) and plugin_dispatch (pg_net, only when an install listens)

create extension if not exists pg_net with schema extensions; -- its functions live in the "net" schema either way

-- ───────── columns on existing tables ─────────
alter table public.profiles add column if not exists is_bot boolean not null default false; -- not in the profile update grants: users can't flip it
alter table public.messages
  add column if not exists embeds jsonb not null default '[]'
    check (jsonb_typeof(embeds) = 'array' and jsonb_array_length(embeds) <= 5),
  add column if not exists interaction jsonb; -- { id, user_id, name }: "pip used /chef rate"

-- ───────── tables ─────────
create table if not exists public.plugins (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 500),
  author text not null default 'Chitchat' check (char_length(author) <= 64),
  kind text not null check (kind in ('builtin', 'webhook')),
  icon text check (char_length(icon) <= 32),
  permissions text[] not null default '{}' check (permissions <@ array['send_messages','read_messages','add_reactions','manage_roles','timeout_members']),
  events text[] not null default '{}' check (events <@ array['message_created','bot_mentioned','member_joined','reaction_added']),
  commands jsonb not null default '[]' check (jsonb_typeof(commands) = 'array'),
  config_schema jsonb not null default '[]' check (jsonb_typeof(config_schema) = 'array'),
  server_id uuid references public.servers on delete cascade, -- a server's own external bot; null = built-in catalog
  bot_user_id uuid references public.profiles on delete set null,
  webhook_url text check (char_length(webhook_url) <= 500),
  created_at timestamptz not null default now(),
  check ((kind = 'webhook') = (server_id is not null))
);
create index if not exists plugins_server_idx on public.plugins (server_id);
create index if not exists plugins_bot_idx on public.plugins (bot_user_id);

create table if not exists public.server_plugins (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  plugin_id text not null references public.plugins on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  permissions text[] not null default '{}', -- what the installer approved (never more than the plugin asked for)
  events text[] not null default '{}',
  commands jsonb check (commands is null or jsonb_typeof(commands) = 'array'), -- null = the plugin's own list
  bot_user_id uuid references public.profiles on delete set null,
  installed_by uuid references public.profiles on delete set null,
  failures int not null default 0, -- webhook deliveries failed in a row
  last_errors jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (server_id, plugin_id)
);
create index if not exists server_plugins_plugin_idx on public.server_plugins (plugin_id);
create index if not exists server_plugins_bot_idx on public.server_plugins (bot_user_id);
create index if not exists server_plugins_installer_idx on public.server_plugins (installed_by);

-- Service role only (RLS on, no policies): token hash, signing secret, per-bot rate window.
create table if not exists public.plugin_secrets (
  install_id uuid primary key references public.server_plugins on delete cascade,
  token_hash text unique,
  signing_secret text,
  rate_at timestamptz not null default now(),
  rate_n int not null default 0
);

create table if not exists public.plugin_interactions (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.server_plugins on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  command text not null,
  options jsonb not null default '{}',
  response jsonb, -- a late ephemeral reply (bot-api), read by the invoker over realtime
  created_at timestamptz not null default now()
);
create index if not exists plugin_interactions_user_idx on public.plugin_interactions (user_id, created_at desc);
create index if not exists plugin_interactions_install_idx on public.plugin_interactions (install_id);
create index if not exists plugin_interactions_channel_idx on public.plugin_interactions (channel_id);
create index if not exists plugin_interactions_age_idx on public.plugin_interactions (created_at);

-- Automod's strike counter, and where the sender's client reads why a message was held back.
create table if not exists public.automod_hits (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  channel_id uuid references public.channels on delete cascade,
  rule text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists automod_hits_strikes_idx on public.automod_hits (server_id, user_id, created_at desc);
create index if not exists automod_hits_user_idx on public.automod_hits (user_id, channel_id, id desc);
create index if not exists automod_hits_channel_idx on public.automod_hits (channel_id);

-- ───────── RLS ─────────
alter table public.plugins enable row level security;
alter table public.server_plugins enable row level security;
alter table public.plugin_secrets enable row level security;
alter table public.plugin_interactions enable row level security;
alter table public.automod_hits enable row level security;
revoke all on public.plugins, public.server_plugins, public.plugin_secrets, public.plugin_interactions, public.automod_hits from anon;
revoke insert, update, delete, truncate on public.plugins, public.server_plugins, public.plugin_interactions, public.automod_hits from authenticated;
revoke all on public.plugin_secrets from authenticated;

drop policy if exists "see catalog and own bots" on public.plugins;
create policy "see catalog and own bots" on public.plugins for select to authenticated
  using (server_id is null or public.has_perm(server_id, 'manage_server'));
drop policy if exists "managers see installs" on public.server_plugins;
create policy "managers see installs" on public.server_plugins for select to authenticated
  using (public.has_perm(server_id, 'manage_server'));
drop policy if exists "own interactions" on public.plugin_interactions;
create policy "own interactions" on public.plugin_interactions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "own automod hits" on public.automod_hits;
create policy "own automod hits" on public.automod_hits for select to authenticated
  using (user_id = (select auth.uid()));

-- ───────── helpers ─────────

-- Bots never sign in: no password, an unroutable address, banned from GoTrue for good. handle_new_user makes the profile.
create or replace function public.create_bot_user(uname text, dname text, avatar text, colour text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    banned_until, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'bot+' || uid || '@bots.chitchat.invalid',
    '{"provider":"bot","providers":["bot"]}',
    jsonb_build_object('username', coalesce(nullif(lower(regexp_replace(uname, '[^a-zA-Z0-9_.]', '', 'g')), ''), 'bot'), 'display_name', left(dname, 48), 'avatar_url', avatar),
    now(), now(), 'infinity', '', '', '', '');
  update public.profiles set is_bot = true, color = coalesce(colour, color) where id = uid;
  return uid;
end $$;

-- Removes a bot's account unless it still has messages somewhere (they keep showing with its name and BOT badge).
-- During a server delete the server row is already gone, so its messages are going anyway.
create or replace function public.drop_bot_user(uid uuid, sid uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.users u where u.id = uid
    and exists (select 1 from public.profiles p where p.id = uid and p.is_bot)
    and (not exists (select 1 from public.servers s where s.id = sid)
         or not exists (select 1 from public.messages m where m.author_id = uid))
$$;

create or replace function public.on_plugin_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'webhook' and old.bot_user_id is not null then perform public.drop_bot_user(old.bot_user_id, old.server_id); end if;
  return null;
end $$;
drop trigger if exists on_plugin_deleted on public.plugins;
create trigger on_plugin_deleted after delete on public.plugins for each row execute function public.on_plugin_deleted();

-- Can this bot see the room (threads follow their parent)? Same rule as members: public rooms, or private ones it was added to.
create or replace function public.bot_can_view(bot uuid, cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels t
    join public.channels c on c.id = coalesce(t.parent_channel_id, t.id)
    join public.members m on m.server_id = c.server_id and m.user_id = bot
    where t.id = cid and (not c.private or exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = bot)))
$$;

-- Turns a plugin's config form schema + submitted values into a safe config: unknown keys dropped, wrong types → default,
-- numbers rounded and clamped, lists trimmed and capped. Never raises, so Automod can always trust what it reads.
-- The Plugins tab builds its form from the same schema (src/Plugins.jsx).
create or replace function public.clean_plugin_config(sch jsonb, cfg jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare f jsonb; k text; t text; v jsonb; n numeric; out_ jsonb := '{}';
begin
  cfg := case when jsonb_typeof(cfg) = 'object' then cfg else '{}' end;
  for f in select * from jsonb_array_elements(coalesce(sch, '[]')) loop
    k := f->>'key'; t := f->>'type'; v := cfg->k;
    if t in ('text', 'textarea') then
      v := case when jsonb_typeof(v) = 'string' then to_jsonb(left(trim(v#>>'{}'), coalesce((f->>'max')::int, 500))) end;
    elsif t = 'number' then
      n := case when jsonb_typeof(v) = 'number' then (v#>>'{}')::numeric
                when jsonb_typeof(v) = 'string' and v#>>'{}' ~ '^\s*-?\d{1,9}(\.\d+)?\s*$' then trim(v#>>'{}')::numeric end;
      v := case when n is not null then to_jsonb(least(greatest(round(n), coalesce((f->>'min')::numeric, round(n))), coalesce((f->>'max')::numeric, round(n)))::int) end;
    elsif t = 'boolean' then
      v := case when jsonb_typeof(v) = 'boolean' then v end;
    elsif t = 'select' then
      v := case when jsonb_typeof(v) = 'string' and exists (select 1 from jsonb_array_elements(f->'options') o where o->>0 = v#>>'{}') then v end;
    elsif t = 'room' then
      v := case when jsonb_typeof(v) = 'string' and (v#>>'{}' = '' or v#>>'{}' ~ '^[0-9a-f-]{36}$') then v end;
    elsif t in ('list', 'roles', 'rooms') then
      v := case when jsonb_typeof(v) = 'array' then (
        select coalesce(jsonb_agg(x order by i), '[]') from (
          select x, min(i) i from (
            select left(trim(e#>>'{}'), 100) x, i from jsonb_array_elements(v) with ordinality a(e, i) where jsonb_typeof(e) = 'string'
          ) s where x <> '' and (t = 'list' or x ~ '^[0-9a-f-]{36}$')
          group by x order by min(i) limit coalesce((f->>'max')::int, 100)
        ) d
      ) end;
    else
      v := null;
    end if;
    if k is not null then out_ := out_ || jsonb_build_object(k, coalesce(v, f->'default')); end if;
  end loop;
  return out_;
end $$;

-- Server permissions a plugin can hold. A bot never gets one its installer lacks.
create or replace function public.check_plugin_perms(sid uuid, requested text[], want text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(want, '{}') <@ coalesce(requested, '{}')) then
    raise exception 'A plugin can only get permissions it asked for.' using errcode = '22023';
  end if;
  if not (array(select unnest(want) intersect select unnest(array['manage_roles','timeout_members'])) <@ coalesce(public.my_perms(sid), '{}')) then
    raise exception 'You can''t give a plugin a permission you don''t have yourself.' using errcode = '42501';
  end if;
end $$;

create or replace function public.valid_webhook_url(u text) returns boolean
language sql immutable set search_path = '' as $$
  -- https only, no credentials, default port; the edge function also resolves DNS and refuses private addresses on every delivery
  select u is null or (char_length(u) <= 500 and u ~ '^https://[a-zA-Z0-9.-]+(:443)?(/[^\s]*)?$'
    and lower(split_part(substr(u, 9), '/', 1)) !~ '^(localhost|.*\.localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+)(:443)?$')
$$;

create or replace function public.new_secret(prefix text) returns text
language sql volatile set search_path = '' as $$
  select prefix || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
$$;

-- ───────── manager RPCs ─────────

create or replace function public.install_plugin(sid uuid, pid text, perms text[] default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.plugins; iid uuid; want text[];
begin
  if not public.has_perm(sid, 'manage_server') then raise exception 'You need Manage server to add plugins.' using errcode = '42501'; end if;
  select * into p from public.plugins where id = pid and server_id is null and kind = 'builtin';
  if p.id is null then raise exception 'That plugin doesn''t exist.' using errcode = 'P0002'; end if;
  want := coalesce(perms, p.permissions);
  perform public.check_plugin_perms(sid, p.permissions, want);
  insert into public.members (server_id, user_id) values (sid, p.bot_user_id) on conflict do nothing;
  insert into public.server_plugins (server_id, plugin_id, config, permissions, events, bot_user_id, installed_by)
  values (sid, pid, public.clean_plugin_config(p.config_schema, '{}'), want, p.events, p.bot_user_id, auth.uid())
  on conflict (server_id, plugin_id) do nothing returning id into iid;
  if iid is null then raise exception 'That plugin is already added here.' using errcode = '23505'; end if;
  perform public.audit(sid, 'plugin_install', p.bot_user_id, jsonb_build_object('name', p.name));
  return iid;
end $$;

-- Any argument left null stays as it is. url/evs only apply to external bots.
create or replace function public.configure_plugin(iid uuid, cfg jsonb default null, en boolean default null, perms text[] default null,
  url text default null, evs text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins; p public.plugins;
begin
  select * into sp from public.server_plugins where id = iid;
  if sp.id is null or not public.has_perm(sp.server_id, 'manage_server') then raise exception 'Plugin not found.' using errcode = 'P0002'; end if;
  select * into p from public.plugins where id = sp.plugin_id;
  if perms is not null then
    perform public.check_plugin_perms(sp.server_id,
      case when p.kind = 'webhook' then array['send_messages','read_messages','add_reactions','manage_roles'] else p.permissions end, perms);
  end if;
  if p.kind = 'webhook' and url is not null then -- '' clears it
    if not public.valid_webhook_url(nullif(trim(url), '')) then raise exception 'The webhook address must be a public https:// URL.' using errcode = '22023'; end if;
    update public.plugins set webhook_url = nullif(trim(configure_plugin.url), '') where id = p.id;
  end if;
  if p.kind = 'webhook' and evs is not null then
    if not (evs <@ array['message_created','bot_mentioned','member_joined','reaction_added']) then raise exception 'Unknown event.' using errcode = '22023'; end if;
    update public.plugins set events = evs where id = p.id;
    update public.server_plugins set events = evs where id = iid;
  end if;
  update public.server_plugins set
    config = case when cfg is null then config else public.clean_plugin_config(p.config_schema, cfg) end,
    enabled = coalesce(en, enabled),
    failures = case when en then 0 else failures end, -- switching it back on gives it a fresh start
    permissions = coalesce(perms, permissions)
  where id = iid;
  perform public.audit(sp.server_id, 'plugin_update', sp.bot_user_id, jsonb_build_object('name', p.name));
end $$;

create or replace function public.uninstall_plugin(iid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins; p public.plugins;
begin
  select * into sp from public.server_plugins where id = iid;
  if sp.id is null or not public.has_perm(sp.server_id, 'manage_server') then raise exception 'Plugin not found.' using errcode = 'P0002'; end if;
  select * into p from public.plugins where id = sp.plugin_id;
  delete from public.server_plugins where id = iid;
  perform set_config('chitchat.quiet_audit', 'on', true); -- one "removed the plugin" entry, not a kick too
  delete from public.members where server_id = sp.server_id and user_id = sp.bot_user_id;
  perform set_config('chitchat.quiet_audit', '', true);
  if p.kind = 'webhook' then delete from public.plugins where id = p.id; end if; -- its bot account goes too (on_plugin_deleted)
  perform public.audit(sp.server_id, 'plugin_remove', null, jsonb_build_object('name', p.name));
end $$;

-- External bot: plugin row + bot account + install + token/secret, returned once.
create or replace function public.create_webhook_bot(sid uuid, bot_name text, avatar text default null, url text default null,
  evs text[] default '{}', perms text[] default '{send_messages}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pid text := 'bot-' || substr(md5(gen_random_uuid()::text), 1, 12); uid uuid; iid uuid; tok text; sec text; nm text := trim(bot_name);
begin
  if not public.has_perm(sid, 'manage_server') then raise exception 'You need Manage server to connect bots.' using errcode = '42501'; end if;
  if (select count(*) from public.plugins where server_id = sid) >= 10 then raise exception 'A server can have up to 10 external bots.' using errcode = '22023'; end if;
  if char_length(nm) not between 1 and 32 then raise exception 'Give the bot a name (up to 32 characters).' using errcode = '22023'; end if;
  url := nullif(trim(url), '');
  if not public.valid_webhook_url(url) then raise exception 'The webhook address must be a public https:// URL.' using errcode = '22023'; end if;
  if avatar is not null and (char_length(avatar) > 1000 or avatar !~ '^https://') then raise exception 'Bad avatar address.' using errcode = '22023'; end if;
  if not (coalesce(evs, '{}') <@ array['message_created','bot_mentioned','member_joined','reaction_added']) then raise exception 'Unknown event.' using errcode = '22023'; end if;
  perform public.check_plugin_perms(sid, array['send_messages','read_messages','add_reactions','manage_roles'], perms);
  uid := public.create_bot_user(nm, nm, avatar);
  insert into public.plugins (id, name, author, kind, icon, permissions, events, server_id, bot_user_id, webhook_url)
  values (pid, nm, coalesce((select username from public.profiles where id = auth.uid()), 'someone'), 'webhook', 'link', perms, coalesce(evs, '{}'), sid, uid, url);
  insert into public.members (server_id, user_id) values (sid, uid) on conflict do nothing;
  insert into public.server_plugins (server_id, plugin_id, permissions, events, commands, bot_user_id, installed_by)
  values (sid, pid, perms, coalesce(evs, '{}'), '[]', uid, auth.uid()) returning id into iid;
  tok := public.new_secret('ccb_'); sec := public.new_secret('ccs_');
  insert into public.plugin_secrets (install_id, token_hash, signing_secret) values (iid, encode(extensions.digest(tok, 'sha256'), 'hex'), sec);
  perform public.audit(sid, 'plugin_install', uid, jsonb_build_object('name', nm));
  return jsonb_build_object('install_id', iid, 'bot_user_id', uid, 'token', tok, 'signing_secret', sec);
end $$;

create or replace function public.regenerate_bot_secrets(iid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins; tok text := public.new_secret('ccb_'); sec text := public.new_secret('ccs_');
begin
  select * into sp from public.server_plugins where id = iid;
  if sp.id is null or not public.has_perm(sp.server_id, 'manage_server')
     or not exists (select 1 from public.plugins where id = sp.plugin_id and kind = 'webhook') then
    raise exception 'Bot not found.' using errcode = 'P0002';
  end if;
  insert into public.plugin_secrets (install_id, token_hash, signing_secret) values (iid, encode(extensions.digest(tok, 'sha256'), 'hex'), sec)
  on conflict (install_id) do update set token_hash = excluded.token_hash, signing_secret = excluded.signing_secret;
  return jsonb_build_object('token', tok, 'signing_secret', sec);
end $$;

-- No-code custom commands, validated here. Returns the cleaned list.
create or replace function public.save_custom_commands(iid uuid, cmds jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins; c jsonb; nm text; out_ jsonb := '[]'; seen text[] := '{}'; emb jsonb; col text;
begin
  select * into sp from public.server_plugins where id = iid and plugin_id = 'custom-commands';
  if sp.id is null or not public.has_perm(sp.server_id, 'manage_server') then raise exception 'Plugin not found.' using errcode = 'P0002'; end if;
  if jsonb_typeof(cmds) <> 'array' or jsonb_array_length(cmds) > 50 then raise exception 'Up to 50 custom commands.' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(cmds) loop
    nm := lower(trim(coalesce(c->>'name', '')));
    if nm !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then
      raise exception 'Command names are one word: letters, numbers, - and _ (got "%").', left(nm, 40) using errcode = '22023';
    end if;
    if nm = any(seen) then raise exception 'There are two commands called /%.', nm using errcode = '22023'; end if;
    seen := seen || nm;
    emb := null;
    if jsonb_typeof(c->'embed') = 'object' and coalesce(c->'embed'->>'title', c->'embed'->>'description', '') <> '' then
      col := c->'embed'->>'color';
      emb := jsonb_strip_nulls(jsonb_build_object('title', left(c->'embed'->>'title', 256), 'description', left(c->'embed'->>'description', 2000),
        'color', case when col ~ '^#[0-9a-fA-F]{6}$' then col end));
    end if;
    if coalesce(trim(c->>'reply'), '') = '' and emb is null then raise exception '/% needs a reply or an embed.', nm using errcode = '22023'; end if;
    out_ := out_ || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', nm,
      'description', left(coalesce(trim(c->>'description'), ''), 100),
      'reply', left(coalesce(c->>'reply', ''), 2000),
      'embed', emb,
      'roles', (select coalesce(jsonb_agg(distinct r), '[]') from jsonb_array_elements_text(case when jsonb_typeof(c->'roles') = 'array' then c->'roles' else '[]' end) r
                where r ~ '^[0-9a-f-]{36}$' and exists (select 1 from public.roles x where x.id = r::uuid and x.server_id = sp.server_id)),
      'ephemeral', coalesce((c->>'ephemeral')::boolean, false))));
  end loop;
  update public.server_plugins set commands = out_ where id = iid;
  return out_;
end $$;

-- ───────── member RPCs ─────────

-- Slash commands everyone in the server can use right now (role-only custom commands only for those roles).
create or replace function public.server_commands(sid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'install_id', sp.id, 'plugin_id', p.id, 'plugin', p.name, 'icon', p.icon, 'bot_user_id', sp.bot_user_id,
      'name', c->>'name', 'description', coalesce(c->>'description', ''),
      'options', case when p.id = 'custom-commands' then
          case when concat(c->>'reply', c->'embed'->>'title', c->'embed'->>'description') like '%{args}%'
            then '[{"name":"text","type":"string","description":"Anything to add","required":false}]'::jsonb else '[]'::jsonb end
        else coalesce(c->'options', '[]') end)
    order by c->>'name', p.name), '[]')
  from public.server_plugins sp
  join public.plugins p on p.id = sp.plugin_id
  cross join lateral jsonb_array_elements(coalesce(sp.commands, p.commands)) c
  where sp.server_id = sid and sp.enabled and public.is_member(sid)
    and (p.id <> 'custom-commands' or jsonb_array_length(coalesce(c->'roles', '[]')) = 0 or public.has_perm(sid, 'manage_server')
         or exists (select 1 from public.member_roles mr where mr.server_id = sid and mr.user_id = auth.uid()
                    and mr.role_id::text in (select jsonb_array_elements_text(c->'roles'))))
$$;

-- Records a slash-command use after the same checks as posting. The plugin-runtime function calls this with the user's JWT.
create or replace function public.begin_interaction(cid uuid, iid uuid, cmd text, opts jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins; c jsonb; sid uuid; why text; n int; id_ uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into sp from public.server_plugins where id = iid and enabled;
  select ch.server_id into sid from public.channels ch where ch.id = cid;
  if sp.id is null or sid is distinct from sp.server_id or not public.can_view_channel(cid) then
    raise exception 'That command isn''t available here.' using errcode = 'P0002';
  end if;
  why := public.post_block(sid);
  if why = 'timeout' then raise exception 'You''re in a timeout here, so commands are paused too.' using errcode = '42501', hint = 'timeout'; end if;
  if why = 'rules' then raise exception 'Agree to the server rules first.' using errcode = '42501', hint = 'rules'; end if;
  select x into c from public.plugins p cross join lateral jsonb_array_elements(coalesce(sp.commands, p.commands)) x
   where p.id = sp.plugin_id and x->>'name' = cmd limit 1;
  if c is null then raise exception 'There''s no /% here any more.', left(cmd, 40) using errcode = 'P0002'; end if;
  if jsonb_array_length(coalesce(c->'roles', '[]')) > 0 and not public.has_perm(sid, 'manage_server')
     and not exists (select 1 from public.member_roles mr where mr.server_id = sid and mr.user_id = auth.uid()
                     and mr.role_id::text in (select jsonb_array_elements_text(c->'roles'))) then
    raise exception 'Only some roles can use /%.', cmd using errcode = '42501';
  end if;
  if jsonb_typeof(opts) is distinct from 'object' or char_length(opts::text) > 4000 then raise exception 'Bad command options.' using errcode = '22023'; end if;
  select count(*) into n from public.plugin_interactions where user_id = auth.uid() and created_at > now() - interval '30 seconds';
  if n >= 8 then raise exception 'Easy there! Try that again in a few seconds.' using errcode = 'P0001', hint = 'rate_limited'; end if;
  delete from public.plugin_interactions where created_at < now() - interval '1 day'; -- housekeeping (indexed, usually nothing)
  insert into public.plugin_interactions (install_id, channel_id, user_id, command, options) values (iid, cid, auth.uid(), cmd, opts)
  returning id into id_;
  return id_;
end $$;

-- ───────── bot RPCs (service role only: plugin-runtime and bot-api edge functions) ─────────

create or replace function public.bot_install(iid uuid, need text) returns public.server_plugins
language plpgsql stable security definer set search_path = '' as $$
declare sp public.server_plugins;
begin
  select * into sp from public.server_plugins where id = iid;
  if sp.id is null then raise exception 'Unknown bot.' using errcode = 'P0002'; end if;
  if not sp.enabled then raise exception 'This bot is turned off in its server.' using errcode = '42501', hint = 'disabled'; end if;
  if need is not null and not need = any(sp.permissions) then
    raise exception 'This bot doesn''t have the % permission.', need using errcode = '42501', hint = 'missing_permission';
  end if;
  return sp;
end $$;

-- Room the bot may act in: in its install's server and visible to it.
create or replace function public.bot_room(sp public.server_plugins, cid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.channels where id = cid and server_id = sp.server_id) or not public.bot_can_view(sp.bot_user_id, cid) then
    raise exception 'Room not found, or the bot can''t see it.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.bot_send(iid uuid, cid uuid, body text, emb jsonb default '[]', reply bigint default null, inter uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, 'send_messages'); m public.messages; ix public.plugin_interactions;
begin
  perform public.bot_room(sp, cid);
  body := coalesce(body, ''); emb := coalesce(emb, '[]');
  if body = '' and jsonb_array_length(emb) = 0 then raise exception 'A message needs content or an embed.' using errcode = '22023'; end if;
  if char_length(body) > 4000 then raise exception 'Messages can be up to 4000 characters.' using errcode = '22001'; end if;
  if reply is not null and not exists (select 1 from public.messages where id = reply and channel_id = cid) then
    raise exception 'reply_to must be a message in the same room.' using errcode = '22023';
  end if;
  if inter is not null then
    select * into ix from public.plugin_interactions where id = inter and install_id = iid;
    if ix.id is null then raise exception 'Interaction not found.' using errcode = 'P0002'; end if;
  end if;
  insert into public.messages (channel_id, author_id, content, reply_to, embeds, interaction)
  values (cid, sp.bot_user_id, body, reply, emb,
          case when ix.id is not null then jsonb_build_object('id', ix.id, 'user_id', ix.user_id, 'name', ix.command) end)
  returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.bot_edit(iid uuid, mid bigint, body text default null, emb jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, 'send_messages'); m public.messages;
begin
  select msg.* into m from public.messages msg join public.channels c on c.id = msg.channel_id
   where msg.id = mid and msg.author_id = sp.bot_user_id and c.server_id = sp.server_id;
  if m.id is null then raise exception 'Message not found (bots can only edit their own).' using errcode = 'P0002'; end if;
  if char_length(body) > 4000 then raise exception 'Messages can be up to 4000 characters.' using errcode = '22001'; end if;
  if coalesce(body, m.content) = '' and jsonb_array_length(coalesce(emb, m.embeds)) = 0 then
    raise exception 'A message needs content or an embed.' using errcode = '22023';
  end if;
  update public.messages set content = coalesce(body, content), embeds = coalesce(emb, embeds), edited_at = now()
   where id = mid returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.bot_delete(iid uuid, mid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, null);
begin
  delete from public.messages msg using public.channels c
   where msg.id = mid and msg.author_id = sp.bot_user_id and c.id = msg.channel_id and c.server_id = sp.server_id;
  if not found then raise exception 'Message not found (bots can only delete their own).' using errcode = 'P0002'; end if;
end $$;

create or replace function public.bot_react(iid uuid, mid bigint, emo text, add boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, 'add_reactions'); cid uuid;
begin
  select msg.channel_id into cid from public.messages msg join public.channels c on c.id = msg.channel_id
   where msg.id = mid and c.server_id = sp.server_id;
  if cid is null or not public.bot_can_view(sp.bot_user_id, cid) then raise exception 'Message not found.' using errcode = 'P0002'; end if;
  if coalesce(char_length(emo), 0) not between 1 and 32 then raise exception 'Bad emoji.' using errcode = '22023'; end if;
  if add then
    insert into public.reactions (message_id, user_id, emoji, channel_id) values (mid, sp.bot_user_id, emo, cid) on conflict do nothing;
  else
    delete from public.reactions where message_id = mid and user_id = sp.bot_user_id and emoji = emo;
  end if;
end $$;

create or replace function public.bot_messages(iid uuid, cid uuid, lim int default 50, before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, 'read_messages');
begin
  perform public.bot_room(sp, cid);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (
    select m.id, m.channel_id, m.content, m.embeds, m.attachments, m.reply_to, m.created_at, m.edited_at,
      jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'is_bot', p.is_bot) as author
    from public.messages m join public.profiles p on p.id = m.author_id
    where m.channel_id = cid and (before is null or m.id < before)
    order by m.id desc limit least(greatest(coalesce(lim, 50), 1), 100)) x), '[]');
end $$;

create or replace function public.bot_rooms(iid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, null);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'private', c.private,
      'parent_id', c.parent_channel_id, 'topic', c.topic) order by c.position, c.name)
    from public.channels c where c.server_id = sp.server_id and c.kind not in ('dm', 'thread') and public.bot_can_view(sp.bot_user_id, c.id)), '[]');
end $$;

create or replace function public.bot_roles(iid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, null); top int;
begin
  top := public.member_rank(sp.server_id, sp.installed_by);
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'color', r.color, 'position', r.position,
      'permissions', r.permissions, 'assignable', 'manage_roles' = any(sp.permissions) and r.permissions = '{}' and r.position < top)
      order by r.position desc)
    from public.roles r where r.server_id = sp.server_id), '[]');
end $$;

-- Bots may only hand out roles that grant no permissions and sit below their installer's highest role.
create or replace function public.bot_set_role(iid uuid, uid uuid, rid uuid, add boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, 'manage_roles'); r public.roles;
begin
  select * into r from public.roles where id = rid and server_id = sp.server_id;
  if r.id is null then raise exception 'Role not found.' using errcode = 'P0002'; end if;
  if r.permissions <> '{}' or r.position >= public.member_rank(sp.server_id, sp.installed_by) then
    raise exception 'Bots can only give out roles without permissions that rank below whoever added the bot.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members where server_id = sp.server_id and user_id = uid) then
    raise exception 'They aren''t in this server.' using errcode = 'P0002';
  end if;
  if add then
    insert into public.member_roles (server_id, user_id, role_id) values (sp.server_id, uid, rid) on conflict do nothing;
  else
    delete from public.member_roles where server_id = sp.server_id and user_id = uid and role_id = rid;
  end if;
  if found then
    insert into public.audit_log (server_id, actor_id, action, target_id, details)
    values (sp.server_id, sp.bot_user_id, case when add then 'member_role_add' else 'member_role_remove' end, uid, jsonb_build_object('role', r.name));
  end if;
end $$;

create or replace function public.bot_interaction_reply(iid uuid, ix uuid, body text, emb jsonb default '[]', eph boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, null); r public.plugin_interactions;
begin
  select * into r from public.plugin_interactions where id = ix and install_id = iid;
  if r.id is null then raise exception 'Interaction not found.' using errcode = 'P0002'; end if;
  if r.created_at < now() - interval '15 minutes' then raise exception 'That interaction expired (bots have 15 minutes to reply).' using errcode = '22023'; end if;
  if eph then
    if coalesce(body, '') = '' and jsonb_array_length(coalesce(emb, '[]')) = 0 then raise exception 'A reply needs content or an embed.' using errcode = '22023'; end if;
    update public.plugin_interactions set response = jsonb_build_object('content', left(coalesce(body, ''), 4000), 'embeds', coalesce(emb, '[]'), 'at', now())
     where id = ix;
    return jsonb_build_object('ephemeral', true, 'interaction_id', ix);
  end if;
  return public.bot_send(iid, r.channel_id, body, emb, null, ix);
end $$;

create or replace function public.bot_set_commands(iid uuid, cmds jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare sp public.server_plugins := public.bot_install(iid, null);
begin
  if not exists (select 1 from public.plugins where id = sp.plugin_id and kind = 'webhook') then
    raise exception 'Only external bots register commands.' using errcode = '42501';
  end if;
  if jsonb_typeof(cmds) <> 'array' or jsonb_array_length(cmds) > 50 then raise exception 'Up to 50 commands.' using errcode = '22023'; end if;
  update public.server_plugins set commands = cmds where id = iid;
end $$;

-- Token check + fixed one-minute window rate limit (120 calls). Returns null for an unknown token.
create or replace function public.bot_auth(th text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare iid uuid; n int; at_ timestamptz;
begin
  update public.plugin_secrets s set
    rate_n = case when s.rate_at > now() - interval '1 minute' then s.rate_n + 1 else 1 end,
    rate_at = case when s.rate_at > now() - interval '1 minute' then s.rate_at else now() end
  where s.token_hash = th
  returning s.install_id, s.rate_n, s.rate_at into iid, n, at_;
  if iid is null then return null; end if;
  if n > 120 then
    raise exception 'Too many requests.' using errcode = 'P0001',
      hint = 'rate_limited:' || greatest(1, ceil(extract(epoch from at_ + interval '1 minute' - now())))::int;
  end if;
  return (select jsonb_build_object('install_id', sp.id, 'server_id', sp.server_id, 'bot_user_id', sp.bot_user_id, 'enabled', sp.enabled,
      'permissions', sp.permissions, 'events', sp.events, 'name', p.name, 'username', b.username, 'server_name', s.name)
    from public.server_plugins sp join public.plugins p on p.id = sp.plugin_id
    join public.profiles b on b.id = sp.bot_user_id join public.servers s on s.id = sp.server_id
    where sp.id = iid);
end $$;

-- Everything the runtime needs to run one install (and, for a command, the interaction around it).
create or replace function public.plugin_context(iid uuid, ix uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'install', to_jsonb(sp), 'plugin', to_jsonb(p) - 'config_schema', 'signing_secret', s.signing_secret,
    'bot', jsonb_build_object('id', b.id, 'username', b.username, 'display_name', b.display_name),
    'server', jsonb_build_object('id', sv.id, 'name', sv.name),
    'interaction', to_jsonb(i),
    'user', (select jsonb_build_object('id', u.id, 'username', u.username,
               'display_name', coalesce(mb.nickname, u.display_name, u.username))
             from public.profiles u left join public.members mb on mb.server_id = sp.server_id and mb.user_id = u.id where u.id = i.user_id),
    'room', (select jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind) from public.channels c where c.id = i.channel_id))
  from public.server_plugins sp
  join public.plugins p on p.id = sp.plugin_id
  join public.servers sv on sv.id = sp.server_id
  left join public.profiles b on b.id = sp.bot_user_id
  left join public.plugin_secrets s on s.install_id = sp.id
  left join public.plugin_interactions i on i.id = ix and i.install_id = sp.id
  where sp.id = coalesce(iid, (select install_id from public.plugin_interactions where id = ix))
$$;

-- Webhook delivery bookkeeping: failures in a row, the last 5 errors, and auto-off after 10 straight failures.
create or replace function public.plugin_result(iid uuid, err text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.server_plugins sp set
    failures = case when err is null then 0 else sp.failures + 1 end,
    enabled = case when err is not null and sp.failures + 1 >= 10 then false else sp.enabled end,
    last_errors = case when err is null then sp.last_errors else (
      select coalesce(jsonb_agg(e order by i), '[]') from jsonb_array_elements(
        jsonb_build_array(jsonb_build_object('at', now(), 'error',
          left(err, 300) || case when sp.failures + 1 >= 10 then ' (turned off after 10 failed deliveries in a row)' else '' end))
        || sp.last_errors) with ordinality a(e, i) where i <= 5) end
  where sp.id = iid and (err is not null or sp.failures <> 0);
end $$;

-- Shared secret the database sends with event deliveries; the edge function compares against it.
create or replace function public.plugin_runtime_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'plugin_runtime_secret' limit 1
$$;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'plugin_runtime_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'plugin_runtime_secret', 'plugin-runtime event deliveries');
  end if;
end $$;

-- ───────── Automod (pure matching; mirrored in src/lib/automod.js for the "would this be blocked?" preview) ─────────

-- Lower-case, then l33t → letters (0→o, 1 ! | l→i, 3→e, 4 @→a, 5 $→s, 7 +→t). Applied to both text and patterns.
create or replace function public.automod_norm(s text) returns text
language sql immutable set search_path = '' as $$
  select translate(lower(coalesce(s, '')), '01!|l34@5$7+', 'oiiiieaasstt')
$$;

-- One regex for the whole blocked list: whole words, * = any letters, letters may repeat ("baaad") and be split by
-- one of " ._*-" ("b.a.d"), spaces in a phrase match any gap.
create or replace function public.automod_words_rx(words jsonb) returns text
language sql immutable set search_path = '' as $$
  select '(^|[^a-z0-9])(' || string_agg(body, '|') || ')($|[^a-z0-9])'
  from (
    select (select string_agg(case ch when '*' then '[a-z0-9]*' when ' ' then '[^a-z0-9]+' else ch || '+[ ._*-]?' end, '' order by i)
            from (select substr(p, i, 1) ch, i from generate_series(1, length(p)) i) s) body
    from (select regexp_replace(regexp_replace(public.automod_norm(trim(w)), '[^a-z0-9* ]', '', 'g'), '\s+', ' ', 'g') p
          from jsonb_array_elements_text(case when jsonb_typeof(words) = 'array' then words else '[]' end) w) x
    where trim(p) not in ('', '*')
  ) y
$$;

-- Which content rule a message breaks, or null. Spam/repeat need history, so the trigger checks those.
create or replace function public.automod_rule(cfg jsonb, body text) returns text
language plpgsql immutable set search_path = '' as $$
declare rx text := public.automod_words_rx(cfg->'words'); mode text := coalesce(cfg->>'links', 'off'); h text; letters int; caps int;
begin
  if coalesce(body, '') = '' then return null; end if;
  if rx is not null and public.automod_norm(body) ~ rx then return 'words'; end if;
  if mode in ('invites', 'all') and body ~* '(#/invite/[a-z0-9_-]+|discord(app)?\.(gg|com/invite)/|chat\.whatsapp\.com/|t\.me/(joinchat|\+))' then
    return 'invites';
  end if;
  if mode = 'all' then
    for h in select regexp_replace(lower(m[1]), '^www\.', '') from regexp_matches(body, '(?:https?://|www\.)([a-z0-9.-]+)', 'gi') m loop
      if not exists (select 1 from jsonb_array_elements_text(coalesce(cfg->'allow_sites', '[]')) a(s),
                     lateral (select regexp_replace(lower(trim(both ' ./' from regexp_replace(a.s, '^\s*https?://', ''))), '^www\.', '') d) dd
                     where dd.d <> '' and (h = dd.d or right(h, length(dd.d) + 1) = '.' || dd.d)) then
        return 'links';
      end if;
    end loop;
  end if;
  if coalesce((cfg->>'max_mentions')::int, 0) > 0 and cardinality(public.mention_handles(body)) > (cfg->>'max_mentions')::int then
    return 'mentions';
  end if;
  if coalesce((cfg->>'caps')::int, 0) > 0 then
    letters := length(regexp_replace(body, '[^A-Za-z]', '', 'g'));
    caps := length(regexp_replace(body, '[^A-Z]', '', 'g'));
    if letters >= 12 and caps * 100 > (cfg->>'caps')::int * letters then return 'caps'; end if;
  end if;
  return null;
end $$;

-- BEFORE INSERT on messages. Runs after the timeout/slowmode/forward triggers (names sort first).
--  1. Only bots (server-side writes) may post embeds or interaction headers.
--  2. Automod: a held-back message is dropped (return null), the reason goes to automod_hits for the sender's client,
--     the audit log gets an entry, and repeat offenders get the moderation timeout.
create or replace function public.plugins_before_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); sid uuid; root uuid; cfg jsonb; bot uuid; rule text; why text; n int; strikes int; lim int; secs int; same text[];
begin
  if uid is null then return new; end if; -- bots and other server-side writes
  if new.embeds is distinct from '[]'::jsonb or new.interaction is not null then
    raise exception 'Only bots can post embeds.' using errcode = '42501';
  end if;
  select c.server_id, coalesce(c.parent_channel_id, c.id) into sid, root from public.channels c where c.id = new.channel_id;
  if sid is null then return new; end if;
  select sp.config, sp.bot_user_id into cfg, bot from public.server_plugins sp where sp.server_id = sid and sp.plugin_id = 'automod' and sp.enabled;
  if cfg is null then return new; end if;
  begin -- a broken config must never stop a whole server from talking
    if public.has_perm(sid, 'manage_server')
       or exists (select 1 from jsonb_array_elements_text(cfg->'exempt_rooms') r where r in (root::text, new.channel_id::text))
       or exists (select 1 from public.member_roles mr where mr.server_id = sid and mr.user_id = uid
                  and mr.role_id::text in (select jsonb_array_elements_text(cfg->'exempt_roles'))) then
      return new;
    end if;
    rule := public.automod_rule(cfg, new.content);
    if rule is null and coalesce((cfg->>'spam_count')::int, 0) > 0 then
      select count(*) into n from (select m.author_id, m.created_at from public.messages m where m.channel_id = new.channel_id order by m.id desc limit 40) x
       where x.author_id = uid and x.created_at > now() - make_interval(secs => greatest(coalesce((cfg->>'spam_seconds')::int, 8), 1));
      if n >= (cfg->>'spam_count')::int then rule := 'spam'; end if;
    end if;
    if rule is null and coalesce((cfg->>'repeats')::int, 0) > 0 and new.content <> '' then
      select array_agg(x.content) into same from (
        select y.content from (select m.author_id, m.content, m.created_at, m.id from public.messages m where m.channel_id = new.channel_id order by m.id desc limit 40) y
        where y.author_id = uid and y.created_at > now() - interval '5 minutes' order by y.id desc limit (cfg->>'repeats')::int) x;
      if cardinality(same) = (cfg->>'repeats')::int and new.content = all(same) then rule := 'repeat'; end if;
    end if;
  exception when others then
    return new;
  end;
  if rule is null then return new; end if;

  why := 'Automod held that back: ' || case rule
    when 'words' then 'it has a word or phrase this server doesn''t allow.'
    when 'invites' then 'invite links aren''t allowed here.'
    when 'links' then 'links to that site aren''t allowed here.'
    when 'mentions' then 'it mentions too many people at once.'
    when 'caps' then 'it''s mostly CAPITALS. No need to shout!'
    when 'spam' then 'you''re sending messages a little fast. Take a breath!'
    else 'you''ve said that a few times already.' end;
  select count(*) + 1 into strikes from public.automod_hits h where h.server_id = sid and h.user_id = uid and h.created_at > now() - interval '10 minutes';
  lim := coalesce((cfg->>'timeout_after')::int, 0);
  if lim > 0 and strikes >= lim then
    secs := least(greatest(coalesce((cfg->>'timeout_minutes')::int, 10), 1), 10080) * 60;
    update public.members set timeout_until = now() + make_interval(secs => secs) where server_id = sid and user_id = uid and role <> 'owner';
    if found then
      why := why || ' That''s ' || strikes || ' in a few minutes, so you''re in a timeout for '
        || case when secs >= 86400 then (secs / 86400) || ' day' || case when secs >= 172800 then 's' else '' end
                when secs >= 3600 then (secs / 3600) || ' hour' || case when secs >= 7200 then 's' else '' end
                else (secs / 60) || ' minute' || case when secs >= 120 then 's' else '' end end || '.';
      insert into public.audit_log (server_id, actor_id, action, target_id, details)
      values (sid, bot, 'member_timeout', uid, jsonb_build_object('secs', secs, 'reason', 'Automod: ' || strikes || ' messages held back in 10 minutes'));
    end if;
  elsif lim > 1 and strikes = lim - 1 then
    why := why || ' One more and you''ll get a short timeout.';
  end if;
  insert into public.automod_hits (server_id, user_id, channel_id, rule, reason) values (sid, uid, new.channel_id, rule, why);
  insert into public.audit_log (server_id, actor_id, action, target_id, details)
  values (sid, bot, 'automod_block', uid, jsonb_build_object('rule', rule, 'room', (select name from public.channels where id = root)));
  return null;
end $$;
drop trigger if exists plugins_before_message on public.messages;
create trigger plugins_before_message before insert on public.messages for each row execute function public.plugins_before_message();

-- ───────── event dispatch (only when an enabled install in that server listens) ─────────
create or replace function public.plugin_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; cid uuid; actor uuid; targets jsonb; data jsonb; hs text[];
begin
  if tg_table_name = 'members' then
    sid := new.server_id; actor := new.user_id;
  elsif tg_table_name = 'messages' then
    cid := new.channel_id; actor := new.author_id;
  else
    cid := new.channel_id; actor := new.user_id;
  end if;
  if cid is not null then select c.server_id into sid from public.channels c where c.id = cid; end if;
  if sid is null then return null; end if;
  -- the common case: nobody in this server listens to anything
  if not exists (select 1 from public.server_plugins sp where sp.server_id = sid and sp.enabled and sp.events <> '{}') then return null; end if;
  if coalesce((select is_bot from public.profiles where id = actor), true) then return null; end if; -- bots don't trigger bots (no loops)

  if tg_table_name = 'messages' then
    hs := public.mention_handles(new.content);
    select jsonb_agg(jsonb_build_object('id', t.id, 'event', t.ev)) into targets from (
      select sp.id, case when 'bot_mentioned' = any(sp.events) and (b.username = any(hs)
                  or exists (select 1 from public.messages o where o.id = new.reply_to and o.author_id = sp.bot_user_id))
                then 'bot_mentioned' else 'message_created' end ev,
             'message_created' = any(sp.events) and 'read_messages' = any(sp.permissions) all_msgs
      from public.server_plugins sp join public.profiles b on b.id = sp.bot_user_id
      where sp.server_id = sid and sp.enabled and sp.events && array['message_created','bot_mentioned'] and public.bot_can_view(sp.bot_user_id, cid)
    ) t where t.ev = 'bot_mentioned' or t.all_msgs;
    data := jsonb_build_object('message', jsonb_build_object('id', new.id, 'channel_id', cid, 'content', new.content,
      'reply_to', new.reply_to, 'attachments', new.attachments, 'created_at', new.created_at, 'mentions', to_jsonb(hs),
      'author', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name) from public.profiles p where p.id = actor)));
  elsif tg_table_name = 'reactions' then
    select jsonb_agg(jsonb_build_object('id', sp.id, 'event', 'reaction_added')) into targets from public.server_plugins sp
     where sp.server_id = sid and sp.enabled and 'reaction_added' = any(sp.events) and public.bot_can_view(sp.bot_user_id, cid);
    data := jsonb_build_object('reaction', jsonb_build_object('message_id', new.message_id, 'channel_id', cid, 'emoji', new.emoji, 'user_id', actor));
  else
    select jsonb_agg(jsonb_build_object('id', sp.id, 'event', 'member_joined')) into targets from public.server_plugins sp
     where sp.server_id = sid and sp.enabled and 'member_joined' = any(sp.events);
    data := jsonb_build_object('member', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'joined_at', new.joined_at)
      from public.profiles p where p.id = actor));
  end if;
  if targets is null then return null; end if;
  -- shortcut: project URL is hard-coded (one project); move it to a vault secret if this ever runs in several environments.
  perform net.http_post(
    url := 'https://nilludyavkfqwastghmw.supabase.co/functions/v1/plugin-runtime',
    body := jsonb_build_object('type', 'event', 'server_id', sid, 'targets', targets, 'data', data, 'at', now()),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-chitchat-secret', public.plugin_runtime_secret()),
    timeout_milliseconds := 10000);
  return null;
end $$;
drop trigger if exists plugins_dispatch on public.messages;
create trigger plugins_dispatch after insert on public.messages for each row execute function public.plugin_dispatch();
drop trigger if exists plugins_dispatch on public.reactions;
create trigger plugins_dispatch after insert on public.reactions for each row execute function public.plugin_dispatch();
drop trigger if exists plugins_dispatch on public.members;
create trigger plugins_dispatch after insert on public.members for each row execute function public.plugin_dispatch();

-- ───────── realtime: late ephemeral replies reach the person who used the command ─────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plugin_interactions') then
    alter publication supabase_realtime add table public.plugin_interactions;
  end if;
end $$;

-- ───────── function privileges ─────────
revoke execute on function
  public.create_bot_user(text, text, text, text), public.drop_bot_user(uuid, uuid), public.on_plugin_deleted(),
  public.bot_can_view(uuid, uuid), public.clean_plugin_config(jsonb, jsonb), public.check_plugin_perms(uuid, text[], text[]),
  public.valid_webhook_url(text), public.new_secret(text),
  public.install_plugin(uuid, text, text[]), public.configure_plugin(uuid, jsonb, boolean, text[], text, text[]),
  public.uninstall_plugin(uuid), public.create_webhook_bot(uuid, text, text, text, text[], text[]), public.regenerate_bot_secrets(uuid),
  public.save_custom_commands(uuid, jsonb), public.server_commands(uuid), public.begin_interaction(uuid, uuid, text, jsonb),
  public.bot_install(uuid, text), public.bot_room(public.server_plugins, uuid), public.bot_send(uuid, uuid, text, jsonb, bigint, uuid),
  public.bot_edit(uuid, bigint, text, jsonb), public.bot_delete(uuid, bigint), public.bot_react(uuid, bigint, text, boolean),
  public.bot_messages(uuid, uuid, int, bigint), public.bot_rooms(uuid), public.bot_roles(uuid), public.bot_set_role(uuid, uuid, uuid, boolean),
  public.bot_interaction_reply(uuid, uuid, text, jsonb, boolean), public.bot_set_commands(uuid, jsonb), public.bot_auth(text),
  public.plugin_context(uuid, uuid), public.plugin_result(uuid, text), public.plugin_runtime_secret(),
  public.automod_norm(text), public.automod_words_rx(jsonb), public.automod_rule(jsonb, text),
  public.plugins_before_message(), public.plugin_dispatch()
from public, anon, authenticated;
grant execute on function
  public.install_plugin(uuid, text, text[]), public.configure_plugin(uuid, jsonb, boolean, text[], text, text[]),
  public.uninstall_plugin(uuid), public.create_webhook_bot(uuid, text, text, text, text[], text[]), public.regenerate_bot_secrets(uuid),
  public.save_custom_commands(uuid, jsonb), public.server_commands(uuid), public.begin_interaction(uuid, uuid, text, jsonb)
to authenticated;
grant execute on function
  public.bot_send(uuid, uuid, text, jsonb, bigint, uuid), public.bot_edit(uuid, bigint, text, jsonb), public.bot_delete(uuid, bigint),
  public.bot_react(uuid, bigint, text, boolean), public.bot_messages(uuid, uuid, int, bigint), public.bot_rooms(uuid), public.bot_roles(uuid),
  public.bot_set_role(uuid, uuid, uuid, boolean), public.bot_interaction_reply(uuid, uuid, text, jsonb, boolean),
  public.bot_set_commands(uuid, jsonb), public.bot_auth(text), public.plugin_context(uuid, uuid), public.plugin_result(uuid, text),
  public.plugin_runtime_secret()
to service_role;

-- ───────── built-in catalog (bot accounts made once, shared by every server that adds the plugin) ─────────
do $$
declare chef uuid; am uuid; chit uuid;
begin
  if exists (select 1 from public.plugins where id = 'chef') then return; end if;
  chef := public.create_bot_user('thechef', 'The Chef', null, '#ffd166');
  am := public.create_bot_user('automod', 'Automod', null, '#7b9cff');
  chit := public.create_bot_user('chit', 'Chit', null, '#ff9f6b');
  insert into public.plugins (id, name, description, kind, icon, permissions, events, commands, config_schema, bot_user_id) values
  ('chef', 'The Chef',
   'A very serious head chef. @mention it and it answers "Yes Chef." (almost always). Also serves a dish of the day, rates anything out of 10, reads the menu, and 86es things.',
   'builtin', 'party', '{send_messages}', '{bot_mentioned}',
   '[{"name":"chef special","description":"Today''s special. It changes every day.","options":[]},
     {"name":"chef rate","description":"The Chef tastes something and rates it out of 10","options":[{"name":"thing","type":"string","description":"What should the Chef taste?","required":true}]},
     {"name":"chef menu","description":"Tonight''s menu","options":[]},
     {"name":"chef 86","description":"86 something: it''s off the menu now","options":[{"name":"thing","type":"string","description":"What''s being 86''d?","required":true}]}]',
   '[{"key":"variations","type":"boolean","label":"Rare variations","help":"Once in a long while the Chef says something other than \"Yes Chef.\"","default":true},
     {"key":"kitchen","type":"text","label":"Kitchen name","help":"Shown on /chef menu. Leave empty to use the server''s name.","default":"","max":40}]',
   chef),
  ('automod', 'Automod',
   'Quietly holds back blocked words, invite links, unwanted links, mention spam, SHOUTING and message floods before anyone sees them. Runs inside the database, so it works even when nobody is online.',
   'builtin', 'shield', '{send_messages,timeout_members}', '{}', '[]',
   '[{"key":"words","type":"list","label":"Blocked words and phrases","help":"One per line. * is a wildcard (bad* also catches badly). Catches l33t spellings, stretched letters and s.p.a.c.e.d letters too.","default":[],"max":200},
     {"key":"links","type":"select","label":"Links","options":[["off","Allow all links"],["invites","Block invite links"],["all","Block links, except allowed sites"]],"default":"invites"},
     {"key":"allow_sites","type":"list","label":"Allowed sites","help":"Used when links are blocked. One per line, like youtube.com (subdomains count too).","default":[],"max":100},
     {"key":"max_mentions","type":"number","label":"Most @mentions in one message","help":"0 means no limit.","default":5,"min":0,"max":50},
     {"key":"caps","type":"number","label":"Hold back SHOUTING above this % of capitals","help":"Only checks messages with 12 or more letters. 0 turns it off.","default":0,"min":0,"max":100},
     {"key":"spam_count","type":"number","label":"Most messages in a burst","help":"Per person, per room. 0 turns it off.","default":6,"min":0,"max":30},
     {"key":"spam_seconds","type":"number","label":"Burst length (seconds)","default":8,"min":2,"max":120},
     {"key":"repeats","type":"number","label":"Most identical messages in a row","help":"Within 5 minutes. 0 turns it off.","default":3,"min":0,"max":10},
     {"key":"timeout_after","type":"number","label":"Time out after this many held-back messages","help":"Counted over 10 minutes. 0 means never.","default":3,"min":0,"max":20},
     {"key":"timeout_minutes","type":"select","label":"Timeout length","options":[["1","1 minute"],["5","5 minutes"],["10","10 minutes"],["60","1 hour"],["1440","1 day"]],"default":"10"},
     {"key":"exempt_roles","type":"roles","label":"Roles Automod skips","help":"People with Manage server are always skipped.","default":[]},
     {"key":"exempt_rooms","type":"rooms","label":"Rooms Automod ignores","default":[]}]',
   am),
  ('custom-commands', 'Custom commands',
   'Make your own slash commands without code: replies with {user}, {server} and {args}, random picks, small embeds, and commands only some roles can use. Chit answers them.',
   'builtin', 'sparkle', '{send_messages}', '{}', '[]', '[]', chit);
end $$;
