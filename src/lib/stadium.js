import { createStore, prefs, profiles, setTalking } from './store'
import { blip } from './animalese'
import { bubbleMs, clip, isStale, pickVoice, speakable } from './tts'
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
let busy = false, cancel = null
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
    over = true; cancel = null
    clearInterval(t); clearTimeout(t)
    setTalking(id, false)
    setTimeout(next, 250)
  }
  setTalking(id, true)
  if (voice.tts === 'real' && typeof speechSynthesis !== 'undefined') {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = pickVoice(speechSynthesis.getVoices(), voice.voiceName, voice.voiceLang)
    if (voice.voiceLang) u.lang = voice.voiceLang
    u.pitch = voice.pitch ?? 1
    u.rate = voice.speed ?? 1
    u.volume = Math.min(1, vol)
    u.onend = u.onerror = done
    cancel = () => { speechSynthesis.cancel(); done() }
    t = setTimeout(done, 4000 + text.length * 150) // some browsers never fire onend
    speechSynthesis.speak(u)
  } else {
    let i = 0
    cancel = done
    t = setInterval(() => {
      blip(text[i], voice, { force: true, vol })
      if (++i >= text.length) done()
    }, 55 / (voice.speed || 1))
  }
}
