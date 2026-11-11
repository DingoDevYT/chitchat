-- Stadium text chat + TTS.
-- Messages sent with the 🔊 TTS toggle on are read aloud to people who joined that stadium.
alter table public.messages add column if not exists tts boolean not null default false;

-- Stadium chat needs its own realtime topic 'chat:<channel id>' (the stadium's 'chan:<id>' carries voice presence,
-- and supabase-js shares one channel object per topic). Same access rule as 'chan:'.
create or replace function public.can_use_topic(t text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case
    when t = 'online' then auth.uid() is not null
    when t ~ '^(chan|chat):[0-9a-f-]{36}$' then public.can_view_channel(substr(t, 6)::uuid)
    else false end
$function$;
revoke execute on function public.can_use_topic(text) from public, anon;
grant execute on function public.can_use_topic(text) to authenticated;
