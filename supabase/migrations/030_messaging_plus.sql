-- 030 messaging plus: favourite GIFs, forwarded messages, polls.

-- ── favourite GIFs (yours only, synced across devices, up to 500) ──
create table public.gif_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  preview text check (preview ~ '^https://' and char_length(preview) <= 1000),
  w int check (w between 1 and 10000),
  h int check (h between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
alter table public.gif_favorites enable row level security;
revoke all on public.gif_favorites from anon, authenticated;
grant select, delete on public.gif_favorites to authenticated;
grant insert (url, preview, w, h) on public.gif_favorites to authenticated;
create policy "see own gif favourites" on public.gif_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "add own gif favourites" on public.gif_favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own gif favourites" on public.gif_favorites for delete to authenticated using (user_id = (select auth.uid()));

create function public.cap_gif_favorites() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.gif_favorites where user_id = new.user_id) >= 500 then
    raise exception 'You can keep up to 500 favourite GIFs. Unstar a few first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.cap_gif_favorites() from public, anon, authenticated;
create trigger cap_gif_favorites before insert on public.gif_favorites for each row execute function public.cap_gif_favorites();

-- ── polls (one per message; the message itself has no content) ──
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null unique references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  answers text[] not null check (cardinality(answers) between 2 and 10),
  allow_multiple boolean not null default false,
  duration_h smallint not null check (duration_h in (1, 4, 8, 24, 72, 168)),
  created_at timestamptz not null default now(),
  closes_at timestamptz not null
);
alter table public.polls enable row level security;
revoke all on public.polls from anon, authenticated;
grant select on public.polls to authenticated;
grant insert (message_id, channel_id, question, answers, allow_multiple, duration_h) on public.polls to authenticated;
create policy "see polls where you can read" on public.polls for select to authenticated using (public.can_view_channel(channel_id));
-- only onto your own message, in the same transaction that sent it (create_poll)
create policy "add a poll to your new message" on public.polls for insert to authenticated with check (exists (
  select 1 from public.messages m where m.id = message_id and m.channel_id = polls.channel_id
    and m.author_id = (select auth.uid()) and m.content = '' and m.created_at > now() - interval '1 minute'));

create function public.prep_poll() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.question := btrim(new.question);
  new.answers := array(select btrim(a) from unnest(new.answers) a);
  if cardinality(new.answers) not between 2 and 10
     or exists (select 1 from unnest(new.answers) a where a is null or char_length(a) not between 1 and 55) then
    raise exception 'Polls need 2 to 10 answers, each up to 55 characters.' using errcode = '22023';
  end if;
  new.created_at := now();
  new.closes_at := now() + make_interval(hours => new.duration_h);
  return new;
end $$;
revoke execute on function public.prep_poll() from public, anon, authenticated;
create trigger prep_poll before insert on public.polls for each row execute function public.prep_poll();

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  answer smallint not null check (answer between 0 and 9),
  channel_id uuid not null, -- copied from the poll (trigger) for RLS and the realtime filter
  slot smallint not null,   -- = answer when multiple answers are allowed, else 0: the unique key below makes single-choice race-free
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, answer),
  unique (poll_id, user_id, slot)
);
alter table public.poll_votes enable row level security;
revoke all on public.poll_votes from anon, authenticated;
grant select, delete on public.poll_votes to authenticated;
grant insert (poll_id, answer) on public.poll_votes to authenticated;

create function public.prep_poll_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select channel_id, allow_multiple into p from public.polls where id = new.poll_id;
  new.user_id := auth.uid();
  new.channel_id := p.channel_id; -- null (so rejected) when there's no such poll
  new.slot := case when p.allow_multiple then new.answer else 0 end;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.prep_poll_vote() from public, anon, authenticated;
create trigger prep_poll_vote before insert on public.poll_votes for each row execute function public.prep_poll_vote();

create policy "see votes where you can read" on public.poll_votes for select to authenticated using (public.can_view_channel(channel_id));
create policy "vote while open" on public.poll_votes for insert to authenticated with check (
  user_id = (select auth.uid()) and public.can_view_channel(channel_id) and exists (
    select 1 from public.polls p where p.id = poll_id and p.closes_at > now() and answer < cardinality(p.answers)));
create policy "unvote while open" on public.poll_votes for delete to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.polls p where p.id = poll_id and p.closes_at > now()));

alter publication supabase_realtime add table public.poll_votes;

-- One round trip, one transaction: the message (under the normal send rules) plus its poll.
create function public.create_poll(cid uuid, question text, answers text[], allow_multiple boolean, duration_h int)
returns public.messages
language plpgsql security invoker set search_path = '' as $$
declare m public.messages;
begin
  insert into public.messages (channel_id, author_id, content) values (cid, auth.uid(), '') returning * into m;
  insert into public.polls (message_id, channel_id, question, answers, allow_multiple, duration_h)
    values (m.id, cid, question, answers, allow_multiple, duration_h);
  return m;
end $$;
revoke execute on function public.create_poll(uuid, text, text[], boolean, int) from public, anon;
grant execute on function public.create_poll(uuid, text, text[], boolean, int) to authenticated;

-- ── forwarded messages ──
-- The client only sends forward = { message_id }; the database checks you can see the original
-- and fills in the copy (content, attachments) and where it came from, so a forward can't be faked.
alter table public.messages add column forward jsonb;
grant insert (forward) on public.messages to authenticated;

create function public.check_forward() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content
       and (old.forward is not null or exists (select 1 from public.polls p where p.message_id = old.id)) then
      raise exception 'Forwarded messages and polls can''t be edited.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.forward is null then return new; end if;
  if jsonb_typeof(new.forward -> 'message_id') is distinct from 'number' then
    raise exception 'Bad forward.' using errcode = '22023';
  end if;
  select m.id, m.channel_id, m.author_id, m.content, m.attachments, m.created_at, m.forward, c.name, c.server_id
    into o from public.messages m join public.channels c on c.id = m.channel_id
   where m.id = (new.forward ->> 'message_id')::bigint;
  if o.id is null or not public.can_view_channel(o.channel_id) then
    raise exception 'You can only forward messages you can see.' using errcode = '42501';
  end if;
  if exists (select 1 from public.polls p where p.message_id = o.id) then
    raise exception 'Polls can''t be forwarded.' using errcode = 'P0001';
  end if;
  new.content := o.content;
  new.attachments := o.attachments;
  new.reply_to := null;
  new.tts := false;
  -- forwarding a forward keeps pointing at the first original
  new.forward := coalesce(o.forward, jsonb_build_object(
    'message_id', o.id, 'channel_id', o.channel_id, 'server_id', o.server_id, 'author_id', o.author_id,
    'room', case when o.server_id is not null then o.name end, 'created_at', o.created_at));
  return new;
end $$;
revoke execute on function public.check_forward() from public, anon, authenticated;
create trigger check_forward before insert or update of content on public.messages for each row execute function public.check_forward();
