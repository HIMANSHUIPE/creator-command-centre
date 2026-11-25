import { cors, json } from './cors.ts'
import { HttpError, requireUser } from './supabase.ts'
import { chatJson } from './openai.ts'

const SYSTEM = `You write viral, child-safe short-form video ideas for a children's educational creator
(audience: parents, families, children and educators in India and internationally).
Use simple, curiosity-driven language kids understand; hooks must create a question in the first 2 seconds.
Prioritise topics with higher "vs_average" in the performance data and riff on patterns from the creator's top posts without copying them.
For each idea return:
platform ("instagram" or "youtube"), category, title, hook, script_30s (timestamped beats), script_60s (timestamped beats),
caption (Instagram style, 1 to 2 lines, may use 1 emoji), seo_keywords (4 to 6), hashtags (MAXIMUM 5, each starting with #),
youtube_title (under 70 characters, for youtube ideas), youtube_description (2 to 3 sentences with keywords, for youtube ideas), cta.
Reply as JSON: {"ideas": [...]}.`

export async function handleIdeas(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { user, workspaceId, db } = await requireUser(req, 'viewer')
    const { categories, platform, count, performance, top_posts, demo } = await req.json()
    const n = Math.min(20, Math.max(1, Number(count) || 10))
    const split = platform === 'both' ? `${n / 2} Instagram Reel ideas and ${n / 2} YouTube Shorts ideas` : `${n} ${platform === 'instagram' ? 'Instagram Reel' : 'YouTube Shorts'} ideas`
    const prompt = `Write ${split}.\nCategories to use: ${JSON.stringify(categories)}\nPerformance by category (real data${demo ? ', DEMO sample' : ''}): ${JSON.stringify(performance)}\nTop posts: ${JSON.stringify(top_posts)}`
    const { model, data } = await chatJson(SYSTEM, prompt, 7000)
    const ideas = (data.ideas ?? []).map((i: any) => ({ ...i, hashtags: (i.hashtags ?? []).slice(0, 5) }))
    if (!demo) await db.from('ai_insights').insert({ workspace_id: workspaceId, kind: 'ideas', question: `Ideas: ${(categories ?? []).join(', ')}`, data_snapshot: { performance, top_posts }, response: { ideas }, model, created_by: user.id })
    return json({ ideas })
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500)
  }
}
