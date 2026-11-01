import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icon } from '../components/ui'

export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setMsg({ kind: 'err', text: /confirm/i.test(error.message)
          ? 'Confirm your email first: tap the link we sent you, then sign in here.'
          : 'That email and password don’t match. Check them and try again.' })
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setMsg({ kind: 'err', text: error.message })
      else if (!data.session) {
        setMsg({ kind: 'ok', text: 'Account created. Tap the confirmation link in your email, then come back and sign in.' })
        setMode('in')
      }
    }
    setBusy(false)
  }

  return (
    <div className="signin">
      <span className="signin-ball" aria-hidden="true"><Icon.ball size={420} /></span>
      <div className="signin-top">
        <span className="logo" aria-hidden="true">R</span>
        <h1>Rollcall</h1>
        <p>Take attendance in seconds and see who keeps showing up.</p>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <label className="field dark">
          <span>Email</span>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field dark">
          <span>Password</span>
          <input id="password" type="password" required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === 'up' && <small>At least 8 characters.</small>}
        </label>
        {msg && <p className={`form-msg ${msg.kind}`} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
        <button type="submit" className="btn accent big" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <p className="switch">
          {mode === 'in' ? 'First time? ' : 'Have an account? '}
          <button type="button" className="link on-dark" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
            {mode === 'in' ? 'Create your account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  )
}
