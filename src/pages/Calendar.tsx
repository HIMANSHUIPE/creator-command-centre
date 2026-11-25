import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarCheck } from 'lucide-react'
import { useCollection } from '../lib/useCollection'
import { getDemoCalendar } from '../lib/demo'
import { useData } from '../context/DataContext'
import { fmt, platformSeries } from '../lib/analytics'
import { CATEGORIES, type CalendarItem, type CalendarStatus } from '../lib/types'
import { Card, DataTag, Modal, PageHeader, Segmented, Spinner, DemoBadge } from '../components/ui'

const STATUS: Record<CalendarStatus, string> = {
  idea: 'bg-stone-100 text-stone-700',
  draft: 'bg-amber-100 text-amber-800',
  ready: 'bg-sky-100 text-sky-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  published: 'bg-emerald-100 text-emerald-800',
  repurpose: 'bg-fuchsia-100 text-fuchsia-800',
}
const blank = (date: string): Partial<CalendarItem> => ({ title: '', platform: 'instagram', format: 'reel', category: CATEGORIES[0], planned_date: date, status: 'draft', priority: 2, hook: '', caption: '', script: '', hashtags: [] })

function useFrequencyAdvice() {
  const { dataset } = useData()
  return useMemo(() => {
    const r = { from: subDays(new Date(), 181), to: new Date(), label: '' }
    const gained = platformSeries(dataset, r, 'followers_gained', 'week')
    const views = platformSeries(dataset, r, 'views', 'week')
    const posts = new Map<string, number>()
    dataset.content.forEach((c) => {
      if (!c.published_at) return
      const k = format(startOfWeek(new Date(c.published_at), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      posts.set(k, (posts.get(k) ?? 0) + 1)
    })
    const buckets = new Map<string, { weeks: number; gained: number; views: number }>()
    gained.forEach((g, i) => {
      const p = posts.get(g.key) ?? 0
      const b = p <= 2 ? '0-2' : p <= 4 ? '3-4' : p <= 6 ? '5-6' : p <= 9 ? '7-9' : '10+'
      const cur = buckets.get(b) ?? { weeks: 0, gained: 0, views: 0 }
      cur.weeks++; cur.gained += g.total; cur.views += views[i]?.total ?? 0
      buckets.set(b, cur)
    })
    const rows = [...buckets.entries()].map(([b, v]) => ({ bucket: b, weeks: v.weeks, avgGained: v.gained / v.weeks, avgViews: v.views / v.weeks })).filter((x) => x.weeks >= 2).sort((a, b) => b.avgGained - a.avgGained)
    const current = [...posts.values()].slice(-8).reduce((a, b) => a + b, 0) / 8
    return { rows, best: rows[0], current }
  }, [dataset])
}

export default function CalendarPage() {
  const { items, loading, error, upsert, remove, persistent } = useCollection<CalendarItem>('calendar_items', getDemoCalendar, 'planned_date')
  const { isDemo } = useData()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [cursor, setCursor] = useState(new Date())
  const [editing, setEditing] = useState<Partial<CalendarItem> | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const advice = useFrequencyAdvice()

  const days = view === 'week'
    ? eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) })
    : eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) })
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    items.forEach((i) => { if (!m.has(i.planned_date)) m.set(i.planned_date, []); m.get(i.planned_date)!.push(i) })
    m.forEach((list) => list.sort((a, b) => a.priority - b.priority))
    return m
  }, [items])
  const step = (dir: 1 | -1) => setCursor((c) => (view === 'week' ? addWeeks(c, dir) : addMonths(c, dir)))
  const inView = items.filter((i) => i.planned_date >= format(days[0], 'yyyy-MM-dd') && i.planned_date <= format(days[days.length - 1], 'yyyy-MM-dd'))
  const counts = (Object.keys(STATUS) as CalendarStatus[]).map((s) => ({ s, n: inView.filter((i) => i.status === s).length }))

  const save = async () => {
    if (!editing?.title) return
    setSaveErr(null)
    try {
      await upsert({ ...editing, hashtags: (editing.hashtags ?? []).slice(0, 5) })
      setEditing(null)
    } catch (e) { setSaveErr((e as Error).message) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Content Calendar" subtitle={persistent ? 'Saved to your workspace' : 'Demo calendar, saved in this browser only'}
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          <button className="btn-primary" onClick={() => setEditing(blank(format(addDays(new Date(), 1), 'yyyy-MM-dd')))}><Plus size={14} />Plan content</button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card pad={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-1">
              <button className="btn-ghost p-1.5" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={16} /></button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setCursor(new Date())}>Today</button>
              <button className="btn-ghost p-1.5" onClick={() => step(1)} aria-label="Next"><ChevronRight size={16} /></button>
            </div>
            <span className="text-sm font-medium">{view === 'week' ? `${format(days[0], 'd MMM')} to ${format(days[6], 'd MMM yyyy')}` : format(cursor, 'MMMM yyyy')}</span>
            {!persistent ? <DemoBadge /> : <span />}
          </div>
          {loading ? <Spinner /> : (
            <div className={clsx('grid', view === 'week' ? 'grid-cols-1 md:grid-cols-7' : 'grid-cols-7')}>
              {view === 'month' && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="border-b border-line px-2 py-1.5 text-center text-[11px] font-medium text-ink-mute">{d}</div>)}
              {days.map((d) => {
                const key = format(d, 'yyyy-MM-dd')
                const list = byDay.get(key) ?? []
                return (
                  <div key={key} onClick={() => setEditing(blank(key))}
                    className={clsx('group cursor-pointer border-b border-r border-line p-1.5 transition hover:bg-stone-50', view === 'week' ? 'min-h-[120px] md:min-h-[360px]' : 'min-h-[86px] sm:min-h-[110px]', view === 'month' && !isSameMonth(d, cursor) && 'bg-stone-50/60 text-ink-mute')}>
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={clsx('rounded-full px-1.5 text-xs', isToday(d) ? 'bg-brand font-semibold text-white' : 'text-ink-soft')}>{view === 'week' ? format(d, 'EEE d') : format(d, 'd')}</span>
                      <Plus size={12} className="text-ink-mute opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, view === 'month' ? 3 : 10).map((i) => (
                        <button key={i.id} onClick={(e) => { e.stopPropagation(); setEditing(i) }}
                          className={clsx('block w-full rounded-md border-l-2 bg-white px-1.5 py-1 text-left shadow-card ring-1 ring-line hover:ring-brand/40', i.platform === 'instagram' ? 'border-l-ig' : 'border-l-yt')}>
                          <span className="line-clamp-2 text-[11px] font-medium leading-tight">{i.priority === 1 && '★ '}{i.title}</span>
                          {view === 'week' && <span className={clsx('chip mt-1 px-1.5 py-0 text-[10px] capitalize', STATUS[i.status])}>{i.status}</span>}
                        </button>
                      ))}
                      {view === 'month' && list.length > 3 && <span className="px-1 text-[10px] text-ink-mute">+{list.length - 3} more</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {error && <p className="p-4 text-xs text-bad">{error}</p>}
        </Card>

        <div className="space-y-4">
          <Card title="In this view">
            <div className="grid grid-cols-2 gap-2">
              {counts.map(({ s, n }) => <div key={s} className="flex items-center justify-between rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs"><span className={clsx('chip capitalize', STATUS[s])}>{s}</span><span className="font-semibold tabular-nums">{n}</span></div>)}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft"><CalendarCheck size={13} />{inView.filter((i) => i.status === 'published').length} of {inView.length} completed</p>
          </Card>
          <Card title="Posting frequency" action={<DataTag kind={isDemo ? 'demo' : 'actual'} />}>
            {advice.best ? (
              <>
                <p className="text-sm">Weeks where you posted <strong>{advice.best.bucket}</strong> times gained the most followers: about <strong>{fmt.num(advice.best.avgGained)}</strong> a week.</p>
                <p className="mt-2 text-xs text-ink-soft">You are currently at {advice.current.toFixed(1)} posts per week across all accounts.</p>
                <table className="mt-3 w-full text-xs">
                  <thead><tr className="text-ink-mute"><th className="py-1 text-left font-medium">Posts/week</th><th className="text-right font-medium">Weeks</th><th className="text-right font-medium">Avg gained</th></tr></thead>
                  <tbody>{advice.rows.map((r) => <tr key={r.bucket} className="border-t border-line"><td className="py-1">{r.bucket}</td><td className="text-right">{r.weeks}</td><td className="text-right font-medium">{fmt.num(r.avgGained)}</td></tr>)}</tbody>
                </table>
                <p className="mt-2 text-[11px] text-ink-mute">Based on the last 26 weeks. Correlation, not proof: big weeks may also have had stronger topics.</p>
              </>
            ) : <p className="text-sm text-ink-mute">Needs a few weeks of history.</p>}
          </Card>
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit planned content' : 'Plan content'} wide>
        {editing && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save() }}>
            <div className="sm:col-span-2"><label className="label">Title</label><input className="input" required value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
            <div><label className="label">Platform</label><select className="input" value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value as 'instagram', format: e.target.value === 'instagram' ? 'reel' : 'short' })}><option value="instagram">Instagram Reel</option><option value="youtube">YouTube Short</option></select></div>
            <div><label className="label">Publish date</label><input type="date" className="input" value={editing.planned_date} onChange={(e) => setEditing({ ...editing, planned_date: e.target.value })} /></div>
            <div><label className="label">Status</label><select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as CalendarStatus })}>{(Object.keys(STATUS) as CalendarStatus[]).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</select></div>
            <div><label className="label">Priority</label><select className="input" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) as 1 })}><option value={1}>High</option><option value={2}>Normal</option><option value={3}>Low</option></select></div>
            <div><label className="label">Topic</label><select className="input" value={editing.category ?? ''} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Hashtags (max 5)</label><input className="input" value={(editing.hashtags ?? []).join(' ')} onChange={(e) => setEditing({ ...editing, hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 5) })} placeholder="#kidslearning #funfacts" /></div>
            <div className="sm:col-span-2"><label className="label">Hook</label><input className="input" value={editing.hook ?? ''} onChange={(e) => setEditing({ ...editing, hook: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Caption</label><textarea className="input min-h-[70px]" value={editing.caption ?? ''} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Script</label><textarea className="input min-h-[120px] font-mono text-xs" value={editing.script ?? ''} onChange={(e) => setEditing({ ...editing, script: e.target.value })} /></div>
            {saveErr && <p className="text-xs text-bad sm:col-span-2">{saveErr}</p>}
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              {editing.id ? <button type="button" className="btn-ghost text-bad" onClick={async () => { await remove(editing.id!); setEditing(null) }}><Trash2 size={14} />Delete</button> : <span />}
              <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary">Save</button></div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
