import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { unlockAudio } from './lib/animalese'
import Auth from './Auth'
import Shell from './Shell'
import { Critter } from './Avatar'

export function Splash() {
  return <div className="splash"><Critter size={96} color="#ff9f6b" talk /></div>
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        const password = prompt('Choose a new password (at least 6 characters):')
        if (password) {
          const { error } = await supabase.auth.updateUser({ password })
          alert(error ? error.message : 'Password updated!')
        }
      }
    })
    // Browsers only allow audio after a gesture, so unlock it on the first one.
    const unlock = () => unlockAudio()
    addEventListener('pointerdown', unlock, { once: true })
    addEventListener('keydown', unlock, { once: true })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Splash />
  if (!session) return <Auth />
  return <Shell key={session.user.id} userId={session.user.id} />
}
