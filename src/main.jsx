import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Stash invite codes so they survive sign-up / OAuth redirects.
const invite = location.hash.match(/^#\/invite\/([\w-]+)/)
if (invite) {
  try { localStorage.setItem('chitchat:invite', invite[1]) } catch {}
  history.replaceState(null, '', location.pathname + location.search)
}

// A file dropped outside the composer would otherwise make the browser navigate away to open it.
for (const t of ['dragover', 'drop']) addEventListener(t, e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() })

createRoot(document.getElementById('root')).render(<App />)
