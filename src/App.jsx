import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { unlockAudio } from './lib/animalese'
import Auth from './Auth'
import Shell from './Shell'
import { Critter } from './Avatar'
import DialogHost, { askText, tell } from './Dialog'

// children: a message (and retry) when loading failed; Chit stops chattering then
export function Splash({ children }) {
  return <div className="splash"><div className="col" style={{ alignItems: 'center', textAlign: 'center' }}>
    <Critter size={96} color="#ff9f6b" talk={!children} />{children}</div></div>
}

export default function App() {
  const [session, setSession] = useState(undefined)

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
    {session === undefined ? <Splash /> : !session ? <Auth /> : <Shell key={session.user.id} userId={session.user.id} />}
    <DialogHost />
  </>
}
