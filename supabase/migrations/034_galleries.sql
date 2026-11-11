-- Galleries: a channel kind for media posts (title + 1-10 images/videos). Each post gets its own discussion,
-- a child channel of kind 'post' that inherits visibility from its gallery.
-- Threads (012) are gone: their child-channel machinery (parent_channel_id, can_view_channel inheritance,
-- the reply-counter trigger) is repurposed for post discussions, everything thread-only is dropped.

-- ── 1. Threads out ──
drop function if exists public.start_thread(bigint, text);
drop trigger if exists on_thread_reply on public.messages;
drop function if exists public.bump_thread_replies();
drop trigger if exists on_thread_insert on public.channels;
drop function if exists public.check_thread_parent();
delete from public.channels where kind = 'thread'; -- test data only (none were left when this was written)
alter table public.channels drop constraint channels_thread_parent;
alter table public.channels
  drop column parent_message_id, -- takes the channels_parent_message_key index with it
  drop column archived,
  drop column reply_count,
  drop column last_reply_at;

-- ── 2. Gallery and post channel kinds ──
alter table public.channels drop constraint channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text','voice','dm','gallery','post'));
alter table public.channels add constraint channels_post_parent check ((kind = 'post') = (parent_channel_id is not null));

-- can_view_channel() already resolves coalesce(parent_channel_id, id) first (from 012), so it needs no change.
comment on function public.can_view_channel(uuid) is
  'Post discussions (kind post) resolve to their gallery via parent_channel_id: visible exactly when the gallery is.';

-- Post channels only come from create_gallery_post(); managers can't insert them by hand.
alter policy "admins add channels" on public.channels
  with check (server_id is not null and kind <> 'post' and public.has_perm(server_id, 'manage_channels'));

-- A post hangs off a gallery in the same server, and neither side changes kind or parent afterwards.
create function public.check_post_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.parent_channel_id is distinct from old.parent_channel_id
       or (new.kind <> old.kind and (old.kind in ('gallery','post') or new.kind in ('gallery','post'))) then
      raise exception 'Galleries and posts keep their kind.';
    end if;
  elsif new.kind = 'post' and not exists (
    select 1 from public.channels g where g.id = new.parent_channel_id and g.server_id = new.server_id and g.kind = 'gallery') then
    raise exception 'bad post parent';
  end if;
  return new;
end $$;
create trigger check_post_parent before insert or update of kind, parent_channel_id on public.channels
  for each row execute function public.check_post_parent();

-- ── 3. Posts ──
-- 1-10 items {url, type, w, h, poster?, alt?, spoiler?}: images/videos from this project's media bucket only.
-- CASE guards keep a malformed value a plain false instead of a cast/extract error.
create function public.valid_post_media(m jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(m) is distinct from 'array' then false else
    jsonb_array_length(m) between 1 and 10 and pg_column_size(m) <= 20000
    and not exists (
      select 1 from jsonb_array_elements(m) e
      where case when jsonb_typeof(e) <> 'object' then true else not coalesce(
        public.is_media_url(e->>'url')
        and e->>'type' ~ '^(image|video)/[a-z0-9.+-]{1,40}$'
        and jsonb_typeof(e->'w') = 'number' and e->'w' between '1' and '100000'
        and jsonb_typeof(e->'h') = 'number' and e->'h' between '1' and '100000'
        and (not e ? 'poster' or public.is_media_url(e->>'poster'))
        and (not e ? 'alt' or (jsonb_typeof(e->'alt') = 'string' and char_length(e->>'alt') <= 500))
        and (not e ? 'spoiler' or jsonb_typeof(e->'spoiler') = 'boolean')
        and not exists (select 1 from jsonb_object_keys(e) k where k not in ('url','type','w','h','poster','alt','spoiler')),
      false) end)
  end
$$;

create table public.gallery_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,             -- the gallery
  author_id uuid not null references public.profiles on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 2000),
  media jsonb not null check (public.valid_post_media(media)),
  cover_ratio real generated always as ((media->0->>'w')::real / (media->0->>'h')::real) stored, -- width/height of item 1, for the grid
  discussion_channel_id uuid not null unique references public.channels on delete cascade,
  comment_count int not null default 0,
  last_comment_id bigint,                                                            -- vs read_states: new-comment dots on cards
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index gallery_posts_newest on public.gallery_posts (channel_id, created_at desc);
create index gallery_posts_active on public.gallery_posts (channel_id, comment_count desc, last_activity_at desc);
create index gallery_posts_author on public.gallery_posts (author_id);

alter table public.gallery_posts enable row level security;
revoke all on public.gallery_posts from anon, authenticated;
grant select, delete on public.gallery_posts to authenticated;
grant update (title, description) on public.gallery_posts to authenticated; -- media is fixed once posted
create policy "see posts in galleries you can see" on public.gallery_posts for select to authenticated
  using (public.can_view_channel(channel_id));
create policy "authors edit their posts" on public.gallery_posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors and moderators delete posts" on public.gallery_posts for delete to authenticated
  using (author_id = (select auth.uid()) or exists (
    select 1 from public.channels c where c.id = gallery_posts.channel_id and public.has_perm(c.server_id, 'manage_messages')));

create function public.stamp_post_edit() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  if new.title is distinct from old.title or new.description is distinct from old.description then new.edited_at := now(); end if;
  return new;
end $$;
create trigger stamp_post_edit before update of title, description on public.gallery_posts
  for each row execute function public.stamp_post_edit();

-- The old reply counter, now for post discussions: comment_count / last_comment_id / last_activity_at.
create function public.bump_post_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.gallery_posts set comment_count = comment_count + 1, last_comment_id = new.id, last_activity_at = new.created_at
     where discussion_channel_id = new.channel_id;
  else
    update public.gallery_posts set comment_count = greatest(comment_count - 1, 0)
     where discussion_channel_id = old.channel_id;
  end if;
  return null;
end $$;
create trigger on_post_comment after insert or delete on public.messages
  for each row execute function public.bump_post_activity();

-- Deleting a post takes its discussion with it; a moderator removing someone else's post is audited
-- (not when the whole gallery is being deleted: it's already invisible here).
create function public.drop_post_discussion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  select c.server_id, c.name into g from public.channels c where c.id = old.channel_id;
  if g.server_id is not null and auth.uid() is distinct from old.author_id then
    perform public.audit(g.server_id, 'post_delete', old.author_id, jsonb_build_object('room', g.name, 'title', old.title));
  end if;
  delete from public.channels where id = old.discussion_channel_id;
  return null;
end $$;
create trigger drop_post_discussion after delete on public.gallery_posts
  for each row execute function public.drop_post_discussion();

-- One call posts: checks, the discussion channel, then the post, atomically.
create function public.create_gallery_post(gallery uuid, title text, media jsonb, description text default null)
returns public.gallery_posts
language plpgsql security definer set search_path = '' as $$
declare
  g record;
  t text := btrim(coalesce(create_gallery_post.title, ''));
  d text := nullif(btrim(coalesce(create_gallery_post.description, '')), '');
  last timestamptz;
  wait int;
  did uuid;
  p public.gallery_posts;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select c.id, c.server_id, c.slowmode_sec, s.owner_id into g
    from public.channels c join public.servers s on s.id = c.server_id
   where c.id = create_gallery_post.gallery and c.kind = 'gallery';
  if g.id is null or not public.can_view_channel(g.id) then raise exception 'Gallery not found.'; end if;
  if char_length(t) not between 1 and 120 then
    raise exception 'Give your post a title (up to 120 characters).' using errcode = '22023';
  end if;
  if char_length(d) > 2000 then raise exception 'Descriptions can be up to 2000 characters.' using errcode = '22023'; end if;
  if not public.valid_post_media(create_gallery_post.media) then
    raise exception 'A post needs 1 to 10 images or videos uploaded to Chitchat.' using errcode = '22023';
  end if;
  -- the gallery's slowmode spaces out posts (same exemptions as enforce_slowmode)
  if g.slowmode_sec > 0 and g.owner_id <> auth.uid()
     and not public.has_perm(g.server_id, 'manage_messages') and not public.has_perm(g.server_id, 'manage_channels') then
    select max(x.created_at) into last from public.gallery_posts x where x.channel_id = g.id and x.author_id = auth.uid();
    if last > now() - make_interval(secs => g.slowmode_sec) then
      wait := ceil(extract(epoch from (last + make_interval(secs => g.slowmode_sec) - now())))::int;
      raise exception 'Slowmode is on here. You can post again in %s.', wait using errcode = 'P0001', hint = 'slowmode:' || wait;
    end if;
  end if;
  -- the discussion first: inserting a 'post' channel runs moderation_guard (timeouts, rules screening)
  insert into public.channels (server_id, kind, parent_channel_id, name)
  values (g.server_id, 'post', g.id, left(t, 64)) returning id into did;
  insert into public.gallery_posts (channel_id, author_id, title, description, media, discussion_channel_id)
  values (g.id, auth.uid(), t, d, create_gallery_post.media, did) returning * into p;
  -- the gallery's unread dot: a fresh id from the message sequence, so the usual last_message_id > last_read_id lights it
  update public.channels set last_message_id = nextval('public.messages_id_seq') where id = g.id;
  return p;
end $$;

-- Reactions on the post itself (comments use the normal message reactions).
create table public.post_reactions (
  post_id uuid not null references public.gallery_posts on delete cascade,
  channel_id uuid not null references public.channels on delete cascade, -- the gallery (moderation_guard reads it)
  user_id uuid not null references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 80),
  primary key (post_id, user_id, emoji)
);
create index post_reactions_user on public.post_reactions (user_id);
alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from anon, authenticated;
grant select, insert, delete on public.post_reactions to authenticated;
create policy "see post reactions" on public.post_reactions for select to authenticated using (public.can_view_channel(channel_id));
create policy "react to posts" on public.post_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_channel(channel_id)
    and exists (select 1 from public.gallery_posts p where p.id = post_reactions.post_id and p.channel_id = post_reactions.channel_id));
create policy "unreact to posts" on public.post_reactions for delete to authenticated using (user_id = (select auth.uid()));
create trigger mod_guard before insert on public.post_reactions for each row execute function public.moderation_guard();

-- ── 4. Moderation helpers learn about posts ──
-- Timeouts/rules: a 'post' channel insert (= creating a post) is posting; it was 'thread' before.
create or replace function public.moderation_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; why text;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'channels' then
    if new.kind <> 'post' then return new; end if;
    sid := new.server_id;
  elsif tg_table_name = 'poll_votes' then
    select c.server_id into sid from public.polls p join public.channels c on c.id = p.channel_id where p.id = new.poll_id;
  else
    select c.server_id into sid from public.channels c where c.id = new.channel_id;
  end if;
  if sid is null then return new; end if;
  why := public.post_block(sid);
  if why = 'timeout' then
    raise exception 'You''re in a timeout here. You can read along, and post again once it ends.' using errcode = 'P0001', hint = 'timeout';
  elsif why = 'rules' then
    raise exception 'Agree to the server rules first, then you can post.' using errcode = 'P0001', hint = 'rules';
  end if;
  return new;
end $$;

-- Slowmode in a post discussion is the gallery's.
create or replace function public.enforce_slowmode() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  last timestamptz;
  left_s int;
begin
  select coalesce(p.slowmode_sec, ch.slowmode_sec) as slowmode_sec, ch.server_id, s.owner_id into c
    from public.channels ch
    left join public.channels p on p.id = ch.parent_channel_id
    left join public.servers s on s.id = ch.server_id
   where ch.id = new.channel_id;
  if coalesce(c.slowmode_sec, 0) = 0 or c.server_id is null or c.owner_id = new.author_id
     or public.has_perm(c.server_id, 'manage_messages') or public.has_perm(c.server_id, 'manage_channels') then
    return new;
  end if;
  select m.created_at into last from public.messages m
   where m.channel_id = new.channel_id and m.author_id = new.author_id order by m.id desc limit 1;
  if last is not null and last > now() - make_interval(secs => c.slowmode_sec) then
    left_s := ceil(extract(epoch from (last + make_interval(secs => c.slowmode_sec) - now())))::int;
    raise exception 'Slowmode is on here. You can send again in %s.', left_s
      using errcode = 'P0001', hint = 'slowmode:' || left_s;
  end if;
  return new;
end $$;

-- Audit log: post discussions (like DMs) aren't rooms; creating/deleting one isn't news.
do $$
declare d text := pg_get_functiondef('public.audit_trigger()'::regprocedure);
begin
  if position($q$r->>'kind' in ('thread', 'dm')$q$ in d) = 0 then raise exception 'audit_trigger changed: update 034 by hand'; end if;
  execute replace(replace(d, $q$r->>'kind' in ('thread', 'dm')$q$, $q$r->>'kind' in ('post', 'dm')$q$),
    $q$'last_message_id','reply_count','last_reply_at'$q$, $q$'last_message_id'$q$);
end $$;

-- ── 5. Realtime and grants ──
alter publication supabase_realtime add table public.gallery_posts;

revoke execute on function public.check_post_parent(), public.bump_post_activity(), public.drop_post_discussion(),
  public.stamp_post_edit() from public, anon, authenticated;
revoke execute on function public.valid_post_media(jsonb) from public, anon;
grant execute on function public.valid_post_media(jsonb) to authenticated; -- CHECK on gallery_posts re-runs on author edits
revoke execute on function public.create_gallery_post(uuid, text, jsonb, text) from public, anon;
grant execute on function public.create_gallery_post(uuid, text, jsonb, text) to authenticated;
