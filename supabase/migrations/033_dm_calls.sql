-- Applied to the project as "032_dm_calls" + "033_dm_calls_topic_merge" (the second re-added the 'call:' branch on top
-- of 032_moderation's can_use_topic, which 032_moderation.sql now also carries). Run after 032_moderation.sql.

-- DM calls get their own realtime topic 'call:<dm id>' (a DM's 'chan:' topic is its chat, and supabase-js shares one
-- channel per topic). Members only, and not if someone in the DM blocked you (same rule as sending messages there).
create or replace function public.can_use_topic(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when t = 'online' then auth.uid() is not null
    when t ~ '^(chan|chat):[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 6)::uuid)
      and not (t like 'chan:%' and exists (select 1 from public.channels c
        where c.id = substr(t, 6)::uuid and c.kind = 'voice' and public.post_block(c.server_id) is not null))
    when t ~ '^call:[0-9a-f-]{36}$' then
      exists (select 1 from public.channels c where c.id = substr(t, 6)::uuid and c.kind = 'dm')
      and public.can_view_channel(substr(t, 6)::uuid) and not public.dm_blocks_me(substr(t, 6)::uuid)
    else false end
$$;

-- "Missed call" / "Call · 12m" lines: an ordinary message with a small call marker, e.g. {"missed":true} or {"secs":720}.
alter table public.messages add column call jsonb
  check (call is null or (jsonb_typeof(call) = 'object' and pg_column_size(call) <= 256));
grant select (call), insert (call) on public.messages to authenticated;
