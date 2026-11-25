// Pulls metrics for one connected account and writes daily snapshots.
// Safe to run repeatedly: every write is an upsert keyed by (account, date) or (content, date).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { decrypt, encrypt } from './crypto.ts'
import { categorize } from './categorize.ts'
import { GraphError, igDay, igFollowerGains, igMedia, igMediaInsights, igProfile } from './instagram.ts'
import { GoogleError, isoDuration, ytDaily, ytMyChannels, ytPerVideo, ytRefresh, ytUploads } from './youtube.ts'

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5)

async function chunkedUpsert(db: SupabaseClient, table: string, rows: any[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

export async function syncAccount(db: SupabaseClient, accountId: string) {
  const { data: acc } = await db.from('social_accounts').select('*').eq('id', accountId).single()
  if (!acc) throw new Error('Account not found')
  const { data: tok } = await db.from('oauth_tokens').select('*').eq('account_id', accountId).single()
  if (!tok) throw new Error('No token stored. Reconnect the account.')
  const { data: run } = await db.from('sync_runs').insert({ account_id: accountId }).select('id').single()
  const firstSync = !acc.last_synced_at
  try {
    const items = acc.platform === 'instagram' ? await syncInstagram(db, acc, tok, firstSync) : await syncYouTube(db, acc, tok, firstSync)
    await db.from('social_accounts').update({ last_synced_at: new Date().toISOString(), status: 'active', last_error: null }).eq('id', accountId)
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), status: 'ok', items_synced: items }).eq('id', run!.id)
    return { ok: true, items }
  } catch (e) {
    const auth = (e instanceof GraphError && e.authError) || (e instanceof GoogleError && e.authError)
    const msg = (e as Error).message
    await db.from('social_accounts').update({ status: auth ? 'needs_reauth' : 'error', last_error: msg.slice(0, 500) }).eq('id', accountId)
    await db.from('sync_runs').update({ finished_at: new Date().toISOString(), status: 'error', error: msg.slice(0, 1000) }).eq('id', run!.id)
    return { ok: false, error: auth ? 'Access expired or revoked. Reconnect this account.' : msg }
  }
}

// ---------------- Instagram ----------------
async function syncInstagram(db: SupabaseClient, acc: any, tok: any, first: boolean) {
  const token = await decrypt(tok.access_token_enc)
  const profile = await igProfile(acc.external_id, token)
  await db.from('social_accounts').update({ handle: `@${profile.username}`, display_name: profile.name ?? profile.username, avatar_url: profile.profile_picture_url ?? null }).eq('id', acc.id)

  // Daily account totals. First sync backfills 30 days, later syncs refresh the last 3 (late-arriving data).
  const back = first ? 30 : 3
  const gains = await igFollowerGains(acc.external_id, token, 30)
  const today = ymd(new Date())
  const rows: any[] = []
  for (let i = back; i >= 1; i--) {
    const day = daysAgo(i)
    const t = await igDay(acc.external_id, token, day)
    const date = ymd(day)
    rows.push({
      account_id: acc.id, date, views: t.views ?? null, reach: t.reach ?? null, accounts_engaged: t.accounts_engaged ?? null, profile_visits: t.profile_views ?? null,
      likes: t.likes ?? null, comments: t.comments ?? null, shares: t.shares ?? null, saves: t.saves ?? null,
      followers_gained: gains[ymd(new Date(day.getTime() + 864e5))] ?? gains[date] ?? null, source: 'api',
    })
  }
  // Rebuild historical follower totals backwards from today's count using daily gains.
  let running = profile.followers_count
  for (let i = rows.length - 1; i >= 0; i--) {
    rows[i].followers = running
    running -= rows[i].followers_gained ?? 0
  }
  rows.push({ account_id: acc.id, date: today, followers: profile.followers_count, source: 'snapshot' })
  // Don't overwrite yesterday's API totals with nulls: upsert merges only provided columns.
  await chunkedUpsert(db, 'account_daily_metrics', rows, 'account_id,date')

  // Content: latest media + per-post insights
  const media = await igMedia(acc.external_id, token, first ? 300 : 120)
  const contentRows = media.map((m) => ({
    account_id: acc.id, platform: 'instagram', external_id: m.id,
    title: (m.caption ?? '').split('\n')[0].slice(0, 140) || '(no caption)', caption: m.caption ?? null,
    format: m.media_product_type === 'REELS' ? 'reel' : m.media_product_type === 'STORY' ? 'story' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'post',
    published_at: m.timestamp, permalink: m.permalink, thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
  }))
  // Keep user-set categories: only set category on new rows
  const { data: existing } = await db.from('content_items').select('id, external_id, category').eq('account_id', acc.id)
  const known = new Map((existing ?? []).map((e) => [e.external_id, e]))
  const toUpsert = contentRows.map((r) => ({ ...r, category: known.get(r.external_id)?.category ?? categorize(r.caption) }))
  await chunkedUpsert(db, 'content_items', toUpsert, 'account_id,external_id')
  const { data: ids } = await db.from('content_items').select('id, external_id').eq('account_id', acc.id)
  const idMap = new Map((ids ?? []).map((r) => [r.external_id, r.id]))

  const snaps: any[] = []
  for (const m of media) {
    const ageDays = (Date.now() - +new Date(m.timestamp)) / 864e5
    // Insights for recent posts every day; older posts weekly (they barely move) to save API calls.
    let ins: Record<string, number> = {}
    if (ageDays < 60 || first || new Date().getDay() === 1) ins = await igMediaInsights(m.id, m.media_product_type, token)
    snaps.push({
      content_id: idMap.get(m.id), date: today,
      views: ins.views ?? null, reach: ins.reach ?? null,
      likes: ins.likes ?? m.like_count ?? null, comments: ins.comments ?? m.comments_count ?? null,
      shares: ins.shares ?? null, saves: ins.saved ?? null, followers_gained: ins.follows ?? null,
      avg_view_duration_s: ins.ig_reels_avg_watch_time != null ? ins.ig_reels_avg_watch_time / 1000 : null,
    })
  }
  await chunkedUpsert(db, 'content_metrics_snapshots', snaps.filter((s) => s.content_id), 'content_id,date')
  return media.length
}

// ---------------- YouTube ----------------
async function ytToken(db: SupabaseClient, acc: any, tok: any) {
  if (tok.expires_at && new Date(tok.expires_at).getTime() - Date.now() > 120_000) return decrypt(tok.access_token_enc)
  if (!tok.refresh_token_enc) throw new GoogleError('No refresh token stored. Reconnect the channel.', true)
  const r = await ytRefresh(await decrypt(tok.refresh_token_enc))
  await db.from('oauth_tokens').update({ access_token_enc: await encrypt(r.access_token), expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('account_id', acc.id)
  return r.access_token
}

async function syncYouTube(db: SupabaseClient, acc: any, tok: any, first: boolean) {
  const token = await ytToken(db, acc, tok)
  const channels = await ytMyChannels(token)
  const ch = channels.find((c) => c.id === acc.external_id) ?? channels[0]
  if (!ch || ch.id !== acc.external_id) throw new GoogleError('This Google login no longer manages the channel. Reconnect it.', true)
  await db.from('social_accounts').update({ handle: ch.handle, display_name: ch.title, avatar_url: ch.avatar ?? null }).eq('id', acc.id)

  // Daily analytics. First sync: ~13 months. Later: last 7 days (Analytics finalises with 2-3 day delay).
  const start = ymd(daysAgo(first ? 400 : 7))
  const end = ymd(daysAgo(1))
  const days = await ytDaily(ch.id, token, start, end)
  const today = ymd(new Date())
  // Follower totals per day reconstructed backwards from today's subscriber count.
  const { data: later } = await db.from('account_daily_metrics').select('date, followers_gained, followers_lost').eq('account_id', acc.id).gt('date', end)
  let running = ch.subscribers
  const laterNet = (later ?? []).filter((d) => d.date < today).reduce((s, d) => s + (d.followers_gained ?? 0) - (d.followers_lost ?? 0), 0)
  running -= laterNet
  const rows = days.map((d) => ({
    account_id: acc.id, date: d.day, views: d.views, watch_time_minutes: d.estimatedMinutesWatched, avg_view_duration_s: d.averageViewDuration,
    likes: d.likes, comments: d.comments, shares: d.shares, followers_gained: d.subscribersGained, followers_lost: d.subscribersLost, source: 'api',
  })) as any[]
  for (let i = rows.length - 1; i >= 0; i--) {
    rows[i].followers = running
    running -= (rows[i].followers_gained ?? 0) - (rows[i].followers_lost ?? 0)
  }
  rows.push({ account_id: acc.id, date: today, followers: ch.subscribers, source: 'snapshot' })
  await chunkedUpsert(db, 'account_daily_metrics', rows, 'account_id,date')

  // Videos + lifetime per-video analytics
  const videos = await ytUploads(ch.uploads, token, first ? 400 : 150)
  const perVideo = await ytPerVideo(ch.id, token, '2006-01-01', end)
  const { data: existing } = await db.from('content_items').select('external_id, category').eq('account_id', acc.id)
  const known = new Map((existing ?? []).map((e) => [e.external_id, e.category]))
  const items = videos.map((v) => {
    const dur = isoDuration(v.contentDetails.duration)
    return {
      account_id: acc.id, platform: 'youtube', external_id: v.id, title: v.snippet.title, caption: v.snippet.description?.slice(0, 2000) ?? null,
      // YouTube does not flag Shorts in the API; uploads up to 3 minutes are treated as Shorts.
      format: v.snippet.liveBroadcastContent === 'live' ? 'live' : dur <= 180 ? 'short' : 'video',
      category: known.get(v.id) ?? categorize(`${v.snippet.title} ${v.snippet.tags?.join(' ') ?? ''}`),
      published_at: v.snippet.publishedAt, permalink: dur <= 180 ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`,
      thumbnail_url: v.snippet.thumbnails?.medium?.url ?? null, duration_s: dur,
    }
  })
  await chunkedUpsert(db, 'content_items', items, 'account_id,external_id')
  const { data: ids } = await db.from('content_items').select('id, external_id').eq('account_id', acc.id)
  const idMap = new Map((ids ?? []).map((r) => [r.external_id, r.id]))
  const snaps = videos.map((v) => {
    const a = perVideo.get(v.id)
    return {
      content_id: idMap.get(v.id), date: today,
      views: Number(v.statistics.viewCount ?? a?.views ?? 0), likes: Number(v.statistics.likeCount ?? a?.likes ?? 0), comments: Number(v.statistics.commentCount ?? a?.comments ?? 0),
      shares: a?.shares ?? null, followers_gained: a?.subscribersGained ?? null, watch_time_minutes: a?.estimatedMinutesWatched ?? null,
      avg_view_duration_s: a?.averageViewDuration ?? null, avg_view_percentage: a?.averageViewPercentage ?? null,
    }
  }).filter((s) => s.content_id)
  await chunkedUpsert(db, 'content_metrics_snapshots', snaps, 'content_id,date')
  return videos.length
}
