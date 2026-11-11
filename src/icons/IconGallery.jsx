import Icon from './Icon'
import { ICONS } from './paths'

// Dev-only review sheet at #/icons (wired in main.jsx): every icon at small→large sizes on night and cream.
const SIZES = [14, 16, 20, 24, 32]
const THEMES = [['night', '#1f2440', '#f3e9d2'], ['cream', '#fbf3e2', '#4b3a2a']]

export default function IconGallery() {
  const names = Object.keys(ICONS)
  return (
    <div style={{ height: '100%', overflow: 'auto', font: '600 12px system-ui, sans-serif' }}>
      {THEMES.map(([id, bg, ink]) => (
        <section key={id} data-theme-sample={id} style={{ background: bg, color: ink, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px' }}>Chitchat doodles · {id} · {names.length} icons</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {names.map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, outline: `1px dashed ${ink}33` }}>
                {SIZES.map(s => <Icon key={s} name={n} size={s} />)}
                <span style={{ opacity: 0.75, marginLeft: 'auto' }}>{n}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14, marginTop: 16 }}>In text: <Icon name="pin" size="1.15em" /> pinned · <Icon name="gallery" size="1.15em" /> gallery ·
            <Icon name="lock" size="1.15em" /> private · <Icon name="live" size="1.15em" /> live · <Icon name="stadium" size="1.15em" /> in Hangout</p>
        </section>
      ))}
    </div>
  )
}
