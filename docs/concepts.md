# Concepts

A short tour of the ideas behind plugins. Nothing here is required reading for custom commands, but it helps when you write a bot.

## Bots

A **bot** is a member of your server that a program controls. It has a name, a picture and a **BOT** badge. Bots can't sign in like people do: they only act through Chitchat's plugin system, and only in servers.

Built-in plugins share one bot account across every server that adds them (The Chef is the same Chef everywhere). Each external bot gets its own account, which belongs to the server that created it.

## Plugins and installs

A **plugin** is the thing you add: The Chef, Automod, Custom commands, or your own external bot. When you add one to a server, that's an **install**. Each install has its own:

- **On/off switch**: off means no commands, no events, and the Bot API refuses its token.
- **Settings**: built-in plugins have a settings form (Automod's blocked words, for example).
- **Permissions**: what it may do in this server.
- For external bots: a **webhook address**, the **events** it wants, a **token** and a **signing secret**.

Removing a plugin takes its bot out of the server. Messages it already posted stay.

## Permissions

A plugin asks for permissions, and whoever adds it decides which ones to give. You can change them later in **Added**.

| Permission | What it allows |
|---|---|
| Send messages | Post, edit and delete its own messages in rooms it can see |
| Read messages | Read recent messages (`GET …/messages`) and receive every new message (`message_created`) |
| Add reactions | React to messages |
| Give out roles | Add and remove roles that don't grant any permissions (like colour or ping roles), below whoever added the bot |
| Time out members | Automod only: pause people who keep breaking the rules |

Two safety rules always apply:

1. **A bot never gets more than its installer has.** You can't give a plugin "Time out members" unless you can time people out yourself.
2. **Private rooms stay private.** A bot only sees a private room if someone adds it to that room, exactly like a person.

## Events

An **event** is something that happened that a bot can hear about. Your bot picks which ones it wants:

- `bot_mentioned`: a message @mentions the bot, or replies to one of its messages.
- `message_created`: any new message in a room the bot can see (needs Read messages).
- `member_joined`: someone joined the server.
- `reaction_added`: someone reacted to a message.

Chitchat only sends an event when at least one bot in that server wants it. Bots never get events caused by other bots, so two bots can't get stuck chatting forever. See the [Events reference](events.md).

## Interactions

When someone uses a slash command, that's an **interaction**. It goes like this:

1. They type `/roll 20` and press Enter. Chitchat checks they're allowed (they can see the room, aren't in a timeout, have the right role).
2. Chitchat sends the interaction to the plugin. Built-ins answer instantly; external bots get a signed `POST` and have **5 seconds** to answer.
3. The answer is either a normal message everyone sees, an **ephemeral** reply only that person sees, or "I'll answer in a moment" (**deferred**). A deferred bot has **15 minutes** to reply through the Bot API.

## Rate limits

Limits keep things fast and fair for everyone (and keep Chitchat free to run):

| What | Limit |
|---|---|
| Bot API calls | 120 per minute per bot. Over that you get `429` with a `Retry-After` header. |
| Slash commands | 8 per person every 30 seconds |
| Webhook answer time | 5 seconds per request |
| Event delivery | Tried up to 3 times (right away, after 1 s, after 3 s more) |
| Failures in a row | After 10 failed deliveries in a row the bot is switched off. Turning it back on resets the count. |
| Slowmode | Applies to bots too |
| Message length | 4000 characters, up to 5 embeds |

## Ephemeral replies

An ephemeral reply only appears for the person who used the command, in the room they used it in, with an "Only you can see this" label. It isn't saved as a message: it disappears when they reload or press Dismiss. Use them for help text, errors and anything only one person cares about.
