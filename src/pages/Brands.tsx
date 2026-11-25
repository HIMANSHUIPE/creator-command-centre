import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { subDays } from 'date-fns'
import { Plus, Trash2, FileBadge, Printer, Mail, Phone } from 'lucide-react'
import { useCollection } from '../lib/useCollection'
import { getDemoBrands } from '../lib/demo'
import { useData } from '../context/DataContext'
import { categoryStats, computeKpis, contentInRange, filterPlatform, fmt, topContent } from '../lib/analytics'
import type { BrandCollab } from '../lib/types'
import { Card, DemoBadge, Empty, Kpi, Modal, PageHeader, PlatformBadge, Spinner } from '../components/ui'

const PAY: Record<BrandCollab['payment_status'], string> = {
  not_due: 'bg-stone-100 text-stone-700', invoiced: 'bg-sky-100 text-sky-800', pending: 'bg-amber-100 text-amber-800',
  partially_paid: 'bg-orange-100 text-orange-800', paid: 'bg-emerald-100 text-emerald-800', overdue: 'bg-rose-100 text-rose-800', cancelled: 'bg-stone-200 text-stone-600',
}
const STAGES = ['lead', 'negotiating', 'confirmed', 'live', 'completed', 'lost']
const blank: Partial<BrandCollab> = { brand_name: '', deal_type: 'paid', currency: 'INR', payment_status: 'not_due', stage: 'lead' }

function MediaKit() {
  const { dataset, isDemo } = useData()
  const r = { from: subDays(new Date(), 29), to: new Date(), label: '30d' }
  const all = computeKpis(dataset, r)
  const ig = computeKpis(filterPlatform(dataset, 'instagram'), r)
  const yt = computeKpis(filterPlatform(dataset, 'youtube'), r)
  const r90 = { from: subDays(new Date(), 89), to: new Date(), label: '90d' }
  const cats = categoryStats(contentInRange(dataset, r90)).slice(0, 4)
  const best = topContent(contentInRange(dataset, r90), 3)
  return (
    <div className="space-y-5" id="media-kit">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Creator Media Kit</h2>
          <p className="text-sm text-ink-soft">Children's education · fun facts, animals, science and activities · Parents, families and educators in India and worldwide</p>
        </div>
        {isDemo && <DemoBadge />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total audience" value={fmt.num(all.followers)} />
        <Kpi label="Monthly views" value={fmt.num(all.views)} />
        <Kpi label="Engagement rate" value={fmt.pct(all.engagementRate)} />
        <Kpi label="30-day growth" value={fmt.signedPct(all.growthPct)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {dataset.accounts.map((a) => {
          const k = computeKpis({ accounts: [a], daily: dataset.daily.filter((d) => d.account_id === a.id), content: dataset.content.filter((c) => c.account_id === a.id) }, r)
          return (
            <div key={a.id} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">{a.display_name}</span><PlatformBadge p={a.platform} withLabel={false} /></div>
              <div className="text-xs text-ink-mute">{a.handle}</div>
              <div className="mt-2 flex gap-4 text-xs"><span><strong>{fmt.num(k.followers)}</strong> {a.platform === 'youtube' ? 'subscribers' : 'followers'}</span><span><strong>{fmt.num(k.views)}</strong> views / 30d</span></div>
            </div>
          )
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">Top content themes</h3><ul className="space-y-1 text-sm">{cats.map((c) => <li key={c.category} className="flex justify-between"><span>{c.category}</span><span className="text-ink-soft">{fmt.num(c.avgViews)} avg views</span></li>)}</ul></div>
        <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">Recent hits</h3><ul className="space-y-1 text-sm">{best.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.title}</span><span className="shrink-0 text-ink-soft">{fmt.num(c.views)}</span></li>)}</ul></div>
      </div>
      <p className="text-xs text-ink-mute">Instagram: {fmt.num(ig.followers)} followers, {fmt.pct(ig.engagementRate)} engagement. YouTube: {fmt.num(yt.followers)} subscribers, {fmt.minutes(yt.watchTimeMinutes)} watch time in 30 days. Figures from platform APIs{isDemo ? ' (DEMO sample data)' : ''}, as of {fmt.date(new Date().toISOString().slice(0, 10))}.</p>
      <button className="btn-primary no-print" onClick={() => { document.body.classList.add('print-kit'); window.print(); document.body.classList.remove('print-kit') }}><Printer size={14} />Print or save as PDF</button>
    </div>
  )
}

export default function Brands() {
  const { items, loading, upsert, remove, persistent, error } = useCollection<BrandCollab>('brand_collaborations', getDemoBrands, 'campaign_deadline')
  const [editing, setEditing] = useState<Partial<BrandCollab> | null>(null)
  const [kit, setKit] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const totals = useMemo(() => {
    const paid = items.filter((i) => i.payment_status === 'paid').reduce((s, i) => s + (i.final_amount ?? 0), 0)
    const pending = items.filter((i) => ['invoiced', 'pending', 'partially_paid', 'overdue'].includes(i.payment_status)).reduce((s, i) => s + (i.final_amount ?? i.quoted_amount ?? 0), 0)
    const active = items.filter((i) => ['confirmed', 'live', 'negotiating'].includes(i.stage)).length
    const due = items.filter((i) => i.campaign_deadline && i.campaign_deadline >= new Date().toISOString().slice(0, 10) && i.stage !== 'completed').sort((a, b) => a.campaign_deadline!.localeCompare(b.campaign_deadline!))[0]
    return { paid, pending, active, due }
  }, [items])

  const save = async () => {
    if (!editing?.brand_name) return
    setErr(null)
    try {
      const n = (v: unknown) => (v === '' || v == null ? null : Number(v))
      await upsert({ ...editing, quoted_amount: n(editing.quoted_amount), final_amount: n(editing.final_amount), campaign_deadline: editing.campaign_deadline || null })
      setEditing(null)
    } catch (e) { setErr((e as Error).message) }
  }

  const F = ({ label, k, type = 'text', span }: { label: string; k: keyof BrandCollab; type?: string; span?: boolean }) => (
    <div className={span ? 'sm:col-span-2' : ''}><label className="label">{label}</label><input type={type} className="input" value={(editing?.[k] as string | number | null) ?? ''} onChange={(e) => setEditing({ ...editing!, [k]: e.target.value })} /></div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Brand Collaborations" subtitle={persistent ? 'Deals, deliverables and payments' : 'Demo deals, saved in this browser only'}
        actions={<><button className="btn-secondary" onClick={() => setKit(true)}><FileBadge size={14} />Media kit</button><button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={14} />Add deal</button></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Received" value={fmt.money(totals.paid)} />
        <Kpi label="Awaiting payment" value={fmt.money(totals.pending)} />
        <Kpi label="Active deals" value={totals.active} />
        <Kpi label="Next deadline" value={totals.due ? fmt.date(totals.due.campaign_deadline) : '—'} hint={totals.due?.brand_name} />
      </div>
      <Card pad={false}>
        {loading ? <Spinner /> : items.length === 0 ? <Empty title="No brand deals yet" body="Track every brand conversation from first email to final payment." action={<button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={14} />Add deal</button>} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50/60"><tr className="border-b border-line"><th className="th">Brand</th><th className="th">Contact</th><th className="th">Type</th><th className="th">Deal</th><th className="th text-right">Quoted</th><th className="th text-right">Final</th><th className="th">Deliverables</th><th className="th">Deadline</th><th className="th">Stage</th><th className="th">Payment</th><th className="th">Performance</th></tr></thead>
              <tbody className="divide-y divide-line">
                {items.map((b) => (
                  <tr key={b.id} className="cursor-pointer hover:bg-stone-50/60" onClick={() => setEditing(b)}>
                    <td className="td font-medium">{b.brand_name}</td>
                    <td className="td text-xs text-ink-soft">{b.contact_name}<div className="flex gap-2">{b.contact_email && <span className="inline-flex items-center gap-0.5"><Mail size={10} />{b.contact_email}</span>}{b.contact_phone && <span className="inline-flex items-center gap-0.5"><Phone size={10} />{b.contact_phone}</span>}</div></td>
                    <td className="td text-ink-soft">{b.collaboration_type}</td>
                    <td className="td capitalize">{b.deal_type}</td>
                    <td className="td text-right tabular-nums">{fmt.money(b.quoted_amount, b.currency)}</td>
                    <td className="td text-right font-medium tabular-nums">{fmt.money(b.final_amount, b.currency)}</td>
                    <td className="td max-w-[200px] truncate text-ink-soft">{b.deliverables}</td>
                    <td className="td">{fmt.date(b.campaign_deadline)}</td>
                    <td className="td capitalize">{b.stage}</td>
                    <td className="td"><span className={clsx('chip', PAY[b.payment_status])}>{b.payment_status.replace('_', ' ')}</span></td>
                    <td className="td max-w-[180px] truncate text-xs text-ink-soft">{b.performance_notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="p-4 text-xs text-bad">{error}</p>}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit deal' : 'New brand deal'} wide>
        {editing && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save() }}>
            <F label="Brand name" k="brand_name" span />
            <F label="Contact name" k="contact_name" />
            <F label="Contact email" k="contact_email" type="email" />
            <F label="Contact phone" k="contact_phone" />
            <F label="Collaboration type" k="collaboration_type" />
            <div><label className="label">Paid or barter</label><select className="input" value={editing.deal_type} onChange={(e) => setEditing({ ...editing, deal_type: e.target.value as 'paid' })}><option value="paid">Paid</option><option value="barter">Barter</option><option value="affiliate">Affiliate</option><option value="hybrid">Paid + barter</option></select></div>
            <div><label className="label">Currency</label><select className="input" value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></div>
            <F label="Quoted amount" k="quoted_amount" type="number" />
            <F label="Final agreed amount" k="final_amount" type="number" />
            <F label="Campaign deadline" k="campaign_deadline" type="date" />
            <div><label className="label">Stage</label><select className="input capitalize" value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="label">Payment status</label><select className="input" value={editing.payment_status} onChange={(e) => setEditing({ ...editing, payment_status: e.target.value as 'paid' })}>{Object.keys(PAY).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label">Deliverables</label><textarea className="input min-h-[60px]" value={editing.deliverables ?? ''} onChange={(e) => setEditing({ ...editing, deliverables: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">Campaign performance</label><textarea className="input min-h-[60px]" placeholder="Views, engagement, clicks, brand feedback" value={editing.performance_notes ?? ''} onChange={(e) => setEditing({ ...editing, performance_notes: e.target.value })} /></div>
            {err && <p className="text-xs text-bad sm:col-span-2">{err}</p>}
            <div className="flex items-center justify-between sm:col-span-2">
              {editing.id ? <button type="button" className="btn-ghost text-bad" onClick={async () => { await remove(editing.id!); setEditing(null) }}><Trash2 size={14} />Delete</button> : <span />}
              <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary">Save</button></div>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={kit} onClose={() => setKit(false)} title="Media kit" wide><MediaKit /></Modal>
    </div>
  )
}
