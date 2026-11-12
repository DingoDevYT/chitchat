import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTrackUrl, validTrack, titleFromFile, titleFromSc, clockOffset, position, isOver, fmtTime,
  votesNeeded, canSkipNow, skipStatus, voteSkips, musicGain, anyoneTalking, glide, parseMusicCommand, DUCK,
  pickOffset, mergeOffset, syncStep, syncMem, SYNC, duckStep, DUCK_ENV, loopOf, nextLoop, rowFrom, radioGone, radioMode,
  nextUp, ytPlayerVars, deckPlan, outputVolume, DEFAULT_MUSIC_VOL, MUSIC_MASTER,
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

test('clock offset: the quickest round trip wins, and a sloppier one never nudges it', () => {
  const best = pickOffset([
    { t0: 0, t1: 400, server: 50_300 },   // rtt 400 → offset 50100
    { t0: 1000, t1: 1040, server: 51_020 }, // rtt 40 → offset 50000
    { t0: 2000, t1: 2900, server: 53_000 }, // rtt 900
    { t0: 5, t1: 4, server: 1 },           // nonsense: negative rtt
    { t0: 0, t1: 9000, server: 1 },        // too slow to trust
  ])
  assert.deepEqual(best, { offset: 50_000, rtt: 40 })
  assert.equal(pickOffset([]), null)
  assert.equal(pickOffset([{ t0: 0, t1: 10, server: NaN }]), null)
  const prev = { offset: 50_000, rtt: 40 }
  assert.equal(mergeOffset(prev, { offset: 50_300, rtt: 600 }), prev) // slow trip: keep the precise one
  assert.deepEqual(mergeOffset(prev, { offset: 50_010, rtt: 60 }), { offset: 50_010, rtt: 60 }) // about as good: take it
  assert.deepEqual(mergeOffset(prev, { offset: 58_000, rtt: 300 }), { offset: 58_000, rtt: 300 }) // clocks really moved
  assert.equal(mergeOffset(null, prev), prev)
  assert.equal(mergeOffset(prev, null), prev)
})

test('syncStep: waits for steady playback, confirms, rate-limits seeks', () => {
  const now = 100_000
  // not steady yet (just started, buffering, just seeked): never acts, however far off
  assert.equal(syncStep(syncMem(), { actual: 0, target: 60, now, steadyFor: 1000 }).seek, undefined)
  // far off once: wait for a second look (a getCurrentTime blip shouldn't cause a seek)
  let r = syncStep(syncMem(), { actual: 10, target: 20, now, steadyFor: 5000 })
  assert.equal(r.seek, undefined)
  assert.equal(r.mem.over, 1)
  r = syncStep(r.mem, { actual: 11, target: 21, now: now + 1000, steadyFor: 6000 })
  assert.equal(r.seek, 21)
  assert.equal(r.mem.lastSeekAt, now + 1000)
  // still far off right after: no second seek within minGapMs, even confirmed
  let m = r.mem
  for (let i = 1; i <= 5; i++) { r = syncStep(m, { actual: 30, target: 40, now: now + 1000 + i * 1000, steadyFor: 5000 }); m = r.mem; assert.equal(r.seek, undefined) }
  r = syncStep(m, { actual: 30, target: 40, now: now + 1000 + SYNC.minGapMs, steadyFor: 5000 })
  assert.equal(r.seek, 40)
  // a blip back in range resets the confirmation count
  r = syncStep({ ...syncMem(), over: 1 }, { actual: 20.5, target: 20, now, steadyFor: 5000 })
  assert.equal(r.mem.over, 0)
  // up to the threshold, YouTube / SoundCloud are left alone (each seek is an audible rebuffer)
  for (const d of [0.5, 1.5, 2.9, -2.9]) {
    r = syncStep(syncMem(), { actual: 20 + d, target: 20, now, steadyFor: 9000 })
    assert.equal(r.seek, undefined, `d=${d}`); assert.equal(r.rate, undefined, `d=${d}`)
  }
  // NaN time counts as far off
  r = syncStep({ ...syncMem(), over: 1 }, { actual: NaN, target: 5, now, steadyFor: 9000 })
  assert.equal(r.seek, 5)
})

test('syncStep: <audio> nudges its speed, with hysteresis', () => {
  const at = (mem, d) => syncStep(mem, { actual: 20 + d, target: 20, now: 1e6, steadyFor: 9000, canRate: true })
  let r = at(syncMem(), 0.2) // under nudgeOn: leave it
  assert.equal(r.rate, 1); assert.equal(r.mem.nudging, false)
  r = at(r.mem, 0.5) // past nudgeOn: slow down a little
  assert.ok(r.rate < 1 && r.rate >= 0.95, `rate ${r.rate}`); assert.equal(r.mem.nudging, true)
  r = at(r.mem, 0.15) // still above nudgeOff: keep nudging (no flapping around one threshold)
  assert.ok(r.rate < 1)
  r = at(r.mem, 0.05) // settled
  assert.equal(r.rate, 1); assert.equal(r.mem.nudging, false)
  assert.ok(at({ ...syncMem(), nudging: true }, -0.5).rate > 1) // behind: speed up
  assert.equal(at({ ...syncMem(), nudging: true }, 2.5).rate, 0.95) // capped at 5%
  r = syncStep({ ...syncMem(), over: 1 }, { actual: 30, target: 20, now: 1e6, steadyFor: 9000, canRate: true })
  assert.deepEqual([r.seek, r.rate], [20, 1]) // a seek resets the speed too
})

test('duck envelope: holds through gaps between words, eases in and out', () => {
  let env = { amount: 0, lastLoud: -Infinity }, t = 0
  const step = loud => { t += 100; env = duckStep(env, { loud, now: t, dt: 100 }); return env.amount }
  assert.ok(step(true) > 0.6) // attack: most of the way in after 100 ms
  assert.equal(step(true), 1) // fully in by ~150 ms
  // a talker's flicker (loud, quiet, loud...) keeps it fully down: no pumping
  for (let i = 0; i < 10; i++) assert.equal(step(i % 3 === 0), 1)
  // silence: held for holdMs, then released over releaseMs
  const quietFrom = t
  while (t - quietFrom < DUCK_ENV.holdMs - 100) assert.equal(step(false), 1)
  const a1 = step(false), a2 = step(false)
  assert.ok(a1 <= 1 && a2 < a1 && a2 > 0.6, `${a1} ${a2}`)
  for (let i = 0; i < 10; i++) step(false)
  assert.equal(env.amount, 0)
  assert.equal(duckStep(undefined, { loud: false, now: 0, dt: 100 }).amount, 0)
  // the gain follows the amount smoothly between full and ducked
  assert.equal(musicGain({ vol: 1, amount: 0 }), 1)
  assert.equal(musicGain({ vol: 1, amount: 1 }), DUCK)
  assert.ok(Math.abs(musicGain({ vol: 1, amount: 0.5 }) - (1 + DUCK) / 2) < 1e-9)
  assert.equal(musicGain({ vol: 1, amount: 1, duck: false }), 1)
})

test('loop modes: off → queue → one → off, missing = off', () => {
  assert.equal(loopOf({}), 'off')
  assert.equal(loopOf(null), 'off')
  assert.equal(loopOf({ loop: 'queue' }), 'queue')
  assert.equal(loopOf({ loop: 'banana' }), 'off')
  assert.equal(nextLoop('off'), 'queue')
  assert.equal(nextLoop('queue'), 'one')
  assert.equal(nextLoop('one'), 'off')
  assert.equal(nextLoop(undefined), 'queue')
})

test('the row and the off switch', () => {
  // before 042 there's no `disabled` column: on
  assert.deepEqual(rowFrom({ state: { track: null }, queue: [] }), { state: { track: null }, queue: [], disabled: false })
  assert.deepEqual(rowFrom(null), { state: {}, queue: [], disabled: false }) // no row yet: an empty radio
  assert.deepEqual(rowFrom({ state: [], queue: 'x', disabled: 'yes' }), { state: {}, queue: [], disabled: false })
  assert.equal(rowFrom({ disabled: true }).disabled, true)
  assert.equal(radioMode(null, true), 'none') // no radio here at all
  assert.equal(radioMode(rowFrom({}), false), 'on')
  assert.equal(radioMode(rowFrom({ disabled: true }), false), 'none') // members don't see a turned-off radio
  assert.equal(radioMode(rowFrom({ disabled: true }), true), 'off') // mods get the chip
  // only "no table / no access" hides the radio; a network blip keeps the row (and the music)
  assert.equal(radioGone({ code: '42P01', message: 'relation "public.stadium_music" does not exist' }), true)
  assert.equal(radioGone({ code: 'PGRST205', message: 'Could not find the table in the schema cache' }), true)
  assert.equal(radioGone({ message: 'TypeError: Failed to fetch' }), false)
  assert.equal(radioGone({ code: '57014', message: 'canceling statement due to statement timeout' }), false)
  assert.equal(radioGone(null), false)
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
  assert.deepEqual(parseMusicCommand('/loop'), { cmd: 'loop' })
  assert.deepEqual(parseMusicCommand('/loop song'), { cmd: 'loop', mode: 'one' })
  assert.deepEqual(parseMusicCommand('/LOOP Queue'), { cmd: 'loop', mode: 'queue' })
  assert.deepEqual(parseMusicCommand('/repeat off'), { cmd: 'loop', mode: 'off' })
  assert.equal(parseMusicCommand('/loop me in on this'), null)
  assert.equal(parseMusicCommand('/looping'), null)
})

test('nextUp: what plays after this song', () => {
  const a = { id: 'a', src: 'A' }, b = { id: 'b', src: 'B' }
  assert.equal(nextUp({ track: a }, [b]), b)
  assert.equal(nextUp({ track: a }, []), null)
  assert.equal(nextUp({ track: a, loop: 'one' }, [b]), a)
  assert.equal(nextUp({ track: a, loop: 'queue' }, [b]), b)
  assert.equal(nextUp({ track: a, loop: 'queue' }, []), a)
  assert.equal(nextUp({}, [b]), b)
  assert.equal(nextUp(null, null), null)
})

test('ytPlayerVars: a hidden, sound-only player', () => {
  const v = ytPlayerVars('https://chit.example')
  assert.equal(v.controls, 0); assert.equal(v.fs, 0); assert.equal(v.rel, 0); assert.equal(v.iv_load_policy, 3)
  assert.equal(v.playsinline, 1); assert.equal(v.disablekb, 1); assert.equal(v.origin, 'https://chit.example')
  assert.equal('origin' in ytPlayerVars(''), false)
})

test('deckPlan: reuse, swap to the cued player, or load', () => {
  assert.equal(deckPlan({ ok: true, vid: 'A' }, null, 'A'), 'reuse')
  assert.equal(deckPlan({ ok: true, vid: 'A' }, { ok: true, vid: 'B' }, 'B'), 'swap')
  assert.equal(deckPlan({ ok: true, vid: 'A' }, { ok: false, vid: 'B' }, 'B'), 'load')
  assert.equal(deckPlan({ ok: true, vid: 'A' }, { ok: true, vid: 'C' }, 'B'), 'load')
  assert.equal(deckPlan(null, null, 'B'), 'load')
  assert.equal(deckPlan({ ok: true, vid: 'A' }, { ok: true, vid: 'B' }, 'B', true), 'load')
})

test('outputVolume: default 20%, and the whole scale halved on the way out', () => {
  assert.equal(DEFAULT_MUSIC_VOL, 0.2)
  assert.equal(MUSIC_MASTER, 0.5)
  assert.equal(outputVolume(1), 0.5)
  assert.equal(outputVolume(0), 0)
  assert.ok(Math.abs(outputVolume(musicGain({ vol: DEFAULT_MUSIC_VOL })) - 0.1) < 1e-9)
  assert.ok(Math.abs(outputVolume(musicGain({ vol: 1, talking: true })) - 0.5 * DUCK) < 1e-9)
  assert.equal(outputVolume(musicGain({ vol: 0.8, muted: true })), 0)
  assert.equal(outputVolume(2), 0.5)
  assert.equal(outputVolume(-1), 0)
})
