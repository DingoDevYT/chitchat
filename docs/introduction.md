# Introduction

Plugins add helpers to your Chitchat server: friendly bots, handy commands and quiet guardians that keep things tidy. They show up as members of your server with a small **BOT** badge next to their name, so everyone always knows who's a person and who isn't.

There are three ways to use them, from "no code at all" to "write your own":

| Way | Code needed? | Good for |
|---|---|---|
| **Built-in plugins** | None | The Chef (a very serious chef), Automod (keeps spam and unkind words out) |
| **Custom commands** | None | Your own `/hug`, `/rules` or `/pickagame` in a minute |
| **External bots** | Yes, a little | Anything you can imagine: games, reminders, lookups, welcome messages |

## Where to find it

Open your server, then **Server settings → Plugins**. You need the **Manage server** permission (server owners and admins have it).

The Plugins tab has three parts:

- **Browse**: the built-in plugins, with what each one can do. Press **Add** to put one in your server.
- **Added**: everything in your server. Turn things on and off, change settings, see recent problems, or remove them.
- **Make your own**: create custom commands, or connect an external bot.

## What people see

When someone types `/` in a room, a list pops up with every command your plugins offer, what each one does, and what to type after it. Replies arrive as normal messages from the bot (some come with a neat little card called an *embed*). A reply can also be private: then only the person who used the command sees it, with an "Only you can see this" label.

> **Tip:** Bots never get more power than the person who added them. A plugin also only gets the permissions you tick when you add it, and you can change them later.

## Where to go next

- Never written code? Start with the [Quickstart](quickstart.md) and make a custom command.
- Want to write a bot? Follow [Build a bot in 10 minutes](build-a-bot.md).
- Curious how it all fits together? Read [Concepts](concepts.md).
- Setting up The Chef or Automod? See the [Built-in plugins guide](built-in-plugins.md).
