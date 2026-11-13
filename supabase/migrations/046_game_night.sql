-- 046 Game night (src/games/night.js): a playlist of games for one table and the night's scoreboard, plus switching
-- the game kind in place between them. Apply BEFORE redeploying the game-<id> functions that use it (the referee
-- refuses the night actions until `games.night` exists, so the old functions keep working either way).
--   games.night  { list, at, scores, played, who, votes, ended? }   public, like games.pub: everyone in the stadium sees it
-- game_save learns two keys:
--   game   switch the table to another game (the referee checks it against src/games/meta.js first)
--   night  replace games.night (JSON null clears it)
-- and stores a JSON null `pub` as SQL null (a switched table is back in its lobby with no game state).

alter table public.games add column if not exists night jsonb;

create or replace function public.game_save(gid uuid, ver int, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.games set
    game = coalesce(p->>'game', game),
    status = coalesce(p->>'status', status),
    opts = coalesce(p->'opts', opts),
    pub = case when p ? 'pub' then nullif(p->'pub', 'null'::jsonb) else pub end,
    night = case when p ? 'night' then nullif(p->'night', 'null'::jsonb) else night end,
    deadline = case when p ? 'deadline' then (p->>'deadline')::timestamptz else deadline end,
    version = version + 1, updated_at = now()
  where id = gid and version = ver
  returning version into v;
  if v is null then raise exception 'conflict' using errcode = 'P0001', hint = 'conflict'; end if;
  if p ? 'seats' then
    delete from public.game_seats where game_id = gid;
    insert into public.game_seats (game_id, seat, user_id, bot)
      select gid, (x->>'seat')::smallint, (x->>'user_id')::uuid, x->>'bot' from jsonb_array_elements(p->'seats') x;
  end if;
  if coalesce((p->>'privs_reset')::boolean, false) then delete from public.game_private where game_id = gid; end if;
  if p ? 'privs' then
    insert into public.game_private (game_id, user_id, hand)
      select gid, k::uuid, val from jsonb_each(p->'privs') e(k, val)
    on conflict (game_id, user_id) do update set hand = excluded.hand;
  end if;
  if p ? 'secret' then
    insert into public.game_secret (game_id, data) values (gid, p->'secret')
    on conflict (game_id) do update set data = excluded.data;
  end if;
  return v;
end $$;

revoke execute on function public.game_save(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.game_save(uuid, int, jsonb) to service_role;
