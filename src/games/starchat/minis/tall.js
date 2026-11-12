// Phone-in-portrait check for the minigame views that switch to a tall field (Lantern Lift, Teacup Tap, Owl Says).
import { useEffect, useState } from 'react'

const Q = '(max-aspect-ratio: 4/5)'
export function useTall() {
  const [tall, setTall] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(Q).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia(Q), on = () => setTall(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return tall
}

// A requestAnimationFrame loop that calls fn every frame while mounted.
export function useFrame(fn, deps) {
  useEffect(() => {
    let raf
    const loop = () => { fn(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export const TINTS = ['#f2a65a', '#8f8fe0', '#7cc4a4', '#e7787f', '#f2c14e', '#9ccbe0', '#c49ad8', '#b9784a']
