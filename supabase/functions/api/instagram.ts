// Instagram Graph API (Instagram API with Facebook Login).
// Works for Instagram Business and Creator accounts linked to a Facebook Page.
// One login can connect every IG account the person manages.
const V = () => Deno.env.get('META_GRAPH_VERSION') ?? 'v23.0'
const GRAPH = () => `https://graph.facebook.com/${V()}`

export const IG_SCOPES = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management']

export function igAuthorizeUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({ client_id: Deno.env.get('META_APP_ID')!, redirect_uri: redirectUri, state, response_type: 'code', scope: IG_SCOPES.join(',') })
  return `https://www.facebook.com/${V()}/dialog/oauth?${p}`
}

export class GraphError extends Error {
  constructor(message: string, public code?: number, public authError = false) { super(message) }
}

export async function graph<T = any>(path: string, params: Record<string, string> = {}, token?: string): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${GRAPH()}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  if (token) url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    const e = body.error ?? {}
    // 190 = invalid/expired token, 10/200 = permission
    throw new GraphError(e.message ?? `Graph API ${res.status}`, e.code, e.code === 190 || e.type === 'OAuthException' && e.code === 102)
  }
  return body as T
}

/** Exchange the OAuth code, then upgrade to a long-lived user token and list IG business accounts. */
export async function igExchange(code: string, redirectUri: string) {
  const short = await graph<{ access_token: string }>('/oauth/access_token', {
    client_id: Deno.env.get('META_APP_ID')!, client_secret: Deno.env.get('META_APP_SECRET')!, redirect_uri: redirectUri, code,
  })
  const long = await graph<{ access_token: string; expires_in?: number }>('/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: Deno.env.get('META_APP_ID')!, client_secret: Deno.env.get('META_APP_SECRET')!, fb_exchange_token: short.access_token,
  })
  const pages = await graph<{ data: any[] }>('/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}', limit: '100',
  }, long.access_token)
  // Page tokens obtained from a long-lived user token do not expire (until the password changes or access is revoked).
  return pages.data
    .filter((p) => p.instagram_business_account)
    .map((p) => ({
      igId: p.instagram_business_account.id as string,
      username: p.instagram_business_account.username as string,
      name: (p.instagram_business_account.name ?? p.name) as string,
      avatar: p.instagram_business_account.profile_picture_url as string | undefined,
      pageToken: p.access_token as string,
      userTokenExpiresIn: long.expires_in,
    }))
}

/** Fetch insights; if one metric isn't supported, retry metrics one by one and keep the ones that work. */
async function insightsTolerant(path: string, metrics: string[], params: Record<string, string>, token: string) {
  const out: Record<string, number> = {}
  const read = (data: any[]) => data.forEach((m) => {
    const v = m.total_value?.value ?? m.values?.[m.values.length - 1]?.value
    if (typeof v === 'number') out[m.name] = v
  })
  try {
    const r = await graph<{ data: any[] }>(path, { metric: metrics.join(','), ...params }, token)
    read(r.data)
  } catch (e) {
    if ((e as GraphError).authError) throw e
    for (const m of metrics) {
      try { read((await graph<{ data: any[] }>(path, { metric: m, ...params }, token)).data) } catch (e2) { if ((e2 as GraphError).authError) throw e2 }
    }
  }
  return out
}

const DAY_METRICS = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_views']

export async function igProfile(igId: string, token: string) {
  return graph<{ followers_count: number; media_count: number; username: string; name?: string; profile_picture_url?: string }>(`/${igId}`, { fields: 'followers_count,media_count,username,name,profile_picture_url' }, token)
}

/** Totals for one calendar day (UTC). */
export async function igDay(igId: string, token: string, day: Date) {
  const since = Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 1000)
  const until = since + 86400
  return insightsTolerant(`/${igId}/insights`, DAY_METRICS, { period: 'day', metric_type: 'total_value', since: String(since), until: String(until) }, token)
}

/** Daily new followers for up to the last 30 days (Instagram limit). */
export async function igFollowerGains(igId: string, token: string, days = 30) {
  const until = Math.floor(Date.now() / 1000)
  const since = until - Math.min(30, days) * 86400
  try {
    const r = await graph<{ data: any[] }>(`/${igId}/insights`, { metric: 'follower_count', period: 'day', since: String(since), until: String(until) }, token)
    const out: Record<string, number> = {}
    r.data[0]?.values?.forEach((v: any) => { out[v.end_time.slice(0, 10)] = v.value })
    return out
  } catch (e) {
    if ((e as GraphError).authError) throw e
    return {} // follower_count needs 100+ followers
  }
}

export async function igMedia(igId: string, token: string, max = 300) {
  const items: any[] = []
  let next: string | null = `${GRAPH()}/${igId}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count&limit=50&access_token=${encodeURIComponent(token)}`
  while (next && items.length < max) {
    const r: { data: any[]; paging?: { next?: string } } = await graph(next)
    items.push(...r.data)
    next = r.paging?.next ?? null
  }
  return items
}

export async function igMediaInsights(mediaId: string, productType: string, token: string) {
  const metrics = productType === 'REELS'
    ? ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time']
    : ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'follows', 'profile_visits']
  return insightsTolerant(`/${mediaId}/insights`, metrics, {}, token)
}
