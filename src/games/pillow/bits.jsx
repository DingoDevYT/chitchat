// Small shared pieces: a player's face (their avatar, or the Chitbot portrait) and a champion's display name.
import Avatar from '../../Avatar'
import { botChar, botUrl } from '../bots.js'

export function Face({ p, size = 32 }) {
  if (!p) return <span className="pcf-face" style={{ width: size, height: size }} />
  if (p.user_id) return <span className="pcf-face" style={{ width: size, height: size }}><Avatar id={p.user_id} size={size} /></span>
  return <span className="pcf-face bot" style={{ width: size, height: size }}><img src={botUrl(botChar(p.bot, p.seat))} alt="" width={size} height={size} draggable="false" /></span>
}

export const champName = (champ, nm) => champ?.name || (champ?.owner ? `${nm(champ.owner)}'s champion` : 'The House champion')
export const ChampName = ({ champ, nm }) => <>{champName(champ, nm)}</>
