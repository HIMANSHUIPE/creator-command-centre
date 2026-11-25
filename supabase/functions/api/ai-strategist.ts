import { cors, json } from './cors.ts'
import { HttpError, requireUser } from './supabase.ts'
import { chatJson } from './openai.ts'

const SYSTEM = `You are a senior social media growth strategist for a children's educational content creator
(kids learning, fun facts, animals, science, activities; audience: parents, families, children and educators in India and worldwide)
who publishes Instagram Reels and YouTube Shorts.
You receive a JSON snapshot of the creator's REAL account data. Rules:
- Base every statement on the snapshot. Quote real numbers, titles and topics from it. Never invent metrics.
- Put only things directly supported by the numbers in "facts".
- Put forecasts, guesses about causes, and expected outcomes in "predictions" and phrase them as estimates.
- Recommendations must be specific and actionable (what to post, when, which hook/format), each with a short "why" tied to the data.
- If the data cannot answer the question, say so in facts and give the best data-backed alternative.
- Keep content child-safe and suitable for families.
Reply as JSON: {"facts": string[], "recommendations": [{"text": string, "why": string}], "predictions": string[]}. 3 to 7 items per list.`

export async function handleStrategist(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { user, workspaceId, db } = await requireUser(req, 'viewer')
    const { question, snapshot, demo } = await req.json()
    if (!question || typeof question !== 'string' || question.length > 600) throw new HttpError(400, 'Question is required (max 600 characters)')
    const snap = JSON.stringify(snapshot ?? {})
    if (snap.length > 80_000) throw new HttpError(400, 'Snapshot too large')
    const { model, data } = await chatJson(SYSTEM, `${demo ? 'NOTE: this is DEMO sample data, not the real account.\n' : ''}QUESTION: ${question}\n\nDATA SNAPSHOT:\n${snap}`)
    const answer = { facts: data.facts ?? [], recommendations: data.recommendations ?? [], predictions: data.predictions ?? [] }
    if (!demo) await db.from('ai_insights').insert({ workspace_id: workspaceId, kind: 'strategist', question, data_snapshot: snapshot, response: answer, model, created_by: user.id })
    return json(answer)
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500)
  }
}
