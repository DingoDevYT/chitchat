// The Chef: a deadpan head chef. "Yes Chef." to every @mention (very rarely something else),
// plus /chef special, /chef rate, /chef menu and /chef 86. Pure, so it's unit-tested (src/lib/plugins.test.js).
import { seeded } from '../shared.js'

const pick = (list, rng) => list[Math.floor(rng() * list.length)]
const fill = (tpl, thing) => tpl.split('{thing}').join(thing) // not .replaceAll: "$&" in the thing would be special

const RARE = ['Yes Chef!', 'Heard, Chef.', 'Yes Chef. Behind!', 'Oui, Chef.', 'Yes Chef. Hands!', 'Yes Chef. (wipes station)',
  'Corner! ...Yes Chef.', 'YES CHEF.', 'Yes Chef. Two minutes.', 'Yes Chef. Plating now.']

export function mentionReply(rng, variations = true) {
  return variations && rng() < 0.03 ? pick(RARE, rng) : 'Yes Chef.'
}

const STYLE = ['Deconstructed', 'Slightly haunted', 'Artisanal', 'Twice-forgotten', 'Sous-vide', 'Emotionally supportive', 'Hand-foraged',
  'Reverse-seared', 'Extremely confident', 'Grandma-approved', 'Midnight', 'Slow-roasted', 'Unreasonably fancy', 'Tiny', 'Award-pending']
const MAIN = ['toast', 'cereal soup', 'lasagna tower', 'pancake stack', 'grilled cheese', 'spaghetti nest', 'ice cube', 'peanut butter sandwich',
  'baked potato', 'dumplings', 'cinnamon roll', 'taco', 'cup noodles', 'omelette', 'cheese wheel']
const SIDE = ['regret foam', 'microgreens', 'a single pea', 'mashed potatoes shaped like a duck', 'smooth jazz', 'garlic bread (mandatory)',
  'a light drizzle of confidence', 'pickles nobody asked for', 'crispy onion confetti', 'a gravy waterfall', 'three (3) croutons',
  'the good ketchup', 'a sprig of parsley for emotional balance']
const SAYS = ['Order it.', 'It is perfect. Do not ask questions.', 'It took nine hours. Eat it slowly.', 'Comes with a free nod of approval.',
  'Pairs well with water.', 'Best eaten while it is still warm and you are still hungry.']
const STARTERS = ['Soup of the moment', 'Bread, but warm', 'A very small salad', 'Mozzarella sticks (respectfully)', 'Nachos, architecturally sound',
  'Six (6) fries, plated']
const DESSERTS = ['Creme brulee you get to crack yourself', 'A cloud of whipped cream', 'Brownie, still gooey', 'Lemon tart with attitude',
  'Ice cream: three scoops, no regrets']
const DRINKS = ['Sparkling water, very sparkling', 'Hot cocoa with too many marshmallows', 'Lemonade, squeezed by the Chef personally',
  'Iced tea, sweet like grandma makes it', 'Tap water (artisanal)']
const GOLD = '#ffd166'

// Same special all day in a server, a new one at midnight UTC.
export function special(serverId, date = new Date()) {
  const r = seeded(serverId + date.toISOString().slice(0, 10))
  const dish = `${pick(STYLE, r)} ${pick(MAIN, r)}`
  const side = pick(SIDE, r)
  const price = r() < 0.15 ? 'Market price (vibes)' : `$${4 + Math.floor(r() * 36)}.99`
  return { embeds: [{ title: "Today's special", description: `**${dish}**\nwith ${side}`, color: GOLD,
    fields: [{ name: 'Price', value: price, inline: true }, { name: 'Chef says', value: pick(SAYS, r), inline: true }],
    footer: { text: 'Changes at midnight (UTC). No substitutions.' } }] }
}

const BANDS = [
  [0, ['Raw. Back to the pan.', 'I have notes. All of them say "no".', 'This is not food. This is a cry for help, and the help is salt.']],
  [3, ['Needs salt. Needs love. Needs a second attempt.', 'The idea is there. The flavour is on holiday.', 'Edible. Technically.']],
  [5, ['Respectable. I would eat this on a Tuesday.', 'Solid. Not exciting, but solid.', 'Fine. Tasty, even. Do not let it go to your head.']],
  [8, ['Very good. Somebody in this kitchen can cook.', 'Clean plate. Well done.', 'I am not crying. It is the onions.']],
  [10, ['Perfect. Frame it.', 'This is why I got into this business.', 'Ten. Do not touch it. Do not change a thing.']],
]

// The same thing always gets the same score, so nobody can reroll their way to a 10.
export function rate(thing) {
  const t = String(thing ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Nothing'
  if (/^(the )?chef$|^(you|yourself)$/i.test(t)) return { content: `**${t}**: 11/10. Obviously.` }
  const r = seeded(t.toLowerCase())
  const score = Math.floor(r() * 11)
  const band = BANDS.findLast(([min]) => score >= min)[1]
  return { content: `**${t}**: ${score}/10. ${pick(band, r)}` }
}

export function menu(kitchen, rng) {
  return { embeds: [{ title: `Tonight at ${String(kitchen).slice(0, 60)}`, color: GOLD,
    fields: [
      { name: 'Starter', value: pick(STARTERS, rng) },
      { name: 'Main', value: `${pick(STYLE, rng)} ${pick(MAIN, rng)} with ${pick(SIDE, rng)}` },
      { name: 'Dessert', value: pick(DESSERTS, rng) },
      { name: 'Drink', value: pick(DRINKS, rng) },
    ],
    footer: { text: 'Every dish comes with a side of "Yes Chef."' } }] }
}

const OUT = ['**86 {thing}!** We are out. Nobody order {thing}.', '**86 {thing}!** Off the menu. Wipe it from the board.',
  '**86 {thing}!** Gone. It never existed. Move on.', '**86 {thing}!** If anyone asks, it was a seasonal item.']
export function eightySix(thing, rng) {
  const t = String(thing ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'everything'
  return { content: fill(pick(OUT, rng), t) }
}

export default {
  command({ name, options, config, server, rng }) {
    if (name === 'chef special') return special(server.id)
    if (name === 'chef rate') return rate(options.thing)
    if (name === 'chef menu') return menu(config.kitchen || server.name, rng)
    if (name === 'chef 86') return eightySix(options.thing, rng)
    return null
  },
  event({ event, data, config, rng }) {
    if (event === 'bot_mentioned') return { content: mentionReply(rng, config.variations !== false), reply_to: data.message.id }
    return null
  },
}
