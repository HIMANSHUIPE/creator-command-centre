// YouTube Data API v3 + YouTube Analytics API v2 with Google OAuth (offline access).
export const YT_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly']

export function ytAuthorizeUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: redirectUri, response_type: 'code', state,
    scope: YT_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

export class GoogleError extends Error {
  constructor(message: string, public authError = false) { super(message) }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  const j = await res.json()
  if (!res.ok) throw new GoogleError(j.error_description ?? j.error ?? 'Google token error', j.error === 'invalid_grant')
  return j as { access_token: string; refresh_token?: string; expires_in: number; scope: string }
}

export const ytExchange = (code: string, redirectUri: string) => tokenRequest({
  code, redirect_uri: redirectUri, grant_type: 'authorization_code', client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
})
export const ytRefresh = (refreshToken: string) => tokenRequest({
  refresh_token: refreshToken, grant_type: 'refresh_token', client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
})

export async function gapi<T = any>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new GoogleError(j.error?.message ?? `Google API ${res.status}`, res.status === 401)
  return j as T
}

export async function ytMyChannels(token: string) {
  const r = await gapi<{ items?: any[] }>('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true', token)
  return (r.items ?? []).map((c) => ({
    id: c.id as string,
    title: c.snippet.title as string,
    handle: (c.snippet.customUrl as string | undefined) ?? null,
    avatar: c.snippet.thumbnails?.default?.url as string | undefined,
    subscribers: Number(c.statistics.subscriberCount ?? 0),
    views: Number(c.statistics.viewCount ?? 0),
    uploads: c.contentDetails.relatedPlaylists.uploads as string,
  }))
}

const YA = 'https://youtubeanalytics.googleapis.com/v2/reports'

export async function ytDaily(channelId: string, token: string, start: string, end: string) {
  const p = new URLSearchParams({
    ids: `channel==${channelId}`, startDate: start, endDate: end, dimensions: 'day', sort: 'day',
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost',
  })
  const r = await gapi<{ columnHeaders: { name: string }[]; rows?: any[][] }>(`${YA}?${p}`, token)
  const cols = r.columnHeaders.map((c) => c.name)
  return (r.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as Record<string, any>)
}

/** Lifetime analytics per video (top 200 by views). */
export async function ytPerVideo(channelId: string, token: string, start: string, end: string) {
  const p = new URLSearchParams({
    ids: `channel==${channelId}`, startDate: start, endDate: end, dimensions: 'video', sort: '-views', maxResults: '200',
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained',
  })
  const r = await gapi<{ columnHeaders: { name: string }[]; rows?: any[][] }>(`${YA}?${p}`, token)
  const cols = r.columnHeaders.map((c) => c.name)
  const out = new Map<string, Record<string, number>>()
  ;(r.rows ?? []).forEach((row) => { const o = Object.fromEntries(cols.map((c, i) => [c, row[i]])); out.set(o.video, o) })
  return out
}

export async function ytUploads(playlistId: string, token: string, max = 400) {
  const ids: string[] = []
  let page = ''
  while (ids.length < max) {
    const r = await gapi<{ items: any[]; nextPageToken?: string }>(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlistId}${page ? `&pageToken=${page}` : ''}`, token)
    ids.push(...r.items.map((i) => i.contentDetails.videoId))
    if (!r.nextPageToken) break
    page = r.nextPageToken
  }
  const videos: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const r = await gapi<{ items: any[] }>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(',')}`, token)
    videos.push(...r.items)
  }
  return videos
}

/** ISO 8601 duration (PT1M5S) to seconds */
export function isoDuration(d: string) {
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0))
}
