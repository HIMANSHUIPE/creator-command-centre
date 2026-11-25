// Daily sync. pg_cron calls POST /api/cron with the x-cron-secret header; this fans out one
// invocation per account (each gets its own time budget) by calling /api/cron?account=<id>.
import { admin } from './supabase.ts'
import { syncAccount } from './sync.ts'

export async function handleCron(req: Request) {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 })
  const db = admin()
  const one = new URL(req.url).searchParams.get('account')
  if (one) {
    const r = await syncAccount(db, one)
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
  }
  const { data: accounts } = await db.from('social_accounts').select('id').in('status', ['active', 'error'])
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/api/cron`
  const calls = (accounts ?? []).map((a) => fetch(`${base}?account=${a.id}`, { method: 'POST', headers: { 'x-cron-secret': secret } }).catch(() => null))
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(Promise.all(calls))
  return new Response(JSON.stringify({ queued: accounts?.length ?? 0 }), { headers: { 'Content-Type': 'application/json' } })
}
