import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Eye, Heart, Clapperboard, BarChart3, TrendingUp, ExternalLink } from 'lucide-react'
import { Instagram, Youtube } from '../components/icons'
import { useData } from '../context/DataContext'
import { computeKpis, contentInRange, fmt, filterPlatform, pctChange, platformSeries, previousRange, topContent, engagementRate } from '../lib/analytics'
import { Card, DateRangeControl, Kpi, PageHeader, PlatformBadge, Segmented, DemoBadge, Empty, Spinner, CHART } from '../components/ui'
import { PlatformTrend, Bars } from '../components/charts'
import type { ContentItem } from '../lib/types'

export function BestCard({ label, item }: { label: string; item?: ContentItem }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-mute">{label}</span>
        {item && <PlatformBadge p={item.platform} withLabel={false} />}
      </div>
      {item ? (
        <>
          <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
          <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <span><strong className="text-ink">{fmt.num(item.views)}</strong> views</span>
            <span><strong className="text-ink">{fmt.pct(engagementRate(item))}</strong> eng.</span>
            <span>{fmt.date(item.published_at)}</span>
            {item.permalink && <a className="inline-flex items-center gap-1 text-brand" href={item.permalink} target="_blank" rel="noreferrer">Open <ExternalLink size={11} /></a>}
          </div>
        </>
      ) : <p className="text-sm text-ink-mute">No posts in this period.</p>}
    </div>
  )
}

export default function Overview() {
  const { dataset, range, isDemo, loading } = useData()
  const [trendMetric, setTrendMetric] = useState<'followers' | 'views' | 'followers_gained'>('followers')

  const m = useMemo(() => {
    const prev = previousRange(range)
    const all = computeKpis(dataset, range)
    const allPrev = computeKpis(dataset, prev)
    const ig = filterPlatform(dataset, 'instagram')
    const yt = filterPlatform(dataset, 'youtube')
    const igK = computeKpis(ig, range), igP = computeKpis(ig, prev)
    const ytK = computeKpis(yt, range), ytP = computeKpis(yt, prev)
    const posts = contentInRange(dataset, range)
    const bestReel = topContent(posts.filter((c) => c.platform === 'instagram'), 1)[0]
    const bestShort = topContent(posts.filter((c) => c.platform === 'youtube' && c.format === 'short'), 1)[0]
    return { all, allPrev, igK, igP, ytK, ytP, posts, bestReel, bestShort }
  }, [dataset, range])

  const series = useMemo(() => platformSeries(dataset, range, trendMetric), [dataset, range, trendMetric])
  const share = (a: number, b: number) => (a + b ? +((a / (a + b)) * 100).toFixed(1) : 0)
  const compare = ([
    ['Audience', m.igK.followers, m.ytK.followers],
    ['New followers', m.igK.followersGained, m.ytK.followersGained],
    ['Views', m.igK.views, m.ytK.views],
    ['Engagement', m.igK.engagement, m.ytK.engagement],
    ['Posts', m.igK.posts, m.ytK.posts],
  ] as const).map(([metric, a, b]) => ({ metric, Instagram: share(a, b), YouTube: a + b ? +(100 - share(a, b)).toFixed(1) : 0 }))

  if (loading && !isDemo) return <Spinner label="Loading your accounts…" />
  if (!dataset.accounts.length) return <Empty title="No accounts connected yet" body="Connect Instagram or YouTube to see your dashboard." action={<Link className="btn-primary" to="/settings">Go to integrations</Link>} />

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle={<>{range.label} · {dataset.accounts.length} connected accounts {isDemo && <DemoBadge />}</>} actions={<DateRangeControl />} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Combined audience" value={fmt.num(m.all.followers)} delta={pctChange(m.all.followers, m.all.followersStart)} hint={`${m.all.followersGained >= 0 ? '+' : ''}${fmt.num(m.all.followersGained)} this period`} icon={<Users size={14} />} />
        <Kpi label="Total views" value={fmt.num(m.all.views)} delta={pctChange(m.all.views, m.allPrev.views)} hint="vs previous period" icon={<Eye size={14} />} />
        <Kpi label="Total engagement" value={fmt.num(m.all.engagement)} delta={pctChange(m.all.engagement, m.allPrev.engagement)} hint={`${fmt.pct(m.all.engagementRate)} of views`} icon={<Heart size={14} />} />
        <Kpi label="Content published" value={fmt.num(m.all.posts)} delta={pctChange(m.all.posts, m.allPrev.posts)} hint="Reels, Shorts, videos" icon={<Clapperboard size={14} />} />
        <Kpi label="Avg views per post" value={fmt.num(m.all.avgViewsPerPost)} delta={pctChange(m.all.avgViewsPerPost, m.allPrev.avgViewsPerPost)} icon={<BarChart3 size={14} />} />
        <Kpi label="Instagram followers" value={fmt.num(m.igK.followers)} delta={pctChange(m.igK.followers, m.igK.followersStart)} hint={`+${fmt.num(m.igK.followersGained)}`} icon={<Instagram size={14} />} accent="ig" />
        <Kpi label="YouTube subscribers" value={fmt.num(m.ytK.followers)} delta={pctChange(m.ytK.followers, m.ytK.followersStart)} hint={`+${fmt.num(m.ytK.followersGained)}`} icon={<Youtube size={14} />} accent="yt" />
        <Kpi label="Growth this period" value={fmt.signedPct(m.all.growthPct)} delta={m.allPrev.growthPct ? m.all.growthPct - m.allPrev.growthPct : null} hint="pts vs previous" icon={<TrendingUp size={14} />} />
        <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-3 xl:col-span-2">
          <BestCard label="Best Reel" item={m.bestReel} />
          <BestCard label="Best YouTube Short" item={m.bestShort} />
        </div>
      </div>

      <Card title="Audience trend" subtitle="Instagram and YouTube on one timeline"
        action={<Segmented value={trendMetric} onChange={setTrendMetric} options={[{ value: 'followers', label: 'Audience' }, { value: 'followers_gained', label: 'New followers' }, { value: 'views', label: 'Views' }]} />}>
        <PlatformTrend data={series} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Instagram vs YouTube" subtitle={`Share of each metric, ${range.label.toLowerCase()}`} className="lg:col-span-3">
          <Bars layout="vertical" stacked percent height={280} data={compare} x="metric" bars={[{ key: 'Instagram', name: 'Instagram', color: CHART.ig }, { key: 'YouTube', name: 'YouTube', color: CHART.yt }]} />
        </Card>
        <Card title="Platform scorecard" className="lg:col-span-2" pad={false}>
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Metric</th><th className="th text-right">Instagram</th><th className="th text-right">YouTube</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[
                ['Audience', fmt.num(m.igK.followers), fmt.num(m.ytK.followers)],
                ['Growth', fmt.signedPct(m.igK.growthPct), fmt.signedPct(m.ytK.growthPct)],
                ['Views', fmt.num(m.igK.views), fmt.num(m.ytK.views)],
                ['Views change', fmt.signedPct(pctChange(m.igK.views, m.igP.views)), fmt.signedPct(pctChange(m.ytK.views, m.ytP.views))],
                ['Engagement rate', fmt.pct(m.igK.engagementRate), fmt.pct(m.ytK.engagementRate)],
                ['Posts', fmt.num(m.igK.posts), fmt.num(m.ytK.posts)],
                ['Avg views / post', fmt.num(m.igK.avgViewsPerPost), fmt.num(m.ytK.avgViewsPerPost)],
                ['Watch time', '—', fmt.minutes(m.ytK.watchTimeMinutes)],
              ].map(([k, a, b]) => (
                <tr key={k}><td className="td text-ink-soft">{k}</td><td className="td text-right font-medium tabular-nums">{a}</td><td className="td text-right font-medium tabular-nums">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Top content this period" action={<Link to="/content" className="text-xs font-medium text-brand">Open library</Link>} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">#</th><th className="th">Title</th><th className="th">Platform</th><th className="th">Topic</th><th className="th text-right">Views</th><th className="th text-right">Eng. rate</th></tr></thead>
            <tbody className="divide-y divide-line">
              {topContent(m.posts, 5).map((c, i) => (
                <tr key={c.id}><td className="td text-ink-mute">{i + 1}</td><td className="td max-w-[280px] truncate font-medium">{c.title}</td><td className="td"><PlatformBadge p={c.platform} /></td><td className="td text-ink-soft">{c.category}</td><td className="td text-right tabular-nums">{fmt.num(c.views)}</td><td className="td text-right tabular-nums">{fmt.pct(engagementRate(c))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
