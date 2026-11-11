import { useEffect, useState } from 'react'
import Chat from './Chat'
import { clearBubbles, showBubble, showTyping } from './lib/stadium'
import './styles/stadium-chat.css'
import Icon from './icons/Icon'

const narrow = () => matchMedia('(max-width: 720px)').matches

// A stadium's stage (children) with its text chat beside it: side panel on desktop, bottom sheet on phones.
// The chat stays mounted while hidden so typing dots and speech bubbles keep floating over the stage.
export default function StadiumChat({ channel, ctx, children }) {
  const [open, setOpen] = useState(() => !narrow())
  useEffect(() => clearBubbles, [channel.id])
  return (
    <div className={`stadium-split${open ? ' chat-open' : ''}`}>
      {children}
      {!open && <button className="btn primary small stadium-chat-btn pop" onClick={() => setOpen(true)}><Icon name="chat" size={16} /> Chat</button>}
      <aside className="stadium-chat" aria-label={`${channel.name} chat`} hidden={!open}>
        <Chat key={channel.id} channel={channel} ctx={ctx}
          stadium={{ onType: showTyping, onArrive: showBubble, onClose: () => setOpen(false) }} />
      </aside>
    </div>
  )
}
