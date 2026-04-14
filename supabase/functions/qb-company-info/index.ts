import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'

// ── Inline: qb-token ─────────────────────────────────────────────────────────
const QB_CLIENT_ID = Deno.env.get('INTUIT_CLIENT_ID')!
const QB_CLIENT_SECRET = Deno.env.get('INTUIT_CLIENT_SECRET')!
const REFRESH_BUFFER_MS = 5 * 60 * 1000

async function getValidToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ access_token: string; realm_id: string }> {
  const { data: conn, error } = await supabase
    .from('qb_connections')
    .select('access_token, refresh_token, token_expires_at, realm_id')
    .eq('user_id', userId)
    .single()

  if (error || !conn) throw new Error('No QuickBooks connection found for this user')

  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (expiresAt - Date.now() >= REFRESH_BUFFER_MS) {
    return { access_token: conn.access_token, realm_id: conn.realm_id }
  }

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  })

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)

  const tokens: { access_token: string; refresh_token: string; expires_in: number } = await res.json()
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('qb_connections')
    .update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: newExpiresAt })
    .eq('user_id', userId)

  return { access_token: tokens.access_token, realm_id: conn.realm_id }
}

// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const QB_BASE_URL = Deno.env.get('QB_ENVIRONMENT') === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function qbGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const data = await res.json()
  if (!res.ok) throw { status: res.status, data }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )

  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const { access_token, realm_id } = await getValidToken(supabase, user.id)
  const base = `${QB_BASE_URL}/v3/company/${realm_id}`

  try {
    const [companyInfo, preferences] = await Promise.all([
      qbGet(`${base}/companyinfo/${realm_id}?minorversion=65`, access_token),
      qbGet(`${base}/preferences?minorversion=65`, access_token),
    ])

    console.log(`[qb-company-info] fetched for user ${user.id}`)
    return json({ companyInfo: companyInfo.CompanyInfo, preferences: preferences.Preferences })
  } catch (err: unknown) {
    const e = err as { status?: number; data?: unknown }
    console.error('[qb-company-info] QB API error:', JSON.stringify(e.data ?? err))
    return json({ error: e.data ?? String(err) }, e.status ?? 500)
  }
})
