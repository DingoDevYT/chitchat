// The Chitbots: Nutmeg and friends, an original cast of round critters. Each difficulty has its own three, so a table
// shows "Biscuit" or "Saffron", never "Chitbot (Hard)". The character comes from the seat, so nothing new is stored.
export const CAST = {
  easy: [
    { id: 'doodle', name: 'Doodle', color: '#ffb48a', ears: 'round', extra: 'sprout', blurb: 'Just happy to be here. Plays whatever looks pretty.' },
    { id: 'biscuit', name: 'Biscuit', color: '#f6d37a', ears: 'long', extra: 'bow', blurb: 'Snack first, strategy later.' },
    { id: 'puddle', name: 'Puddle', color: '#9fd0ea', ears: 'round', extra: 'raincap', blurb: 'Splashes in, forgets the rules, has a lovely time.' },
  ],
  normal: [
    // Was "Chit" (the app's mascot name), which made "Chit wins!" read like the app talking. Not "Pip" either: that's
    // the owner's test account.
    { id: 'nutmeg', name: 'Nutmeg', color: '#ff9f6b', ears: 'round', extra: 'none', blurb: 'Plays fair, plays steady.' },
    { id: 'juniper', name: 'Juniper', color: '#8fd1b0', ears: 'pointy', extra: 'scarf', blurb: 'Thinks it over with a cup of tea.' },
    { id: 'marzipan', name: 'Marzipan', color: '#f2a7c3', ears: 'leaf', extra: 'glasses', blurb: 'Keeps tidy notes on everyone.' },
  ],
  hard: [
    { id: 'saffron', name: 'Saffron', color: '#f0a640', ears: 'pointy', extra: 'monocle', blurb: 'Counts every card. Smiles anyway.' },
    { id: 'inkwell', name: 'Inkwell', color: '#6c76c9', ears: 'round', extra: 'tophat', blurb: 'Quiet, polite, rarely loses.' },
    { id: 'thistle', name: 'Thistle', color: '#b597e0', ears: 'tuft', extra: 'scarf', blurb: 'Prickly at the table, sweet after.' },
  ],
}
export const LEVELS = ['easy', 'normal', 'hard']
export const botChar = (level, seat = 0) => { const list = CAST[level] || CAST.normal; return list[((seat % list.length) + list.length) % list.length] }

const ink = '#231d2b'
const EARS = {
  round: c => `<circle cx="16" cy="15" r="9" fill="${c}"/><circle cx="48" cy="15" r="9" fill="${c}"/><circle cx="16" cy="15" r="4" fill="#0002"/><circle cx="48" cy="15" r="4" fill="#0002"/>`,
  long: c => `<ellipse cx="20" cy="9" rx="6" ry="13" fill="${c}" transform="rotate(-12 20 9)"/><ellipse cx="44" cy="9" rx="6" ry="13" fill="${c}" transform="rotate(12 44 9)"/><ellipse cx="20" cy="10" rx="2.6" ry="8" fill="#ff9fb455" transform="rotate(-12 20 10)"/><ellipse cx="44" cy="10" rx="2.6" ry="8" fill="#ff9fb455" transform="rotate(12 44 10)"/>`,
  pointy: c => `<path d="M9 24 14 4 27 16z" fill="${c}"/><path d="M55 24 50 4 37 16z" fill="${c}"/><path d="M13 19 15 9 22 15z" fill="#0002"/><path d="M51 19 49 9 42 15z" fill="#0002"/>`,
  leaf: c => `<path d="M10 22c-4-9 1-17 9-18 2 8-2 14-9 18z" fill="${c}"/><path d="M54 22c4-9-1-17-9-18-2 8 2 14 9 18z" fill="${c}"/><path d="M11 20c3-5 5-9 7-14M53 20c-3-5-5-9-7-14" stroke="#0003" stroke-width="1.2" fill="none"/>`,
  tuft: c => `<circle cx="17" cy="16" r="8" fill="${c}"/><circle cx="47" cy="16" r="8" fill="${c}"/><path d="M27 13c1-6 3-9 5-10 1 3 0 6-1 8 2-3 5-4 7-4-1 3-3 5-6 7z" fill="${c}"/>`,
}
const EXTRA = {
  none: () => '',
  sprout: () => `<path d="M32 13c0-4 0-6 1-8" stroke="#5f9a58" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="28" cy="6" rx="4.5" ry="2.6" fill="#7cc46a" transform="rotate(-25 28 6)"/><ellipse cx="37.5" cy="5.5" rx="4.5" ry="2.6" fill="#7cc46a" transform="rotate(25 37.5 5.5)"/>`,
  bow: () => `<path d="M40 14l-7 4 7 4zM48 14l7 4-7 4z" fill="#e86a8a"/><circle cx="44" cy="18" r="2.6" fill="#c94f70"/>`,
  raincap: () => `<path d="M14 20c2-10 34-10 36 0z" fill="#f2c14e"/><path d="M12 20h40" stroke="#d9a535" stroke-width="3" stroke-linecap="round"/>`,
  scarf: () => `<path d="M14 52c10 6 26 6 36 0l-1 6c-10 5-24 5-34 0z" fill="#e8857a"/><path d="M40 55l4 9h5l-3-10z" fill="#d86f64"/>`,
  glasses: () => `<circle cx="24" cy="34" r="6" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="40" cy="34" r="6" fill="none" stroke="${ink}" stroke-width="2"/><path d="M30 34h4" stroke="${ink}" stroke-width="2"/>`,
  monocle: () => `<circle cx="40" cy="34" r="6.5" fill="#ffffff33" stroke="#c98d1f" stroke-width="2"/><path d="M45 39c2 6 1 10-1 14" stroke="#c98d1f" stroke-width="1.2" fill="none"/>`,
  tophat: () => `<rect x="22" y="2" width="20" height="14" rx="2" fill="${ink}"/><rect x="17" y="14" width="30" height="4" rx="2" fill="${ink}"/><rect x="22" y="11" width="20" height="3" fill="#c8414f"/>`,
}

// The character as a 64×64 SVG (talk: mouth open). Used for DOM portraits and, as a data URL, for the 3D cut-outs.
export function botSvg(c, talk = false) {
  const mouth = talk ? `<ellipse cx="32" cy="45" rx="5" ry="4" fill="${ink}"/>` : `<path d="M27 43 Q32 47 37 43" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
  const eyes = c.extra === 'glasses' || c.extra === 'monocle'
    ? `<ellipse cx="24" cy="34" rx="2.6" ry="3.4" fill="${ink}"/><ellipse cx="40" cy="34" rx="2.6" ry="3.4" fill="${ink}"/>`
    : `<ellipse cx="24" cy="33" rx="3" ry="4" fill="${ink}"/><ellipse cx="40" cy="33" rx="3" ry="4" fill="${ink}"/><circle cx="25" cy="31.5" r="1" fill="#fff"/><circle cx="41" cy="31.5" r="1" fill="#fff"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${EARS[c.ears](c.color)}<circle cx="32" cy="36" r="24" fill="${c.color}"/>` +
    `<ellipse cx="18" cy="42" rx="4" ry="2.5" fill="#ff6b8b55"/><ellipse cx="46" cy="42" rx="4" ry="2.5" fill="#ff6b8b55"/>${eyes}${mouth}${EXTRA[c.extra](c.color)}</svg>`
}
export const botUrl = (c, talk) => 'data:image/svg+xml;utf8,' + encodeURIComponent(botSvg(c, talk))
