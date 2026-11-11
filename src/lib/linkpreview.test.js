import test from 'node:test'
import assert from 'node:assert/strict'
import { previewLinks } from './linkpreview.js'
import { checkUrl, clean, isPublicIP, parseMeta } from '../../supabase/functions/link-preview/safe.js'

test('previewLinks skips media, code, spoilers, dupes; caps at 3', () => {
  assert.deepEqual(previewLinks('see https://a.com/x#top and https://a.com/x and https://i.com/cat.png'), ['https://a.com/x'])
  assert.deepEqual(previewLinks('`https://code.com` ||https://spoil.com|| ```\nhttps://block.com```'), [])
  assert.deepEqual(previewLinks('**https://b.com** https://c.com https://d.com https://e.com'), ['https://b.com/', 'https://c.com/', 'https://d.com/'])
})

test('isPublicIP refuses private, loopback, link-local, metadata and mapped ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '224.0.0.1', '255.255.255.255', '999.1.1.1', '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:0:4136::1', '2001:db8::1', 'nonsense', '1:2:3'])
    assert.equal(isPublicIP(ip), false, ip)
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e'])
    assert.equal(isPublicIP(ip), true, ip)
})

test('checkUrl allows only http(s) on 80/443 without credentials', () => {
  assert.equal(checkUrl('https://a.com/x#frag').href, 'https://a.com/x')
  assert.equal(checkUrl('http://a.com:443/').hostname, 'a.com')
  assert.equal(checkUrl('http://2130706433/').hostname, '127.0.0.1') // decimal IPs normalise, then fail the IP check
  for (const u of ['ftp://a.com', 'file:///etc/passwd', 'http://a.com:8080', 'http://u:p@a.com', 'javascript:alert(1)', 'nope'])
    assert.throws(() => checkUrl(u), u)
})

test('parseMeta returns plain text and safe urls only', () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Hi &amp; &lt;b&gt;bye&lt;/b&gt;">
    <meta name="description" content='A &lt;script&gt;x&lt;/script&gt; thing'>
    <meta property="og:image" content="/img.png"><meta name="theme-color" content="red;background:url(x)">
    <link rel="shortcut icon" href="javascript:alert(1)"></head><body><meta property="og:title" content="late"></body></html>`
  const p = parseMeta(html, 'https://www.site.com/page')
  assert.equal(p.title, 'Hi & bye')
  assert.equal(p.description, 'A x thing')
  assert.equal(p.image, 'https://www.site.com/img.png')
  assert.equal(p.site_name, 'site.com')
  assert.equal(p.favicon, 'https://www.site.com/favicon.ico')
  assert.equal(p.color, null)
  assert.equal(clean('x'.repeat(10), 5), 'xxxx…')
})
