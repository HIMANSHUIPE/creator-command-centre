import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowUpDown, ExternalLink, Flame, TrendingDown, Rocket, Share2, Heart, Trophy, Download } from 'lucide-react'
import { useData } from '../context/DataContext'
import { categoryStats, engagementOf, engagementRate, fmt, gainingTraction, medianByAccount, performanceTier, topContent } from '../lib/analytics'
import { Card, PageHeader, PlatformBadge, Segmented, Empty } from '../components/ui'
import { CATEGORIES, type ContentItem, type Platform } from '../lib/types'
import { supabase } from '../lib/supabase'

type SortKey = 'published_at' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'er' | 'followers_gained'
type View = 'all' | 'top' | 'low' | 'traction' | 'shares' | 'engagement'

const TIER = {
  viral: 'bg-violet-100 text-violet-800',
  strong: 'bg-emerald-100 text-emerald-800',
  average: 'bg-stone-100 text-stone-700',
  low: 'bg-rose-100 text-rose-800',
}

export default function ContentLibrary() {
  const { dataset, isDemo, reload } = useData()
  const [platform, setPlatform] = useState<'all' | Platform>('all')
  const [category, setCategory] = useState('all')
  const [tier, setTier] = useState('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'views', dir: -1 })
  const [view, setView] = useState<View>('all')
  const [page, setPage] = useState(0)

  const med = useMemo(() => medianByAccount(dataset.content), [dataset.content])
  const rankMap = useMemo(() => new Map(topContent(dataset.content, dataset.content.length).map((c, i) => [c.id, i + 1])), [dataset.content])
  const categories = useMemo(() => Array.from(new Set([...CATEGORIES, ...dataset.content.map((c) => c.category).filter(Boolean) as string[]])), [dataset.content])

  const filtered = useMemo(() => {
    let list = dataset.content.filter((c) =>
      (platform === 'all' || c.platform === platform) &&
      (category === 'all' || c.category === category) &&
      (tier === 'all' || performanceTier(c, med.get(c.account_id) ?? 0) === tier) &&
      (!q || (c.title ?? '').toLowerCase().includes(q.toLowerCase())) &&
      (!from || (c.published_at ?? '') >= from) && (!to || (c.published_at ?? '').slice(0, 10) <= to))
    if (view === 'top') list = topContent(list, 10)
    if (view === 'low') list = list.filter((c) => performanceTier(c, med.get(c.account_id) ?? 0) === 'low' && c.published_at && Date.now() - +new Date(c.published_at) > 7 * 864e5)
    if (view === 'traction') list = gainingTraction(list)
    if (view === 'shares') list = topContent(list, 20, (c) => c.shares ?? 0)
    if (view === 'engagement') list = topContent(list.filter((c) => (c.views ?? 0) > 500), 20, engagementRate)
    const val = (c: ContentItem) => sort.key === 'er' ? engagementRate(c) : sort.key === 'published_at' ? +new Date(c.published_at ?? 0) : Number(c[sort.key] ?? -1)
    if (view === 'all' || view === 'low') list = [...list].sort((a, b) => (val(a) - val(b)) * sort.dir)
    return list
  }, [dataset.content, platform, category, tier, q, from, to, sort, view, med])

  const pageSize = 25
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const consistent = useMemo(() => categoryStats(dataset.content.filter((c) => platform === 'all' || c.platform === platform)).filter((c) => c.posts >= 5 && c.index >= 1.1).slice(0, 4), [dataset.content, platform])

  const setCategoryFor = async (c: ContentItem, cat: string) => {
    if (isDemo || !supabase) return
    await supabase.from('content_items').update({ category: cat }).eq('id', c.id)
    reload()
  }

  const exportCsv = () => {
    const head = ['title', 'platform', 'published', 'category', 'format', 'views', 'likes', 'comments', 'shares', 'saves', 'engagement_rate', 'followers_gained', 'rank']
    const lines = filtered.map((c) => [c.title, c.platform, c.published_at?.slice(0, 10), c.category, c.format, c.views, c.likes, c.comments, c.shares, c.saves, engagementRate(c).toFixed(2), c.followers_gained, rankMap.get(c.id)].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `content-library${isDemo ? '-DEMO' : ''}.csv`
    a.click()
  }

  const Th = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={clsx('th cursor-pointer select-none hover:text-ink', right && 'text-right')} onClick={() => { setView('all'); setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 })) }}>
      <span className="inline-flex items-center gap-1">{children}{sort.key === k && <ArrowUpDown size={11} />}</span>
    </th>
  )

  const views: { value: View; label: React.ReactNode }[] = [
    { value: 'all', label: 'All' },
    { value: 'top', label: <span className="inline-flex items-center gap-1"><Trophy size={12} />Top 10</span> },
    { value: 'traction', label: <span className="inline-flex items-center gap-1"><Rocket size={12} />Gaining traction</span> },
    { value: 'shares', label: <span className="inline-flex items-center gap-1"><Share2 size={12} />High shares</span> },
    { value: 'engagement', label: <span className="inline-flex items-center gap-1"><Heart size={12} />High engagement</span> },
    { value: 'low', label: <span className="inline-flex items-center gap-1"><TrendingDown size={12} />Low performers</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Content Library" subtitle={`${dataset.content.length} Reels, Shorts and videos`} actions={<button className="btn-secondary" onClick={exportCsv}><Download size={14} />Export CSV</button>} />

      {consistent.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {consistent.map((c) => (
            <div key={c.category} className="card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-ink-mute"><Flame size={13} className="text-warn" />Consistently strong topic</div>
              <div className="mt-1.5 text-sm font-semibold">{c.category}</div>
              <div className="mt-1 text-xs text-ink-soft">{c.index.toFixed(1)}× your average views · {c.posts} posts</div>
            </div>
          ))}
        </div>
      )}

      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="overflow-x-auto"><Segmented value={view} onChange={(v) => { setView(v); setPage(0) }} options={views} /></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <input className="input col-span-2" placeholder="Search titles…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
            <select className="input" value={platform} onChange={(e) => { setPlatform(e.target.value as 'all'); setPage(0) }}><option value="all">All platforms</option><option value="instagram">Instagram</option><option value="youtube">YouTube</option></select>
            <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setPage(0) }}><option value="all">All topics</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="input" value={tier} onChange={(e) => { setTier(e.target.value); setPage(0) }}><option value="all">All performance</option><option value="viral">Viral (4×+ median)</option><option value="strong">Strong</option><option value="average">Average</option><option value="low">Low</option></select>
            <div className="col-span-2 flex items-center gap-1">
              <input type="date" className="input px-2 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
              <input type="date" className="input px-2 text-xs" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
            </div>
          </div>
        </div>
        {rows.length === 0 ? <Empty title="No content matches these filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50/60"><tr className="border-b border-line">
                <th className="th">Rank</th><th className="th">Content</th><th className="th">Platform</th><Th k="published_at">Published</Th><th className="th">Topic</th><th className="th">Format</th>
                <Th k="views" right>Views</Th><Th k="likes" right>Likes</Th><Th k="comments" right>Comments</Th><Th k="shares" right>Shares</Th><Th k="saves" right>Saves</Th><Th k="er" right>Eng. rate</Th><Th k="followers_gained" right>Followers +</Th><th className="th">Tier</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const t = performanceTier(c, med.get(c.account_id) ?? 0)
                  return (
                    <tr key={c.id} className="hover:bg-stone-50/60">
                      <td className="td text-ink-mute tabular-nums">#{rankMap.get(c.id)}</td>
                      <td className="td max-w-[260px]"><div className="flex items-center gap-1.5"><span className="truncate font-medium">{c.title || '(untitled)'}</span>{c.permalink && <a href={c.permalink} target="_blank" rel="noreferrer" className="text-ink-mute hover:text-brand"><ExternalLink size={12} /></a>}</div></td>
                      <td className="td"><PlatformBadge p={c.platform} withLabel={false} /></td>
                      <td className="td text-ink-soft">{fmt.date(c.published_at)}</td>
                      <td className="td">
                        {isDemo ? <span className="text-ink-soft">{c.category}</span> : (
                          <select className="rounded border-0 bg-transparent p-0 text-sm text-ink-soft focus:ring-0" value={c.category ?? ''} onChange={(e) => setCategoryFor(c, e.target.value)}>
                            <option value="">Untagged</option>{categories.map((x) => <option key={x}>{x}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="td capitalize text-ink-soft">{c.format}</td>
                      <td className="td text-right font-medium tabular-nums">{fmt.num(c.views)}</td>
                      <td className="td text-right tabular-nums">{fmt.num(c.likes)}</td>
                      <td className="td text-right tabular-nums">{fmt.num(c.comments)}</td>
                      <td className="td text-right tabular-nums">{fmt.num(c.shares)}</td>
                      <td className="td text-right tabular-nums">{c.saves == null ? <span className="text-ink-mute">n/a</span> : fmt.num(c.saves)}</td>
                      <td className="td text-right tabular-nums">{fmt.pct(engagementRate(c))}</td>
                      <td className="td text-right tabular-nums">{c.followers_gained == null ? <span className="text-ink-mute">n/a</span> : fmt.num(c.followers_gained)}</td>
                      <td className="td"><span className={clsx('chip capitalize', TIER[t])}>{t}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-mute">
          <span>{filtered.length} items · total engagement {fmt.num(filtered.reduce((s, c) => s + engagementOf(c), 0))}</span>
          <div className="flex gap-2">
            <button className="btn-secondary px-2 py-1 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-secondary px-2 py-1 text-xs" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </Card>
      <p className="text-xs text-ink-mute">Tier compares each post with the median views of its own account: viral 4× or more, strong 1.5×, low under 0.6×. Saves are only reported by Instagram. Followers gained per post comes from Instagram Reels insights ("follows") and YouTube Analytics (subscribersGained).</p>
    </div>
  )
}
