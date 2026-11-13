// What the island is waiting for you to tap. The HUD sets it ({ kind, spots, onPick, focus }); the 3D island (Table3D)
// and the flat fallback draw the glowing spots and report taps. A tiny store so Table3D needs no new props from GameScreen.
// focus: the spot chosen in the HUD's "Pick from a list" fallback, drawn with a big ring so you can see where it goes.
import { useSyncExternalStore } from 'react'

const NONE = { kind: null, spots: [], onPick: null, focus: null }
let state = NONE
const subs = new Set()
export const getPick = () => state
export function setPick(next) { state = next ? { focus: null, ...next } : NONE; subs.forEach(f => f()) }
export function setFocus(id) { if (!state.onPick || state.focus === id) return; state = { ...state, focus: id }; subs.forEach(f => f()) }
const sub = f => { subs.add(f); return () => subs.delete(f) }
export const usePick = () => useSyncExternalStore(sub, getPick)
if (import.meta.env?.DEV && typeof window !== 'undefined') window.__islePick = getPick // dev: lets a test script "tap" a spot

// The island tells the HUD where a tile is on screen (CSS px in the table's box), so resource chips can fly from it.
export const screen = { tile: null }
