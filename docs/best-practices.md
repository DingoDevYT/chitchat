# Best practices

Little habits that make a bot pleasant to have around (and easy to keep running).

## Be a good guest

- **Ask for as little as you need.** Most bots only need Send messages. Only ask for Read messages if your bot really has to see every message.
- **Prefer `bot_mentioned` over `message_created`.** Let people talk to your bot, instead of your bot reading everything.
- **Don't flood rooms.** Bundle updates into one message (embeds with fields are great for this), and edit a message instead of posting a new one when something changes.
- **Use ephemeral replies** for help text, errors and anything only one person cares about.
- **Write friendly messages.** "I couldn't find a city called Pariss. Did you mean Paris?" beats "Error 404".

## Be fast

- **Answer within 5 seconds.** For anything slow (calling another website, a big calculation), answer the interaction as deferred and reply later with `POST /interactions/{id}/reply`.
- **Answer events with `204` straight away**, then do the work.
- **Cache what you can.** Room lists and roles rarely change; fetch them once in a while, not on every message.

## Be sturdy

- **Check every signature.** See [Security](security.md).
- **Handle `429`.** Wait for the number of seconds in `Retry-After`, then try again. Don't retry in a tight loop.
- **Expect repeats.** Events can be delivered again after a timeout. The event's `id` stays the same, so skip ones you've already handled.
- **Register commands on start-up.** `PUT /commands` with the full list each time your bot starts keeps Chitchat in step with your code.
- **Keep secrets in environment variables**, never in code.
- **Log errors** somewhere you'll see them, and keep an eye on **Recent problems** in the Plugins tab.

## Be clear

- **Describe every command and option.** The description is what people see in the `/` list.
- **Put required options first,** and give optional ones sensible defaults.
- **Pick names that won't clash** with other plugins (`/frog weather` rather than `/weather`).
- **Give your bot a picture and a clear name,** so people know who's talking.

## A checklist before you share your bot

- [Signature check](security.md#checking-signatures) in place, using the raw body.
- Token and secret only in environment variables.
- Answers within 5 seconds (or defers).
- Only the permissions it needs.
- Every command has a description.
- **Send a test ping** works.
