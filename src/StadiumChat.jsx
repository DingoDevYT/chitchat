import { useEffect, useState } from 'react'
import Chat from './Chat'
import { clearBubbles, showBubble, showTyping } from './lib/stadium'
import './styles/stadium-chat.css'
import Icon from './icons/Icon'
import { musicCommand } from './Radio'

const narrow = () => matchMedia('(max-width: 720px)').matches

// A stadium's stage (children) with its text chat beside it: side panel on desktop, bottom sheet on phones.
// The chat stays mounted while hidden so typing dots and speech bubbles keep floating over the stage.
export default function StadiumChat({ channel, ctx, children }) {
  // always starts closed: the stage is the point; the Chat button opens it
  const [open, setOpen] = useState(false)
  useEffect(() => clearBubbles, [channel.id])
  return (
    <div className={`stadium-split${open ? ' chat-open' : ''}`}>
      {children}
      {!open && <button className="btn primary small stadium-chat-btn pop" onClick={() => setOpen(true)} aria-label="Open chat" title="Chat"><Icon name="chat" size={16} /><span className="sc-btn-label"> Chat</span></button>}
      <aside className="stadium-chat" aria-label={`${channel.name} chat`} hidden={!open}>
        {/* phones: a grab-tab on the sheet's top edge (the header's close is small and easy to miss there) */}
        <button type="button" className="stadium-chat-close" onClick={() => setOpen(false)} aria-label="Close chat"><Icon name="chevron-down" size={18} /> Close</button>
        <Chat key={channel.id} channel={channel} ctx={ctx}
          stadium={{ onType: showTyping, onArrive: showBubble, onClose: () => setOpen(false), onCommand: text => musicCommand(channel.id, text) }} />
      </aside>
    </div>
  )
}
