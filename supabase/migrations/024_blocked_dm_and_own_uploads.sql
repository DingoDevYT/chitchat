-- Someone who blocked you can't receive new messages from you in a DM / group DM.
create function public.dm_blocks_me(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    join public.channel_members cm on cm.channel_id = c.id
    join public.blocks b on b.blocker = cm.user_id and b.blocked = auth.uid()
    where c.id = cid and c.server_id is null)
$$;
revoke execute on function public.dm_blocks_me(uuid) from public, anon;
grant execute on function public.dm_blocks_me(uuid) to authenticated;
create policy "not to people who blocked you" on public.messages as restrictive for insert to authenticated
  with check (not public.dm_blocks_me(channel_id));

-- Storage delete needs a matching SELECT policy; without it remove() silently deletes nothing.
create policy "see own uploads" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
