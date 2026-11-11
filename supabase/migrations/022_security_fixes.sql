-- 022 security fixes (red-team pass)

-- messages: the INSERT column grant was unrestricted (Supabase default grants INSERT on every
-- column), so a plain member could POST a row with pinned_at/pinned_by set (self-pinning their own
-- message, bypassing can_pin / toggle_pin) or spoof created_at/edited_at. The UPDATE grant already
-- limits columns to (content, edited_at, suppress_embeds); mirror that for INSERT. The allowed set
-- matches the only insert the client performs (src/Chat.jsx).
revoke insert on public.messages from authenticated;
grant insert (channel_id, author_id, content, reply_to, attachments, tts, suppress_embeds)
  on public.messages to authenticated;
