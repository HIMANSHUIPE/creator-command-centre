import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { CHART } from './ui'
import { fmt, type SeriesPoint } from '../lib/analytics'

const tick = { fontSize: 11, fill: CHART.axis }
const fmtKey = (k: string) => { try { return format(parseISO(k), 'd MMM') } catch { return k } }

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-medium text-ink">{label ? fmtKey(label) : ''}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-soft"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="font-medium tabular-nums">{fmt.full(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function PlatformTrend({ data, mode = 'both', height = 260, kind = 'area' }: { data: SeriesPoint[]; mode?: 'both' | 'instagram' | 'youtube' | 'total'; height?: number; kind?: 'area' | 'line' }) {
  const series = mode === 'both' ? [['instagram', 'Instagram', CHART.ig], ['youtube', 'YouTube', CHART.yt]] : mode === 'total' ? [['total', 'Total', CHART.brand]] : [[mode, mode === 'instagram' ? 'Instagram' : 'YouTube', mode === 'instagram' ? CHART.ig : CHART.yt]]
  const Chart = kind === 'area' ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          {series.map(([k, , c]) => (
            <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.18} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="key" tickFormatter={fmtKey} tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => fmt.num(v)} tick={tick} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
        <Tooltip content={<Tip />} />
        {mode === 'both' && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map(([k, name, c]) =>
          kind === 'area'
            ? <Area key={k} type="monotone" dataKey={k} name={name} stroke={c} strokeWidth={2} fill={`url(#g-${k})`} dot={false} />
            : <Line key={k} type="monotone" dataKey={k} name={name} stroke={c} strokeWidth={2} dot={false} />,
        )}
      </Chart>
    </ResponsiveContainer>
  )
}

export function Bars({ data, x, bars, height = 240, layout = 'horizontal', stacked, percent }: { data: Record<string, unknown>[]; x: string; bars: { key: string; name: string; color: string }[]; height?: number; layout?: 'horizontal' | 'vertical'; stacked?: boolean; percent?: boolean }) {
  const vertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: vertical ? 8 : -8, bottom: 0 }}>
        <CartesianGrid stroke={CHART.grid} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tickFormatter={(v) => (percent ? `${v}%` : fmt.num(v))} tick={tick} tickLine={false} axisLine={false} domain={percent ? [0, 100] : undefined} />
            <YAxis type="category" dataKey={x} tick={tick} tickLine={false} axisLine={false} width={percent ? 90 : 150} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => (String(v).match(/^\d{4}-/) ? fmtKey(String(v)) : String(v))} />
            <YAxis tickFormatter={(v) => fmt.num(v)} tick={tick} tickLine={false} axisLine={false} width={48} />
          </>
        )}
        <Tooltip cursor={{ fill: '#00000008' }} formatter={(v) => (percent ? `${Number(v).toFixed(1)}%` : fmt.full(Number(v)))} contentStyle={{ borderRadius: 8, border: '1px solid #ECEAE5', fontSize: 12 }} />
        {bars.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={stacked ? 0 : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} stackId={stacked ? 's' : undefined} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
