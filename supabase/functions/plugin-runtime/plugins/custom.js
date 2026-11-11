// No-code custom commands (saved by public.save_custom_commands). Chit answers them.
import { renderTemplate } from '../shared.js'

export default {
  command({ def, options, user, server, room, rng }) {
    const vars = { user: user.display_name, mention: '@' + user.username, server: server.name, room: room?.name ?? '', args: options.text ?? '' }
    const r = s => (s ? renderTemplate(s, vars, rng) : undefined)
    const e = def.embed
    return {
      content: r(def.reply) || '',
      embeds: e ? [{ title: r(e.title)?.slice(0, 256), description: r(e.description), color: e.color }] : [],
      ephemeral: !!def.ephemeral,
    }
  },
}
