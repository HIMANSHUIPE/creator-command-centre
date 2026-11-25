import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Workspace { id: string; name: string; role: 'owner' | 'admin' | 'editor' | 'viewer' }
interface AuthState {
  session: Session | null
  loading: boolean
  workspace: Workspace | null
  demoGuest: boolean
  enterDemoGuest: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as unknown as AuthState)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [demoGuest, setDemoGuest] = useState(() => {
    try { return sessionStorage.getItem('demoGuest') === '1' } catch { return false }
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setWorkspace(null); return }
    supabase
      .from('workspace_members')
      .select('role, workspaces(id, name)')
      .eq('user_id', session.user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const ws = data?.workspaces as unknown as { id: string; name: string } | undefined
        if (ws) setWorkspace({ id: ws.id, name: ws.name, role: data!.role as Workspace['role'] })
      })
  }, [session])

  const value: AuthState = {
    session, loading, workspace, demoGuest,
    enterDemoGuest: () => { try { sessionStorage.setItem('demoGuest', '1') } catch { /* ignore */ } setDemoGuest(true) },
    signOut: async () => {
      try { sessionStorage.removeItem('demoGuest') } catch { /* ignore */ }
      setDemoGuest(false)
      await supabase?.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
