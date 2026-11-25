import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null when the app is built without Supabase config: the app then runs in DEMO-only mode. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
export const supabaseUrl = url ?? ''

/** Call an edge function with the user's session. Throws with the function's error message. */
export async function callFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json()
        msg = j.error || msg
      }
    } catch { /* keep generic message */ }
    throw new Error(msg)
  }
  return data as T
}
