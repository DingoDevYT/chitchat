import { THEMES } from '../lib/themes'
import { ThemeThumb } from './ThemeBackdrop'
import '../styles/themes.css'

// Grid of theme choices with live mini previews. value: theme id or null (inherit).
// allowInherit: show "Inherit" first; inheritLabel describes where it would come from, e.g. "from server: Beach day".
export default function ThemePicker({ value, onChange, allowInherit, inheritLabel, disabled }) {
  const opts = [...(allowInherit ? [{ id: null, name: 'Inherit', emoji: '↩️' }] : []), ...THEMES]
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme">
      {opts.map(t => {
        const on = (value ?? null) === t.id || (!allowInherit && value == null && t.id === 'none')
        return (
          <button key={t.id ?? 'inherit'} type="button" role="radio" aria-checked={on} disabled={disabled}
            className={`theme-opt${on ? ' on' : ''}`} onClick={() => onChange(t.id)} title={t.id === null ? inheritLabel : t.name}>
            <span className="theme-thumb-box">{t.id === null ? <span className="theme-inherit">↩</span> : <ThemeThumb theme={t.id} />}</span>
            <span className="theme-opt-name">{t.emoji} {t.name}</span>
            {t.id === null && inheritLabel && <span className="theme-opt-sub">{inheritLabel}</span>}
          </button>
        )
      })}
    </div>
  )
}
