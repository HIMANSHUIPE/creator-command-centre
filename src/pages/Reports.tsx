import { useMemo, useState } from 'react'
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { Printer, Sparkles, Loader2, Save } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { categoryStats, computeKpis, contentInRange, engagementRate, filterPlatform, fmt, pctChange, platformSeries, previousRange, topContent, type DateRange } from '../lib/analytics'
import { buildSnapshot, type Answer } from '../lib/insights'
import { callFunction, supabase } from '../lib/supabase'
import { Card, DataTag, Kpi, PageHeader, PlatformBadge, Segmented, DemoBadge } from '../components/ui'
import { PlatformTrend } from '../components/charts'
import type { ContentItem } from '../lib/types'

function periodRange(kind: 'weekly' | 'monthly', offset: number): DateRange {
  const now = new Date()
  if (kind === 'weekly') {
    const ref = subWeeks(now, offset)
    return { from: startOfWeek(ref, { weekStartsOn: 1 }), to: offset === 0 ? now : endOfWeek(ref, { weekStartsOn: 1 }), label: 'week' }
  }
  const ref = subMonths(now, offset)
  return { from: startOfMonth(ref), to: offset === 0 ? now : endOfMonth(ref), label: 'month' }
}

function PostTable({ items }: { items: ContentItem[] }) {
  return (
    <table className="w-full">
      <tbody className="divide-y divide-line">
        {items.map((c) => (
          <tr key={c.id}><td className="py-2 pr-2"><PlatformBadge p={c.platform} withLabel={false} /></td><td className="max-w-[220px] truncate py-2 text-sm">{c.title}<div className="text-xs text-ink-mute">{c.category} · {fmt.date(c.published_at)}</div></td><td className="py-2 text-right text-sm font-medium tabular-nums">{fmt.num(c.views)}</td><td className="py-2 pl-3 text-right text-xs text-ink-soft tabular-nums">{fmt.pct(engagementRate(c))}</td></tr>
        ))}
        {!items.length && <tr><td className="py-4 text-sm text-ink-mute">No posts in this period.</td></tr>}
      </tbody>
    </table>
  )
}

export default function Reports() {
  const { dataset, isDemo } = useData()
  const { session, workspace, demoGuest } = useAuth()
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly')
  const [offset, setOffset] = useState(1)
  const [ai, setAi] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const range = periodRange(kind, offset)
  const prev = previousRange(range)

  const r = useMemo(() => {
    const ig = filterPlatform(dataset, 'instagram'), yt = filterPlatform(dataset, 'youtube')
    const posts = contentInRange(dataset, range)
    const prevPosts = contentInRange(dataset, prev)
    const cats = categoryStats(posts)
    const prevCats = new Map(categoryStats(prevPosts).map((c) => [c.category, c]))
    const k = { all: computeKpis(dataset, range), allP: computeKpis(dataset, prev), ig: computeKpis(ig, range), igP: computeKpis(ig, prev), yt: computeKpis(yt, range), ytP: computeKpis(yt, prev) }
    const worked: string[] = [], didnt: string[] = []
    cats.filter((c) => c.index >= 1).slice(0, 3).forEach((c) => worked.push(`${c.category} averaged ${fmt.num(c.avgViews)} views (${c.index.toFixed(1)}× this period's average).`))
    const best = topContent(posts, 1)[0]
    if (best) worked.push(`"${best.title}" was the top post with ${fmt.num(best.views)} views.`)
    if ((pctChange(k.all.views, k.allP.views) ?? 0) > 0) worked.push(`Total views grew ${fmt.signedPct(pctChange(k.all.views, k.allP.views))} on the previous ${kind === 'weekly' ? 'week' : 'month'}.`)
    cats.slice(-2).filter((c) => c.index < 0.8).forEach((c) => didnt.push(`${c.category} averaged only ${fmt.num(c.avgViews)} views (${c.index.toFixed(1)}× average).`))
    if ((pctChange(k.all.views, k.allP.views) ?? 0) < 0) didnt.push(`Total views fell ${Math.abs(pctChange(k.all.views, k.allP.views) ?? 0).toFixed(1)}% versus the previous period.`)
    if (k.all.posts < k.allP.posts) didnt.push(`You published ${k.all.posts} posts versus ${k.allP.posts} before.`)
    const engTrend = platformSeries(dataset, range, 'likes', 'day')
    const strategy = [
      cats[0] ? `Lead with ${cats[0].category}: plan at least 3 posts.` : 'Post at least 4 times.',
      cats[1] ? `Back it up with ${cats[1].category}.` : '',
      best ? `Repurpose "${best.title}" to ${best.platform === 'instagram' ? 'YouTube Shorts' : 'Instagram Reels'}.` : '',
      didnt[0] && cats.length ? `Test a new hook for ${cats[cats.length - 1].category} or pause it for a ${kind === 'weekly' ? 'week' : 'month'}.` : '',
    ].filter(Boolean)
    return { k, posts, best5: topContent(posts, 5), worst5: topContent(posts, posts.length, (c) => -(c.views ?? 0)).slice(0, 5), cats, prevCats, worked, didnt, strategy, engTrend }
  }, [dataset, range.from.getTime(), range.to.getTime(), kind])

  const title = `${kind === 'weekly' ? 'Weekly' : 'Monthly'} report · ${format(range.from, 'd MMM')} to ${format(range.to, 'd MMM yyyy')}`
  const canAi = !!supabase && !!session && !demoGuest

  const aiSummary = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await callFunction<Answer>('api/ai-strategist', { question: `Write the ${kind} performance summary for ${format(range.from, 'd MMM')} to ${format(range.to, 'd MMM yyyy')}: what worked, what did not, and next ${kind === 'weekly' ? "week's" : "month's"} content strategy.`, snapshot: { ...buildSnapshot(dataset), report_period: { kpis: r.k, top: r.best5.map((c) => ({ title: c.title, views: c.views, category: c.category })), categories: r.cats.slice(0, 6) } }, demo: isDemo })
      setAi(res)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const saveReport = async () => {
    if (!supabase || !workspace) return
    const { error } = await supabase.from('reports').upsert({ workspace_id: workspace.id, period: kind, period_start: format(range.from, 'yyyy-MM-dd'), period_end: format(range.to, 'yyyy-MM-dd'), content: { kpis: r.k, best5: r.best5.map((c) => c.id), worst5: r.worst5.map((c) => c.id), worked: r.worked, didnt: r.didnt, strategy: r.strategy, ai } }, { onConflict: 'workspace_id,period,period_start' })
    setMsg(error ? error.message : 'Report saved to your workspace.')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Weekly and monthly performance, ready to export as PDF"
        actions={<>
          <Segmented value={kind} onChange={(v) => { setKind(v); setOffset(1); setAi(null) }} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
          <select className="input w-auto py-1.5 text-xs" value={offset} onChange={(e) => { setOffset(Number(e.target.value)); setAi(null) }}>
            {[0, 1, 2, 3, 4, 5].map((o) => { const pr = periodRange(kind, o); return <option key={o} value={o}>{o === 0 ? `This ${kind === 'weekly' ? 'week' : 'month'} (so far)` : `${format(pr.from, 'd MMM')} to ${format(pr.to, 'd MMM')}`}</option> })}
          </select>
          {canAi && <button className="btn-secondary" onClick={aiSummary} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}AI summary</button>}
          {canAi && !isDemo && <button className="btn-secondary" onClick={saveReport}><Save size={14} />Save</button>}
          <button className="btn-primary" onClick={() => window.print()}><Printer size={14} />Export PDF</button>
        </>} />
      {msg && <p className="no-print rounded-lg bg-stone-100 p-3 text-xs text-ink-soft">{msg}</p>}

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {isDemo && <DemoBadge />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total views" value={fmt.num(r.k.all.views)} delta={pctChange(r.k.all.views, r.k.allP.views)} />
          <Kpi label="Audience gained" value={`+${fmt.num(r.k.all.followersGained)}`} delta={pctChange(r.k.all.followersGained, r.k.allP.followersGained)} />
          <Kpi label="Engagement rate" value={fmt.pct(r.k.all.engagementRate)} delta={r.k.allP.engagementRate ? r.k.all.engagementRate - r.k.allP.engagementRate : null} hint="pts" />
          <Kpi label="Posts published" value={r.k.all.posts} delta={pctChange(r.k.all.posts, r.k.allP.posts)} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {([['Instagram performance', r.k.ig, r.k.igP, 'Followers'], ['YouTube performance', r.k.yt, r.k.ytP, 'Subscribers']] as const).map(([t, k, kp, label]) => (
          <Card key={t} title={t}>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-soft">{label}</dt><dd className="text-right font-medium">{fmt.num(k.followers)} <span className="text-xs text-good">+{fmt.num(k.followersGained)}</span></dd>
              <dt className="text-ink-soft">Views</dt><dd className="text-right font-medium">{fmt.num(k.views)} <span className="text-xs text-ink-mute">{fmt.signedPct(pctChange(k.views, kp.views))}</span></dd>
              <dt className="text-ink-soft">Engagement</dt><dd className="text-right font-medium">{fmt.num(k.engagement)} <span className="text-xs text-ink-mute">{fmt.pct(k.engagementRate)}</span></dd>
              <dt className="text-ink-soft">Posts</dt><dd className="text-right font-medium">{k.posts}</dd>
              <dt className="text-ink-soft">Avg views per post</dt><dd className="text-right font-medium">{fmt.num(k.avgViewsPerPost)}</dd>
            </dl>
          </Card>
        ))}
      </div>

      <Card title="Audience engagement trend" subtitle="Likes per day"><PlatformTrend data={r.engTrend} height={200} kind="line" /></Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Best 5 videos"><PostTable items={r.best5} /></Card>
        <Card title="Worst 5 videos"><PostTable items={r.worst5} /></Card>
      </div>

      <Card title="Top-performing topics">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-ink-mute"><th className="py-1 text-left font-medium">Topic</th><th className="text-right font-medium">Posts</th><th className="text-right font-medium">Avg views</th><th className="text-right font-medium">vs prev.</th><th className="text-right font-medium">Eng. rate</th></tr></thead>
          <tbody className="divide-y divide-line">{r.cats.slice(0, 6).map((c) => { const p = r.prevCats.get(c.category); return <tr key={c.category}><td className="py-1.5">{c.category}</td><td className="text-right">{c.posts}</td><td className="text-right font-medium">{fmt.num(c.avgViews)}</td><td className="text-right text-xs text-ink-soft">{p ? fmt.signedPct(pctChange(c.avgViews, p.avgViews)) : 'new'}</td><td className="text-right">{fmt.pct(c.engagementRate)}</td></tr> })}</tbody>
        </table>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="What worked" action={<DataTag kind={isDemo ? 'demo' : 'actual'} />}><ul className="space-y-2 text-sm">{r.worked.map((w, i) => <li key={i}>✓ {w}</li>)}</ul></Card>
        <Card title="What did not work" action={<DataTag kind={isDemo ? 'demo' : 'actual'} />}><ul className="space-y-2 text-sm">{r.didnt.length ? r.didnt.map((w, i) => <li key={i}>✕ {w}</li>) : <li className="text-ink-mute">Nothing stood out as weak.</li>}</ul></Card>
        <Card title={`Next ${kind === 'weekly' ? "week's" : "month's"} strategy`} action={<DataTag kind="prediction" />}><ol className="list-decimal space-y-2 pl-4 text-sm">{r.strategy.map((w, i) => <li key={i}>{w}</li>)}</ol></Card>
      </div>

      {ai && (
        <Card title="AI summary" action={<DataTag kind="prediction" />}>
          <div className="space-y-3 text-sm">
            {ai.facts.length > 0 && <div><p className="mb-1 text-xs font-semibold text-ink-mute">FROM YOUR DATA</p><ul className="list-disc space-y-1 pl-4">{ai.facts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
            <div><p className="mb-1 text-xs font-semibold text-ink-mute">RECOMMENDATIONS</p><ul className="list-disc space-y-1 pl-4">{ai.recommendations.map((f, i) => <li key={i}>{f.text}</li>)}</ul></div>
            {ai.predictions.length > 0 && <div><p className="mb-1 text-xs font-semibold text-ink-mute">ESTIMATES</p><ul className="list-disc space-y-1 pl-4">{ai.predictions.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
          </div>
        </Card>
      )}
      <p className="text-xs text-ink-mute">Generated {format(new Date(), 'd MMM yyyy, HH:mm')}. {isDemo ? 'DEMO sample data.' : 'Source: Instagram Graph API and YouTube Analytics API daily snapshots.'}</p>
    </div>
  )
}
