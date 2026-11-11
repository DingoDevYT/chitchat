# Security

Bots are powerful, so Chitchat is careful with them, and your bot should be too. This page covers what Chitchat does for you, and the two things you must do yourself: **keep your token secret** and **check signatures**.

## Your bot token

- The token (`ccb_…`) is how your bot proves who it is to the Bot API. Anyone with it can act as your bot.
- Chitchat only stores a fingerprint (a SHA-256 hash) of it, so even we can't show it again. That's why it's shown once.
- Keep it in an environment variable or your host's secret settings, never in your code, and never in a public repository.
- **Leaked it?** Go to **Server settings → Plugins → Added → your bot → New token & secret**. The old token stops working immediately. Then update your bot.

## Checking signatures

Your webhook address is on the public internet, so anyone could send it a fake request. Every real request from Chitchat is signed with your bot's **signing secret** (`ccs_…`):

```text
X-Chitchat-Timestamp: 1794416400
X-Chitchat-Signature: sha256=<hex of HMAC-SHA256(signing secret, "<timestamp>.<raw body>")>
```

To check a request:

1. Take the timestamp header, a dot, and the **raw** request body, exactly as received (before any JSON parsing).
2. Compute HMAC-SHA256 of that with your signing secret, as lowercase hex, and put `sha256=` in front.
3. Compare it with the signature header using a constant-time comparison.
4. Reject requests whose timestamp is more than 5 minutes away from now. That stops someone replaying an old request.

If any step fails, answer `401` and do nothing else.

### Node.js

```js
import crypto from 'node:crypto'

export function fromChitchat(secret, timestamp, rawBody, signature) {
  if (!timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return signature.length === want.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(want))
}
```

With Express, read the body as text so you have the raw bytes: `express.text({ type: '*/*' })`.

### Deno, Cloudflare Workers, browsers (Web Crypto)

```js
export async function fromChitchat(secret, timestamp, rawBody, signature) {
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`)))
  const want = 'sha256=' + [...mac].map(b => b.toString(16).padStart(2, '0')).join('')
  if (want.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}
```

### Python

```python
import hashlib, hmac, time

def from_chitchat(secret: str, timestamp: str, raw_body: bytes, signature: str) -> bool:
    if not timestamp or not signature or abs(time.time() - int(timestamp)) > 300:
        return False
    mac = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest("sha256=" + mac, signature)
```

> **Warning:** The most common mistake is checking a body that was parsed and turned back into JSON. Even one changed space breaks the signature. Always use the raw body.

## What Chitchat does for you

- **Permissions you choose.** A bot only gets the permissions ticked when it was added, and never more than the person who added it has.
- **No power hand-outs.** Bots can only give roles that grant no permissions, below the person who added them.
- **Private rooms stay private.** Bots see private rooms only when added to them.
- **No bot loops.** Bots don't receive events caused by bots.
- **Safe webhook calls.** Chitchat only calls public `https://` addresses. Every call checks that the address doesn't point inside a private network, doesn't follow redirects, and gives up after 5 seconds.
- **Only bots post embeds.** A person can't fake a bot's card.
- **Rate limits** on the Bot API (120 calls a minute per bot) and on slash commands (8 per person every 30 seconds).
- **Automatic switch-off** after 10 failed deliveries in a row, so a broken bot doesn't keep failing.
- **Everything is logged.** Adding, changing and removing plugins shows up in the server's audit log, and so does everything Automod does.

## Treat input as untrusted

Anything in an event or interaction was typed by a person. Don't run it as code, don't put it into database queries without parameters, and be careful when you repeat it back (for example, a name could contain `@everyone`; Chitchat won't let bots ping everyone, but your own systems might not be so forgiving).
