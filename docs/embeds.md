# Embeds

An embed is a little card attached to a bot's message: a coloured edge, a title, some text, and optionally fields, a picture and a footer. Only bots can post them.

## A full example

```json
{
  "content": "Here's the forecast!",
  "embeds": [{
    "title": "Weather in Paris",
    "url": "https://example.com/paris",
    "description": "Sunny with a **light breeze**.",
    "color": "#ffd166",
    "fields": [
      { "name": "High", "value": "21°C", "inline": true },
      { "name": "Low", "value": "12°C", "inline": true },
      { "name": "Tip", "value": "Bring sunglasses." }
    ],
    "thumbnail": { "url": "https://example.com/sun.png" },
    "image": { "url": "https://example.com/map.png" },
    "footer": { "text": "Updated 10:20" }
  }]
}
```

## Fields

| Field | Limit | Notes |
|---|---|---|
| `title` | 256 characters | Bold heading. |
| `url` | https only | Makes the title a link. |
| `description` | 4000 characters | Chitchat formatting works: bold, italic, code, links and @mentions. |
| `color` | | The edge colour: `"#ffd166"`, `"ffd166"` or a number like `16765286`. |
| `fields` | up to 25 | Each has `name` (256), `value` (1024) and `inline` (`true` puts fields side by side). |
| `image` | https only | `{ "url": "…" }`, a big picture under the text. |
| `thumbnail` | https only | `{ "url": "…" }`, a small picture on the right. |
| `footer` | 2048 characters | `{ "text": "…" }`, or just a string. Small grey text at the bottom. |

Each message can have up to **5** embeds. An embed needs at least a title, a description, fields or an image. Keep each one under about 6000 characters in total.

## What happens to bad values

Chitchat is forgiving where it can be:

- Text that's too long is cut to the limit.
- Links and pictures that aren't `https://` are dropped (the rest of the embed still shows).
- Unknown fields are ignored.

It refuses the request with `400 bad_request` (and a message saying why) when the shape is wrong: `embeds` isn't a list, an embed isn't an object, there are more than 5, or an embed has nothing to show.

## Embeds without code

Custom commands can have a simple embed too (title, text and colour). Tick **Add an embed card** in the command editor. See the [Quickstart](quickstart.md).

> **Tip:** Pictures load straight from the address you give, so use a host you trust and keep them reasonably small.
