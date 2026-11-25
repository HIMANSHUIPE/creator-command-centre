import { differenceInCalendarDays, format, parseISO, startOfWeek, startOfMonth, subDays } from 'date-fns'
import type { ContentItem, Dataset, DailyMetric, Platform } from './types'

export interface DateRange { from: Date; to: Date; label: string }

export function presetRange(key: '7d' | '30d' | '90d' | '12m'): DateRange {
  const to = new Date()
  const days = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[key]
  return { from: subDays(to, days - 1), to, label: { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months' }[key] }
}

export function previousRange(r: DateRange): DateRange {
  const len = differenceInCalendarDays(r.to, r.from) + 1
  return { from: subDays(r.from, len), to: subDays(r.from, 1), label: 'Previous period' }
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const inRange = (date: string, r: DateRange) => date >= ymd(r.from) && date <= ymd(r.to)
const n = (v: number | null | undefined) => v ?? 0

export function filterPlatform(ds: Dataset, p?: Platform): Dataset {
  if (!p) return ds
  const ids = new Set(ds.accounts.filter((a) => a.platform === p).map((a) => a.id))
  return { accounts: ds.accounts.filter((a) => ids.has(a.id)), daily: ds.daily.filter((d) => ids.has(d.account_id)), content: ds.content.filter((c) => ids.has(c.account_id)) }
}

export function engagementOf(c: Pick<ContentItem, 'likes' | 'comments' | 'shares' | 'saves'>) {
  return n(c.likes) + n(c.comments) + n(c.shares) + n(c.saves)
}
export function engagementRate(c: ContentItem) {
  const v = n(c.views)
  return v > 0 ? (engagementOf(c) / v) * 100 : 0
}

/** Followers at the last snapshot on/before `date`, summed over accounts. */
function followersAt(daily: DailyMetric[], date: string) {
  const byAcc = new Map<string, DailyMetric>()
  for (const d of daily) {
    if (d.date > date || d.followers == null) continue
    const cur = byAcc.get(d.account_id)
    if (!cur || d.date > cur.date) byAcc.set(d.account_id, d)
  }
  let s = 0
  byAcc.forEach((d) => (s += n(d.followers)))
  return s
}

export interface Kpis {
  followers: number
  followersStart: number
  followersGained: number
  growthPct: number
  views: number
  engagement: number
  posts: number
  avgViewsPerPost: number
  engagementRate: number
  watchTimeMinutes: number
}

export function computeKpis(ds: Dataset, r: DateRange): Kpis {
  const daily = ds.daily.filter((d) => inRange(d.date, r))
  const followers = followersAt(ds.daily, ymd(r.to))
  const followersStart = followersAt(ds.daily, ymd(subDays(r.from, 1))) || followers
  const views = daily.reduce((s, d) => s + n(d.views), 0)
  const engagement = daily.reduce((s, d) => s + n(d.likes) + n(d.comments) + n(d.shares) + n(d.saves), 0)
  const posts = ds.content.filter((c) => c.published_at && inRange(c.published_at.slice(0, 10), r))
  const postViews = posts.reduce((s, c) => s + n(c.views), 0)
  return {
    followers,
    followersStart,
    followersGained: followers - followersStart,
    growthPct: followersStart ? ((followers - followersStart) / followersStart) * 100 : 0,
    views,
    engagement,
    posts: posts.length,
    avgViewsPerPost: posts.length ? postViews / posts.length : 0,
    engagementRate: views ? (engagement / views) * 100 : 0,
    watchTimeMinutes: daily.reduce((s, d) => s + n(d.watch_time_minutes), 0),
  }
}

export function pctChange(cur: number, prev: number) {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}

export type Bucket = 'day' | 'week' | 'month'
export function autoBucket(r: DateRange): Bucket {
  const len = differenceInCalendarDays(r.to, r.from)
  return len > 180 ? 'month' : len > 60 ? 'week' : 'day'
}
function bucketKey(date: string, b: Bucket) {
  const d = parseISO(date)
  if (b === 'day') return date
  if (b === 'week') return ymd(startOfWeek(d, { weekStartsOn: 1 }))
  return ymd(startOfMonth(d))
}

export interface SeriesPoint { key: string; instagram: number; youtube: number; total: number; [k: string]: number | string }

/** Time series per platform. `metric` sums for flows; followers uses last value per bucket. */
export function platformSeries(ds: Dataset, r: DateRange, metric: keyof DailyMetric, bucket = autoBucket(r)): SeriesPoint[] {
  const platOf = new Map(ds.accounts.map((a) => [a.id, a.platform]))
  const map = new Map<string, SeriesPoint>()
  const isStock = metric === 'followers'
  const lastSeen = new Map<string, Map<string, { date: string; v: number }>>() // bucket -> acc -> last
  for (const d of ds.daily) {
    if (!inRange(d.date, r)) continue
    const k = bucketKey(d.date, bucket)
    if (!map.has(k)) map.set(k, { key: k, instagram: 0, youtube: 0, total: 0 })
    const v = Number(d[metric] ?? 0)
    if (isStock) {
      if (!lastSeen.has(k)) lastSeen.set(k, new Map())
      const m = lastSeen.get(k)!
      const cur = m.get(d.account_id)
      if (!cur || d.date > cur.date) m.set(d.account_id, { date: d.date, v })
    } else {
      const p = map.get(k)!
      const plat = platOf.get(d.account_id)
      if (plat) p[plat] += v
      p.total += v
    }
  }
  if (isStock) {
    lastSeen.forEach((m, k) => {
      const p = map.get(k)!
      m.forEach((x, acc) => {
        const plat = platOf.get(acc)
        if (plat) p[plat] += x.v
        p.total += x.v
      })
    })
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function contentInRange(ds: Dataset, r: DateRange) {
  return ds.content.filter((c) => c.published_at && inRange(c.published_at.slice(0, 10), r))
}

export function topContent(items: ContentItem[], k = 10, by: (c: ContentItem) => number = (c) => n(c.views)) {
  return [...items].sort((a, b) => by(b) - by(a)).slice(0, k)
}

export interface CategoryStat { category: string; posts: number; views: number; avgViews: number; engagementRate: number; followersGained: number; shares: number; index: number }

export function categoryStats(items: ContentItem[]): CategoryStat[] {
  const m = new Map<string, ContentItem[]>()
  for (const c of items) {
    const k = c.category || 'Uncategorised'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(c)
  }
  const overallAvg = items.length ? items.reduce((s, c) => s + n(c.views), 0) / items.length : 0
  return [...m.entries()].map(([category, list]) => {
    const views = list.reduce((s, c) => s + n(c.views), 0)
    const eng = list.reduce((s, c) => s + engagementOf(c), 0)
    const avg = views / list.length
    return {
      category, posts: list.length, views, avgViews: avg,
      engagementRate: views ? (eng / views) * 100 : 0,
      followersGained: list.reduce((s, c) => s + n(c.followers_gained), 0),
      shares: list.reduce((s, c) => s + n(c.shares), 0),
      index: overallAvg ? avg / overallAvg : 0,
    }
  }).sort((a, b) => b.avgViews - a.avgViews)
}

/** Performance tier relative to the account's own median. */
export function performanceTier(c: ContentItem, medianViews: number): 'viral' | 'strong' | 'average' | 'low' {
  const v = n(c.views)
  if (!medianViews) return 'average'
  const x = v / medianViews
  return x >= 4 ? 'viral' : x >= 1.5 ? 'strong' : x >= 0.6 ? 'average' : 'low'
}

export function median(nums: number[]) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function medianByAccount(items: ContentItem[]) {
  const m = new Map<string, number[]>()
  items.forEach((c) => { if (!m.has(c.account_id)) m.set(c.account_id, []); m.get(c.account_id)!.push(n(c.views)) })
  const out = new Map<string, number>()
  m.forEach((v, k) => out.set(k, median(v)))
  return out
}

/** "Gaining traction": published in the last 14 days, views/day well above account median per-day pace. */
export function gainingTraction(items: ContentItem[]) {
  const now = Date.now()
  const med = medianByAccount(items)
  return items
    .filter((c) => c.published_at && now - +new Date(c.published_at) < 14 * 864e5)
    .map((c) => {
      const age = Math.max(1, (now - +new Date(c.published_at!)) / 864e5)
      return { c, pace: n(c.views) / age, ratio: n(c.views) / Math.max(1, med.get(c.account_id) ?? 1) }
    })
    .filter((x) => x.ratio >= 0.9)
    .sort((a, b) => b.pace - a.pace)
    .slice(0, 8)
    .map((x) => x.c)
}

/** Anomalies: days where followers gained deviates > 2.5 sd from the 28-day rolling mean. */
export function growthAnomalies(series: SeriesPoint[], field: 'total' | 'instagram' | 'youtube' = 'total') {
  const out: { key: string; value: number; mean: number; kind: 'spike' | 'drop' }[] = []
  for (let i = 14; i < series.length; i++) {
    const win = series.slice(Math.max(0, i - 28), i).map((p) => Number(p[field]))
    const mean = win.reduce((s, v) => s + v, 0) / win.length
    const sd = Math.sqrt(win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length) || 1
    const v = Number(series[i][field])
    if (v > mean + 2.5 * sd) out.push({ key: series[i].key, value: v, mean, kind: 'spike' })
    else if (v < mean - 2.5 * sd && v < mean * 0.5) out.push({ key: series[i].key, value: v, mean, kind: 'drop' })
  }
  return out
}

/** Linear-trend projection with a band. Clearly an ESTIMATE. */
export function projectFollowers(ds: Dataset, horizonDays: number[]) {
  const end = new Date()
  const series = platformSeries(ds, { from: subDays(end, 89), to: end, label: '' }, 'followers', 'day')
  if (series.length < 14) return null
  const ys = series.map((p) => p.total)
  const xs = ys.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const recentSlope = (ys[ys.length - 1] - ys[Math.max(0, ys.length - 31)]) / Math.min(30, ys.length - 1)
  const blended = slope * 0.4 + recentSlope * 0.6
  const current = ys[ys.length - 1]
  return {
    current,
    dailyRate: blended,
    points: horizonDays.map((h) => ({ days: h, expected: Math.round(current + blended * h), low: Math.round(current + blended * h * 0.7), high: Math.round(current + blended * h * 1.3) })),
  }
}

/** 0-100: how regularly content went out in the last 8 weeks vs. the average weekly pace. */
export function consistencyScore(items: ContentItem[]) {
  const weeks = new Array(8).fill(0)
  const now = Date.now()
  items.forEach((c) => {
    if (!c.published_at) return
    const w = Math.floor((now - +new Date(c.published_at)) / (7 * 864e5))
    if (w >= 0 && w < 8) weeks[w]++
  })
  const mean = weeks.reduce((a, b) => a + b, 0) / 8
  if (!mean) return { score: 0, perWeek: 0, weeks }
  const sd = Math.sqrt(weeks.reduce((s, v) => s + (v - mean) ** 2, 0) / 8)
  const activeWeeks = weeks.filter((w) => w > 0).length
  const score = Math.round(Math.max(0, Math.min(100, (activeWeeks / 8) * 60 + (1 - Math.min(1, sd / mean)) * 40)))
  return { score, perWeek: mean, weeks }
}

/** Best weekday to post based on avg views by publish weekday. */
export function bestWeekdays(items: ContentItem[]) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const agg = names.map((name) => ({ name, posts: 0, views: 0 }))
  items.forEach((c) => {
    if (!c.published_at) return
    const d = new Date(c.published_at).getDay()
    agg[d].posts++
    agg[d].views += n(c.views)
  })
  return agg.map((a) => ({ ...a, avg: a.posts ? a.views / a.posts : 0 })).sort((a, b) => b.avg - a.avg)
}

export const fmt = {
  num(v: number | null | undefined) {
    const x = n(v)
    if (Math.abs(x) >= 1e7) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
    if (Math.abs(x) >= 1e4) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return Math.round(x).toLocaleString('en-IN')
  },
  full(v: number | null | undefined) { return Math.round(n(v)).toLocaleString('en-IN') },
  pct(v: number | null | undefined, digits = 1) { return v == null ? '—' : `${v.toFixed(digits)}%` },
  signedPct(v: number | null | undefined) { return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
  date(s: string | null | undefined) { return s ? format(parseISO(s), 'd MMM yyyy') : '—' },
  short(s: string) { return format(parseISO(s), 'd MMM') },
  money(v: number | null | undefined, cur = 'INR') {
    if (v == null) return '—'
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  },
  minutes(v: number) { return v >= 60 ? `${fmt.num(v / 60)} hrs` : `${Math.round(v)} min` },
}
