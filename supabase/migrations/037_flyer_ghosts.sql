-- Chatterflies ghosts: flyers broadcast their height and distance ~12 times a second on a private realtime topic
-- 'fly:<stadium channel id>' (its own topic: supabase-js shares one channel object per topic, and 'chan:'/'chat:' are
-- taken). Same access rule as the stadium chat. Everything else about 033_dm_calls' can_use_topic is unchanged.
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
    when t ~ '^fly:[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 5)::uuid)
    else false end
$$;
