import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'

const CLIENT_ID = Deno.env.get('INTUIT_CLIENT_ID')!
const REDIRECT_URI = Deno.env.get('INTUIT_REDIRECT_URI')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SCOPES = 'com.intuit.quickbooks.accounting'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  console.log(`[qb-oauth-start] ${req.method} ${req.url}`)

  if (req.method === 'OPTIONS') {
    console.log('[qb-oauth-start] CORS preflight — responding 204')
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  console.log('[qb-oauth-start] Authorization header present:', !!authHeader)
  console.log('[qb-oauth-start] Token prefix (first 20 chars):', authHeader?.slice(7, 27))

  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[qb-oauth-start] Missing or malformed Authorization header')
    return json({ error: 'Missing authorization header' }, 401)
  }

  console.log('[qb-oauth-start] Verifying JWT with service role...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )

  if (authError || !user) {
    console.error('[qb-oauth-start] JWT verification failed:', authError?.message ?? 'no user returned')
    return json({ error: 'Unauthorized' }, 401)
  }

  console.log('[qb-oauth-start] Authenticated user:', user.id, '| is_anonymous:', user.is_anonymous)

  console.log('[qb-oauth-start] Creating CSRF state token...')
  const { data: stateRow, error: stateError } = await supabase
    .from('qb_oauth_states')
    .insert({ user_id: user.id })
    .select('id')
    .single()

  if (stateError || !stateRow) {
    console.error('[qb-oauth-start] Failed to insert state row:', stateError?.message)
    return json({ error: 'Internal server error' }, 500)
  }

  console.log('[qb-oauth-start] State token created:', stateRow.id)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state: stateRow.id,
  })

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params}`
  console.log('[qb-oauth-start] Returning Intuit auth URL for realm redirect')

  return json({ url: authUrl })
})
