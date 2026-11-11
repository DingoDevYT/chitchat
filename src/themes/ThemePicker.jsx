import { THEMES } from '../lib/themes'
import { ThemeThumb } from './ThemeBackdrop'
import '../styles/themes.css'

// Grid of theme choices with live mini previews. value: theme id or null (inherit).
// allowInherit: show "Inherit" first; inheritLabel says where it would come from, e.g. "Server: Beach day".
export default function ThemePicker({ value, onChange, allowInherit, inheritLabel, disabled }) {
  const opts = [...(allowInherit ? [{ id: null, name: 'Inherit' }] : []), ...THEMES]
  const cur = value ?? (allowInherit ? null : 'none')
  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme">
      {opts.map(t => {
        const on = cur === t.id
        return (
          <button key={t.id ?? 'inherit'} type="button" role="radio" aria-checked={on} disabled={disabled}
            className={`theme-opt${on ? ' on' : ''}`} onClick={() => onChange(t.id)} title={t.id === null ? inheritLabel : t.name}>
            <span className="theme-thumb-box">{t.id === null ? <span className="theme-inherit" /> : <ThemeThumb theme={t.id} />}</span>
            <span className="theme-opt-name">{t.name}</span>
            {t.id === null && inheritLabel && <span className="theme-opt-sub">{inheritLabel}</span>}
          </button>
        )
      })}
    </div>
  )
}
