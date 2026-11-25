import { useMemo, useState } from 'react'
import { format, addDays } from 'date-fns'
import { Lightbulb, Loader2, CalendarPlus, Copy, Check, Info } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { categoryStats, fmt } from '../lib/analytics'
import { callFunction, supabase } from '../lib/supabase'
import { useCollection } from '../lib/useCollection'
import { getDemoCalendar } from '../lib/demo'
import { CATEGORIES, type CalendarItem } from '../lib/types'
import { Card, PageHeader, PlatformBadge, Segmented, Empty, DataTag } from '../components/ui'

export interface Idea {
  platform: 'instagram' | 'youtube'
  category: string
  title: string
  hook: string
  script_30s: string
  script_60s: string
  caption: string
  seo_keywords: string[]
  hashtags: string[]
  youtube_title?: string
  youtube_description?: string
  cta: string
}

// Offline fallback so the module is usable before OpenAI is configured. Labelled as templates.
function templateIdeas(cats: string[], platform: 'instagram' | 'youtube' | 'both', n: number): Idea[] {
  const seeds: Record<string, [string, string][]> = {
    'Animal facts': [['Why do cats purr?', 'Your cat is secretly healing itself!'], ['Which animal never sleeps?', 'This animal has NEVER slept... or has it?'], ['How do penguins stay warm?', 'Penguins have a secret winter coat!']],
    'Science experiments': [['Dancing raisins', 'Can raisins really dance? Watch this!'], ['Make a rainbow in a glass', 'You only need sugar and water for this rainbow!']],
    'Human body': [['Why is blood red?', 'Your blood is a secret colour inside your body!'], ['How fast do nails grow?', 'Your nails are racing right now!']],
    'Space and planets': [['Why does the Moon change shape?', 'The Moon is playing hide and seek!'], ['How cold is space?', 'Space is colder than your freezer... by a LOT!']],
    'Numbers and alphabets': [['Count to 10 with dinosaurs', 'Can you count all the dinosaurs before they run away?']],
    'General knowledge': [['Why do we have leap years?', 'February has a secret extra day!']],
    'Water and nature': [['Why is the sky blue?', 'The sky is actually stealing a colour!'], ['How do rainbows form?', 'Every rainbow is a full circle. Really!']],
    'Educational activities': [['Paper cup telephone', 'Make a phone with just two cups!']],
    'Mini rescue scenarios': [['Rescue the animals from the jelly!', 'Oh no! The animals are stuck in jelly! Can we save them?'], ['Free the toys from the bubble wrap maze', 'Ten toys are trapped! Let\'s count them as we rescue them!']],
    'Parenting and learning': [['5 questions that make kids think', 'Ask your child question number 3 tonight!']],
  }
  const plats: ('instagram' | 'youtube')[] = platform === 'both' ? ['instagram', 'youtube'] : [platform]
  const out: Idea[] = []
  let i = 0
  while (out.length < n && i < 200) {
    const cat = cats[i % cats.length]
    const s = seeds[cat] ?? seeds['Animal facts']
    const [title, hook] = s[Math.floor(i / cats.length) % s.length]
    const p = plats[out.length % plats.length]
    out.push({
      platform: p, category: cat, title, hook,
      script_30s: `[0-3s] ${hook}\n[3-20s] Show the answer step by step with one clear visual.\n[20-27s] Recap the fact in one sentence kids can repeat.\n[27-30s] "Follow for a new fun fact every day!"`,
      script_60s: `[0-3s] ${hook}\n[3-10s] Ask the viewer to guess.\n[10-40s] Explain with 2 to 3 simple visuals or a mini demo.\n[40-52s] Bonus fact that surprises parents too.\n[52-60s] Recap and call to action.`,
      caption: `${title} 🤔 Comment your guess before the end! Save this for your next learning time.`,
      seo_keywords: [title.toLowerCase().replace(/[?!]/g, ''), `${cat.toLowerCase()} for kids`, 'fun facts for kids', 'kids learning video'],
      hashtags: ['#kidslearning', '#funfacts', `#${cat.split(' ')[0].toLowerCase()}`, '#learningisfun', '#kidsactivities'].slice(0, 5),
      youtube_title: `${title} | Fun Facts for Kids`,
      youtube_description: `${hook} In this short we learn ${title.toLowerCase().replace(/[?!]/g, '')} in a fun way for kids and families. Subscribe for daily learning shorts!`,
      cta: 'Follow for a new fun fact every day!',
    })
    i++
  }
  return out
}

export default function Ideas() {
  const { dataset, isDemo } = useData()
  const { session, demoGuest } = useAuth()
  const ranked = useMemo(() => categoryStats(dataset.content), [dataset.content])
  const order = useMemo(() => [...ranked.map((r) => r.category).filter((c) => (CATEGORIES as readonly string[]).includes(c)), ...CATEGORIES.filter((c) => !ranked.some((r) => r.category === c))], [ranked])
  const [selected, setSelected] = useState<string[]>(() => order.slice(0, 3))
  const [platform, setPlatform] = useState<'both' | 'instagram' | 'youtube'>('both')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [source, setSource] = useState<'openai' | 'templates' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const calendar = useCollection<CalendarItem>('calendar_items', getDemoCalendar, 'planned_date')
  const canUseAi = !!supabase && !!session && !demoGuest

  const toggle = (c: string) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))

  const generate = async () => {
    const cats = selected.length ? selected : order.slice(0, 3)
    const count = platform === 'both' ? 20 : 10
    setNote(null); setAdded(new Set())
    if (!canUseAi) { setIdeas(templateIdeas(cats, platform, count)); setSource('templates'); return }
    setBusy(true)
    try {
      const perf = ranked.filter((r) => cats.includes(r.category)).map((r) => ({ category: r.category, avg_views: Math.round(r.avgViews), vs_average: +r.index.toFixed(2), posts: r.posts }))
      const top = [...dataset.content].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 12).map((c) => ({ title: c.title, category: c.category, platform: c.platform, views: c.views }))
      const res = await callFunction<{ ideas: Idea[] }>('api/ai-ideas', { categories: cats, platform, count, performance: perf, top_posts: top, demo: isDemo })
      setIdeas(res.ideas.map((i) => ({ ...i, hashtags: (i.hashtags ?? []).slice(0, 5) })))
      setSource('openai')
    } catch (e) {
      setNote(`AI unavailable (${(e as Error).message}). Showing templates instead.`)
      setIdeas(templateIdeas(cats, platform, count)); setSource('templates')
    } finally { setBusy(false) }
  }

  const addToCalendar = async (idea: Idea, idx: number) => {
    await calendar.upsert({
      title: idea.title, platform: idea.platform, format: idea.platform === 'instagram' ? 'reel' : 'short', category: idea.category,
      planned_date: format(addDays(new Date(), 1 + idx), 'yyyy-MM-dd'), status: 'draft', priority: 2,
      hook: idea.hook, caption: idea.platform === 'youtube' ? `${idea.youtube_title}\n\n${idea.youtube_description}` : idea.caption,
      script: `30s:\n${idea.script_30s}\n\n60s:\n${idea.script_60s}`, hashtags: idea.hashtags,
    } as Partial<CalendarItem>)
    setAdded((s) => new Set(s).add(idx))
  }

  const copy = (idea: Idea, idx: number) => {
    const text = [`${idea.title}`, `Hook: ${idea.hook}`, `30s script:\n${idea.script_30s}`, `60s script:\n${idea.script_60s}`, `Caption: ${idea.caption}`, `Hashtags: ${idea.hashtags.join(' ')}`, `SEO: ${idea.seo_keywords.join(', ')}`, idea.youtube_title ? `YT title: ${idea.youtube_title}` : '', idea.youtube_description ? `YT description: ${idea.youtube_description}` : '', `CTA: ${idea.cta}`].filter(Boolean).join('\n\n')
    navigator.clipboard?.writeText(text)
    setCopied(idx); setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Content Idea Generator" subtitle="Reel and Shorts ideas for kids' educational content, ranked by what works on your channels" />
      <Card title="1. Pick topics" subtitle="Ordered by your average views. Top 3 are pre-selected.">
        <div className="flex flex-wrap gap-2">
          {order.map((c) => {
            const stat = ranked.find((r) => r.category === c)
            return (
              <button key={c} onClick={() => toggle(c)} className={`chip border px-3 py-1.5 text-sm ${selected.includes(c) ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink-soft hover:bg-stone-50'}`}>
                {c}{stat && <span className="text-xs opacity-70">{stat.index.toFixed(1)}×</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmented value={platform} onChange={setPlatform} options={[{ value: 'both', label: '10 Reels + 10 Shorts' }, { value: 'instagram', label: '10 Reels' }, { value: 'youtube', label: '10 Shorts' }]} />
          <button className="btn-primary" onClick={generate} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}Generate ideas</button>
          {isDemo && <DataTag kind="demo" />}
        </div>
        {note && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><Info size={14} className="mt-0.5 shrink-0" />{note}</p>}
      </Card>

      {ideas.length === 0 ? (
        <div className="card"><Empty icon={<Lightbulb />} title="No ideas yet" body="Pick topics and press Generate. Each idea comes with a hook, 30 and 60 second scripts, caption, up to 5 hashtags, SEO keywords and YouTube title and description." /></div>
      ) : (
        <>
          <p className="text-xs text-ink-mute">{source === 'openai' ? 'Written by AI using your top topics and best posts. Treat view potential as an estimate.' : 'Template ideas (AI not configured or unavailable). Connect OpenAI in Supabase for fully written ideas.'}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {ideas.map((idea, i) => (
              <article key={i} className="card flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <PlatformBadge p={idea.platform} />
                  <span className="text-xs text-ink-mute">{idea.category}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{idea.title}</h3>
                <p className="mt-1 rounded-lg bg-stone-50 p-2 text-sm italic">“{idea.hook}”</p>
                <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs font-medium text-ink-soft">30-second script</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink-soft">{idea.script_30s}</pre></details>
                <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs font-medium text-ink-soft">60-second script</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink-soft">{idea.script_60s}</pre></details>
                <div className="mt-3 space-y-1.5 text-xs text-ink-soft">
                  {idea.platform === 'instagram' ? <p><span className="font-medium text-ink">Caption:</span> {idea.caption}</p> : <><p><span className="font-medium text-ink">YouTube title:</span> {idea.youtube_title}</p><p><span className="font-medium text-ink">Description:</span> {idea.youtube_description}</p></>}
                  <p><span className="font-medium text-ink">Hashtags:</span> {idea.hashtags.slice(0, 5).join(' ')}</p>
                  <p><span className="font-medium text-ink">SEO:</span> {idea.seo_keywords.join(', ')}</p>
                  <p><span className="font-medium text-ink">CTA:</span> {idea.cta}</p>
                </div>
                <div className="mt-4 flex gap-2 pt-1">
                  <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => copy(idea, i)}>{copied === i ? <Check size={12} /> : <Copy size={12} />}Copy</button>
                  <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => addToCalendar(idea, i)} disabled={added.has(i)}><CalendarPlus size={12} />{added.has(i) ? 'Added as draft' : 'Add to calendar'}</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-ink-mute">Topic ranking uses {fmt.num(dataset.content.length)} posts{isDemo ? ' of DEMO data' : ''}.</p>
    </div>
  )
}
