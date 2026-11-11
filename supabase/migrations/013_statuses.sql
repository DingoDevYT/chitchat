-- Statuses: chosen status + custom status on profiles. Existing profiles RLS (own row only for update) covers them.
alter table public.profiles
  add column if not exists status text not null default 'online'
    check (status in ('online', 'idle', 'dnd', 'invisible')),
  add column if not exists custom_status jsonb
    check (custom_status is null or (
      jsonb_typeof(custom_status) = 'object'
      and char_length(coalesce(custom_status->>'text', '')) <= 128
      and char_length(coalesce(custom_status->>'emoji', '')) <= 32
    ));

grant update (status, custom_status) on public.profiles to authenticated;
