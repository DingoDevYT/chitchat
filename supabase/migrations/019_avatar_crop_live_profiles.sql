-- Crop framing for animated images ({x, y, zoom}); static images are cropped client-side before upload.
alter table public.profiles add column if not exists avatar_crop jsonb, add column if not exists avatar_talk_crop jsonb;
alter table public.servers add column if not exists icon_crop jsonb;
-- Updates use column-level grants; RLS (own profile / server admins) still applies.
grant update (avatar_crop, avatar_talk_crop) on public.profiles to authenticated;
grant update (icon_crop) on public.servers to authenticated;
-- Live profile updates (profiles are world-readable, so realtime RLS is the existing select policy).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
