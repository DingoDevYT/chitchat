# Troubleshooting

Something not working? Start here.

## I can't see the Plugins tab

You need the **Manage server** permission in that server. Ask the owner, or an admin, to give you a role that has it.

## A command doesn't show up when I type /

- Is the plugin switched on? Check **Server settings → Plugins → Added**.
- Commands only work in server rooms and stadium chats, not in DMs.
- Custom commands limited to some roles only show for people with those roles.
- New commands can take up to a minute to show for people who already had the list open. Typing `/` again after a minute refreshes it.
- External bots: did your bot call `PUT /commands`? Check its commands with `GET /commands`.

## "Automod held that back"

Your message broke one of the server's Automod rules, and the message says which one. Only you saw it. Rephrase it and send again. If you think Automod got it wrong, tell a moderator: they can adjust the blocked words (or the **Try a message** box shows them exactly why).

## The Chef doesn't answer

- Mention it with `@thechef` (pick it from the @ list), or reply to one of its messages.
- The Chef must be able to see the room. In private rooms, add The Chef to the room like you'd add a person.
- Check that The Chef is switched on in **Added**.

## My bot doesn't get events or commands

1. Open **Added → your bot**. Is it switched on? If it says "turned off after delivery errors", read **Recent problems**, fix the cause, then switch it back on.
2. Is the **webhook address** right, starting with `https://`? Chitchat can't reach `localhost`, home network addresses or plain `http://`. Use a host or a tunnel (see [Build a bot](build-a-bot.md#put-it-online)).
3. Press **Send a test ping**. The message tells you what went wrong:
   - *no answer within 5 seconds*: your bot is too slow or not running.
   - *HTTP 401*: your signature check failed (see below), or your server needs a login.
   - *HTTP 404*: the path is wrong (for example `/chitchat` is missing).
   - *the webhook address points at a private network*: the address isn't public.
4. Did you tick the events you need? `message_created` also needs the **Read messages** permission.

## My signature check always fails

- Use the **raw** body exactly as received. Parsing the JSON and turning it back into text changes it. In Express, use `express.text({ type: '*/*' })` for that route.
- Use the **signing secret** (`ccs_…`), not the token (`ccb_…`).
- The signed text is the timestamp, a dot, then the body: `1794416400.{"type":"ping",…}`.
- Did you press **New token & secret**? That changes the signing secret too.
- Is your computer's clock right? Requests older than 5 minutes should be rejected, and a wrong clock makes every request look old.

## The Bot API says…

| Answer | What to do |
|---|---|
| `401 unauthorized` | Send `Authorization: Bot ccb_…`. If it worked before, the token was probably regenerated. |
| `403 disabled` | The bot is switched off in its server. Switch it on in **Added**. |
| `403 forbidden` | The message says which permission is missing. Tick it in **Added → your bot → It can**. |
| `404 not_found` | Wrong id, or your bot can't see that room. Add the bot to private rooms. |
| `429 rate_limited` | Slow down: wait `Retry-After` seconds. |
| `429 slowmode` | The room has slowmode. Post less often there. |
| `400 bad_request` | The message explains what's wrong with the request. |

## People see "… didn't answer in time"

Your bot took longer than 5 seconds to answer a slash command, or answered with an error. Answer with `204` (deferred) right away and reply later with `POST /interactions/{id}/reply`.

## My bot can't give a role

Bots can only give roles that grant **no permissions** and rank **below** the person who added the bot. `GET /roles` shows `"assignable": true` for the ones it can give. Move the role lower, or remove its permissions, in **Server settings → Roles**.

## Still stuck?

Check the [Concepts](concepts.md) page, or the [Bot API reference](bot-api.md) for the exact shape of every request.
