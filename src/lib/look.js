import { prefs } from './store'

// Night (default) / Day / Match system → <html data-theme="night|day">, which styles.css reads.
// index.html sets the first value before paint; this keeps it in sync with Settings and the OS.
const mq = matchMedia('(prefers-color-scheme: light)')
export const resolveLook = (look, systemLight) => (look === 'day' || (look === 'system' && systemLight) ? 'day' : 'night')

function apply() {
  const theme = resolveLook(prefs.get().look, mq.matches)
  if (document.documentElement.dataset.theme === theme) return
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'day' ? '#fbf5e4' : '#162833')
}

export function startLook() {
  apply()
  prefs.subscribe(apply)
  mq.addEventListener('change', apply)
}
