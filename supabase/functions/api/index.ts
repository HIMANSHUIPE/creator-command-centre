// Single edge function for the whole backend. JWT verification is done inside each handler
// (requireUser) so the public OAuth callback and the cron trigger can share the deployment.
//   GET  /api/oauth-callback      Meta / Google redirect target (state-checked)
//   POST /api/cron                daily sync (x-cron-secret header)
//   POST /api  {action: ...}      status | start | sync | disconnect   (signed-in user)
//   POST /api/ai-strategist       strategist answers                   (signed-in user)
//   POST /api/ai-ideas            content ideas                        (signed-in user)
import { cors } from './cors.ts'
import { handleIntegrations } from './integrations.ts'
import { handleCallback } from './callback.ts'
import { handleCron } from './cron.ts'
import { handleStrategist } from './ai-strategist.ts'
import { handleIdeas } from './ai-ideas.ts'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  if (path.endsWith('/oauth-callback')) return handleCallback(req)
  if (path.endsWith('/cron')) return handleCron(req)
  if (path.endsWith('/ai-strategist')) return handleStrategist(req)
  if (path.endsWith('/ai-ideas')) return handleIdeas(req)
  return handleIntegrations(req)
})
