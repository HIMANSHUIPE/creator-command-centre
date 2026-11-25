// Authenticated actions for the Settings page: status, start OAuth, sync, disconnect.
import { cors, json } from './cors.ts'
import { HttpError, requireUser } from './supabase.ts'
import { igAuthorizeUrl } from './instagram.ts'
import { ytAuthorizeUrl } from './youtube.ts'
import { syncAccount } from './sync.ts'

const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/api/oauth-callback`

function allowedReturn(url: string | undefined) {
  const allowed = (Deno.env.get('APP_URL') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!url) return allowed[0] ?? null
  const ok = allowed.some((a) => url.startsWith(a)) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
  return ok ? url : allowed[0] ?? null
}

export async function handleIntegrations(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    if (action === 'status') {
      await requireUser(req, 'viewer')
      const has = (k: string) => !!Deno.env.get(k)
      return json({
        meta: has('META_APP_ID') && has('META_APP_SECRET') && has('TOKEN_ENCRYPTION_KEY'),
        google: has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET') && has('TOKEN_ENCRYPTION_KEY'),
        openai: has('OPENAI_API_KEY'),
        encryption: (Deno.env.get('TOKEN_ENCRYPTION_KEY') ?? '').length >= 32,
        app_url: Deno.env.get('APP_URL') ?? null,
      })
    }

    if (action === 'start') {
      const { user, workspaceId, db } = await requireUser(req, 'admin')
      const platform = body.platform
      if (platform !== 'instagram' && platform !== 'youtube') throw new HttpError(400, 'Unknown platform')
      if (platform === 'instagram' && !Deno.env.get('META_APP_ID')) throw new HttpError(400, 'Meta app is not configured (META_APP_ID)')
      if (platform === 'youtube' && !Deno.env.get('GOOGLE_CLIENT_ID')) throw new HttpError(400, 'Google OAuth is not configured (GOOGLE_CLIENT_ID)')
      if (!Deno.env.get('TOKEN_ENCRYPTION_KEY')) throw new HttpError(400, 'TOKEN_ENCRYPTION_KEY is not set')
      const state = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '')
      await db.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString())
      const { error } = await db.from('oauth_states').insert({ state, user_id: user.id, workspace_id: workspaceId, platform, redirect_to: allowedReturn(body.return_to) })
      if (error) throw new Error(error.message)
      const url = platform === 'instagram' ? igAuthorizeUrl(state, redirectUri()) : ytAuthorizeUrl(state, redirectUri())
      return json({ url })
    }

    if (action === 'sync') {
      const { workspaceId, db } = await requireUser(req, 'editor')
      let q = db.from('social_accounts').select('id, display_name, handle').eq('workspace_id', workspaceId).neq('status', 'disconnected')
      if (body.account_id) q = q.eq('id', body.account_id)
      const { data: accounts } = await q
      const results = []
      for (const a of accounts ?? []) {
        const r = await syncAccount(db, a.id)
        results.push({ account: a.display_name ?? a.handle, ...r })
      }
      return json({ results })
    }

    if (action === 'disconnect') {
      const { workspaceId, db } = await requireUser(req, 'admin')
      const { error } = await db.from('social_accounts').delete().eq('id', body.account_id).eq('workspace_id', workspaceId)
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    throw new HttpError(400, 'Unknown action')
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    console.error(e)
    return json({ error: (e as Error).message }, status)
  }
}
