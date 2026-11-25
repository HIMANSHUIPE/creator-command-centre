// Public OAuth redirect target for Meta and Google. Validates state, stores encrypted tokens,
// creates/updates the connected accounts, kicks off the first sync and sends the user back to the app.
import { admin } from './supabase.ts'
import { encrypt } from './crypto.ts'
import { igExchange, IG_SCOPES } from './instagram.ts'
import { ytExchange, ytMyChannels, YT_SCOPES } from './youtube.ts'
import { syncAccount } from './sync.ts'

const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/api/oauth-callback`
const back = (base: string | null, qs: Record<string, string>) => {
  const target = (base ?? Deno.env.get('APP_URL')?.split(',')[0] ?? '/').replace(/#.*$/, '')
  return Response.redirect(`${target}#/settings?${new URLSearchParams(qs)}`, 302)
}

export async function handleCallback(req: Request) {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const oauthErr = url.searchParams.get('error_description') ?? url.searchParams.get('error_message') ?? url.searchParams.get('error')
  const db = admin()
  if (!state) return new Response('Missing state', { status: 400 })
  const { data: st } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle()
  if (!st) return back(null, { error: 'This sign-in link expired. Please try connecting again.' })
  await db.from('oauth_states').delete().eq('state', state)
  if (Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back(st.redirect_to, { error: 'Sign-in took too long. Please try again.' })
  if (oauthErr || !code) return back(st.redirect_to, { error: oauthErr ?? 'Connection was cancelled.' })

  try {
    const ids: string[] = []
    if (st.platform === 'instagram') {
      const accounts = await igExchange(code, redirectUri())
      if (!accounts.length) return back(st.redirect_to, { error: 'No Instagram Business or Creator account was found. Make sure each Instagram account is a professional account linked to a Facebook Page you manage, and that you selected it during login.' })
      for (const a of accounts) {
        const { data: row, error } = await db.from('social_accounts').upsert({
          workspace_id: st.workspace_id, platform: 'instagram', external_id: a.igId, handle: `@${a.username}`, display_name: a.name, avatar_url: a.avatar ?? null, status: 'active', last_error: null, connected_by: st.user_id,
        }, { onConflict: 'workspace_id,platform,external_id' }).select('id').single()
        if (error) throw new Error(error.message)
        await db.from('oauth_tokens').upsert({ account_id: row.id, access_token_enc: await encrypt(a.pageToken), refresh_token_enc: null, expires_at: null, scopes: IG_SCOPES, updated_at: new Date().toISOString() })
        ids.push(row.id)
      }
    } else {
      const tok = await ytExchange(code, redirectUri())
      const channels = await ytMyChannels(tok.access_token)
      if (!channels.length) return back(st.redirect_to, { error: 'That Google account has no YouTube channel. If your channel is a Brand Account, pick it on the Google account chooser.' })
      for (const c of channels) {
        const { data: row, error } = await db.from('social_accounts').upsert({
          workspace_id: st.workspace_id, platform: 'youtube', external_id: c.id, handle: c.handle, display_name: c.title, avatar_url: c.avatar ?? null, status: 'active', last_error: null, connected_by: st.user_id,
        }, { onConflict: 'workspace_id,platform,external_id' }).select('id').single()
        if (error) throw new Error(error.message)
        const existing = await db.from('oauth_tokens').select('refresh_token_enc').eq('account_id', row.id).maybeSingle()
        await db.from('oauth_tokens').upsert({
          account_id: row.id, access_token_enc: await encrypt(tok.access_token),
          refresh_token_enc: tok.refresh_token ? await encrypt(tok.refresh_token) : existing.data?.refresh_token_enc ?? null,
          expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(), scopes: YT_SCOPES, updated_at: new Date().toISOString(),
        })
        ids.push(row.id)
      }
    }
    // First sync runs in the background so the user isn't kept waiting.
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil((async () => { for (const id of ids) await syncAccount(db, id) })())
    return back(st.redirect_to, { connected: st.platform, count: String(ids.length) })
  } catch (e) {
    console.error(e)
    return back(st.redirect_to, { error: `Connection failed: ${(e as Error).message}` })
  }
}
