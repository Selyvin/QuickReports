import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'
import { getValidToken } from '../_shared/qb-token.ts'

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
