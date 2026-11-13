// Island Builders's little filled icons (24x24 SVG bodies), shared by the HUD sprite and the 3D island's tile badges and dock signs.
export const SYMBOLS = {
  twig: '<path d="M3 21 19 5" stroke="#8a5a34" stroke-width="3.2" stroke-linecap="round"/><path d="M10 14l6 1.5M7.5 16.5 6.5 10" stroke="#8a5a34" stroke-width="2.2" stroke-linecap="round"/><path d="M18 6c1-3 4-3.5 4-3.5s.5 3.5-2.5 4.5c-1.2.4-1.8-.2-1.5-1z" fill="#6fb06a"/>',
  wool: '<g fill="#fbf6ea" stroke="#b8ad94" stroke-width="1.6"><circle cx="8" cy="13" r="5"/><circle cx="16" cy="13" r="5"/><circle cx="12" cy="9" r="5"/><circle cx="12" cy="15.5" r="4.5"/></g><path d="M9 11.5c1.5-1 4.5-1 6 0" stroke="#d8cdb4" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  clay: '<rect x="3" y="12" width="9" height="6" rx="1.6" fill="#c8693f"/><rect x="12.5" y="12" width="9" height="6" rx="1.6" fill="#b85a33"/><rect x="7.5" y="5.5" width="9" height="6" rx="1.6" fill="#d9804f"/><path d="M5 14.5h4M14.5 14.5h4M9.5 8h4" stroke="#f3b48c" stroke-width="1.2" stroke-linecap="round"/>',
  berry: '<circle cx="8" cy="15" r="4.2" fill="#a54a82"/><circle cx="15.5" cy="15.5" r="4.2" fill="#8f3c70"/><circle cx="12" cy="9.5" r="4.2" fill="#b65a93"/><circle cx="10.5" cy="8.3" r="1.1" fill="#fff" opacity=".7"/><path d="M12 5.5c1-2.5 4-3 5-2.5-1 2-3 2.8-5 2.5z" fill="#6fb06a"/>',
  tea: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#5f9a4f"/><path d="M5 19 15 9M9 15l-.5-3.5M12 12l3 .5" stroke="#cfe8b8" stroke-width="1.5" stroke-linecap="round"/>',
  house: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="10" y="14" width="4" height="7" rx="1" fill="#fff" opacity=".8"/>',
  lodge: '<path d="M2 10 12 2.5 22 10v10.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill="currentColor"/><rect x="16" y="3.5" width="3" height="5" fill="currentColor"/><rect x="5" y="11" width="3.2" height="3.2" rx=".6" fill="#fff" opacity=".8"/><rect x="15.8" y="11" width="3.2" height="3.2" rx=".6" fill="#fff" opacity=".8"/><rect x="10.3" y="14" width="3.4" height="7.5" rx="1" fill="#fff" opacity=".8"/>',
  path: '<rect x="2" y="9" width="20" height="6" rx="2" fill="currentColor" transform="rotate(-25 12 12)"/><path d="M7 14.5 6 9.5M12 12.2l-1-5M17 10l-1-5" stroke="#fff" stroke-width="1.3" opacity=".6" transform="rotate(-5 12 12)"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><g fill="#fff"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="16" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="8" cy="16" r="1.7"/></g>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cards: '<rect x="3" y="6" width="11" height="15" rx="2.5" fill="currentColor" opacity=".55" transform="rotate(-10 8 13)"/><rect x="9" y="4" width="11" height="15" rx="2.5" fill="currentColor"/><path d="M14.5 8.5c1.2-1.4 3.4 0 1.8 1.8L14.5 12l-1.8-1.7c-1.6-1.8.6-3.2 1.8-1.8z" fill="#fff" opacity=".8"/>',
  moon: '<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z" fill="currentColor"/>',
  star: '<path d="M12 2l2.6 6.6L21 9.3l-5 4.5 1.5 7L12 17.3 6.5 20.8 8 13.8 3 9.3l6.4-.7z" fill="currentColor"/>',
  check: '<path d="M5 12.5 10 17 19 7" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  leaf: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="currentColor"/>',
  basket: '<path d="M3 10h18l-2 10a1.5 1.5 0 0 1-1.5 1.2h-11A1.5 1.5 0 0 1 5 20z" fill="currentColor"/><path d="M7 10l3-6M17 10l-3-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 13v5M12 13v5M16 13v5" stroke="#fff" stroke-width="1.4" opacity=".55"/>',
  anchor: '<circle cx="12" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V21M7 11h10M4 14c0 4 4 7 8 7s8-3 8-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  raccoon: '<path d="M4 4l4 4M20 4l-4 4" stroke="#6b6f7a" stroke-width="3" stroke-linecap="round"/><ellipse cx="12" cy="13" rx="9" ry="7.5" fill="#9aa0aa"/><path d="M3.5 12c2-2.5 5.5-2.5 8.5 0 3-2.5 6.5-2.5 8.5 0-1.5 2.5-5.5 3-8.5 1-3 2-7 1.5-8.5-1z" fill="#3a3a44"/><circle cx="8.3" cy="12.2" r="1.3" fill="#fff"/><circle cx="15.7" cy="12.2" r="1.3" fill="#fff"/><ellipse cx="12" cy="17" rx="2" ry="1.4" fill="#3a3a44"/>',
}

// An icon as a standalone SVG data URL (for drawing onto canvas textures).
export const iconUrl = (k, size = 96) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" color="#4a3324">${SYMBOLS[k]}</svg>`)}`
