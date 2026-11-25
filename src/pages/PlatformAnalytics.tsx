import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Eye, Heart, Share2, Bookmark, MousePointerClick, Clock, Timer, Radar } from 'lucide-react'
import { Instagram, Youtube } from '../components/icons'
import { useData } from '../context/DataContext'
import { categoryStats, computeKpis, contentInRange, engagementRate, filterPlatform, fmt, pctChange, platformSeries, previousRange, topContent } from '../lib/analytics'
import { Card, DateRangeControl, Kpi, PageHeader, Segmented, Empty, CHART } from '../components/ui'
import { Bars, PlatformTrend } from '../components/charts'
import type { DailyMetric, Platform } from '../lib/types'

export default function PlatformAnalytics({ platform }: { platform: Platform }) {
  const { dataset, range } = useData()
  const isIg = platform === 'instagram'
  const ds = useMemo(() => filterPlatform(dataset, platform), [dataset, platform])
  const [accountId, setAccountId] = useState<string>('all')
  const scoped = useMemo(() => accountId === 'all' ? ds : { accounts: ds.accounts.filter((a) => a.id === accountId), daily: ds.daily.filter((d) => d.account_id === accountId), content: ds.content.filter((c) => c.account_id === accountId) }, [ds, accountId])
  const [metric, setMetric] = useState<keyof DailyMetric>('followers')

  const prev = previousRange(range)
  const k = computeKpis(scoped, range)
  const kp = computeKpis(scoped, prev)
  const daily = scoped.daily.filter((d) => d.date >= range.from.toISOString().slice(0, 10) && d.date <= range.to.toISOString().slice(0, 10))
  const sum = (f: keyof DailyMetric) => daily.reduce((s, d) => s + Number(d[f] ?? 0), 0)
  const prevDaily = scoped.daily.filter((d) => d.date >= prev.from.toISOString().slice(0, 10) && d.date <= prev.to.toISOString().slice(0, 10))
  const psum = (f: keyof DailyMetric) => prevDaily.reduce((s, d) => s + Number(d[f] ?? 0), 0)
  const series = platformSeries(scoped, range, metric)
  const posts = contentInRange(scoped, range)
  const cats = categoryStats(posts).slice(0, 8)

  if (!ds.accounts.length) {
    return (
      <>
        <PageHeader title={isIg ? 'Instagram Analytics' : 'YouTube Analytics'} />
        <div className="card"><Empty icon={isIg ? <Instagram /> : <Youtube />} title={`No ${isIg ? 'Instagram' : 'YouTube'} account connected`} body="Connect an account in Settings to start collecting daily snapshots." action={<Link to="/settings" className="btn-primary">Connect account</Link>} /></div>
      </>
    )
  }

  const metricOptions: { value: keyof DailyMetric; label: string }[] = isIg
    ? [{ value: 'followers', label: 'Followers' }, { value: 'followers_gained', label: 'Gained' }, { value: 'views', label: 'Views' }, { value: 'reach', label: 'Reach' }, { value: 'accounts_engaged', label: 'Engaged' }]
    : [{ value: 'followers', label: 'Subscribers' }, { value: 'followers_gained', label: 'Gained' }, { value: 'views', label: 'Views' }, { value: 'watch_time_minutes', label: 'Watch time' }]

  return (
    <div className="space-y-6">
      <PageHeader title={isIg ? 'Instagram Analytics' : 'YouTube Analytics'} subtitle={range.label}
        actions={<>
          <select className="input w-auto py-1.5 text-xs" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">All {isIg ? 'Instagram accounts' : 'channels'} ({ds.accounts.length})</option>
            {ds.accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name ?? a.handle}</option>)}
          </select>
          <DateRangeControl />
        </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={isIg ? 'Followers' : 'Subscribers'} value={fmt.num(k.followers)} delta={pctChange(k.followers, k.followersStart)} hint={`${k.followersGained >= 0 ? '+' : ''}${fmt.num(k.followersGained)}`} icon={<Users size={14} />} accent={isIg ? 'ig' : 'yt'} />
        <Kpi label={isIg ? 'Views' : 'Video views'} value={fmt.num(k.views)} delta={pctChange(k.views, kp.views)} icon={<Eye size={14} />} accent={isIg ? 'ig' : 'yt'} />
        {isIg ? (
          <>
            <Kpi label="Accounts reached" value={fmt.num(sum('reach'))} delta={pctChange(sum('reach'), psum('reach'))} icon={<Radar size={14} />} accent="ig" />
            <Kpi label="Accounts engaged" value={fmt.num(sum('accounts_engaged'))} delta={pctChange(sum('accounts_engaged'), psum('accounts_engaged'))} icon={<MousePointerClick size={14} />} accent="ig" />
            <Kpi label="Likes + comments" value={fmt.num(sum('likes') + sum('comments'))} delta={pctChange(sum('likes') + sum('comments'), psum('likes') + psum('comments'))} icon={<Heart size={14} />} accent="ig" />
            <Kpi label="Shares" value={fmt.num(sum('shares'))} delta={pctChange(sum('shares'), psum('shares'))} icon={<Share2 size={14} />} accent="ig" />
            <Kpi label="Saves" value={fmt.num(sum('saves'))} delta={pctChange(sum('saves'), psum('saves'))} icon={<Bookmark size={14} />} accent="ig" />
            <Kpi label="Profile visits" value={fmt.num(sum('profile_visits'))} delta={pctChange(sum('profile_visits'), psum('profile_visits'))} icon={<Users size={14} />} accent="ig" />
          </>
        ) : (
          <>
            <Kpi label="Watch time" value={fmt.minutes(sum('watch_time_minutes'))} delta={pctChange(sum('watch_time_minutes'), psum('watch_time_minutes'))} icon={<Clock size={14} />} accent="yt" />
            <Kpi label="Avg view duration" value={`${Math.round(daily.length ? daily.reduce((s, d) => s + Number(d.avg_view_duration_s ?? 0), 0) / daily.length : 0)}s`} icon={<Timer size={14} />} accent="yt" />
            <Kpi label="Likes" value={fmt.num(sum('likes'))} delta={pctChange(sum('likes'), psum('likes'))} icon={<Heart size={14} />} accent="yt" />
            <Kpi label="Comments" value={fmt.num(sum('comments'))} delta={pctChange(sum('comments'), psum('comments'))} icon={<Heart size={14} />} accent="yt" />
            <Kpi label="Shares" value={fmt.num(sum('shares'))} delta={pctChange(sum('shares'), psum('shares'))} icon={<Share2 size={14} />} accent="yt" />
            <Kpi label="Shorts published" value={fmt.num(posts.filter((p) => p.format === 'short').length)} hint={`${posts.filter((p) => p.format === 'video').length} long videos`} icon={<Youtube size={14} />} accent="yt" />
          </>
        )}
      </div>

      <Card title="Trend" action={<Segmented value={metric} onChange={setMetric} options={metricOptions} />}>
        <PlatformTrend data={series} mode={platform} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Average views by topic" subtitle="Posts published in this period">
          {cats.length ? <Bars layout="vertical" height={Math.max(200, cats.length * 34)} data={cats.map((c) => ({ ...c, avgViews: Math.round(c.avgViews) }))} x="category" bars={[{ key: 'avgViews', name: 'Avg views', color: isIg ? CHART.ig : CHART.yt }]} /> : <Empty title="No posts in this period" />}
        </Card>
        <Card title={isIg ? 'Top Reels' : 'Top Shorts and videos'} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Title</th><th className="th text-right">Views</th><th className="th text-right">{isIg ? 'Shares' : 'Avg view %'}</th><th className="th text-right">Eng.</th></tr></thead>
              <tbody className="divide-y divide-line">
                {topContent(posts, 8).map((c) => (
                  <tr key={c.id}><td className="td max-w-[220px] truncate">{c.title}<div className="text-xs text-ink-mute">{fmt.date(c.published_at)} · {c.format}</div></td><td className="td text-right tabular-nums">{fmt.num(c.views)}</td><td className="td text-right tabular-nums">{isIg ? fmt.num(c.shares) : fmt.pct(c.avg_view_percentage, 0)}</td><td className="td text-right tabular-nums">{fmt.pct(engagementRate(c))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {isIg && <p className="text-xs text-ink-mute">Instagram's API reports account-level insights for roughly the last 2 years and only from the day an account is a professional account. Follower counts before connection are rebuilt from daily snapshots once syncing starts.</p>}
      {!isIg && <p className="text-xs text-ink-mute">YouTube Analytics data usually lands 2 to 3 days late, so the most recent days can look low until Google finalises them.</p>}
    </div>
  )
}
