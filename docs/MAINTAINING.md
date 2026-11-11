# Maintaining plugins

For whoever works on Chitchat's plugin system next. (This file isn't shown in the in-app docs.)

## The pieces

| Piece | Where | Job |
|---|---|---|
| Database | `supabase/migrations/035_plugins.sql` | Tables, RLS, every RPC, Automod, event dispatch, the built-in catalog |
| RLS tests | `supabase/tests/035_plugins_rls.sql` | Run in the SQL editor (or `execute_sql`). It rolls itself back and ends with `ALL PLUGIN TESTS PASSED`. |
| plugin-runtime | `supabase/functions/plugin-runtime/` | Slash commands (user JWT), events (DB shared secret), test pings; runs built-ins, calls external bots |
| bot-api | `supabase/functions/bot-api/` | REST API for external bots (`Authorization: Bot ccb_…`) |
| Shared pure code | `supabase/functions/plugin-runtime/shared.js`, `plugins/*.js` | Templates, embeds, command/option validation, signing, The Chef. Imported by both functions and by the app; tested in `src/lib/plugins.test.js` |
| App | `src/Plugins.jsx`, `src/SlashCommands.jsx`, `src/Embed.jsx`, `src/lib/slash.js`, `src/lib/automod.js`, `src/styles/plugins.css` | Plugins tab, `/` autocomplete, ephemeral replies, embeds, BOT badge (in `Avatar.jsx` `Name`) |
| Docs | `docs/*.md`, `src/Docs.jsx`, `src/lib/docsmd.js` | The in-app docs at `#/docs` |

## How a slash command flows

1. Composer (`useSlashCommands`) parses the text with `src/lib/slash.js` and calls `plugin-runtime` with the user's JWT.
2. plugin-runtime calls `begin_interaction` **as the user** (it checks room access, timeouts, rules screening, role limits and an 8-per-30-s rate limit, then records the interaction).
3. It loads everything with the service role (`plugin_context`), re-checks the options (`checkOptions`), and runs the built-in handler or POSTs to the bot.
4. Public replies go through `bot_send` (service role only). Ephemeral replies return in the HTTP response; late ones land on `plugin_interactions.response`, which the client watches over realtime.

## How an event flows

`plugin_dispatch` (AFTER INSERT on messages, reactions and members) does nothing unless an enabled install **in that server** listens to that event and the actor isn't a bot. Then it calls `net.http_post` (pg_net, async, after commit) to plugin-runtime with the `x-chitchat-secret` header. The secret lives in Vault (`plugin_runtime_secret`); the function reads it with `plugin_runtime_secret()` and caches it.

The project URL is hard-coded in `plugin_dispatch`. If Chitchat ever runs in more than one Supabase project, move it into Vault too.

## Automod

Enforced by `plugins_before_message` (BEFORE INSERT on messages). A held-back message returns `NULL` (so it's silently not inserted) instead of raising, which keeps the strike (`automod_hits`), the audit entry and any timeout. The client notices the empty insert result and reads the reason from `automod_hits`. Don't insert messages with `.single()`: PostgREST rolls the whole transaction back when a single-object response has zero rows, which would throw away the strike, the reason and the audit entry (the message stays blocked either way).

`automod_norm`, `automod_words_rx` and `automod_rule` are mirrored in `src/lib/automod.js` for the preview. **Change both together.** The test "automod mirror matches the database rules" and the SQL block in the RLS tests use the same cases.

Config is always cleaned by `clean_plugin_config` against the plugin's `config_schema`, and the trigger wraps its checks in an exception block, so a bad config can never stop a server from talking.

## Adding a built-in plugin

1. Insert a row into `public.plugins` in a new migration (id, name, description, icon from `src/icons/paths.js`, permissions, events, commands, config_schema) with a bot account from `public.create_bot_user(...)`.
2. Write the handler in `supabase/functions/plugin-runtime/plugins/<id>.js` (export `command(ctx)` and/or `event(ctx)`, returning `{ content, embeds, ephemeral, reply_to }` or `null`), keep it pure, and register it in `BUILTINS` in `index.ts`.
3. Add tests to `src/lib/plugins.test.js`.
4. Document it in `docs/built-in-plugins.md` and `docs/changelog.md`.
5. Redeploy plugin-runtime.

The settings form is generated from `config_schema`. Field types: `text`, `textarea`, `number` (`min`/`max`), `boolean`, `select` (`options: [[value, label]]`), `list`, `roles`, `rooms`, `room`.

## Deploying the functions

Both functions run with JWT verification **off** (each checks its own caller). They import files from sibling folders, so deploy from `supabase/functions` keeping the folder layout:

```bash
supabase functions deploy plugin-runtime --no-verify-jwt
supabase functions deploy bot-api --no-verify-jwt
```

With the Supabase MCP `deploy_edge_function`, upload the files with their folder names (`plugin-runtime/index.ts`, `plugin-runtime/shared.js`, `plugin-runtime/plugins/chef.js`, `plugin-runtime/plugins/custom.js`, `link-preview/safe.js`) and set the entrypoint to `plugin-runtime/index.ts`. bot-api needs `bot-api/index.ts` and `plugin-runtime/shared.js`.

## Docs

Pages are the Markdown files in `docs/`, listed in order in `ORDER` in `src/Docs.jsx`. To add one, write the file, add its slug to `ORDER`, and link it from a neighbour. The renderer (`src/lib/docsmd.js`) supports headings, lists, tables (`\|` for a literal pipe), code blocks, `> **Tip:**` / `> **Note:**` / `> **Warning:**` callouts and links like `[x](bot-api.md#errors)`. Keep the docs true: if you change an endpoint or a limit, change the page in the same commit.

## Cost (Supabase free tier)

- Automod and custom-command validation run in Postgres: no edge invocations.
- Every slash command is one plugin-runtime invocation. Every **delivered** event is one invocation (several installs listening to the same event share it). Servers with no listening install never invoke anything.
- Bot API calls are one bot-api invocation each, capped at 120 a minute per bot.
- `plugin_interactions` older than a day are deleted as new ones arrive.
