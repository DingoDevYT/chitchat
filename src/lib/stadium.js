import { createStore, prefs, profiles, setTalking } from './store'
import { blip, audioReady } from './animalese'
import { bubbleMs, chunkSpeech, clip, isStale, pickVoice, speakable } from './tts'
import { isBlocked } from './blocks'

// ── speech bubbles over stage avatars: userId -> { typing: true } | { text, key } ──
export const bubbles = createStore({})
const timers = {}
function setBubble(id, b, ms) {
  if (b && isBlocked(id)) return
  clearTimeout(timers[id])
  bubbles.set(s => { const n = { ...s }; if (b) n[id] = b; else delete n[id]; return n })
  if (b) timers[id] = setTimeout(() => setBubble(id, null), ms)
}
// Typing dots never cover a message bubble that is still up.
export const showTyping = id => { if (!bubbles.get()[id]?.text) setBubble(id, { typing: true }, 4000) }
export const showBubble = row =>
  setBubble(row.author_id, { text: clip((row.content || '').replace(/\|\|[\s\S]*?\|\|/g, '🤫'), 64) || '📎', key: row.id }, bubbleMs(row.content))
export const clearBubbles = () => bubbles.set({})

// ── TTS: one message at a time, read on this device in the sender's chosen voice ──
const queue = []
let busy = false, cancel = null, live = null, lastSpoke = 0
export function speakTTS(row) {
  queue.push(row)
  if (!busy) next()
}
export function stopTTS() {
  queue.length = 0
  cancel?.()
}

function next() {
  const row = queue.shift()
  busy = !!row
  if (!row) return
  const p = prefs.get(), id = row.author_id, text = speakable(row.content)
  if (!text || isStale(row.created_at) || !p.ttsHear || p.muted[id] || p.callMuted?.[id] || isBlocked(id)) return next()
  const voice = profiles.get()[id]?.voice || {}
  const vol = (p.peerVol[id] ?? 1) * p.outVol // per-person call volume × output volume
  let t = null, over = false
  const done = () => {
    if (over) return
    over = true; cancel = null; live = null; lastSpoke = Date.now()
    clearInterval(t); clearTimeout(t)
    setTalking(id, false)
    setTimeout(next, 250)
  }
  setTalking(id, true)
  if (voice.tts === 'real' && typeof speechSynthesis !== 'undefined') {
    const rate = voice.speed ?? 1
    const make = (s, volume = Math.min(1, vol)) => {
      const u = new SpeechSynthesisUtterance(s)
      u.voice = pickVoice(speechSynthesis.getVoices(), voice.voiceName, voice.voiceLang)
      if (voice.voiceLang) u.lang = voice.voiceLang
      u.pitch = voice.pitch ?? 1
      u.rate = rate
      u.volume = volume
      return u
    }
    const parts = chunkSpeech(text).map(s => make(s))
    // Speakers/Bluetooth headsets drop the first syllable while they wake up: lead in with a silent beat if we've been quiet.
    const lead = Date.now() - lastSpoke > 5000 ? [make('.', 0)] : []
    const all = [...lead, ...parts]
    live = all // keep references: Chrome garbage-collects pending utterances and cuts them off mid-sentence
    const last = all[all.length - 1]
    last.onend = done
    all.forEach(u => { u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') done() } })
    cancel = () => { speechSynthesis.cancel(); done() }
    // safety net only (some browsers never fire onend), sized for the voice's speed so it never ends early
    t = setTimeout(done, 5000 + (text.length * 110) / Math.max(0.5, rate))
    if (speechSynthesis.paused) speechSynthesis.resume()
    all.forEach(u => speechSynthesis.speak(u))
  } else {
    let i = 0, stopped = false
    cancel = () => { stopped = true; done() }
    // wait for the audio engine so the first letters aren't swallowed, plus a short lead-in
    audioReady().then(() => setTimeout(() => {
      if (stopped) return
      t = setInterval(() => {
        blip(text[i], voice, { force: true, vol })
        if (++i >= text.length) { clearInterval(t); t = setTimeout(done, 150) } // let the last blip ring out
      }, 55 / (voice.speed || 1))
    }, 80))
  }
}
