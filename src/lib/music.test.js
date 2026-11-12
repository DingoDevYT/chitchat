import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTrackUrl, validTrack, titleFromFile, titleFromSc, clockOffset, position, isOver, correction, fmtTime,
  votesNeeded, canSkipNow, skipStatus, voteSkips, musicGain, anyoneTalking, glide, parseMusicCommand, DUCK,
} from './music.js'

test('parseTrackUrl: YouTube in all its shapes', () => {
  const yt = { kind: 'yt', src: 'dQw4w9WgXcQ' }
  for (const u of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123',
    'youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    '<https://youtu.be/dQw4w9WgXcQ>',
    'http://youtu.be/dQw4w9WgXcQ',
  ]) assert.deepEqual(parseTrackUrl(u), yt, u)
  assert.ok(parseTrackUrl('https://www.youtube.com/watch?v=short').error)
  assert.ok(parseTrackUrl('https://www.youtube.com/@somechannel').error)
  assert.ok(parseTrackUrl('https://youtu.be/').error)
})

test('parseTrackUrl: SoundCloud, audio files, and what it refuses', () => {
  assert.deepEqual(parseTrackUrl('https://soundcloud.com/artist-name/cool-track'), { kind: 'sc', src: 'https://soundcloud.com/artist-name/cool-track' })
  assert.deepEqual(parseTrackUrl('https://m.soundcloud.com/artist/track/?in=x'), { kind: 'sc', src: 'https://soundcloud.com/artist/track' })
  assert.deepEqual(parseTrackUrl('https://soundcloud.com/artist/sets/summer'), { kind: 'sc', src: 'https://soundcloud.com/artist/sets/summer' })
  assert.ok(parseTrackUrl('https://soundcloud.com/artist').error)
  assert.ok(parseTrackUrl('https://soundcloud.com/discover/sets').error)
  assert.match(parseTrackUrl('https://on.soundcloud.com/abc').error, /full track link/)
  assert.deepEqual(parseTrackUrl('https://example.com/music/song.MP3?x=1'), { kind: 'audio', src: 'https://example.com/music/song.MP3?x=1' })
  const media = 'https://nilludyavkfqwastghmw.supabase.co/storage/v1/object/public/media/u/1/tune'
  assert.deepEqual(parseTrackUrl(media), { kind: 'audio', src: media })
  assert.ok(parseTrackUrl('https://example.com/page').error)
  assert.ok(parseTrackUrl('javascript:alert(1)').error)
  assert.ok(parseTrackUrl('ftp://x.com/a.mp3').error)
  assert.ok(parseTrackUrl('').error)
  assert.ok(parseTrackUrl('not a link at all').error)
})

test('validTrack mirrors music_track_ok', () => {
  assert.ok(validTrack({ kind: 'yt', src: 'dQw4w9WgXcQ', title: 'Song', art: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', dur: 212 }))
  assert.ok(validTrack({ kind: 'sc', src: 'https://soundcloud.com/a/b', title: 'x', art: 'https://i1.sndcdn.com/artworks-1.jpg' }))
  assert.ok(validTrack({ kind: 'audio', src: 'https://a.com/b.mp3', title: 'x', art: null, dur: null }))
  assert.ok(!validTrack({ kind: 'yt', src: 'nope', title: 'x' }))
  assert.ok(!validTrack({ kind: 'audio', src: 'http://a.com/b.mp3', title: 'x' }))
  assert.ok(!validTrack({ kind: 'audio', src: 'https://a.com/b c.mp3', title: 'x' }))
  assert.ok(!validTrack({ kind: 'yt', src: 'dQw4w9WgXcQ', title: '   ' }))
  assert.ok(!validTrack({ kind: 'yt', src: 'dQw4w9WgXcQ', title: 'x'.repeat(201) }))
  assert.ok(!validTrack({ kind: 'yt', src: 'dQw4w9WgXcQ', title: 'x', art: 'https://evil.com/pixel.gif' }))
  assert.ok(!validTrack({ kind: 'yt', src: 'dQw4w9WgXcQ', title: 'x', dur: 0 }))
  assert.ok(!validTrack({ kind: 'mp4', src: 'https://a.com/b.mp3', title: 'x' }))
  assert.ok(!validTrack(null))
})

test('titles from files and SoundCloud slugs', () => {
  assert.equal(titleFromFile('my_cool_song.mp3'), 'my cool song')
  assert.equal(titleFromFile('Lo-fi beats (v2).flac'), 'Lo-fi beats (v2)')
  assert.equal(titleFromFile('.mp3'), 'Untitled song')
  assert.equal(titleFromSc('https://soundcloud.com/cozy-band/rainy_day-mix'), 'cozy band · rainy day mix')
})

test('clock offset and synced position', () => {
  // We sent at 1000, got the answer at 1200; the server said 51100 → it's 50000 ms ahead of us.
  assert.equal(clockOffset(1000, 1200, 51100), 50000)
  const st = { track: { id: 't', dur: 200 }, started_at: 10_000, paused_at: null }
  assert.equal(position(st, 10_000), 0)
  assert.equal(position(st, 40_500), 30.5)
  assert.equal(position(st, 9_000), 0) // a clock a hair behind never goes negative
  assert.equal(position(st, 999_999), 200) // clamped to the song length
  assert.equal(position({ ...st, paused_at: 25_000 }, 99_000), 15) // paused: frozen where it stopped
  assert.equal(position({ ...st, track: { id: 't' } }, 1_000_000), 990) // unknown length: no clamp
  assert.equal(position({}, 5), null)
  assert.equal(position(null, 5), null)
  assert.equal(isOver(st, 10_000 + 200_400), false)
  assert.equal(isOver(st, 10_000 + 200_600), true)
  assert.equal(isOver({ ...st, paused_at: 20_000 }, 999_999), false)
  assert.equal(isOver({ ...st, track: { id: 't' } }, 999_999), false)
})

test('correction: seek when far off, glide when close, rest when in sync', () => {
  assert.deepEqual(correction(10, 12), { seek: 12 })
  assert.deepEqual(correction(13.5, 12), { seek: 12 })
  assert.deepEqual(correction(NaN, 12), { seek: 12 })
  assert.deepEqual(correction(12.05, 12, { canRate: true }), { rate: 1 })
  assert.deepEqual(correction(12.5, 12), { rate: 1 }) // a player that can't change speed just lives with half a second
  const ahead = correction(12.5, 12, { canRate: true }).rate, behind = correction(11.5, 12, { canRate: true }).rate
  assert.ok(ahead < 1 && ahead >= 0.95, `ahead ${ahead}`)
  assert.ok(behind > 1 && behind <= 1.05, `behind ${behind}`)
  assert.equal(correction(12.9, 12, { canRate: true }).rate, 0.95) // capped at 5%
})

test('fmtTime', () => {
  assert.equal(fmtTime(0), '0:00')
  assert.equal(fmtTime(65.9), '1:05')
  assert.equal(fmtTime(3725), '1:02:05')
  assert.equal(fmtTime(null), '--:--')
  assert.equal(fmtTime(Infinity), '--:--')
})

test('vote to skip: strict majority, instant for the queuer and mods', () => {
  assert.equal(votesNeeded(1), 1)
  assert.equal(votesNeeded(2), 2)
  assert.equal(votesNeeded(3), 2)
  assert.equal(votesNeeded(4), 3)
  assert.equal(votesNeeded(0), 1)
  const track = { id: 't', by: 'ana' }
  assert.equal(canSkipNow(track, 'ana', false), true)
  assert.equal(canSkipNow(track, 'bo', false), false)
  assert.equal(canSkipNow(track, 'bo', true), true)
  assert.equal(canSkipNow(null, 'bo', true), false)
  assert.deepEqual(skipStatus({ track, skips: ['cy'] }, 'bo', 4, false), { votes: 1, need: 3, voted: false, instant: false })
  assert.deepEqual(skipStatus({ track, skips: ['cy', 'bo'] }, 'bo', 1, false), { votes: 2, need: 2, voted: true, instant: false })
  assert.equal(voteSkips([], 'bo', 1), true) // alone: your vote is the majority
  assert.equal(voteSkips([], 'bo', 2), false)
  assert.equal(voteSkips(['cy'], 'bo', 3), true)
  assert.equal(voteSkips(['cy'], 'cy', 3), false) // voting twice counts once
  assert.equal(voteSkips(['cy', 'dee'], 'bo', 6), false)
  assert.equal(voteSkips(['cy', 'dee'], 'bo', 5), true)
})

test('music gain: volume, mute, deafen, ducking', () => {
  assert.equal(musicGain({ vol: 0.8 }), 0.8)
  assert.equal(musicGain({ vol: 0.8, talking: true }), 0.8 * DUCK)
  assert.equal(musicGain({ vol: 0.8, talking: true, duck: false }), 0.8)
  assert.equal(musicGain({ vol: 0.8, muted: true }), 0)
  assert.equal(musicGain({ vol: 0.8, deafened: true }), 0)
  assert.equal(musicGain({ vol: 3 }), 1)
  assert.equal(anyoneTalking(new Map([['a', 0], ['b', 0.02]])), false)
  assert.equal(anyoneTalking(new Map([['a', 0], ['b', 0.3]])), true)
  assert.equal(anyoneTalking(new Map()), false)
  assert.equal(glide(1, 0.3) < 1 && glide(1, 0.3) > 0.3, true)
  assert.equal(glide(0.305, 0.3), 0.3)
})

test('parseMusicCommand', () => {
  assert.deepEqual(parseMusicCommand('/play https://youtu.be/dQw4w9WgXcQ'), { cmd: 'play', arg: 'https://youtu.be/dQw4w9WgXcQ' })
  assert.deepEqual(parseMusicCommand('/P  youtu.be/x '), { cmd: 'play', arg: 'youtu.be/x' })
  assert.ok(parseMusicCommand('/play').error)
  assert.deepEqual(parseMusicCommand('/skip'), { cmd: 'skip' })
  assert.deepEqual(parseMusicCommand('/queue'), { cmd: 'queue' })
  assert.deepEqual(parseMusicCommand('/np'), { cmd: 'queue' })
  assert.equal(parseMusicCommand('/skip to the good part'), null)
  assert.equal(parseMusicCommand('/player'), null)
  assert.equal(parseMusicCommand('play something'), null)
  assert.equal(parseMusicCommand('/shrug'), null)
})
