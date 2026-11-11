import test from 'node:test'
import assert from 'node:assert/strict'
import { checkOptions, cleanCommands, cleanEmbeds, coerceOption, renderTemplate, safeEqual, seeded, sign, verify, sha256Hex, InvalidInput }
  from '../../supabase/functions/plugin-runtime/shared.js'
import chef, { eightySix, mentionReply, menu, rate, special } from '../../supabase/functions/plugin-runtime/plugins/chef.js'
import custom from '../../supabase/functions/plugin-runtime/plugins/custom.js'
import { findCommand, optionLabel, parseCommand, suggest } from './slash.js'
import { automodRule, mentionHandles, norm, wordsRx } from './automod.js'
import { docHref, inline, renderMarkdown, searchDocs } from './docsmd.js'

const fixed = v => () => v

test('renderTemplate fills variables, random picks, and leaves unknown braces', () => {
  const vars = { user: 'Pip', mention: '@pip', server: "Pip's place", args: 'cake' }
  assert.equal(renderTemplate('Hi {user} from {server}! {args}', vars), "Hi Pip from Pip's place! cake")
  assert.equal(renderTemplate('{random:a|b|c}', vars, fixed(0)), 'a')
  assert.equal(renderTemplate('{random:a|b|c}', vars, fixed(0.99)), 'c')
  assert.equal(renderTemplate('{random:hi {user}|yo}', vars, fixed(0)), 'hi Pip')
  assert.equal(renderTemplate('{nope} {USER}', vars), '{nope} Pip')
  assert.equal(renderTemplate('x'.repeat(5000), vars).length, 4000)
})

test('cleanEmbeds keeps safe fields, trims, and refuses bad shapes', () => {
  const [e] = cleanEmbeds([{ title: 'T'.repeat(300), color: 0xffd166, url: 'http://insecure.example', fields: [{ name: 'a', value: 'b', inline: 1 }],
    image: { url: 'https://img.example/x.png' }, footer: 'foot', junk: 1 }])
  assert.equal(e.title.length, 256)
  assert.equal(e.color, '#ffd166')
  assert.equal(e.url, undefined)
  assert.deepEqual(e.fields, [{ name: 'a', value: 'b', inline: true }])
  assert.deepEqual(e.image, { url: 'https://img.example/x.png' })
  assert.deepEqual(e.footer, { text: 'foot' })
  assert.equal(e.junk, undefined)
  assert.equal(cleanEmbeds([{ description: 'x', color: 'FFD166' }])[0].color, '#ffd166')
  assert.deepEqual(cleanEmbeds(null), [])
  assert.throws(() => cleanEmbeds({}), InvalidInput)
  assert.throws(() => cleanEmbeds([{ color: '#fff000' }]), /needs a title/)
  assert.throws(() => cleanEmbeds(Array(6).fill({ title: 'x' })), /up to 5/)
})

test('cleanCommands validates names, options and order', () => {
  const [c] = cleanCommands([{ name: ' Dice  Roll ', description: 'Roll', options: [{ name: 'sides', type: 'integer', required: true }, { name: 'note' }] }])
  assert.equal(c.name, 'dice roll')
  assert.deepEqual(c.options.map(o => [o.name, o.type, o.required]), [['sides', 'integer', true], ['note', 'string', false]])
  assert.throws(() => cleanCommands([{ name: 'Bad Name Here' }]), /bad command name/)
  assert.throws(() => cleanCommands([{ name: 'a' }, { name: 'a' }]), /two commands/)
  assert.throws(() => cleanCommands([{ name: 'a', options: [{ name: 'x' }, { name: 'y', required: true }] }]), /required options before/)
  assert.throws(() => cleanCommands([{ name: 'a', options: [{ name: 'x', type: 'date' }] }]), /type must be/)
  assert.throws(() => cleanCommands({}), /list/)
})

test('coerceOption and checkOptions type values and catch missing ones', () => {
  assert.equal(coerceOption({ name: 'n', type: 'integer' }, ' 42 '), 42)
  assert.throws(() => coerceOption({ name: 'n', type: 'integer' }, '4.2'), /whole number/)
  assert.equal(coerceOption({ name: 'b', type: 'boolean' }, 'Yes'), true)
  assert.equal(coerceOption({ name: 'u', type: 'user' }, '@Mochi'), 'mochi')
  assert.equal(coerceOption({ name: 'c', type: 'string', choices: ['Red', 'Blue'] }, 'blue'), 'Blue')
  assert.throws(() => coerceOption({ name: 'c', type: 'string', choices: ['Red'] }, 'green'), /one of: Red/)
  const cmd = { name: 'chef rate', options: [{ name: 'thing', type: 'string', required: true }] }
  assert.deepEqual(checkOptions(cmd, { thing: 'soup' }), { options: { thing: 'soup' } })
  assert.match(checkOptions(cmd, {}).error, /needs thing/)
  assert.match(checkOptions(cmd, { thing: 'x', other: 1 }).error, /no option called other/)
})

test('signatures: sign, verify, stale timestamps and tampering', async () => {
  const body = '{"type":"ping"}', ts = String(Math.floor(Date.now() / 1000))
  const sig = 'sha256=' + await sign('ccs_secret', ts, body)
  assert.match(sig, /^sha256=[0-9a-f]{64}$/)
  assert.equal(await verify('ccs_secret', ts, body, sig), true)
  assert.equal(await verify('ccs_other', ts, body, sig), false)
  assert.equal(await verify('ccs_secret', ts, body + ' ', sig), false)
  assert.equal(await verify('ccs_secret', String(Number(ts) - 600), body, 'sha256=' + await sign('ccs_secret', String(Number(ts) - 600), body)), false)
  // known vector (Node's crypto.createHmac): HMAC-SHA256("key", "1.x")
  assert.equal(await sign('key', '1', 'x'), 'fc4913c41a7bf793267e2a384f3261c9436ec2cd097bd745e7b0d99113f510ec')
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('seeded random is repeatable and in [0, 1)', () => {
  const a = seeded('x'), b = seeded('x'), c = seeded('y')
  const xs = [a(), a(), a()]
  assert.deepEqual(xs, [b(), b(), b()])
  assert.notDeepEqual(xs, [c(), c(), c()])
  assert.ok(xs.every(v => v >= 0 && v < 1))
})

test('The Chef: Yes Chef., rare variations, stable ratings and specials', () => {
  assert.equal(mentionReply(fixed(0.5)), 'Yes Chef.')
  assert.notEqual(mentionReply(fixed(0.01)), 'Yes Chef.')
  assert.equal(mentionReply(fixed(0.01), false), 'Yes Chef.')
  let other = 0
  const r = seeded('chef')
  for (let i = 0; i < 2000; i++) if (mentionReply(r) !== 'Yes Chef.') other++
  assert.ok(other > 20 && other < 120, `variations should be rare (got ${other}/2000)`)
  assert.equal(rate('pizza').content.split('**')[2], rate(' Pizza ').content.split('**')[2]) // same score and comment
  assert.match(rate('pizza').content, /^\*\*pizza\*\*: \d{1,2}\/10\. /)
  assert.match(rate('the chef').content, /11\/10/)
  const d = new Date('2026-11-12T10:00:00Z')
  assert.deepEqual(special('srv', d), special('srv', new Date('2026-11-12T23:00:00Z')))
  assert.equal(special('srv', d).embeds[0].title, "Today's special")
  assert.equal(menu('Pip Bistro', seeded('m')).embeds[0].title, 'Tonight at Pip Bistro')
  assert.match(eightySix('pineapple $&', fixed(0)).content, /^\*\*86 pineapple \$&!\*\*/)
  const ev = chef.event({ event: 'bot_mentioned', data: { message: { id: 7 } }, config: {}, rng: fixed(0.9) })
  assert.deepEqual(ev, { content: 'Yes Chef.', reply_to: 7 })
  assert.equal(chef.event({ event: 'member_joined', data: {}, config: {}, rng: fixed(0) }), null)
  assert.equal(chef.command({ name: 'chef menu', options: {}, config: { kitchen: '' }, server: { id: 's', name: 'Srv' }, rng: fixed(0) }).embeds[0].title, 'Tonight at Srv')
  // every reply is something cleanEmbeds accepts
  for (const out of [special('a'), menu('k', seeded('z'))]) assert.doesNotThrow(() => cleanEmbeds(out.embeds))
})

test('custom commands render replies, embeds and ephemeral', () => {
  const out = custom.command({
    def: { name: 'hug', reply: '{mention} hugs {args}! {random:aww|so sweet}', embed: { title: 'For {user}', color: '#ff9f6b' }, ephemeral: true },
    options: { text: 'mochi' }, user: { username: 'pip', display_name: 'Pip' }, server: { name: 'S' }, room: { name: 'general' }, rng: fixed(0),
  })
  assert.equal(out.content, '@pip hugs mochi! aww')
  assert.deepEqual(out.embeds, [{ title: 'For Pip', description: undefined, color: '#ff9f6b' }])
  assert.equal(out.ephemeral, true)
})

const REG = [
  { install_id: 'i1', plugin: 'The Chef', name: 'chef rate', description: 'Rate', options: [{ name: 'thing', type: 'string', required: true }] },
  { install_id: 'i1', plugin: 'The Chef', name: 'chef special', description: 'Special', options: [] },
  { install_id: 'i2', plugin: 'Dice', name: 'roll', description: 'Roll', options: [{ name: 'sides', type: 'integer', required: true }, { name: 'times', type: 'integer' }, { name: 'note', type: 'string' }] },
  { install_id: 'i3', plugin: 'Custom commands', name: 'chef', description: 'custom', options: [] },
]

test('findCommand prefers the longest name and needs a word boundary', () => {
  assert.equal(findCommand('/chef rate soup', REG).name, 'chef rate')
  assert.equal(findCommand('/chef', REG).name, 'chef')
  assert.equal(findCommand('/chef   special', REG).name, 'chef special')
  assert.equal(findCommand('/chefs', REG), null)
  assert.equal(findCommand('/time', REG), null)
  assert.equal(findCommand('hello /roll', REG), null)
})

test('parseCommand: positional, named, quoted, rest-of-line, errors', () => {
  const rate = REG[0], roll = REG[2], special = REG[1]
  assert.deepEqual(parseCommand('/chef rate a big  pizza!', rate), { options: { thing: 'a big  pizza!' } })
  assert.deepEqual(parseCommand('/chef rate "soup"', rate), { options: { thing: 'soup' } })
  assert.match(parseCommand('/chef rate', rate).error, /needs thing/)
  assert.deepEqual(parseCommand('/roll 6 2 for luck', roll), { options: { sides: 6, times: 2, note: 'for luck' } })
  assert.deepEqual(parseCommand('/roll times:3 20', roll), { options: { sides: 20, times: 3 } })
  assert.deepEqual(parseCommand('/roll 6 note:"two words"', roll), { options: { sides: 6, note: 'two words' } })
  assert.match(parseCommand('/roll six', roll).error, /whole number/)
  assert.match(parseCommand('/chef special extra', special).error, /doesn't take anything/)
  assert.deepEqual(parseCommand('/chef special', special), { options: {} })
})

test('suggest lists matches, then switches to the chosen command', () => {
  assert.equal(suggest('/', REG).items.length, 4)
  assert.deepEqual(suggest('/chef r', REG).items.map(c => c.name), ['chef rate'])
  assert.deepEqual(suggest('/chef', REG).items.map(c => c.name), ['chef', 'chef rate', 'chef special'])
  assert.equal(suggest('/chef hello', REG).cmd.name, 'chef')
  assert.deepEqual(suggest('/sp', REG).items.map(c => c.name), ['chef special'])
  assert.deepEqual(suggest('/dic', REG).items.map(c => c.name), ['roll']) // by plugin name
  assert.equal(suggest('/roll 6', REG).cmd.name, 'roll')
  assert.equal(suggest('/time', REG), null)
  assert.equal(suggest('/', []), null)
  assert.equal(suggest('hi', REG), null)
  assert.equal(optionLabel(REG[2].options[0]), 'sides (whole number)')
  assert.equal(optionLabel(REG[2].options[1]), '[times (whole number)]')
})

// Same cases as the SQL check in supabase/tests/035_plugins_rls.sql, so the preview and the database agree.
test('automod mirror matches the database rules', () => {
  const cfg = { words: ['darn', 'bad*', 'go away'], links: 'all', allow_sites: ['youtube.com'], max_mentions: 2, caps: 70 }
  const cases = {
    'hello there': null, 'D4RN it': 'words', 'd.a.r.n': 'words', daaarn: 'words', darning: null, 'so baaadly': 'words',
    'go   away': 'words', goaway: null, 'see https://www.youtube.com/x': null, 'see https://m.youtube.com/x': null,
    'see https://evil.com': 'links', 'join https://chitchat.app/#/invite/abc': 'invites', 'THIS IS VERY LOUD TEXT': 'caps',
    'Ok fine': null, bad: 'words', abad: null, 'hi @aa @bb @cc': 'mentions', 'hi @aa @bb': null,
  }
  for (const [text, want] of Object.entries(cases)) assert.equal(automodRule(cfg, text), want, text)
  assert.equal(automodRule({ links: 'invites' }, 'https://discord.gg/xyz'), 'invites')
  assert.equal(automodRule({ links: 'off' }, 'https://discord.gg/xyz'), null)
  assert.equal(norm('H3ll0 W0rld!'), 'heiio woridi')
  assert.equal(wordsRx([]), null)
  assert.equal(wordsRx(['*', '  ']), null)
  assert.deepEqual(mentionHandles('@Pip and @pip. and me@mail.com @x'), ['pip'])
})

test('docs markdown: headings, code, callouts, tables, links, escaping', () => {
  const md = '# Title\n\nHello **world** and `code <b>`.\n\n## Part one\n\n> **Tip:** be kind\n\n```js\nconst a = 1 < 2\n```\n\n- one\n- two [link](bot-api.md#errors)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>x</script>'
  const r = renderMarkdown(md, 'intro')
  assert.equal(r.title, 'Title')
  assert.deepEqual(r.toc, [{ id: 'part-one', text: 'Part one', level: 2 }])
  assert.match(r.html, /<h2 id="part-one">Part one<\/h2>/)
  assert.match(r.html, /<code>code &lt;b&gt;<\/code>/)
  assert.match(r.html, /<aside class="docs-callout tip"><b>Tip<\/b><p>be kind<\/p><\/aside>/)
  assert.match(r.html, /<pre><code>const a = 1 &lt; 2<\/code><\/pre>/)
  assert.match(r.html, /<a href="#\/docs\/bot-api\/errors">link<\/a>/)
  assert.match(r.html, /<th>a<\/th>/)
  assert.ok(!r.html.includes('<script>'))
  assert.equal(docHref('javascript:alert(1)', 'x'), '#')
  assert.equal(docHref('#errors', 'bot-api'), '#/docs/bot-api/errors')
  assert.match(inline('[x](https://a.com)'), /target="_blank"/)
  assert.match(renderMarkdown('| v | x |\n|---|---|\n| `{random:a\\|b}` | y |').html, /<td><code>\{random:a\|b\}<\/code><\/td><td>y<\/td>/)
  const hits = searchDocs([{ slug: 'intro', ...r }], 'part')
  assert.equal(hits[0].heading.id, 'part-one')
})
