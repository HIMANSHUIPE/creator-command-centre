import { useState } from 'react'
import { Loader2, FlaskConical } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { enterDemoGuest } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setMsg(null)
    const redirect = window.location.href.split('#')[0]
    const res = mode === 'signin' ? await supabase.auth.signInWithPassword({ email, password })
      : mode === 'signup' ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setBusy(false)
    if (res.error) setMsg({ ok: false, text: res.error.message })
    else if (mode === 'signup' && !res.data.session) setMsg({ ok: true, text: 'Check your inbox to confirm your email, then sign in.' })
    else if (mode === 'magic') setMsg({ ok: true, text: 'Check your inbox for a sign-in link.' })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white shadow-card">
            <svg viewBox="0 0 32 32" width="24" height="24"><path d="M7 22l6-7 4 4 8-10" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Creator Command Centre</h1>
          <p className="mt-1 text-sm text-ink-soft">Instagram and YouTube, one private dashboard.</p>
        </div>
        <div className="card p-6">
          {supabase ? (
            <form onSubmit={submit} className="space-y-3">
              <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
              {mode !== 'magic' && <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>}
              {msg && <p className={`text-xs ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a link'}</button>
              <div className="flex justify-between pt-1 text-xs">
                <button type="button" className="text-ink-soft hover:text-ink" onClick={() => setMode(mode === 'magic' ? 'signin' : 'magic')}>{mode === 'magic' ? 'Use password' : 'Email me a sign-in link'}</button>
                <button type="button" className="text-ink-soft hover:text-ink" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'I have an account' : 'Create account'}</button>
              </div>
            </form>
          ) : <p className="text-sm text-ink-soft">This build has no Supabase connection configured, so only DEMO mode is available.</p>}
        </div>
        <button onClick={enterDemoGuest} className="btn-ghost mx-auto mt-4 flex text-xs"><FlaskConical size={14} />Explore the DEMO without signing in</button>
      </div>
    </div>
  )
}
