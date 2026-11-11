# Build a bot in 10 minutes

An external bot is a small program you run somewhere on the internet. Chitchat talks to it in two directions:

- **Chitchat → your bot**: when something happens (someone @mentions it, uses one of its slash commands…), Chitchat sends a signed `POST` request to your bot's **webhook address**.
- **Your bot → Chitchat**: your bot calls the **Bot API** with its token to post messages, react, hand out roles and more.

You can start with just the second part: a bot that only posts things doesn't need a webhook address at all.

## 1. Create the bot

1. Go to **Server settings → Plugins → Make your own → Connect an external bot**.
2. Give it a name (and a picture, if you like).
3. Webhook address: leave it empty for now if you don't have one yet. You can add it later.
4. Choose what it can do. "Send messages" is enough to start.
5. Press **Create**, then copy the **bot token** (`ccb_…`) and the **signing secret** (`ccs_…`).

> **Warning:** The token and secret are only shown once. Keep them somewhere safe, like a password manager or your host's "environment variables" settings. Never paste them into public code or screenshots. Lost them? Press **New token & secret** in **Added**.

## 2. Say hello (no code!)

Open a terminal. First, ask which rooms your bot can see:

```bash
curl -H "Authorization: Bot YOUR_TOKEN" \
  https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api/rooms
```

You get a list like `[{"id":"5c1e…","name":"general","kind":"text",…}]`. Copy a room `id` and post:

```bash
curl -X POST -H "Authorization: Bot YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Hello from my very own bot!"}' \
  https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api/rooms/ROOM_ID/messages
```

Your bot just spoke! (On Windows PowerShell, use `curl.exe` and put the JSON in a file: `-d "@hello.json"`.)

## 3. A real bot in Node.js

This bot has a `/roll` slash command and says hi when someone @mentions it. You need [Node.js](https://nodejs.org) 18 or newer.

```bash
mkdir my-bot && cd my-bot
npm init -y && npm pkg set type=module
npm install express
```

Save this as `bot.js`:

```js
import express from 'express'
import crypto from 'node:crypto'

const API = 'https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api'
const TOKEN = process.env.CHITCHAT_TOKEN   // ccb_...
const SECRET = process.env.CHITCHAT_SECRET // ccs_...

// Calls the Bot API and throws a readable error if something's wrong.
async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json()
  if (!res.ok) throw new Error(`${res.status} ${data.error.code}: ${data.error.message}`)
  return data
}

// Checks that a request really came from Chitchat (see the Security page).
function fromChitchat(req) {
  const ts = req.get('x-chitchat-timestamp') || ''
  const sig = req.get('x-chitchat-signature') || ''
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false // older than 5 minutes: maybe a replay
  const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${req.body}`).digest('hex')
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))
}

const app = express()
// express.text keeps the raw body, which the signature check needs
app.post('/chitchat', express.text({ type: '*/*' }), async (req, res) => {
  if (!fromChitchat(req)) return res.status(401).send('bad signature')
  const e = JSON.parse(req.body)

  if (e.type === 'ping') return res.json({ ok: true })

  if (e.type === 'interaction' && e.command === 'roll') {
    const sides = e.options.sides ?? 6
    const n = 1 + Math.floor(Math.random() * sides)
    return res.json({ content: `${e.user.display_name} rolled a **${n}** (1 to ${sides})` })
  }

  if (e.type === 'event' && e.event === 'bot_mentioned') {
    res.status(204).end() // answer Chitchat right away, then do the work
    await api(`/rooms/${e.data.message.channel_id}/messages`, 'POST', {
      content: `Hi ${e.data.message.author.display_name}! Try /roll`,
      reply_to: e.data.message.id,
    })
    return
  }

  res.status(204).end()
})

// Tell Chitchat which slash commands this bot has (safe to do on every start).
await api('/commands', 'PUT', [
  { name: 'roll', description: 'Roll a die', options: [
    { name: 'sides', type: 'integer', description: 'How many sides (default 6)', required: false },
  ] },
])
app.listen(process.env.PORT || 3000, () => console.log('Bot is listening'))
```

Run it:

```bash
CHITCHAT_TOKEN=ccb_... CHITCHAT_SECRET=ccs_... node bot.js
```

(PowerShell: `$env:CHITCHAT_TOKEN="ccb_..."; $env:CHITCHAT_SECRET="ccs_..."; node bot.js`.)

### Put it online

Chitchat can only reach addresses on the public internet that start with `https://`. Some easy options:

- **Hosting**: Render, Railway, Fly.io, Glitch and friends run Node apps and give you an `https://` address. Set `CHITCHAT_TOKEN` and `CHITCHAT_SECRET` in their environment settings.
- **Testing from your own computer**: a tunnel such as `cloudflared tunnel --url http://localhost:3000` gives you a temporary public `https://` address.

Then, in **Added**, open your bot, paste the address (for the example above: `https://your-address/chitchat`), tick **Messages that @mention it or reply to it**, and **Save changes**. Press **Send a test ping**: if your bot answers, you'll see "Your bot answered".

Now type `/roll` in a room.

## 4. The same bot on Cloudflare Workers or Deno

No server to look after: these run your code only when a request arrives. Here's a coin-flip bot.

```js
// Cloudflare Workers: set CHITCHAT_SECRET as a secret, deploy, and use the worker's URL as the webhook address.
// Deno Deploy: replace "export default { fetch }" with Deno.serve(req => fetch(req, { CHITCHAT_SECRET: Deno.env.get('CHITCHAT_SECRET') })).
async function fetch(req, env) {
  const raw = await req.text()
  const ok = await verify(env.CHITCHAT_SECRET, req.headers.get('x-chitchat-timestamp'), raw, req.headers.get('x-chitchat-signature'))
  if (!ok) return new Response('bad signature', { status: 401 })
  const e = JSON.parse(raw)
  if (e.type === 'interaction' && e.command === 'flip') {
    return Response.json({ content: Math.random() < 0.5 ? 'Heads!' : 'Tails!' })
  }
  return new Response(null, { status: 204 })
}
export default { fetch }

async function verify(secret, ts, body, sig) {
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${body}`)))
  const want = 'sha256=' + [...mac].map(b => b.toString(16).padStart(2, '0')).join('')
  if (want.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}
```

Register the `/flip` command once from your terminal:

```bash
curl -X PUT -H "Authorization: Bot YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '[{"name":"flip","description":"Flip a coin"}]' \
  https://nilludyavkfqwastghmw.supabase.co/functions/v1/bot-api/commands
```

## What's next

- Every event your bot can get: [Events reference](events.md).
- Everything your bot can do: [Bot API reference](bot-api.md).
- Pretty cards: [Embeds](embeds.md).
- Private replies and answering later: [Slash commands & options](slash-commands.md).
