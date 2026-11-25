import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getDemoDataset } from '../lib/demo'
import { presetRange, type DateRange } from '../lib/analytics'
import type { Dataset } from '../lib/types'
import { useAuth } from './AuthContext'

interface DataState {
  dataset: Dataset
  isDemo: boolean
  /** true when the user has real connected accounts */
  hasLive: boolean
  loading: boolean
  error: string | null
  demoPreferred: boolean
  setDemoPreferred: (v: boolean) => void
  range: DateRange
  setRange: (r: DateRange) => void
  reload: () => Promise<void>
}

const Ctx = createContext<DataState>(null as unknown as DataState)
export const useData = () => useContext(Ctx)

const EMPTY: Dataset = { accounts: [], daily: [], content: [] }

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, workspace, demoGuest } = useAuth()
  const [live, setLive] = useState<Dataset>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange>(presetRange('30d'))
  const [demoPreferred, setDemoPreferredState] = useState(() => {
    try { return localStorage.getItem('demoPreferred') === '1' } catch { return false }
  })
  const setDemoPreferred = (v: boolean) => {
    try { localStorage.setItem('demoPreferred', v ? '1' : '0') } catch { /* ignore */ }
    setDemoPreferredState(v)
  }

  const reload = useCallback(async () => {
    if (!supabase || !session || !workspace) return
    setLoading(true)
    setError(null)
    try {
      const { data: accounts, error: e1 } = await supabase.from('social_accounts').select('*').eq('workspace_id', workspace.id).order('created_at')
      if (e1) throw new Error(e1.message)
      const ids = (accounts ?? []).map((a) => a.id)
      if (!ids.length) { setLive({ accounts: [], daily: [], content: [] }); return }
      const since = format(subDays(new Date(), 400), 'yyyy-MM-dd')
      const [daily, content] = await Promise.all([
        fetchAll((f, t) => supabase!.from('account_daily_metrics').select('*').in('account_id', ids).gte('date', since).order('date').range(f, t)),
        fetchAll((f, t) => supabase!.from('content_latest').select('*').in('account_id', ids).order('published_at', { ascending: false }).range(f, t)),
      ])
      setLive({ accounts: accounts ?? [], daily: daily as Dataset['daily'], content: content as Dataset['content'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [session, workspace])

  useEffect(() => { reload() }, [reload])

  const hasLive = live.accounts.length > 0
  const isDemo = demoGuest || !supabase || demoPreferred || !hasLive
  const dataset = useMemo(() => (isDemo ? getDemoDataset() : live), [isDemo, live])

  return (
    <Ctx.Provider value={{ dataset, isDemo, hasLive, loading, error, demoPreferred, setDemoPreferred, range, setRange, reload }}>
      {children}
    </Ctx.Provider>
  )
}
