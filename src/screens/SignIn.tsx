import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icon, Logo } from '../components/ui'

type Mode = 'in' | 'up' | 'forgot'

export function SignIn() {
  const [mode, setMode] = useState<Mode>('in')
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
          : 'That email and password don’t match. Check them, or reset your password.' })
      }
    } else if (mode === 'up') {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
      if (error) setMsg({ kind: 'err', text: error.message })
      else if (!data.session) {
        setMsg({ kind: 'ok', text: 'Account created. Tap the confirmation link in your email, then come back and sign in.' })
        setMode('in')
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (error) setMsg({ kind: 'err', text: error.message })
      else setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way. Open it on this phone to set a new password.' })
    }
    setBusy(false)
  }

  const label = mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'

  return (
    <div className="signin">
      <span className="signin-ball" aria-hidden="true"><Icon.ball size={420} /></span>
      <div className="signin-top">
        <Logo size={60} />
        <h1>Rollcall</h1>
        <p>{mode === 'forgot' ? 'Enter your email and we’ll send a link to set a new password.' : 'Take attendance in seconds and see who keeps showing up.'}</p>
      </div>
      <form className="signin-form" onSubmit={submit}>
        <label className="field dark">
          <span>Email</span>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label className="field dark">
            <span>Password</span>
            <input id="password" type="password" required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'up' && <small>At least 8 characters.</small>}
          </label>
        )}
        {msg && <p className={`form-msg ${msg.kind}`} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
        <button type="submit" className="btn accent big" disabled={busy}>{busy ? 'One moment…' : label}</button>
        <div className="switch">
          {mode === 'in' && (
            <>
              <button type="button" className="link on-dark" onClick={() => { setMode('forgot'); setMsg(null) }}>Forgot password?</button>
              <span aria-hidden="true"> · </span>
              <button type="button" className="link on-dark" onClick={() => { setMode('up'); setMsg(null) }}>Create your account</button>
            </>
          )}
          {mode !== 'in' && <button type="button" className="link on-dark" onClick={() => { setMode('in'); setMsg(null) }}>Back to sign in</button>}
        </div>
      </form>
    </div>
  )
}

export function NewPassword({ done }: { done: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="signin">
      <div className="signin-top">
        <Logo size={60} />
        <h1>New password</h1>
        <p>Choose a new password for your Rollcall account.</p>
      </div>
      <form className="signin-form" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null)
        const { error } = await supabase.auth.updateUser({ password })
        setBusy(false)
        if (error) setErr(error.message)
        else { history.replaceState(null, '', '/'); done() }
      }}>
        <label className="field dark">
          <span>New password</span>
          <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <small>At least 8 characters.</small>
        </label>
        {err && <p className="form-msg err" role="alert">{err}</p>}
        <button type="submit" className="btn accent big" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  )
}
