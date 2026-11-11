-- 014: channel categories, channel/category reordering, per-user server order.

-- One place that decides who may manage a server's channels and categories (custom roles can swap this).
create function public.can_manage_channels(sid uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.server_role(sid) in ('owner','admin'), false)
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create index on public.categories (server_id);
alter table public.categories enable row level security;
create policy "members see categories" on public.categories for select to authenticated using (public.is_member(server_id));
create policy "managers add categories" on public.categories for insert to authenticated with check (public.can_manage_channels(server_id));
create policy "managers edit categories" on public.categories for update to authenticated using (public.can_manage_channels(server_id));
create policy "managers delete categories" on public.categories for delete to authenticated using (public.can_manage_channels(server_id));
revoke update on public.categories from authenticated;
grant update (name, position) on public.categories to authenticated;

-- Composite FK keeps a channel's category inside the same server; deleting a category only nulls category_id.
alter table public.channels add column category_id uuid;
alter table public.channels add constraint channels_category_fk foreign key (category_id, server_id)
  references public.categories (id, server_id) on delete set null (category_id);
create index on public.channels (category_id);
grant insert (category_id), update (category_id) on public.channels to authenticated;

-- Batched reorder. Invoker rights: RLS + column grants still apply; the check gives a clear error.
-- items: [{id, position, category_id?}]; ids are channels (category_id applied) or categories.
create function public.reorder_channels(server_id uuid, items jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if not public.can_manage_channels(reorder_channels.server_id) then raise exception 'not allowed'; end if;
  update public.channels c set position = (i->>'position')::int, category_id = (i->>'category_id')::uuid
    from jsonb_array_elements(items) i
    where c.id = (i->>'id')::uuid and c.server_id = reorder_channels.server_id;
  update public.categories k set position = (i->>'position')::int
    from jsonb_array_elements(items) i
    where k.id = (i->>'id')::uuid and k.server_id = reorder_channels.server_id;
end $$;

-- Per-user server rail order.
alter table public.members add column position int;
create function public.reorder_servers(ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.members m set position = a.ord
  from unnest(ids) with ordinality a(id, ord)
  where m.server_id = a.id and m.user_id = (select auth.uid())
$$;

revoke execute on function public.can_manage_channels(uuid), public.reorder_channels(uuid, jsonb), public.reorder_servers(uuid[]) from public, anon;
grant execute on function public.can_manage_channels(uuid), public.reorder_channels(uuid, jsonb), public.reorder_servers(uuid[]) to authenticated;

alter publication supabase_realtime add table public.categories;
