import { useState } from 'react'
import { supabase } from './lib/supabase'
import { Critter } from './Avatar'

const here = () => location.origin + location.pathname

export default function Auth() {
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email, password,
        options: { data: { username: username.toLowerCase() }, emailRedirectTo: here() },
      })
    setBusy(false)
    if (error) setMsg({ err: true, text: error.message })
    else if (mode === 'up' && !data.session) setMsg({ text: 'Almost there! Check your email to confirm, then sign in.' })
  }

  async function forgot() {
    if (!email) return setMsg({ err: true, text: 'Type your email first, then click "Forgot password".' })
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: here() })
    setMsg(error ? { err: true, text: error.message } : { text: 'Reset link sent. Check your email.' })
  }

  async function oauth(provider) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: here() } })
    if (error) setMsg({ err: true, text: `${provider} sign-in isn't switched on yet.` })
  }

  return (
    <div className="auth">
      <form className="auth-card pop" onSubmit={submit}>
        <div className="auth-logo"><Critter size={72} color="#ff9f6b" talk={busy} /></div>
        <h1>Chitchat</h1>
        <p className="muted">{mode === 'in' ? 'Welcome back!' : 'Make yourself at home.'}</p>

        <div className="oauth-row">
          <button type="button" className="btn ghost" onClick={() => oauth('google')}>Google</button>
          <button type="button" className="btn ghost" onClick={() => oauth('discord')}>Discord</button>
        </div>
        <div className="divider"><span>or</span></div>

        {mode === 'up' && (
          <label>Username
            <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
              minLength={2} maxLength={32} required autoComplete="username" placeholder="cozy_bean" />
          </label>
        )}
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </label>
        {msg && <div className={msg.err ? 'note err' : 'note'} role="status">{msg.text}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? (mode === 'in' ? 'Signing in…' : 'Creating account…') : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <div className="auth-links">
          <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
            {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          {mode === 'in' && <button type="button" className="link" onClick={forgot}>Forgot password</button>}
        </div>
      </form>
    </div>
  )
}
