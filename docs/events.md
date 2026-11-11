# Events reference

When something happens in a server, Chitchat sends a `POST` request to your bot's webhook address. Every request looks the same on the outside, so one handler can deal with all of them.

## The request

```http
POST /your/webhook/path HTTP/1.1
Content-Type: application/json
User-Agent: ChitchatBot/1.0 (+plugins)
X-Chitchat-Timestamp: 1794416400
X-Chitchat-Signature: sha256=5d1f0c…
```

- **X-Chitchat-Timestamp**: when it was sent, in Unix seconds.
- **X-Chitchat-Signature**: proof it came from Chitchat. Always check it: see [Security](security.md).

The body is JSON with a `type`:

| `type` | When | What to answer |
|---|---|---|
| `event` | Something your bot listens to happened | Any `2xx` within 5 seconds (the body is ignored) |
| `interaction` | Someone used one of your slash commands | A reply, or "deferred". See [Slash commands](slash-commands.md#answering) |
| `ping` | Someone pressed **Send a test ping** | Any `2xx` |

> **Tip:** Answer quickly (`204 No Content` is perfect) and do slow work afterwards. If your bot takes longer than 5 seconds, Chitchat counts it as a failed delivery.

## Event envelope

```json
{
  "type": "event",
  "event": "bot_mentioned",
  "id": "8b0d3c1e-2f4a-4a8e-9a77-1d1b5f6a2c90",
  "install_id": "2f6e…",
  "server_id": "b59d…",
  "data": { … },
  "sent_at": "2026-11-12T10:20:00.000Z"
}
```

`id` is unique per event, and stays the same when a delivery is retried, so you can use it to skip repeats.

## bot_mentioned

A message @mentions your bot (`@yourbot`), or replies to one of its messages. Your bot gets this even without the Read messages permission. If your bot listens to both this and `message_created`, a message that mentions it arrives once, as `bot_mentioned`.

```json
{
  "message": {
    "id": 4211,
    "channel_id": "5c1e9a8e-…",
    "content": "@weatherfrog is it raining?",
    "reply_to": null,
    "attachments": [],
    "created_at": "2026-11-12T10:20:00.123Z",
    "mentions": ["weatherfrog"],
    "author": { "id": "4f65…", "username": "pip", "display_name": "Pip" }
  }
}
```

`channel_id` is the room's id: use it with `POST /rooms/{room_id}/messages` to answer. Set `reply_to` to `message.id` to reply right under it.

## message_created

Any new message in a room your bot can see. Needs the **Read messages** permission (without it, your bot only gets `bot_mentioned`). Same `data` as `bot_mentioned`.

> **Note:** This one can be busy in an active server. If you only need to react when people talk to your bot, use `bot_mentioned` instead.

## member_joined

Someone joined the server.

```json
{
  "member": { "id": "6e88…", "username": "mochi", "display_name": "Mochi", "joined_at": "2026-11-12T10:20:00Z" }
}
```

There's no room in this event. Use `GET /rooms` to find where to say hello.

## reaction_added

Someone reacted to a message in a room your bot can see.

```json
{
  "reaction": { "message_id": 4211, "channel_id": "5c1e9a8e-…", "emoji": "👍", "user_id": "6e88…" }
}
```

`emoji` is the emoji itself, or a server emoji code like `<:party_frog:3f1c…>`.

## What your bot never gets

- Events caused by bots (including itself). This stops bots from looping.
- Events from rooms it can't see (private rooms it wasn't added to).
- Direct messages. Bots only live in servers.

## Delivery and retries

- Each request has a **5 second** timeout.
- Events are tried up to **3 times**: right away, after 1 second, then after 3 more seconds. A `4xx` answer (except `429`) isn't retried: something's wrong with the request or your code, and trying again won't help.
- Redirects aren't followed. Use your final address.
- After **10 failed deliveries in a row**, Chitchat switches the bot off and shows the last errors in **Added → your bot → Recent problems**. Fix the problem, then turn it back on.
