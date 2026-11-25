import { useMemo } from 'react'
import { subDays } from 'date-fns'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { useData } from '../context/DataContext'
import { categoryStats, computeKpis, consistencyScore, contentInRange, filterPlatform, fmt, growthAnomalies, platformSeries, projectFollowers, type DateRange } from '../lib/analytics'
import { Card, DataTag, DateRangeControl, Kpi, PageHeader, CHART } from '../components/ui'
import { Bars, PlatformTrend } from '../components/charts'

export default function Growth() {
  const { dataset, range, isDemo } = useData()
  const k = computeKpis(dataset, range)
  const dailyGained = useMemo(() => platformSeries(dataset, range, 'followers_gained', 'day'), [dataset, range])
  const weeklyYt = useMemo(() => platformSeries(filterPlatform(dataset, 'youtube'), range.label === 'Last 7 days' ? { ...range, from: subDays(range.to, 83) } : range, 'followers_gained', 'week'), [dataset, range])
  const monthly = useMemo(() => {
    const r: DateRange = { from: subDays(new Date(), 364), to: new Date(), label: '12m' }
    const s = platformSeries(dataset, r, 'followers', 'month')
    return s.map((p, i) => ({ key: p.key, growth: i ? +(((p.total - s[i - 1].total) / (s[i - 1].total || 1)) * 100).toFixed(2) : 0 })).slice(1)
  }, [dataset])
  const anomalies = useMemo(() => growthAnomalies(platformSeries(dataset, { from: subDays(new Date(), 179), to: new Date(), label: '' }, 'followers_gained', 'day')).slice(-8).reverse(), [dataset])
  const proj = useMemo(() => projectFollowers(dataset, [30, 60, 90]), [dataset])
  const cons = consistencyScore(dataset.content)
  const cats = categoryStats(contentInRange(dataset, range)).slice(0, 6)
  const retention = dataset.content.filter((c) => c.platform === 'youtube' && c.avg_view_percentage != null && contentInRange(dataset, range).includes(c))
  const avgRet = retention.length ? retention.reduce((s, c) => s + (c.avg_view_percentage ?? 0), 0) / retention.length : null
  const dataKind = isDemo ? 'demo' : 'actual'

  return (
    <div className="space-y-6">
      <PageHeader title="Growth Intelligence" subtitle="Follower momentum, consistency and projections" actions={<DateRangeControl />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Net new audience" value={`+${fmt.num(k.followersGained)}`} hint={range.label} />
        <Kpi label="Avg daily growth" value={fmt.num(dailyGained.length ? dailyGained.reduce((s, p) => s + p.total, 0) / dailyGained.length : 0)} hint="followers per day" />
        <Kpi label="Growth rate" value={fmt.signedPct(k.growthPct)} hint="this period" />
        <Kpi label="Views per follower" value={(k.followers ? k.views / k.followers : 0).toFixed(2)} hint="reach beyond your audience" />
        <Kpi label="Engagement rate" value={fmt.pct(k.engagementRate)} hint="engagements / views" />
        <Kpi label="Consistency score" value={`${cons.score}/100`} hint={`${cons.perWeek.toFixed(1)} posts per week, last 8 weeks`} />
      </div>

      <Card title="Daily follower growth" subtitle="New followers and subscribers per day" action={<DataTag kind={dataKind} />}>
        <PlatformTrend data={dailyGained} kind="line" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Weekly YouTube subscriber growth" action={<DataTag kind={dataKind} />}>
          <Bars data={weeklyYt} x="key" bars={[{ key: 'youtube', name: 'Subscribers gained', color: CHART.yt }]} />
        </Card>
        <Card title="Monthly growth rate" subtitle="Change in combined audience, month over month" action={<DataTag kind={dataKind} />}>
          <Bars data={monthly} x="key" bars={[{ key: 'growth', name: 'Growth %', color: CHART.brand }]} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Growth projections" subtitle="Trend of the last 90 days, weighted to the last 30" action={<DataTag kind="prediction" />} className="lg:col-span-1">
          {proj ? (
            <div className="space-y-3">
              {proj.points.map((p) => (
                <div key={p.days} className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-3">
                  <div className="flex items-center justify-between text-xs text-ink-mute"><span>In {p.days} days (estimate)</span><span>+{fmt.num(p.expected - proj.current)}</span></div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{fmt.num(p.expected)}</div>
                  <div className="text-xs text-ink-mute">Likely range {fmt.num(p.low)} to {fmt.num(p.high)}</div>
                </div>
              ))}
              <p className="text-xs text-ink-mute">Estimates assume you keep posting at your current pace. A single viral post can move these a lot.</p>
            </div>
          ) : <p className="text-sm text-ink-mute">Needs at least 14 days of snapshots.</p>}
        </Card>
        <Card title="Unusual spikes and drops" subtitle="Days far outside your 4-week normal" action={<DataTag kind={dataKind} />} className="lg:col-span-1">
          {anomalies.length ? (
            <ul className="space-y-2">
              {anomalies.map((a) => (
                <li key={a.key} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">{a.kind === 'spike' ? <TrendingUp size={14} className="text-good" /> : <AlertTriangle size={14} className="text-bad" />}{fmt.date(a.key)}</span>
                  <span className="text-xs text-ink-soft"><strong className="text-ink">+{fmt.num(a.value)}</strong> vs normal {fmt.num(a.mean)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-mute">No unusual days in the last 6 months.</p>}
        </Card>
        <Card title="Top categories" subtitle={range.label} action={<DataTag kind={dataKind} />} className="lg:col-span-1">
          <ul className="space-y-2.5">
            {cats.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-sm"><span>{c.category}</span><span className="tabular-nums text-ink-soft">{fmt.num(c.avgViews)} avg</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, (c.avgViews / (cats[0]?.avgViews || 1)) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">YouTube audience retention: <strong className="text-ink">{avgRet == null ? 'not available yet' : `${avgRet.toFixed(0)}% average viewed`}</strong></div>
        </Card>
      </div>
    </div>
  )
}
