import { ICONS } from './icons.js'

// One of Starchat's inline SVG icons (decorative: the text beside it says what it is).
export const Ic = ({ n, className = '' }) => (
  <svg className={`sc-i ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: ICONS[n] || '' }} />
)
