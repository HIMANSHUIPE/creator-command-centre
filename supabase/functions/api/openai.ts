// Server-side OpenAI call. The key never reaches the browser.
export async function chatJson(system: string, user: string, maxTokens = 2500) {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY is not set in Supabase')
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.6, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error?.message ?? `OpenAI ${res.status}`)
  return { model, data: JSON.parse(j.choices[0].message.content) }
}
