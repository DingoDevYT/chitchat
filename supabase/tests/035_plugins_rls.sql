-- Rolled-back RLS + behaviour tests for 035_plugins.sql. Run the whole file in the SQL editor (or via execute_sql).
-- It ends by raising 'ALL PLUGIN TESTS PASSED', which also rolls back every change (installs, messages, the temporary outsider).
-- Any other error message is a failing check. Uses the test accounts: pip (owner of "pip's place") and mochi (member).

create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.act_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function pg_temp.fails(q text, pat text default null) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  if pat is not null and sqlerrm !~* pat then raise exception 'wrong error for %: %', q, sqlerrm; end if;
  return true;
end $$;
create function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(c, false) then raise exception 'FAIL: %', what; end if;
end $$;

do $$
declare
  pip uuid := '4f65e92f-c7e1-4b15-a5b7-feb4db159f63';
  mochi uuid := '6e88f393-0d15-4b12-89e3-4410ca066540';
  sid uuid := 'b59d691d-e2d2-4177-83c0-d3f767378dcd';
  gen uuid := 'cb44c837-e669-4011-b029-623da014aca4';
  outsider uuid := gen_random_uuid();
  chef_bot uuid := (select bot_user_id from public.plugins where id = 'chef');
  other_sid uuid; other_gen uuid; priv uuid; chef_iid uuid; am_iid uuid; cc_iid uuid; wh jsonb; wh_iid uuid; wh_bot uuid;
  ix uuid; mid bigint; hello_id bigint; q0 bigint; j jsonb; r record; role_free uuid; role_perm uuid; role_helper uuid;
begin
  -- a temporary outsider who isn't in the server (rolled back with everything else, and deleted below anyway)
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', outsider, 'authenticated', 'authenticated',
          'outsider-' || left(outsider::text, 8) || '@chitchat.test', '{"username":"outsidertest"}', now(), now());

  -- ── pip (owner) ──
  perform pg_temp.act(pip);
  chef_iid := public.install_plugin(sid, 'chef');
  perform pg_temp.ok(pg_temp.fails(format('select public.install_plugin(%L, %L)', sid, 'chef'), 'already added'), 'double install refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.install_plugin(%L, %L, %L)', sid, 'automod', '{send_messages,manage_roles}'), 'only get permissions it asked'), 'unrequested permission refused');
  am_iid := public.install_plugin(sid, 'automod');
  perform public.configure_plugin(am_iid, '{"words":["darn"," bad* ","darn"],"links":"invites","max_mentions":"3","spam_count":0,"repeats":0,"timeout_after":2,"timeout_minutes":"5","junk":true}');
  select config into j from public.server_plugins where id = am_iid;
  perform pg_temp.ok(j->'words' = '["darn","bad*"]' and (j->>'max_mentions')::int = 3 and not j ? 'junk' and j->>'timeout_minutes' = '5', 'config cleaned: ' || j::text);
  cc_iid := public.install_plugin(sid, 'custom-commands');
  perform pg_temp.ok(pg_temp.fails(format('select public.save_custom_commands(%L, %L)', cc_iid, '[{"name":"two words","reply":"x"}]'), 'one word'), 'custom names validated');
  perform pg_temp.ok(pg_temp.fails(format('select public.save_custom_commands(%L, %L)', cc_iid, '[{"name":"x"}]'), 'needs a reply'), 'custom reply required');
  perform pg_temp.ok(pg_temp.fails(format('select public.save_custom_commands(%L, %L)', cc_iid, '[{"name":"a","reply":"1"},{"name":"A","reply":"2"}]'), 'two commands'), 'duplicate custom names refused');
  wh := public.create_webhook_bot(sid, 'Test Frog', null, 'https://example.com/hook', '{bot_mentioned}', '{send_messages,manage_roles}');
  wh_iid := (wh->>'install_id')::uuid; wh_bot := (wh->>'bot_user_id')::uuid;
  perform pg_temp.ok(wh->>'token' like 'ccb_%' and wh->>'signing_secret' like 'ccs_%', 'token and secret returned');
  perform pg_temp.ok(pg_temp.fails(format('select public.create_webhook_bot(%L, %L, null, %L)', sid, 'X', 'http://example.com'), 'https'), 'plain http webhook refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.create_webhook_bot(%L, %L, null, %L)', sid, 'X', 'https://localhost/x'), 'https'), 'localhost webhook refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.create_webhook_bot(%L, %L, null, %L)', sid, 'X', 'https://10.0.0.1/x'), 'https'), 'IP webhook refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.create_webhook_bot(%L, %L, null, null, %L, %L)', sid, 'X', '{}', '{timeout_members}'), 'asked for'), 'webhook bots cannot get timeout_members');
  perform pg_temp.ok(pg_temp.fails('select * from public.plugin_secrets', 'permission denied'), 'secrets closed even to the owner');
  perform pg_temp.ok((select count(*) from public.server_plugins where server_id = sid) = 4, 'owner sees the 4 installs');
  perform pg_temp.ok((select webhook_url from public.plugins where server_id = sid) = 'https://example.com/hook', 'owner sees own bot row');
  insert into public.roles (server_id, name, position, permissions) values (sid, 'frog fans', 1, '{}') returning id into role_free;
  insert into public.roles (server_id, name, position, permissions) values (sid, 'mods', 2, '{kick_members}') returning id into role_perm;
  perform public.save_custom_commands(cc_iid, jsonb_build_array(
    jsonb_build_object('name', 'Hug', 'reply', '{user} hugs {args}', 'embed', jsonb_build_object('title', 'x', 'color', 'red')),
    jsonb_build_object('name', 'secret', 'reply', 'shh', 'roles', jsonb_build_array(role_free, gen_random_uuid()))));
  j := (select commands from public.server_plugins where id = cc_iid);
  perform pg_temp.ok(j->0->>'name' = 'hug' and j->0->'embed' = '{"title":"x"}' and j->1->'roles' = jsonb_build_array(role_free), 'custom commands cleaned: ' || j::text);
  perform pg_temp.ok(jsonb_array_length(public.server_commands(sid)) = 6, 'owner registry: 4 chef + 2 custom');
  insert into public.messages (channel_id, author_id, content) values (gen, pip, 'darn it, owner here') returning id into mid;
  perform pg_temp.ok(mid is not null, 'Manage server is exempt from Automod');

  -- ── mochi (member) ──
  perform pg_temp.act(mochi);
  perform pg_temp.ok(pg_temp.fails(format('select public.install_plugin(%L, %L)', sid, 'chef'), 'Manage server'), 'member cannot install');
  perform pg_temp.ok(pg_temp.fails(format('select public.configure_plugin(%L, %L)', am_iid, '{}'), 'not found'), 'member cannot configure');
  perform pg_temp.ok(pg_temp.fails(format('select public.uninstall_plugin(%L)', chef_iid), 'not found'), 'member cannot uninstall');
  perform pg_temp.ok(pg_temp.fails(format('select public.regenerate_bot_secrets(%L)', wh_iid), 'not found'), 'member cannot regenerate tokens');
  perform pg_temp.ok(pg_temp.fails(format('select public.save_custom_commands(%L, %L)', cc_iid, '[]'), 'not found'), 'member cannot edit custom commands');
  perform pg_temp.ok(pg_temp.fails(format('select public.create_webhook_bot(%L, %L)', sid, 'Nope'), 'Manage server'), 'member cannot connect bots');
  perform pg_temp.ok((select count(*) from public.server_plugins) = 0, 'member sees no installs (configs stay private)');
  perform pg_temp.ok((select count(*) from public.plugins where server_id = sid) = 0, 'member cannot see the bot row or its webhook address');
  perform pg_temp.ok((select count(*) from public.plugins where server_id is null) = 3, 'member sees the catalog');
  j := public.server_commands(sid);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j) c where c->>'name' = 'chef rate')
    and not exists (select 1 from jsonb_array_elements(j) c where c->>'name' = 'secret'), 'member registry hides role-only command');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(j) c where c ? 'reply' or c ? 'roles'), 'registry never leaks replies or roles');
  perform pg_temp.ok((select c->'options'->0->>'name' from jsonb_array_elements(j) c where c->>'name' = 'hug') = 'text', 'custom command using {args} gets a text option');
  ix := public.begin_interaction(gen, chef_iid, 'chef rate', '{"thing":"soup"}');
  perform pg_temp.ok((select count(*) from public.plugin_interactions where id = ix) = 1, 'member reads own interaction');
  perform pg_temp.ok(pg_temp.fails(format('select public.begin_interaction(%L, %L, %L)', gen, cc_iid, 'secret'), 'Only some roles'), 'role-only command refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.begin_interaction(%L, %L, %L)', gen, chef_iid, 'nope'), 'no /nope'), 'unknown command refused');
  perform pg_temp.ok(pg_temp.fails(format('select public.begin_interaction(%L, %L, %L, %L)', gen, chef_iid, 'chef menu', '[1]'), 'Bad command options'), 'options must be an object');
  perform pg_temp.ok(pg_temp.fails(format('insert into public.messages (channel_id, author_id, content, embeds) values (%L, %L, %L, %L)', gen, mochi, 'x', '[{"title":"fake"}]'), 'Only bots|permission denied'), 'members cannot post embeds (column grant + trigger)');
  perform pg_temp.ok(pg_temp.fails(format('insert into public.messages (channel_id, author_id, content, interaction) values (%L, %L, %L, %L)', gen, mochi, 'x', '{"name":"x"}'), 'Only bots|permission denied'), 'members cannot fake "used /command" lines');
  perform pg_temp.ok(pg_temp.fails(format('update public.messages set embeds = %L where id = %s', '[{"title":"x"}]', mid), 'permission denied'), 'members cannot add embeds by editing');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_send(%L, %L, %L)', chef_iid, gen, 'hi'), 'permission denied'), 'bot_send closed to members');
  perform pg_temp.ok(pg_temp.fails('select public.plugin_runtime_secret()', 'permission denied'), 'runtime secret closed');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_auth(%L)', 'x'), 'permission denied'), 'bot_auth closed');
  perform pg_temp.ok(pg_temp.fails(format('select public.plugin_context(%L)', chef_iid), 'permission denied'), 'plugin_context closed');
  perform pg_temp.ok(pg_temp.fails(format('update public.profiles set is_bot = true where id = %L', mochi), 'permission denied'), 'nobody can make themselves a bot');
  -- Automod
  insert into public.messages (channel_id, author_id, content) values (gen, mochi, 'd4rn it') returning id into mid;
  perform pg_temp.ok(mid is null, 'Automod drops a l33t blocked word');
  perform pg_temp.ok((select reason from public.automod_hits where user_id = mochi order by id desc limit 1) ~ '^Automod held that back: it has a word.*One more', 'sender reads the reason, with a warning');
  insert into public.messages (channel_id, author_id, content) values (gen, mochi, 'hello friends') returning id into hello_id;
  perform pg_temp.ok(hello_id is not null, 'an ordinary message goes through');
  insert into public.messages (channel_id, author_id, content) values (gen, mochi, 'join https://discord.gg/abc') returning id into mid;
  perform pg_temp.ok(mid is null, 'invite link held back');
  perform pg_temp.ok((select timeout_until from public.members where server_id = sid and user_id = mochi) > now() + interval '4 minutes', 'second strike: 5 minute timeout');
  perform pg_temp.ok(pg_temp.fails(format('select public.begin_interaction(%L, %L, %L, %L)', gen, chef_iid, 'chef rate', '{"thing":"x"}'), 'timeout'), 'commands paused during a timeout');

  -- ── outsider ──
  perform pg_temp.act(outsider);
  perform pg_temp.ok(public.server_commands(sid) = '[]', 'outsider sees no commands');
  perform pg_temp.ok(pg_temp.fails(format('select public.begin_interaction(%L, %L, %L)', gen, chef_iid, 'chef menu'), 'available'), 'outsider cannot use commands');
  perform pg_temp.ok((select count(*) from public.automod_hits) = 0 and (select count(*) from public.plugin_interactions) = 0
    and (select count(*) from public.server_plugins) = 0, 'outsider reads nothing');
  perform pg_temp.ok(pg_temp.fails(format('select public.install_plugin(%L, %L)', sid, 'chef'), 'Manage server'), 'outsider cannot install');

  -- ── bots (service role side) ──
  perform pg_temp.act_admin();
  perform pg_temp.ok((select count(*) from public.audit_log where server_id = sid and action = 'automod_block' and target_id = mochi) = 2, 'each hold-back is audited');
  perform pg_temp.ok(exists (select 1 from public.audit_log where server_id = sid and action = 'member_timeout' and target_id = mochi
    and actor_id = (select bot_user_id from public.plugins where id = 'automod')), 'the timeout is audited as Automod');
  perform pg_temp.ok((select count(*) from public.audit_log where server_id = sid and action = 'plugin_install') = 4, 'installs are audited');
  update public.members set timeout_until = null where server_id = sid and user_id = mochi;
  j := public.bot_send(chef_iid, gen, 'Yes Chef.', '[{"title":"Special"}]', null, ix);
  perform pg_temp.ok((j->>'author_id')::uuid = chef_bot and j->'interaction'->>'name' = 'chef rate' and j->'embeds'->0->>'title' = 'Special', 'bot_send posts as the bot, with embed and "used" line');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_messages(%L, %L)', chef_iid, gen), 'read_messages'), 'no history without Read messages');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_react(%L, %s, %L, true)', chef_iid, j->>'id', 'x'), 'add_reactions'), 'no reactions without Add reactions');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_edit(%L, %s, %L)', chef_iid, hello_id, 'hacked'), 'not found'), 'bots cannot edit other people''s messages');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_delete(%L, %s)', chef_iid, (select max(id) from public.messages where author_id = pip)), 'not found'), 'bots cannot delete other people''s messages');
  perform pg_temp.ok(public.bot_edit(chef_iid, (j->>'id')::bigint, 'Yes Chef!', '[]')->>'content' = 'Yes Chef!', 'bots edit their own messages');
  insert into public.servers (name, owner_id) values ('plugin test elsewhere', mochi) returning id into other_sid;
  select id into other_gen from public.channels where server_id = other_sid and kind = 'text' limit 1;
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_send(%L, %L, %L)', chef_iid, other_gen, 'hi'), 'Room not found'), 'a bot cannot post in another server');
  insert into public.channels (server_id, name, private) values (sid, 'secret-room', true) returning id into priv;
  perform pg_temp.ok(not public.bot_can_view(chef_bot, priv), 'a bot cannot see a private room');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_send(%L, %L, %L)', chef_iid, priv, 'hi'), 'Room not found'), 'a bot cannot post in a private room');
  insert into public.channel_members (channel_id, user_id) values (priv, chef_bot);
  perform pg_temp.ok(public.bot_can_view(chef_bot, priv), 'a bot sees a private room once added');
  perform public.bot_set_role(wh_iid, mochi, role_free, true);
  perform pg_temp.ok(exists (select 1 from public.member_roles where user_id = mochi and role_id = role_free), 'a bot gives a no-permission role');
  perform pg_temp.ok(exists (select 1 from public.audit_log where action = 'member_role_add' and actor_id = wh_bot), 'bot role changes are audited');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_set_role(%L, %L, %L, true)', wh_iid, mochi, role_perm), 'without permissions'), 'a bot cannot give a role with permissions');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_set_role(%L, %L, %L, true)', chef_iid, mochi, role_free), 'manage_roles'), 'no roles without Give out roles');
  perform pg_temp.ok((select r2->>'assignable' from jsonb_array_elements(public.bot_roles(wh_iid)) r2 where r2->>'id' = role_perm::text) = 'false', 'bot_roles marks permission roles unassignable');
  j := public.bot_auth(encode(extensions.digest(wh->>'token', 'sha256'), 'hex'));
  perform pg_temp.ok((j->>'install_id')::uuid = wh_iid, 'bot_auth finds the install by token hash');
  perform pg_temp.ok(public.bot_auth('nope') is null, 'an unknown token gives null');
  perform pg_temp.ok(pg_temp.fails(format('do $x$ begin for i in 1..125 loop perform public.bot_auth(%L); end loop; end $x$',
    encode(extensions.digest(wh->>'token', 'sha256'), 'hex')), 'Too many'), 'rate limited after 120 calls a minute');
  perform pg_temp.ok(public.bot_interaction_reply(chef_iid, ix, 'only you', '[]', true)->>'ephemeral' = 'true', 'late ephemeral reply accepted');
  perform pg_temp.ok((select response->>'content' from public.plugin_interactions where id = ix) = 'only you', 'late ephemeral reply lands on the interaction');
  for i in 1..10 loop perform public.plugin_result(wh_iid, 'HTTP 500'); end loop;
  select * into r from public.server_plugins where id = wh_iid;
  perform pg_temp.ok(not r.enabled and r.failures = 10 and jsonb_array_length(r.last_errors) = 5, 'switched off after 10 failures; 5 errors kept');
  perform pg_temp.ok(pg_temp.fails(format('select public.bot_send(%L, %L, %L)', wh_iid, gen, 'hi'), 'turned off'), 'a switched-off bot is refused');

  -- ── events: an edge call only when someone listens ──
  select count(*) into q0 from net.http_request_queue;
  perform pg_temp.act(mochi);
  insert into public.messages (channel_id, author_id, content) values (gen, mochi, 'just chatting');
  perform pg_temp.act_admin();
  perform pg_temp.ok((select count(*) from net.http_request_queue) = q0, 'no edge call for an ordinary message');
  perform pg_temp.act(mochi);
  insert into public.messages (channel_id, author_id, content) values (gen, mochi, 'hey @thechef, dinner?');
  perform pg_temp.act_admin();
  perform pg_temp.ok((select count(*) from net.http_request_queue) = q0 + 1, 'one edge call for a mention');
  perform pg_temp.ok((select convert_from(body, 'utf8') from net.http_request_queue order by id desc limit 1) like '%"event": "bot_mentioned"%', 'routed as bot_mentioned');
  insert into public.messages (channel_id, author_id, content) values (gen, chef_bot, '@thechef talking to myself');
  perform pg_temp.ok((select count(*) from net.http_request_queue) = q0 + 1, 'bots never trigger events');

  -- ── Automod's pure matcher (same cases as src/lib/plugins.test.js) ──
  perform pg_temp.ok(public.automod_rule('{"words":["darn","bad*","go away"],"links":"all","allow_sites":["youtube.com"],"max_mentions":2,"caps":70}', t)
    is not distinct from want, t)
  from (values ('hello there', null), ('D4RN it', 'words'), ('d.a.r.n', 'words'), ('daaarn', 'words'), ('darning', null), ('so baaadly', 'words'),
    ('go   away', 'words'), ('goaway', null), ('see https://www.youtube.com/x', null), ('see https://m.youtube.com/x', null),
    ('see https://evil.com', 'links'), ('join https://chitchat.app/#/invite/abc', 'invites'), ('THIS IS VERY LOUD TEXT', 'caps'),
    ('Ok fine', null), ('bad', 'words'), ('abad', null), ('hi @aa @bb @cc', 'mentions'), ('hi @aa @bb', null)) v(t, want);

  -- ── a manager can't hand a plugin more than they have ──
  perform pg_temp.act(pip);
  insert into public.roles (server_id, name, position, permissions) values (sid, 'helpers', 1, '{manage_server}') returning id into role_helper;
  insert into public.member_roles (server_id, user_id, role_id) values (sid, mochi, role_helper);
  perform pg_temp.act(mochi);
  perform public.configure_plugin(chef_iid, '{"kitchen":"Mochi Diner","variations":false}');
  perform pg_temp.ok(pg_temp.fails(format('select public.configure_plugin(%L, null, null, %L)', am_iid, '{send_messages,timeout_members}'), 'have yourself'), 'cannot give a permission you lack');

  -- ── removing an external bot removes its account (it never posted) ──
  perform pg_temp.act(pip);
  perform public.uninstall_plugin(wh_iid);
  perform pg_temp.act_admin();
  perform pg_temp.ok(not exists (select 1 from auth.users where id = wh_bot), 'removed bot account deleted');
  perform pg_temp.ok(not exists (select 1 from public.members where server_id = sid and user_id = wh_bot), 'bot left the server');
  perform pg_temp.ok(not exists (select 1 from public.plugin_secrets where install_id = wh_iid), 'its token is gone');
  perform pg_temp.ok(exists (select 1 from auth.users where id = chef_bot), 'built-in bot accounts stay');

  delete from auth.users where id = outsider;
  raise exception 'ALL PLUGIN TESTS PASSED';
end $$;
