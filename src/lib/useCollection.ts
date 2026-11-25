import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

/**
 * CRUD over a workspace-scoped table. In demo/guest mode it works on local seed data kept
 * in this browser only (clearly labelled DEMO in the UI); signed in, it persists to Postgres.
 */
export function useCollection<T extends { id: string }>(table: string, demoSeed: () => T[], orderBy: string) {
  const { session, workspace, demoGuest } = useAuth()
  const persistent = !!supabase && !!session && !!workspace && !demoGuest
  const storageKey = `demo:${table}`
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (!persistent) {
      let seed: T[] | null = null
      try { seed = JSON.parse(localStorage.getItem(storageKey) || 'null') } catch { /* ignore */ }
      setItems(seed ?? demoSeed())
      setLoading(false)
      return
    }
    const { data, error } = await supabase!.from(table).select('*').eq('workspace_id', workspace!.id).order(orderBy)
    if (error) setError(error.message)
    setItems((data as T[]) ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistent, table, workspace?.id])

  useEffect(() => { load() }, [load])

  const saveLocal = (next: T[]) => {
    setItems(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const upsert = async (item: Partial<T> & { id?: string }) => {
    if (!persistent) {
      const id = item.id ?? `local-${crypto.randomUUID()}`
      const exists = items.some((i) => i.id === id)
      saveLocal(exists ? items.map((i) => (i.id === id ? { ...i, ...item, id } : i)) : [...items, { ...(item as T), id }])
      return
    }
    const row = { ...item, workspace_id: workspace!.id }
    if (!row.id) delete row.id
    const { data, error } = await supabase!.from(table).upsert(row).select().single()
    if (error) throw new Error(error.message)
    setItems((cur) => (cur.some((i) => i.id === data.id) ? cur.map((i) => (i.id === data.id ? data : i)) : [...cur, data]))
  }

  const remove = async (id: string) => {
    if (!persistent) { saveLocal(items.filter((i) => i.id !== id)); return }
    const { error } = await supabase!.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    setItems((cur) => cur.filter((i) => i.id !== id))
  }

  return { items, loading, error, persistent, upsert, remove, reload: load }
}
