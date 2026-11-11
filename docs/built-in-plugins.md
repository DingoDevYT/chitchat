# Built-in plugins guide

Chitchat comes with three plugins. Add them from **Server settings → Plugins → Browse**.

## The Chef

A very serious head chef who has seen it all. The Chef answers every @mention with:

> Yes Chef.

Almost always. Once in a long while it says something else ("Heard, Chef.", "Yes Chef. Behind!"). Replying to one of the Chef's messages counts as mentioning it.

### Commands

| Command | What it does |
|---|---|
| `/chef special` | Today's special: a very real dish, with a side and a price. It's the same all day and changes at midnight (UTC). |
| `/chef rate <thing>` | The Chef tastes something and rates it out of 10, with a deadpan comment. The same thing always gets the same score, so no rerolling for a 10. |
| `/chef menu` | Tonight's menu: starter, main, dessert and a drink. |
| `/chef 86 <thing>` | "86" is kitchen talk for "we're out of it". The Chef takes it off the menu, loudly. |

### Settings

- **Rare variations**: turn off for a Chef who only ever says "Yes Chef."
- **Kitchen name**: shown on `/chef menu` ("Tonight at …"). Empty uses your server's name.

> **Tip:** Try `/chef rate the chef`.

## Automod

Automod quietly holds back messages that break your rules, **before anyone sees them**. It runs inside Chitchat's database, so it works even when no moderator is online, and it never slows anyone down.

### What it checks

| Setting | What it does |
|---|---|
| **Blocked words and phrases** | One per line. Whole words only, so blocking `cat` doesn't catch `category`. Use `*` as a wildcard: `cat*` also catches `cats` and `category`. It also catches sneaky spellings: `c4t`, `caaat`, `c.a.t` and `c a t` all count. |
| **Links** | *Allow all links*, *Block invite links* (to Chitchat servers, Discord, WhatsApp groups and Telegram), or *Block links, except allowed sites*. |
| **Allowed sites** | Used with the last option. One per line, like `youtube.com`. Subdomains count (`m.youtube.com`). |
| **Most @mentions in one message** | Stops mass pings. 0 means no limit. |
| **Hold back SHOUTING** | If more than this percentage of letters are capitals (only for messages with 12 or more letters). 0 turns it off. |
| **Most messages in a burst** + **Burst length** | For example 6 messages in 8 seconds, per person, per room. The 7th waits. |
| **Most identical messages in a row** | Stops copy-paste spam (counted over 5 minutes). |
| **Time out after this many held-back messages** | Counted over 10 minutes. 0 means Automod never times anyone out. |
| **Timeout length** | From 1 minute to 1 day. Uses the same timeouts as the moderation tools. |
| **Roles Automod skips** | People with these roles are never checked. |
| **Rooms Automod ignores** | Messages in these rooms (and their threads) are never checked. |

People with **Manage server** are always skipped, so admins can't lock themselves out.

### What people see

When Automod holds a message back, the sender (and only the sender) sees their message marked as not sent, with the reason:

> Automod held that back: it has a word or phrase this server doesn't allow. One more and you'll get a short timeout.

Nobody else sees anything. If they keep going and reach your limit, they get a timeout and the message says how long. During a timeout they can read but not post, react or use commands, just like a timeout from a moderator.

### What moderators see

Every held-back message and every Automod timeout goes into the server's **Audit log** (Server settings → Audit log, filter "Automod"). The log says who, which room and which rule, but never the message itself.

### Try it before you save

Under the settings there's a **Try a message** box. Type something and it tells you whether Automod would hold it back, using the settings on screen, even before you save. (Bursts and repeats depend on what people actually send, so they can't be previewed.)

> **Note:** Automod checks messages in server rooms, threads, stadium chats and gallery comments. It doesn't read DMs.

## Custom commands

Make your own slash commands without code. Chit, Chitchat's mascot, answers them. Everything about them is in the [Quickstart](quickstart.md).
