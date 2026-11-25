import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

type Role = 'owner' | 'admin' | 'editor' | 'viewer'
const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

/** Resolves the caller from their JWT and returns their workspace + role. Throws on failure. */
export async function requireUser(req: Request, minRole: Role = 'viewer') {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new HttpError(401, 'Not signed in')
  const db = admin()
  const { data: { user }, error } = await db.auth.getUser(jwt)
  if (error || !user) throw new HttpError(401, 'Session expired, sign in again')
  const { data: m } = await db.from('workspace_members').select('workspace_id, role').eq('user_id', user.id).order('created_at').limit(1).maybeSingle()
  if (!m) throw new HttpError(403, 'No workspace for this user')
  if (rank[m.role as Role] < rank[minRole]) throw new HttpError(403, `This needs the ${minRole} role`)
  return { user, workspaceId: m.workspace_id as string, role: m.role as Role, db }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
