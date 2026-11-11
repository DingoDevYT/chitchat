-- Chat cues: @mention / DM unread counts and "last seen".

-- Unread counts that deserve a red badge, per channel you can see:
--   DMs: every unread message from someone else; other channels: unread messages that @mention your username.
-- security invoker: RLS on channels/messages/read_states decides what is counted.
-- The word-boundary regex mirrors src/lib/cues.js mentionRx (and the markdown mention token).
create or replace function public.mention_counts()
returns table (channel_id uuid, count bigint)
language sql stable security invoker set search_path = ''
as $$
  with me as (
    select p.username, '(^|[^a-z0-9_@])@' || replace(p.username, '.', '\.') || '([^a-z0-9_.]|\.([^a-z0-9_]|$)|$)' as rx
    from public.profiles p where p.id = (select auth.uid())
  )
  select m.channel_id, count(*)
  from me
  cross join public.channels c
  left join public.read_states rs on rs.channel_id = c.id and rs.user_id = (select auth.uid())
  join public.messages m on m.channel_id = c.id and m.id > coalesce(rs.last_read_id, 0)
  where c.kind <> 'voice'
    and c.last_message_id > coalesce(rs.last_read_id, 0)
    and m.author_id <> (select auth.uid())
    and (c.kind = 'dm' or (m.content ilike '%@' || me.username || '%' and m.content ~* me.rx))
  group by m.channel_id
$$;
revoke execute on function public.mention_counts() from public, anon;
grant execute on function public.mention_counts() to authenticated;

-- Last seen: written by the app at most every 5 minutes (never while invisible).
alter table public.profiles add column if not exists last_seen_at timestamptz;
grant update (last_seen_at) on public.profiles to authenticated;
