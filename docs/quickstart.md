# Quickstart: custom commands

Custom commands are slash commands you make yourself, with no code. Someone types `/hug mochi`, and Chit (our mascot bot) replies "Pip gives mochi a big hug!". It takes about a minute.

## 1. Turn on custom commands

1. Open your server and go to **Server settings → Plugins**.
2. Pick **Make your own**, then **Custom commands**.
3. Press **Turn on custom commands**.

Chit joins your server as a member with a BOT badge. Chit is the one who answers your commands.

## 2. Make your first command

Press **New command** and fill in:

- **Name**: one word, like `hug`. People will type `/hug`.
- **Description**: a short hint shown in the `/` list, like "Give someone a hug".
- **Reply**: what Chit says. You can use the little variable buttons below the box.

For example:

```text
{user} gives {args} a big hug!
```

Press **Save command**. That's it: go to any room, type `/`, and you'll see it.

## 3. Variables

Variables are words in curly brackets that get swapped for something else when the command runs.

| Variable | Becomes | Example |
|---|---|---|
| `{user}` | The name of the person who used it | Pip |
| `{mention}` | An @mention of them (it pings them) | @pip |
| `{server}` | Your server's name | Pip's place |
| `{room}` | The room it was used in | general |
| `{args}` | Whatever they typed after the command | mochi |
| `{random:a\|b\|c}` | One of the choices, picked at random | b |

If your reply uses `{args}`, the `/` list tells people they can type something after the command.

> **Note:** `{random:…}` choices are split by the `|` character. You can put variables inside them too: `{random:Nice one, {user}!|Wow!}`.

## 4. Extras

- **Add an embed card**: gives the reply a coloured card with a title and text. Great for rules or announcements.
- **Who can use it**: pick roles to limit the command to them. Nobody picked means everyone. People with Manage server can always use every command.
- **Only the person who used it sees the reply**: the reply shows up just for them, with an "Only you can see this" label. Handy for help text.

The **Preview** at the bottom shows exactly what Chit will post (with you as the person using it).

## Ideas to steal

```text
/pick       → I pick... {random:Mario Kart|Minecraft|Among Us|a nap}!
/rules      → (embed) Title: House rules · Text: Be kind. No spoilers without || ||. Have fun!
/welcome    → Welcome to {server}, {args}! Grab a snack and say hi in general.
/coin       → {mention} flips a coin... {random:heads!|tails!}
/help       → (only you see it) Try /pick, /coin and /rules!
```

## Good to know

- A server can have up to 50 custom commands.
- Names are one word: lowercase letters, numbers, `-` and `_`.
- To change or delete a command, open **Make your own → Custom commands** again.
- Turning the plugin off (in **Added**) hides all custom commands until you turn it back on. Your commands are kept.

Ready for more? Learn how to [build your own bot](build-a-bot.md).
