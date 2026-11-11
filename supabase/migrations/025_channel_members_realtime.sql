-- lets clients notice live when their access to a private channel is removed
alter publication supabase_realtime add table public.channel_members;
