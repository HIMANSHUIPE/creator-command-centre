import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Loader2, X, FlaskConical, Sparkles, Database } from 'lucide-react'
import { Instagram, Youtube } from './icons'
import { format } from 'date-fns'
import type { Platform } from '../lib/types'
import { presetRange } from '../lib/analytics'
import { useData } from '../context/DataContext'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className, pad = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(pad && 'p-5', title && pad && 'pt-3')}>{children}</div>
    </section>
  )
}

export function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-ink-mute">no prior data</span>
  const up = value >= 0
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium', up ? 'text-good' : 'text-bad')}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

export function Kpi({ label, value, delta, hint, icon, accent }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode; icon?: ReactNode; accent?: 'ig' | 'yt' | 'brand' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-mute">{label}</span>
        {icon && <span className={clsx('rounded-md p-1', accent === 'ig' ? 'bg-ig-soft text-ig' : accent === 'yt' ? 'bg-yt-soft text-yt' : 'bg-brand-soft text-brand')}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 flex min-h-[18px] items-center gap-2">
        {delta !== undefined && <Delta value={delta} />}
        {hint && <span className="truncate text-xs text-ink-mute">{hint}</span>}
      </div>
    </div>
  )
}

export function PlatformBadge({ p, withLabel = true }: { p: Platform; withLabel?: boolean }) {
  return p === 'instagram' ? (
    <span className="chip bg-ig-soft text-ig"><Instagram size={12} />{withLabel && 'Instagram'}</span>
  ) : (
    <span className="chip bg-yt-soft text-yt"><Youtube size={12} />{withLabel && 'YouTube'}</span>
  )
}

export function DemoBadge() {
  return <span className="chip bg-amber-100 text-amber-800 ring-1 ring-amber-300"><FlaskConical size={12} />DEMO</span>
}
export function DataTag({ kind }: { kind: 'actual' | 'prediction' | 'demo' }) {
  if (kind === 'demo') return <DemoBadge />
  return kind === 'actual' ? (
    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Database size={11} />Actual data</span>
  ) : (
    <span className="chip bg-violet-50 text-violet-700 ring-1 ring-violet-200"><Sparkles size={11} />Estimate</span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-mute"><Loader2 className="animate-spin" size={16} />{label ?? 'Loading…'}</div>
}

export function Empty({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-stone-100 p-3 text-ink-mute">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-mute">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={clsx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium transition', value === o.value ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DateRangeControl() {
  const { range, setRange } = useData()
  const [custom, setCustom] = useState(false)
  const keys = ['7d', '30d', '90d', '12m'] as const
  const active = keys.find((k) => presetRange(k).label === range.label) ?? 'custom'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
        {keys.map((k) => (
          <button key={k} onClick={() => { setCustom(false); setRange(presetRange(k)) }} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', active === k ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100')}>
            {k.toUpperCase()}
          </button>
        ))}
        <button onClick={() => setCustom((c) => !c)} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', active === 'custom' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-stone-100')}>Custom</button>
      </div>
      {custom && (
        <div className="flex items-center gap-1">
          <input type="date" className="input w-auto py-1 text-xs" value={format(range.from, 'yyyy-MM-dd')} onChange={(e) => e.target.value && setRange({ from: new Date(e.target.value), to: range.to, label: 'Custom' })} />
          <span className="text-xs text-ink-mute">to</span>
          <input type="date" className="input w-auto py-1 text-xs" value={format(range.to, 'yyyy-MM-dd')} onChange={(e) => e.target.value && setRange({ from: range.from, to: new Date(e.target.value), label: 'Custom' })} />
        </div>
      )}
    </div>
  )
}

export const CHART = {
  ig: '#AE3EC9',
  yt: '#E03131',
  ytAlt: '#F08C00',
  brand: '#4F46E5',
  grid: '#EFEDE8',
  axis: '#8A857D',
}
