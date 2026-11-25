// Builds a compact, factual snapshot of the account data, and rule-based answers to the
// strategist questions. When OpenAI is configured the same snapshot is sent to the model
// (server-side) and it writes the narrative; facts are always computed here from real numbers.
import { subDays } from 'date-fns'
import { bestWeekdays, categoryStats, computeKpis, consistencyScore, contentInRange, engagementRate, filterPlatform, fmt, gainingTraction, medianByAccount, pctChange, performanceTier, projectFollowers, topContent, type DateRange } from './analytics'
import type { ContentItem, Dataset } from './types'

const last = (days: number): DateRange => ({ from: subDays(new Date(), days - 1), to: new Date(), label: `Last ${days} days` })
const brief = (c: ContentItem) => ({ title: c.title, platform: c.platform, format: c.format, category: c.category, published: c.published_at?.slice(0, 10), views: c.views, likes: c.likes, comments: c.comments, shares: c.shares, saves: c.saves, followers_gained: c.followers_gained, engagement_rate: +engagementRate(c).toFixed(2), avg_view_pct: c.avg_view_percentage })

export function buildSnapshot(ds: Dataset) {
  const r30 = last(30), r60 = { from: subDays(new Date(), 59), to: subDays(new Date(), 30), label: 'prev' }
  const r90 = last(90)
  const plat = (p: 'instagram' | 'youtube') => {
    const d = filterPlatform(ds, p)
    const k = computeKpis(d, r30), kp = computeKpis(d, r60)
    return { accounts: d.accounts.length, audience: k.followers, gained_30d: k.followersGained, growth_pct_30d: +k.growthPct.toFixed(2), views_30d: k.views, views_change_pct: pctChange(k.views, kp.views), engagement_rate: +k.engagementRate.toFixed(2), posts_30d: k.posts, avg_views_per_post: Math.round(k.avgViewsPerPost) }
  }
  const posts90 = contentInRange(ds, r90)
  const med = medianByAccount(ds.content)
  const conv = posts90.filter((c) => (c.views ?? 0) > 300 && c.followers_gained != null).map((c) => ({ c, rate: (c.followers_gained! / (c.views || 1)) * 1000 })).sort((a, b) => b.rate - a.rate)
  const formats = new Map<string, { posts: number; views: number; eng: number }>()
  posts90.forEach((c) => {
    const key = `${c.platform}:${c.format}`
    const f = formats.get(key) ?? { posts: 0, views: 0, eng: 0 }
    f.posts++; f.views += c.views ?? 0; f.eng += engagementRate(c)
    formats.set(key, f)
  })
  const igTop = topContent(posts90.filter((c) => c.platform === 'instagram'), 30)
  const ytCats = new Set(posts90.filter((c) => c.platform === 'youtube').map((c) => c.title?.toLowerCase()))
  const repurposeToYt = igTop.filter((c) => !ytCats.has(c.title?.toLowerCase())).slice(0, 5)
  const igTitles = new Set(posts90.filter((c) => c.platform === 'instagram').map((c) => c.title?.toLowerCase()))
  const repurposeToIg = topContent(posts90.filter((c) => c.platform === 'youtube' && c.format === 'short' && !igTitles.has(c.title?.toLowerCase())), 5)
  const proj = projectFollowers(ds, [30])
  const cons = consistencyScore(ds.content)

  return {
    generated_at: new Date().toISOString(),
    niche: "Children's education: kids learning, fun facts, animals, science, activities. Audience: parents, families, children and educators in India and internationally.",
    instagram: plat('instagram'),
    youtube: plat('youtube'),
    combined: computeKpis(ds, r30),
    top_posts_90d: topContent(posts90, 10).map(brief),
    worst_posts_90d: topContent(posts90.filter((c) => c.published_at && Date.now() - +new Date(c.published_at) > 7 * 864e5), posts90.length, (c) => -(c.views ?? 0)).slice(0, 5).map(brief),
    categories_90d: categoryStats(posts90).map((c) => ({ category: c.category, posts: c.posts, avg_views: Math.round(c.avgViews), engagement_rate: +c.engagementRate.toFixed(2), followers_gained: c.followersGained, shares: c.shares, vs_average: +c.index.toFixed(2) })),
    formats_90d: [...formats.entries()].map(([k, f]) => ({ format: k, posts: f.posts, avg_views: Math.round(f.views / f.posts), avg_engagement_rate: +(f.eng / f.posts).toFixed(2) })).sort((a, b) => b.avg_views - a.avg_views),
    best_weekdays: bestWeekdays(posts90).map((w) => ({ day: w.name, posts: w.posts, avg_views: Math.round(w.avg) })),
    follower_conversion_top: conv.slice(0, 5).map((x) => ({ ...brief(x.c), followers_per_1k_views: +x.rate.toFixed(2) })),
    gaining_traction: gainingTraction(ds.content).slice(0, 5).map(brief),
    repurpose_ig_to_yt: repurposeToYt.map(brief),
    repurpose_yt_to_ig: repurposeToIg.map(brief),
    low_performer_share: posts90.length ? +(posts90.filter((c) => performanceTier(c, med.get(c.account_id) ?? 0) === 'low').length / posts90.length * 100).toFixed(1) : 0,
    consistency: { score: cons.score, posts_per_week: +cons.perWeek.toFixed(1), last_8_weeks: cons.weeks },
    projection_30d_trend: proj ? { current: proj.current, expected_in_30d: proj.points[0].expected, daily_rate: +proj.dailyRate.toFixed(1) } : null,
  }
}
export type Snapshot = ReturnType<typeof buildSnapshot>

export interface Answer {
  facts: string[]        // straight from the data
  recommendations: { text: string; why?: string }[]
  predictions: string[]  // estimates, clearly labelled in the UI
  source: 'rules' | 'openai'
}

export const QUESTIONS = [
  'What content should I create next?',
  'Which topics are generating the most views?',
  'Which videos are converting viewers into followers?',
  'What is my best-performing content format?',
  'Which content should I replicate?',
  'What content is underperforming and why?',
  'What should I post tomorrow?',
  'How can I increase followers by 20% next month?',
  'Which videos should I repurpose between Instagram and YouTube?',
  'What are my top three priorities this week?',
] as const

const t = (c: { title: string | null; views: number | null; platform: string }) => `"${c.title}" (${c.platform === 'instagram' ? 'IG' : 'YT'}, ${fmt.num(c.views)} views)`

export function ruleAnswer(q: string, s: Snapshot): Answer {
  const cats = s.categories_90d.filter((c) => c.posts >= 2)
  const topCats = cats.slice(0, 3)
  const weakCats = [...cats].sort((a, b) => a.vs_average - b.vs_average).slice(0, 2)
  const bestDay = s.best_weekdays[0]
  const bestFormat = s.formats_90d[0]
  const base: Answer = { facts: [], recommendations: [], predictions: [], source: 'rules' }
  const i = QUESTIONS.indexOf(q as (typeof QUESTIONS)[number])
  switch (i) {
    case 0:
    case 6: {
      const cat = topCats[0]
      base.facts = [
        ...topCats.map((c) => `${c.category}: ${fmt.num(c.avg_views)} avg views over ${c.posts} posts (${c.vs_average}× your average).`),
        bestDay ? `${bestDay.day} posts average ${fmt.num(bestDay.avg_views)} views, your best day.` : '',
        s.gaining_traction[0] ? `Gaining traction now: ${t(s.gaining_traction[0])}.` : '',
      ].filter(Boolean)
      base.recommendations = [
        { text: i === 6 ? `Tomorrow, post a ${cat?.category ?? 'top-topic'} Reel and the same idea as a Short.` : `Make your next 3 pieces in ${topCats.map((c) => c.category).join(', ')}.`, why: 'These topics beat your average on views over the last 90 days.' },
        s.gaining_traction[0] ? { text: `Make a follow-up to ${t(s.gaining_traction[0])} while it's still climbing.` } : { text: 'Open with a question kids can answer in 3 seconds.' },
        { text: `Keep videos as ${bestFormat?.format.split(':')[1] ?? 'short'}s and aim for ${bestDay?.day ?? 'weekend'} publishing.` },
      ]
      base.predictions = cat ? [`A ${cat.category} post is likely to land near ${fmt.num(cat.avg_views)} views if it performs like your recent ones (estimate).`] : []
      return base
    }
    case 1:
      base.facts = cats.slice(0, 6).map((c, k) => `${k + 1}. ${c.category}: ${fmt.num(c.avg_views)} avg views, ${c.posts} posts, ${c.engagement_rate}% engagement.`)
      base.recommendations = [{ text: `Double down on ${topCats[0]?.category}; post less ${weakCats[0]?.category} unless you test a new hook.` }]
      return base
    case 2:
      base.facts = s.follower_conversion_top.map((c) => `${t({ title: c.title, views: c.views, platform: c.platform })} brought ${c.followers_per_1k_views} followers per 1,000 views.`)
      if (!base.facts.length) base.facts = ['Per-post follower data is not available yet for your accounts.']
      base.recommendations = [{ text: 'Study the first 3 seconds and the call to action of these posts and reuse that structure.', why: 'They turn viewers into followers at the highest rate.' }]
      return base
    case 3:
      base.facts = s.formats_90d.map((f) => `${f.format.replace(':', ' ')}: ${fmt.num(f.avg_views)} avg views across ${f.posts} posts, ${f.avg_engagement_rate}% engagement.`)
      base.recommendations = [{ text: `Your strongest format is ${bestFormat?.format.replace(':', ' ')}. Keep most of your output there.` }]
      return base
    case 4:
      base.facts = s.top_posts_90d.slice(0, 5).map((c) => `${t(c)}, ${c.category}, ${c.engagement_rate}% engagement.`)
      base.recommendations = s.top_posts_90d.slice(0, 3).map((c) => ({ text: `Make "${c.title}: part 2" or a twist on it.`, why: `It is one of your top 5 posts in ${c.category}.` }))
      return base
    case 5:
      base.facts = [
        `${s.low_performer_share}% of posts in the last 90 days got under 60% of their account's median views.`,
        ...weakCats.map((c) => `${c.category} averages ${c.vs_average}× your typical views (${c.posts} posts).`),
        ...s.worst_posts_90d.slice(0, 3).map((c) => `Low: ${t(c)}.`),
      ]
      base.recommendations = [
        { text: `Rework ${weakCats.map((c) => c.category).join(' and ')} with a stronger curiosity hook (a surprising fact in the first line).`, why: 'Topic may be fine; low early retention usually means the hook lost them.' },
        { text: 'Check whether the low posts went out on your weakest weekdays and move those slots.' },
      ]
      base.predictions = ['Likely reasons (estimate): weaker hook, less visual movement in the first 2 seconds, or topics aimed at parents posted when kids-facing content performs better.']
      return base
    case 7: {
      const need = Math.round((s.combined.followers || 0) * 0.2)
      const trendGain = s.projection_30d_trend ? s.projection_30d_trend.expected_in_30d - s.projection_30d_trend.current : 0
      base.facts = [
        `Your combined audience is ${fmt.num(s.combined.followers)}; 20% growth means about ${fmt.num(need)} new followers in 30 days.`,
        `At your current trend you'd gain about ${fmt.num(trendGain)} (${s.combined.followers ? ((trendGain / s.combined.followers) * 100).toFixed(1) : 0}%).`,
        `You publish ${s.consistency.posts_per_week} posts per week (consistency score ${s.consistency.score}/100).`,
      ]
      base.recommendations = [
        { text: 'Post daily on both platforms for 30 days, with 70% from your top 3 topics.' },
        { text: 'Turn every top Reel into a Short within 48 hours, and the reverse.' },
        { text: 'Add a spoken follow CTA at the payoff moment ("follow for a new animal fact every day").' },
        { text: 'Run one series (e.g. "Rescue Mission Monday") so viewers have a reason to follow.' },
      ]
      base.predictions = [trendGain >= need ? 'You are on track for 20% at the current pace (estimate).' : `Reaching 20% needs roughly ${(need / Math.max(1, trendGain)).toFixed(1)}× your current growth pace, so it would take one or two breakout posts on top of a higher posting rate (estimate).`]
      return base
    }
    case 8:
      base.facts = [
        ...s.repurpose_ig_to_yt.slice(0, 4).map((c) => `IG → YT: ${t(c)}`),
        ...s.repurpose_yt_to_ig.slice(0, 4).map((c) => `YT → IG: ${t(c)}`),
      ]
      base.recommendations = [{ text: 'Re-edit the first frame and title for each platform, keep the same script.', why: 'These posts did well on one platform and have no matching post on the other.' }]
      return base
    case 9:
    default:
      base.facts = [
        `Instagram views ${fmt.signedPct(s.instagram.views_change_pct)} and YouTube views ${fmt.signedPct(s.youtube.views_change_pct)} versus the previous 30 days.`,
        `Top topic: ${topCats[0]?.category}. Weakest: ${weakCats[0]?.category}.`,
        `Consistency score ${s.consistency.score}/100.`,
      ]
      base.recommendations = [
        { text: `Publish 3 ${topCats[0]?.category} pieces and 2 ${topCats[1]?.category} pieces this week.` },
        { text: `Repurpose your top ${s.repurpose_ig_to_yt.length ? 'Reel to YouTube' : 'Short to Instagram'}: ${t((s.repurpose_ig_to_yt[0] ?? s.repurpose_yt_to_ig[0]) || { title: 'best post', views: 0, platform: 'instagram' })}.` },
        { text: s.consistency.score < 70 ? 'Lock a fixed posting schedule so no week drops below 4 posts.' : `Test one new hook style on ${weakCats[0]?.category}.` },
      ]
      return base
  }
}
