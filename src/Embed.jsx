import { useProfile } from './lib/store'
import Markdown from './Markdown'
import Icon from './icons/Icon'
import './styles/plugins.css'

// Bot embed cards (shape cleaned by cleanEmbeds in supabase/functions/plugin-runtime/shared.js; only bots can post them).
export function Embeds({ list, me }) {
  if (!list?.length) return null
  return <div className="embeds">{list.map((e, i) => <Embed key={i} e={e} me={me} />)}</div>
}

function Embed({ e, me }) {
  return (
    <div className="embed" style={e.color ? { '--embed': e.color } : undefined}>
      <div className="embed-main">
        {e.title && (e.url
          ? <a className="embed-title" href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a>
          : <div className="embed-title">{e.title}</div>)}
        {e.description && <div className="embed-desc"><Markdown text={e.description} me={me} /></div>}
        {e.fields?.length > 0 && (
          <div className="embed-fields">
            {e.fields.map((f, i) => (
              <div key={i} className={`embed-field${f.inline ? ' inline' : ''}`}>
                <div className="embed-field-name">{f.name}</div>
                <div className="embed-field-value"><Markdown text={f.value} me={me} /></div>
              </div>
            ))}
          </div>
        )}
        {e.image && <img className="embed-image" src={e.image.url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        {e.footer && <div className="embed-footer">{e.footer.text}</div>}
      </div>
      {e.thumbnail && <img className="embed-thumb" src={e.thumbnail.url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    </div>
  )
}

// "pip used /chef rate" above a bot's reply to a slash command.
export function InteractionLine({ ix }) {
  const p = useProfile(ix.user_id)
  return (
    <div className="ix-line small">
      <Icon name="sparkle" size={13} /> <b>{p?.display_name || p?.username || 'Someone'}</b> used <code>/{ix.name}</code>
    </div>
  )
}
