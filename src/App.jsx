import { Component, lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { unlockAudio } from './lib/animalese'
import Auth from './Auth'
import Shell from './Shell'
import { Critter } from './Avatar'
import DialogHost, { askText, tell } from './Dialog'

// Plugin docs at #/docs (readable signed out too); its own chunk, loaded only when opened.
const Docs = lazy(() => import('./Docs'))
const isDocs = () => location.hash.startsWith('#/docs')

// children: a message (and retry) when loading failed; Chit stops chattering then
export function Splash({ children }) {
  return <div className="splash"><div className="col" style={{ alignItems: 'center', textAlign: 'center' }}>
    <Critter size={96} color="#ff9f6b" talk={!children} />{children}</div></div>
}

// A render crash takes down only its own pane (root: the whole app shows a calm Chit) instead of blanking the page.
// Pane "Reload" just remounts that pane; the root one reloads the page.
export class Boundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error(err, info.componentStack) }
  render() {
    if (!this.state.err) return this.props.children
    const say = <p className="muted">Oops, something here tripped over its own feet.</p>
    if (this.props.root) return <Splash>{say}<button className="btn primary" onClick={() => location.reload()}>Reload</button></Splash>
    return <div className="welcome"><div className="welcome-card pop">
      <Critter size={64} color="#ff9f6b" />{say}<button className="btn primary" onClick={() => this.setState({ err: null })}>Reload</button></div></div>
  }
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [docs, setDocs] = useState(isDocs)
  useEffect(() => {
    const on = () => setDocs(isDocs())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      // outside the callback: awaiting the dialog in it would hold supabase's auth lock and stall every other request
      if (event === 'PASSWORD_RECOVERY') setTimeout(async () => {
        const password = await askText({ text: 'Choose a new password (at least 6 characters):', type: 'password', minLength: 6, confirm: 'Save password' })
        if (password) {
          const { error } = await supabase.auth.updateUser({ password })
          await tell(error ? error.message : 'Password updated!')
        }
      })
    })
    // Browsers only allow audio after a gesture, so unlock it on the first one.
    const unlock = () => unlockAudio()
    addEventListener('pointerdown', unlock, { once: true })
    addEventListener('keydown', unlock, { once: true })
    return () => data.subscription.unsubscribe()
  }, [])

  return <>
    {docs ? <Suspense fallback={<Splash />}><Docs /></Suspense> : session === undefined ? <Splash /> : !session ? <Auth /> : <Shell key={session.user.id} userId={session.user.id} />}
    <DialogHost />
  </>
}
