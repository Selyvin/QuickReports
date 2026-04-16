import { createClient } from 'jsr:@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('INTUIT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('INTUIT_CLIENT_SECRET')!
const REDIRECT_URI = Deno.env.get('INTUIT_REDIRECT_URI')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const STATE_TTL_MS = 10 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  console.log(`[qb-oauth-callback] ${req.method} ${req.url}`)

  if (req.method === 'OPTIONS') {
    console.log('[qb-oauth-callback] CORS preflight')
    return new Response('ok', { status: 204, headers: CORS })
  }

  const authHeader = req.headers.get('Authorization')
  console.log('[qb-oauth-callback] Auth header present:', !!authHeader)

  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )

  if (authError || !user) {
    console.error('[qb-oauth-callback] JWT verification failed:', authError?.message)
    return json({ error: 'Unauthorized' }, 401)
  }

  console.log('[qb-oauth-callback] Authenticated user:', user.id)

  const { code, state, realmId } = await req.json()
  console.log('[qb-oauth-callback] code present:', !!code, 'state:', state, 'realmId:', realmId)

  if (!code || !state || !realmId) {
    return json({ error: 'Missing required params: code, state, realmId' }, 400)
  }

  const cutoff = new Date(Date.now() - STATE_TTL_MS).toISOString()
  const { data: stateRow, error: stateError } = await supabase
    .from('qb_oauth_states')
    .delete()
    .eq('id', state)
    .eq('user_id', user.id)
    .gt('created_at', cutoff)
    .select('user_id')
    .single()

  if (stateError || !stateRow) {
    console.error('[qb-oauth-callback] Invalid or expired state:', stateError?.message)
    return json({ error: 'Invalid or expired state token' }, 400)
  }

  console.log('[qb-oauth-callback] State valid. Exchanging code for tokens...')

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[qb-oauth-callback] Token exchange failed:', tokenRes.status, body)
    return json({ error: 'Token exchange failed' }, 502)
  }

  const tokens: {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  } = await tokenRes.json()

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { error: upsertError } = await supabase
    .from('qb_connections')
    .upsert(
      {
        user_id: user.id,
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
      },
      { onConflict: 'user_id' },
    )

  if (upsertError) {
    console.error('[qb-oauth-callback] Failed to save connection:', upsertError.message)
    return json({ error: 'Failed to save connection' }, 500)
  }

  console.log('[qb-oauth-callback] Connection saved for user:', user.id)
  return json({ success: true })
})
