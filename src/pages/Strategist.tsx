import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Send, Sparkles, Loader2, Info } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { buildSnapshot, QUESTIONS, ruleAnswer, type Answer } from '../lib/insights'
import { callFunction, supabase } from '../lib/supabase'
import { Card, DataTag, PageHeader } from '../components/ui'

export default function Strategist() {
  const { dataset, isDemo } = useData()
  const { session, demoGuest } = useAuth()
  const snapshot = useMemo(() => buildSnapshot(dataset), [dataset])
  const [question, setQuestion] = useState<string>(QUESTIONS[0])
  const [custom, setCustom] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(() => ruleAnswer(QUESTIONS[0], buildSnapshot(dataset)))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const canUseAi = !!supabase && !!session && !demoGuest

  const ask = async (q: string, useAi: boolean) => {
    setQuestion(q)
    setNote(null)
    const rules = ruleAnswer(q, snapshot)
    setAnswer(rules)
    if (!useAi) return
    setBusy(true)
    try {
      const res = await callFunction<Answer>('api/ai-strategist', { question: q, snapshot, demo: isDemo })
      setAnswer({ ...res, source: 'openai', facts: res.facts?.length ? res.facts : rules.facts })
    } catch (e) {
      setNote(`AI unavailable (${(e as Error).message}). Showing rule-based analysis of your data instead.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="AI Strategist" subtitle="Answers built from your account data. Facts and estimates are always labelled." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title="Ask about your channels" pad={false}>
          <ul className="p-2">
            {QUESTIONS.map((q) => (
              <li key={q}>
                <button onClick={() => ask(q, canUseAi)} className={clsx('w-full rounded-lg px-3 py-2 text-left text-sm transition', question === q ? 'bg-brand-soft font-medium text-brand' : 'text-ink-soft hover:bg-stone-100')}>{q}</button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) ask(custom.trim(), canUseAi) }}>
            <input className="input" placeholder={canUseAi ? 'Ask anything…' : 'Sign in to ask your own question'} value={custom} onChange={(e) => setCustom(e.target.value)} disabled={!canUseAi} />
            <button className="btn-primary px-3" disabled={!canUseAi || !custom.trim()} aria-label="Ask"><Send size={14} /></button>
          </form>
        </Card>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{question}</h2>
              <div className="flex items-center gap-2">
                {isDemo && <DataTag kind="demo" />}
                {busy && <span className="flex items-center gap-1 text-xs text-ink-mute"><Loader2 size={12} className="animate-spin" />Asking the AI…</span>}
                {answer && !busy && <span className="chip bg-stone-100 text-ink-soft">{answer.source === 'openai' ? <><Sparkles size={11} />AI analysis</> : 'Rule-based analysis'}</span>}
              </div>
            </div>
            {note && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><Info size={14} className="mt-0.5 shrink-0" />{note}</p>}
          </div>

          {answer && (
            <>
              <Card title="What the data says" action={<DataTag kind={isDemo ? 'demo' : 'actual'} />}>
                <ul className="space-y-2">{answer.facts.map((f, i) => <li key={i} className="flex gap-2 text-sm"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{f}</li>)}</ul>
              </Card>
              <Card title="Recommendations" subtitle="What to do, based on the facts above">
                <ol className="space-y-3">
                  {answer.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-medium text-white">{i + 1}</span>
                      <div><p className="text-sm font-medium">{r.text}</p>{r.why && <p className="mt-0.5 text-xs text-ink-mute">{r.why}</p>}</div>
                    </li>
                  ))}
                </ol>
              </Card>
              {answer.predictions.length > 0 && (
                <Card title="Predictions" action={<DataTag kind="prediction" />} className="border-dashed border-violet-200">
                  <ul className="space-y-2">{answer.predictions.map((p, i) => <li key={i} className="flex gap-2 text-sm text-ink-soft"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />{p}</li>)}</ul>
                </Card>
              )}
            </>
          )}
          {!canUseAi && <p className="text-xs text-ink-mute">Rule-based answers are computed in your browser from the data shown. Sign in and add an OpenAI key in Supabase to get AI-written strategy on top.</p>}
        </div>
      </div>
    </div>
  )
}
