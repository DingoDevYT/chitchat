import { useEffect } from 'react'
import { ensureProfiles } from './lib/store'
import { blocks, unblock } from './lib/blocks'
import Avatar, { Name } from './Avatar'
import './styles/blocks-links.css'

// Settings → Privacy: everyone you've blocked, with unblock.
export default function Privacy() {
  const ids = Object.keys(blocks.use())
  useEffect(() => { ensureProfiles(ids) }, [ids.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="col">
      <h4>Blocked</h4>
      <p className="muted small">Blocked people's messages are collapsed for you, they can't send you friend requests or start new DMs with you, and you won't hear them in stadiums.</p>
      {ids.length === 0 && <p className="muted small">You haven't blocked anyone.</p>}
      <div className="blocked-list">
        {ids.map(id => (
          <div key={id} className="blocked-row pop">
            <Avatar id={id} size={28} />
            <span><Name id={id} /></span>
            <button className="btn ghost small" onClick={() => unblock(id)}>Unblock</button>
          </div>
        ))}
      </div>
    </div>
  )
}
