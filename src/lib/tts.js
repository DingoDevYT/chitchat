// Pure helpers for stadium chat: TTS text, voice picking and speech-bubble timing (tested in tts.test.js).

export const STALE_MS = 15000 // TTS lines older than this are skipped instead of read out late
export const isStale = (createdAt, now = Date.now()) => now - new Date(createdAt).getTime() > STALE_MS

// How long a speech bubble stays up: longer text, longer bubble.
export const bubbleMs = text => Math.min(9000, 3000 + 50 * (text || '').length)

// One tidy line for a bubble, cut at a word boundary.
export function clip(text, n = 90) {
  const s = (text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= n) return s
  const cut = s.slice(0, n), sp = cut.lastIndexOf(' ')
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, '') + '…'
}

// What gets read aloud: no links, markdown symbols, spoilers or custom-emoji codes; capped so nobody filibusters.
export function speakable(text) {
  return (text || '')
    .replace(/\|\|[\s\S]*?\|\|/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/<?:[a-z_][\w~-]*:\d*>?/gi, ' ')
    .replace(/[*_~`>#|]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 300)
}

// The sender's chosen voice if this device has it, else one in the same language (exact, then base language), else null (browser default).
export function pickVoice(voices, name, lang) {
  if (!voices?.length) return null
  const base = l => (l || '').toLowerCase().split(/[-_]/)[0]
  return voices.find(v => v.name === name) ||
    (lang && (voices.find(v => v.lang?.toLowerCase() === lang.toLowerCase()) || voices.find(v => base(v.lang) === base(lang)))) || null
}

// Split for real-voice TTS: Chrome stops utterances after ~15 s, so speak sentence-sized pieces back to back.
export function chunkSpeech(text, max = 180) {
  const out = []
  for (const sentence of (text || '').match(/[^.!?…]+[.!?…]*\s*/g) || []) {
    let s = sentence.trim()
    while (s.length > max) {
      const cut = s.lastIndexOf(' ', max)
      const at = cut > max * 0.5 ? cut : max
      out.push(s.slice(0, at).trim())
      s = s.slice(at).trim()
    }
    if (!s) continue
    // glue short bits onto the previous piece so speech doesn't stutter between tiny chunks
    if (out.length && out[out.length - 1].length + s.length + 1 <= max) out[out.length - 1] += ' ' + s
    else out.push(s)
  }
  return out
}
