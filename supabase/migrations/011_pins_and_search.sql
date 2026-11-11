-- 011: pinned messages + message search

alter table public.messages
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles on delete set null,
  add column fts tsvector generated always as (to_tsvector('simple', content)) stored;
create index messages_fts_idx on public.messages using gin (fts);
create index messages_pinned_idx on public.messages (channel_id, pinned_at desc) where pinned_at is not null;

-- Who may pin in a channel. Swap this body when custom roles add a `pin` permission.
create function public.can_pin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and case
      when c.server_id is null then
        exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
      else public.server_role(c.server_id) in ('owner','admin') and public.can_view_channel(c.id)
    end)
$$;

-- Pins/unpins; returns the new pinned_at (null = unpinned). Column grants stay content/edited_at only.
create function public.toggle_pin(message_id bigint) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare cid uuid; pa timestamptz;
begin
  select m.channel_id, m.pinned_at into cid, pa from public.messages m where m.id = toggle_pin.message_id;
  if cid is null or not public.can_pin(cid) then raise exception 'not allowed to pin here'; end if;
  update public.messages m
     set pinned_at = case when pa is null then now() end,
         pinned_by = case when pa is null then auth.uid() end
   where m.id = toggle_pin.message_id
  returning m.pinned_at into pa;
  return pa;
end $$;

revoke execute on function public.can_pin(uuid), public.toggle_pin(bigint) from public, anon;
grant execute on function public.can_pin(uuid), public.toggle_pin(bigint) to authenticated;

-- Search. security invoker, so the messages/channels RLS decides what you can see.
-- Words become prefix matches ('hel' finds 'hello'); short or symbol-only terms also match by ILIKE.
create function public.search_messages(
  terms text default '', scope_channel uuid default null, scope_server uuid default null, dms_only boolean default false,
  from_user text default null, in_channel text default null, has text default null,
  before_ts timestamptz default null, after_ts timestamptz default null, before_id bigint default null, lim int default 20
) returns setof public.messages
language plpgsql stable security invoker set search_path = '' as $$
declare
  t text := btrim(coalesce(terms, ''));
  q tsquery;
  pat text := '%' || replace(replace(replace(btrim(coalesce(terms, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  select to_tsquery('simple', string_agg(w || ':*', ' & ')) into q
    from regexp_split_to_table(lower(t), '[^[:alnum:]_]+') w where w <> '';
  return query
  select m.* from public.messages m
    join public.channels c on c.id = m.channel_id
   where (t = '' or (q is not null and m.fts @@ q) or ((q is null or char_length(t) < 3) and m.content ilike pat))
     and (scope_channel is null or m.channel_id = scope_channel)
     and (scope_server is null or c.server_id = scope_server)
     and (not dms_only or c.server_id is null)
     and (in_channel is null or lower(c.name) = lower(in_channel))
     and (from_user is null or exists (select 1 from public.profiles p where p.id = m.author_id and lower(p.username) = lower(from_user)))
     and (has is null
       or (has = 'file' and jsonb_array_length(m.attachments) > 0)
       or (has = 'link' and m.content ~* 'https?://')
       or (has = 'image' and (m.content ~* 'https?://\S+\.(png|jpe?g|gif|webp)'
         or exists (select 1 from jsonb_array_elements(m.attachments) a where a->>'type' like 'image/%'))))
     and (before_ts is null or m.created_at < before_ts)
     and (after_ts is null or m.created_at >= after_ts)
     and (before_id is null or m.id < before_id)
   order by m.id desc
   limit least(coalesce(lim, 20), 50);
end $$;

revoke execute on function public.search_messages(text, uuid, uuid, boolean, text, text, text, timestamptz, timestamptz, bigint, int) from public, anon;
grant execute on function public.search_messages(text, uuid, uuid, boolean, text, text, text, timestamptz, timestamptz, bigint, int) to authenticated;
