// Jetpack Dash volume: a speaker button (tap to mute / unmute) with a slider beside it. Saved per browser.
import { useEffect, useState } from 'react'
import { audioPrefs, flyerAudio } from './sound.js'

export function SoundControl({ className = '' }) {
  const [p, setP] = useState(audioPrefs.get())
  useEffect(() => audioPrefs.sub(setP), [])
  const off = p.mute || p.vol === 0
  const stop = e => e.stopPropagation()
  return (
    <div className={`fly-snd ${className}`} onPointerDown={stop}>
      <button type="button" className="fly-snd-btn" aria-pressed={off} aria-label={off ? 'Unmute game sound' : 'Mute game sound'} title={off ? 'Unmute game sound' : 'Mute game sound'}
        onClick={() => { flyerAudio().unlock(); audioPrefs.set(off ? { mute: false, vol: p.vol || 0.35 } : { mute: true }) }}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {off
            ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            : <><path d="M16 9.5a3.5 3.5 0 010 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />{p.vol > 0.5 && <path d="M18.5 7a7 7 0 010 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}</>}
        </svg>
      </button>
      <input type="range" min="0" max="1" step="0.05" value={p.mute ? 0 : p.vol} aria-label="Game volume"
        onChange={e => { flyerAudio().unlock(); audioPrefs.set({ vol: +e.target.value, mute: false }) }} />
    </div>
  )
}
