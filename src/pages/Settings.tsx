import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { RefreshCw, Unplug, CheckCircle2, XCircle, Loader2, FlaskConical, KeyRound, Users } from 'lucide-react'
import { Instagram, Youtube } from '../components/icons'
import { formatDistanceToNow } from 'date-fns'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { callFunction, supabase, supabaseUrl } from '../lib/supabase'
import { Card, PageHeader, PlatformBadge, Empty } from '../components/ui'
import type { Platform } from '../lib/types'

interface Status { meta: boolean; google: boolean; openai: boolean; encryption: boolean; app_url: string | null }

export default function Settings() {
  const { session, workspace, demoGuest } = useAuth()
  const { dataset, isDemo, hasLive, demoPreferred, setDemoPreferred, reload } = useData()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<Status | null>(null)
  const [statusErr, setStatusErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([])
  const live = !!supabase && !!session && !demoGuest
  const accounts = live && hasLive ? (isDemo && demoPreferred ? [] : dataset.accounts) : []

  useEffect(() => {
    const c = params.get('connected'), e = params.get('error')
    if (c) { setFlash({ ok: true, text: `Connected ${params.get('count') ?? ''} ${c === 'instagram' ? 'Instagram account(s)' : 'YouTube channel(s)'}. First sync has started.` }); setDemoPreferred(false); reload() }
    if (e) setFlash({ ok: false, text: decodeURIComponent(e) })
    if (c || e) setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!live) return
    callFunction<Status>('api', { action: 'status' }).then(setStatus).catch((e) => setStatusErr(e.message))
    if (workspace) supabase!.from('workspace_members').select('user_id, role').eq('workspace_id', workspace.id).then(({ data }) => setMembers(data ?? []))
  }, [live, workspace])

  const connect = async (platform: Platform) => {
    setBusy(`connect-${platform}`)
    try {
      const { url } = await callFunction<{ url: string }>('api', { action: 'start', platform, return_to: window.location.href.split('#')[0] })
      window.location.href = url
    } catch (e) { setFlash({ ok: false, text: (e as Error).message }); setBusy(null) }
  }
  const sync = async (account_id?: string) => {
    setBusy(`sync-${account_id ?? 'all'}`)
    try {
      const r = await callFunction<{ results: { account: string; ok: boolean; error?: string; items?: number }[] }>('api', { action: 'sync', account_id })
      const bad = r.results.filter((x) => !x.ok)
      setFlash(bad.length ? { ok: false, text: bad.map((b) => `${b.account}: ${b.error}`).join(' · ') } : { ok: true, text: `Synced ${r.results.length} account(s).` })
      await reload()
    } catch (e) { setFlash({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }
  const disconnect = async (account_id: string) => {
    if (!window.confirm) return
    setBusy(`dc-${account_id}`)
    try { await callFunction('api', { action: 'disconnect', account_id }); await reload(); setFlash({ ok: true, text: 'Account disconnected and its tokens deleted.' }) }
    catch (e) { setFlash({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const Check = ({ ok, label }: { ok?: boolean; label: string }) => (
    <li className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 size={15} className="text-good" /> : <XCircle size={15} className="text-ink-mute" />}<span className={ok ? '' : 'text-ink-soft'}>{label}</span></li>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Settings & Integrations" subtitle="Connect accounts, check API setup and manage DEMO mode" />
      {flash && <div className={clsx('rounded-lg p-3 text-sm', flash.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>{flash.text}</div>}

      {!live ? (
        <Card title="You are exploring the DEMO">
          <p className="text-sm text-ink-soft">Sign in with your account to connect Instagram and YouTube. Everything you see now is sample data.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {(['instagram', 'youtube'] as Platform[]).map((p) => {
              const ready = p === 'instagram' ? status?.meta : status?.google
              return (
                <Card key={p}>
                  <div className="flex items-start gap-3">
                    <span className={clsx('rounded-lg p-2', p === 'instagram' ? 'bg-ig-soft text-ig' : 'bg-yt-soft text-yt')}>{p === 'instagram' ? <Instagram size={20} /> : <Youtube size={20} />}</span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold">{p === 'instagram' ? 'Instagram (Meta Graph API)' : 'YouTube (Data + Analytics API)'}</h3>
                      <p className="mt-0.5 text-xs text-ink-mute">{p === 'instagram' ? 'Business or Creator accounts linked to a Facebook Page. You can connect several at once.' : 'Sign in with the Google account that owns or manages the channel. Repeat for each channel.'}</p>
                      <button className="btn-primary mt-3" disabled={!ready || !!busy} onClick={() => connect(p)}>
                        {busy === `connect-${p}` && <Loader2 size={14} className="animate-spin" />}Connect {p === 'instagram' ? 'Instagram' : 'YouTube'}
                      </button>
                      {status && !ready && <p className="mt-2 text-xs text-warn">{p === 'instagram' ? 'META_APP_ID and META_APP_SECRET' : 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'} are not set in Supabase yet. See the setup guide.</p>}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          <Card title="Connected accounts" action={accounts.length > 0 && <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => sync()} disabled={!!busy}>{busy === 'sync-all' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Sync all now</button>} pad={false}>
            {accounts.length === 0 ? <Empty title="No accounts connected yet" body="Connect Instagram or YouTube above. Until then the dashboard shows DEMO data." /> : (
              <ul className="divide-y divide-line">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-3">
                      {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-stone-200" />}
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">{a.display_name ?? a.handle}<PlatformBadge p={a.platform} withLabel={false} /></div>
                        <div className="text-xs text-ink-mute">{a.handle} · {a.last_synced_at ? `synced ${formatDistanceToNow(new Date(a.last_synced_at))} ago` : 'not synced yet'}</div>
                        {a.status !== 'active' && <div className="text-xs text-bad">{a.status === 'needs_reauth' ? 'Access expired. Reconnect this account.' : a.last_error}</div>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => sync(a.id)} disabled={!!busy}>{busy === `sync-${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Sync</button>
                      <button className="btn-ghost px-2.5 py-1.5 text-xs text-bad" onClick={() => disconnect(a.id)} disabled={!!busy}><Unplug size={12} />Disconnect</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title="API configuration" subtitle="Secrets live only in Supabase edge functions, never in this page" action={<KeyRound size={16} className="text-ink-mute" />}>
              {statusErr ? <p className="text-xs text-bad">Could not reach the integrations function: {statusErr}</p> : !status ? <Loader2 size={16} className="animate-spin text-ink-mute" /> : (
                <ul className="space-y-1.5">
                  <Check ok={status.encryption} label="Token encryption key (TOKEN_ENCRYPTION_KEY)" />
                  <Check ok={status.meta} label="Meta app (Instagram)" />
                  <Check ok={status.google} label="Google OAuth client (YouTube)" />
                  <Check ok={status.openai} label="OpenAI key (AI Strategist, ideas, reports)" />
                  <Check ok={!!status.app_url} label={`App URL ${status.app_url ? `(${status.app_url})` : '(APP_URL)'}`} />
                </ul>
              )}
              <p className="mt-3 break-all text-xs text-ink-mute">OAuth redirect URI to register with Meta and Google: <code className="rounded bg-stone-100 px-1">{supabaseUrl}/functions/v1/api/oauth-callback</code></p>
            </Card>
            <Card title="Workspace" action={<Users size={16} className="text-ink-mute" />}>
              <p className="text-sm"><span className="text-ink-soft">Name:</span> {workspace?.name}</p>
              <p className="text-sm"><span className="text-ink-soft">Your role:</span> <span className="capitalize">{workspace?.role}</span></p>
              <p className="mt-2 text-xs text-ink-mute">{members.length} member(s). Roles: owner, admin, editor (plans content), viewer (read only). Adding teammates is ready in the database and will get an invite screen in a later phase.</p>
            </Card>
          </div>
        </>
      )}

      <Card title="DEMO mode" action={<FlaskConical size={16} className="text-amber-600" />}>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm text-ink-soft">{hasLive ? 'Show sample data instead of your real accounts (useful for demos and screenshots).' : 'DEMO data is shown automatically until you connect an account.'}</span>
          <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={isDemo} disabled={!hasLive || demoGuest} onChange={(e) => setDemoPreferred(e.target.checked)} />
        </label>
      </Card>
    </div>
  )
}
