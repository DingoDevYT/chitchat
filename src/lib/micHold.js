// Holding the mic back from the call: while something private records your voice (a Pillow Chit Fight battle cry),
// VoiceConnection stops sending your mic to the call. Your own mute/deafen state is never touched, so releasing the
// hold puts things back exactly as they were. holdMic() returns its release (safe to call more than once).
const holds = new Set(), subs = new Set()
const ping = () => subs.forEach(f => f())

export const micHeld = () => holds.size > 0
export function holdMic() {
  const token = {}
  holds.add(token)
  ping()
  return () => { if (holds.delete(token)) ping() }
}
export const onMicHold = f => { subs.add(f); return () => subs.delete(f) }
