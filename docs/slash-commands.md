# Slash commands & options

Slash commands are how people ask a bot to do something: `/roll 20`, `/chef rate pancakes`, `/weather now Paris`.

## Using them

Type `/` at the start of a message in a server room. A list pops up with every command in the server: its name, what it does, which plugin it belongs to, and what to type after it.

- **Arrow keys** move through the list, **Tab** or **Enter** picks one, **Esc** closes it.
- Once a command is picked, a hint shows its options. The one you still need is highlighted.
- Press **Enter** to run it. The command doesn't appear as your own message; the bot's answer does (with "Pip used /roll" above it).

Options are typed after the command, in order:

```text
/roll 20
/weather now Paris metric
```

The **last text option takes the rest of the line**, so `/chef rate a very large pancake` works without quotes. You can also name an option, or use quotes to keep words together:

```text
/roll sides:20
/weather now city:"New York" units:imperial
```

If something's missing or the wrong type, Chitchat tells you before anything is sent ("/roll needs sides", "sides should be a whole number").

> **Note:** `/time` is built into Chitchat and opens the timestamp picker. It keeps working whatever plugins you add.

## Option types

| `type` | People type | Your bot receives |
|---|---|---|
| `string` | Any text (up to 1000 characters) | `"New York"` |
| `integer` | A whole number | `20` |
| `number` | Any number | `2.5` |
| `boolean` | yes / no, true / false, on / off | `true` |
| `user` | `@username` | `"mochi"` (the username, without the @) |
| `room` | A room name (`~general` works too) | `"general"` |

Add `choices` to an option to allow only certain values. People can type them in any case; your bot always gets the spelling from your list.

## Registering commands

External bots register their commands with [`PUT /commands`](bot-api.md#put-commands). Built-in plugins and custom commands register themselves.

```json
[
  {
    "name": "weather now",
    "description": "Weather right now",
    "options": [
      { "name": "city", "type": "string", "description": "Which city?", "required": true },
      { "name": "units", "type": "string", "description": "metric or imperial", "choices": ["metric", "imperial"] }
    ]
  }
]
```

The rules:

- **Name**: lowercase letters, numbers, `-` and `_`, up to 32 characters. One word (`roll`) or two (`weather now`) for a group of related commands.
- **Description**: up to 100 characters. Shown in the `/` list, so make it helpful.
- **Options**: up to 10. Names follow the same rules as command names (one word). Put **required options first**.
- Up to 50 commands per bot.

If two plugins have a command with the same name, both show in the list (with their plugin's name) and people pick the one they want. Typing the name in full picks the first one, so it's kinder to choose names that won't clash.

## Answering

When someone uses your command, your webhook gets an `interaction`:

```json
{
  "type": "interaction",
  "id": "8b0d3c1e-…",
  "install_id": "2f6e…",
  "command": "weather now",
  "options": { "city": "Paris", "units": "metric" },
  "user": { "id": "4f65…", "username": "pip", "display_name": "Pip" },
  "room": { "id": "5c1e…", "name": "general", "kind": "text" },
  "server": { "id": "b59d…", "name": "Pip's place" },
  "sent_at": "2026-11-12T10:20:00.000Z"
}
```

`user.display_name` is their server nickname if they have one. Options are already checked and typed for you.

You have **5 seconds** to answer, in one of three ways:

**1. Reply now (everyone sees it):** answer `200` with a message.

```json
{ "content": "It's 21°C and sunny in Paris.", "embeds": [] }
```

**2. Reply now, privately:** add `"ephemeral": true`. Only that person sees it, and it isn't saved.

```json
{ "content": "You don't have any reminders yet.", "ephemeral": true }
```

**3. Reply later:** answer `202 Accepted`, `204 No Content` or `{ "deferred": true }`. The person sees "Weather Frog is thinking…". Then, within **15 minutes**, call:

```http
POST /interactions/8b0d3c1e-…/reply
{ "content": "Done! Here's your report.", "ephemeral": false }
```

If your bot doesn't answer within 5 seconds, or answers with an error, the person sees "Weather Frog didn't answer in time" (only to them).

## Custom commands

Custom commands made in the Plugins tab work the same way for the people using them. They take one optional text option (whatever's typed after the command, shown as `{args}`) when their reply uses it. See the [Quickstart](quickstart.md).

## Who can use a command

Anyone who can post in a room can use commands there, except:

- People in a **timeout**, or who haven't agreed to the server rules yet.
- Custom commands limited to some roles (people with Manage server can always use them).
- Commands from a plugin that's switched off don't show at all.

Commands work in server rooms and stadium side chats, not in DMs.
