# Bot API reference

Your bot uses the Bot API to act in its server: post and edit messages, react, reply to slash commands, hand out roles and register its commands.

## Basics

**Base URL**

```text
https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api
```

**Authentication**: send your bot token in the `Authorization` header on every request.

```http
Authorization: Bot ccb_your_token_here
```

**Bodies** are JSON (`Content-Type: application/json`), up to 64 KB. **Ids**: rooms, people and roles have ids like `5c1e9a8e-3b2f-4c1a-9e0d-7a6b5c4d3e2f`; messages have whole-number ids like `4211`.

A bot only works in the server it belongs to, and only in rooms it can see.

## Errors

Anything that isn't a `2xx` comes with a JSON body like this:

```json
{ "error": { "code": "forbidden", "message": "This bot doesn't have the read_messages permission." } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | Something in your request is wrong. The message says what. |
| 401 | `unauthorized` | No token, or the token is wrong (maybe it was regenerated). |
| 403 | `forbidden` | Your bot isn't allowed to do that (missing permission, a role it can't give…). |
| 403 | `disabled` | The bot is switched off in its server. |
| 404 | `not_found` | That room, message, role or person doesn't exist, or your bot can't see it. |
| 429 | `rate_limited` | More than 120 requests in a minute. Wait the number of seconds in the `Retry-After` header. |
| 429 | `slowmode` | The room has slowmode on and your bot posted too recently. |
| 500 | `server_error` | Something broke on our side. Try again in a bit. |

---

## GET /me

Who your bot is, and what it may do.

```bash
curl -H "Authorization: Bot $TOKEN" $API/me
```

```json
{
  "id": "1f2e…",
  "username": "weatherfrog",
  "name": "Weather Frog",
  "install_id": "2f6e…",
  "server": { "id": "b59d…", "name": "Pip's place" },
  "permissions": ["send_messages", "read_messages"],
  "events": ["bot_mentioned"]
}
```

## GET /rooms

The rooms (and stadiums and galleries) your bot can see, in sidebar order.

```json
[
  { "id": "5c1e…", "name": "general", "kind": "text", "private": false, "parent_id": null, "topic": null },
  { "id": "9a0b…", "name": "Hangout", "kind": "voice", "private": false, "parent_id": null, "topic": null }
]
```

`kind` is `text` for rooms, `voice` for stadiums (they have a side chat you can post in) and `gallery` for galleries.

## GET /rooms/{room_id}/messages

Recent messages, newest first. Needs **Read messages**.

| Query | Default | |
|---|---|---|
| `limit` | 50 | 1 to 100 |
| `before` | | Only messages older than this message id (for paging back) |

```bash
curl -H "Authorization: Bot $TOKEN" "$API/rooms/5c1e…/messages?limit=2"
```

```json
[
  {
    "id": 4212, "channel_id": "5c1e…", "content": "Yes Chef.", "embeds": [], "attachments": [],
    "reply_to": 4211, "created_at": "2026-11-12T10:20:01.5+00:00", "edited_at": null,
    "author": { "id": "c0ff…", "username": "thechef", "display_name": "The Chef", "is_bot": true }
  },
  {
    "id": 4211, "channel_id": "5c1e…", "content": "@thechef dinner?", "embeds": [], "attachments": [],
    "reply_to": null, "created_at": "2026-11-12T10:20:00.1+00:00", "edited_at": null,
    "author": { "id": "4f65…", "username": "pip", "display_name": "Pip", "is_bot": false }
  }
]
```

## POST /rooms/{room_id}/messages

Post a message. Needs **Send messages**. Answers `201` with the new message.

| Field | Type | |
|---|---|---|
| `content` | text | Up to 4000 characters. Chitchat formatting works (`**bold**`, `@mentions`…). |
| `embeds` | list | Up to 5 cards. See [Embeds](embeds.md). |
| `reply_to` | message id | Optional: shows your message as a reply to this one (same room). |

You need `content`, `embeds`, or both.

```bash
curl -X POST -H "Authorization: Bot $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Good morning!","embeds":[{"title":"Today","description":"Sunny, 21°C","color":"#ffd166"}]}' \
  $API/rooms/5c1e…/messages
```

```json
{
  "id": 4213, "channel_id": "5c1e…", "author_id": "1f2e…", "content": "Good morning!",
  "embeds": [{ "title": "Today", "description": "Sunny, 21°C", "color": "#ffd166" }],
  "reply_to": null, "attachments": [], "interaction": null, "created_at": "2026-11-12T10:21:00+00:00", "edited_at": null
}
```

(The real answer has a few more fields that Chitchat uses internally, like `pinned_at`. You can ignore them.)

> **Note:** Bots can't ping `@everyone` or `@here`. Mentioning a person by `@username` does notify them.

## PATCH /messages/{message_id}

Edit one of your bot's own messages. Send `content`, `embeds`, or both; whatever you leave out stays as it is. Send `"embeds": []` to remove the cards. Answers with the edited message.

```bash
curl -X PATCH -H "Authorization: Bot $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Good morning! (updated)"}' $API/messages/4213
```

## DELETE /messages/{message_id}

Delete one of your bot's own messages. Answers `204 No Content`.

## PUT /messages/{message_id}/reactions/{emoji}

React to a message. Needs **Add reactions**. URL-encode the emoji. Answers `204`.

```bash
curl -X PUT -H "Authorization: Bot $TOKEN" "$API/messages/4211/reactions/%F0%9F%91%8D"
```

## DELETE /messages/{message_id}/reactions/{emoji}

Take your bot's reaction back. Answers `204`.

## POST /interactions/{interaction_id}/reply

Answer a slash command later (after you answered the interaction with "deferred"). You have **15 minutes**.

| Field | Type | |
|---|---|---|
| `content` | text | Up to 4000 characters |
| `embeds` | list | Up to 5 cards |
| `ephemeral` | yes/no | `true` = only the person who used the command sees it |

A public reply answers with the new message (which shows "pip used /roll" above it). An ephemeral reply answers:

```json
{ "ephemeral": true, "interaction_id": "8b0d…" }
```

## GET /roles

The server's roles, highest first. `assignable` says whether your bot may hand it out.

```json
[
  { "id": "aa11…", "name": "Mods", "color": "#7b9cff", "position": 2, "permissions": ["kick_members"], "assignable": false },
  { "id": "bb22…", "name": "Frog fans", "color": "#7ed6b1", "position": 1, "permissions": [], "assignable": true }
]
```

## PUT /members/{user_id}/roles/{role_id}

Give someone a role. Needs **Give out roles**. Answers `204`. Bots can only give roles that grant **no permissions** and rank **below the person who added the bot**. That's perfect for colour roles, ping roles and "I agree to the rules" roles, and it means a bot can never hand out power.

## DELETE /members/{user_id}/roles/{role_id}

Take a role away (same rules). Answers `204`.

## GET /commands

Your bot's slash commands, as last registered.

## PUT /commands

Replace your bot's slash commands with this list. Send the whole list every time (it's fine to do this each time your bot starts). Answers with the cleaned-up list.

```json
[
  { "name": "roll", "description": "Roll a die", "options": [
    { "name": "sides", "type": "integer", "description": "How many sides", "required": false }
  ] },
  { "name": "weather now", "description": "Weather right now", "options": [
    { "name": "city", "type": "string", "required": true },
    { "name": "units", "type": "string", "choices": ["metric", "imperial"] }
  ] }
]
```

The rules are in [Slash commands & options](slash-commands.md#registering-commands). Send `[]` to remove them all.
