// Drawing Duel: battle-cry lines for champions without a recording (Chitbots, House champions, and anyone with no
// microphone). The browser reads them aloud with speechSynthesis (audio.js); the referee only stores the text. All
// original, all nonsense. Shared by the referee, so keep it plain data.
export const CRIES = [
  'Fear my fluffy fury!',
  'I have eaten four crackers and I regret nothing!',
  'Prepare to be gently bonked!',
  'My pillow has a name, and that name is Doom!',
  'I was born in a laundry basket!',
  'Feathers! Everywhere! Forever!',
  'You smell like a damp biscuit!',
  'I trained for this in my nap!',
  'Behold my extremely soft wrath!',
  'Snack time is over!',
  'I am the duvet you fear!',
  'Bonk first, apologise never!',
  'My grandma could fluff harder than you, and she is a teapot!',
  'Tonight, we feast on crumbs!',
  'I do my own stunts, badly!',
  'Pillow up, buttercup!',
  'I have socks on my hands and fire in my heart!',
  'Witness the forbidden cushion technique!',
  'I have the high ground, it is a beanbag!',
  'Squish! Squash! Squoosh!',
  'Who left this sock here? It was me! For battle!',
  'My bedtime is in five minutes, let us make this quick!',
  'You cannot defeat the sleepy one!',
  'I will tuck you in so hard!',
  'This pillow is full of bees! No it is not! Or is it!',
  'Ready the marshmallows!',
  'I am one hundred percent fluff and zero percent plan!',
  'Hold my cocoa!',
  'The blanket fort will never fall!',
  'I came here to bonk and nibble toast, and I am all out of toast!',
  'Boop! Boop! Bonk!',
  'My cushion is legally a weapon in three kitchens!',
  'Do not test my naptime!',
  'I have been fluffed and I am ready!',
  'Mum said it is my turn on the pillow!',
  'Fluff around and find out!',
]

export const MAX_CRY_TEXT = 90

// A typed battle cry, made safe: plain text, one line, capped. '' when there's nothing left.
export function cleanCryText(s) {
  if (s == null) return ''
  if (typeof s !== 'string') throw new Error('That battle cry is not text.')
  return s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CRY_TEXT)
}

// A line nobody at the table has shouted yet (while there are any), picked with the referee's seeded rand.
export function pickCry(rand = Math.random, said = []) {
  const fresh = CRIES.map((_, i) => i).filter(i => !said.includes(i))
  const pool = fresh.length ? fresh : CRIES.map((_, i) => i)
  return pool[Math.floor(rand() * pool.length) % pool.length]
}

// About how long a speech voice takes to say a line (the bout waits this long before the next champion speaks).
export const speechMs = text => Math.round(900 + 62 * String(text || '').length)
