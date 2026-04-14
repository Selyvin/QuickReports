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

// Set QB_ENVIRONMENT=production in your Supabase secrets for live data.
const QB_BASE_URL = Deno.env.get('QB_ENVIRONMENT') === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'

const ALLOWED_REPORTS = new Set([
  'AccountListDetail',
  'APAgingDetail',
  'APAgingSummary',
  'ARAgingDetail',
  'ARAgingSummary',
  'BalanceSheet',
  'CashFlow',
  'CustomerBalance',
  'CustomerBalanceDetail',
  'CustomerIncome',
  'GeneralLedger',
  'InventoryValuationDetail',
  'InventoryValuationSummary',
  'JournalReport',
  'ProfitAndLoss',
  'ProfitAndLossDetail',
  'SalesByClassSummary',
  'SalesByCustomer',
  'SalesByDepartment',
  'SalesByProduct',
  'TaxSummary',
  'TransactionList',
  'TransactionListByCustomer',
  'TransactionListByVendor',
  'TransactionListWithSplits',
  'TrialBalance',
  'VendorBalance',
  'VendorBalanceDetail',
  'VendorExpenses',
])

// Params that are safe to forward to the QB Reports API.
const ALLOWED_PARAMS = new Set([
  'start_date',
  'end_date',
  'date_macro',
  'accounting_method',
  'summarize_column_by',
  'columns',
  'customer',
  'vendor',
  'item',
  'department',
  'class',
  'appaid',
  'arpaid',
  'payment_method',
  'start_duedate',
  'end_duedate',
  'start_moddate',
  'end_moddate',
  'sort_by',
  'sort_order',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

  let body: { report: string; params?: Record<string, string> }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { report, params = {} } = body

  if (!report || !ALLOWED_REPORTS.has(report)) {
    return json({ error: `Unknown or unsupported report: ${report}` }, 400)
  }

  const { access_token, realm_id } = await getValidToken(supabase, user.id)

  const qp = new URLSearchParams({ minorversion: '65' })
  for (const [k, v] of Object.entries(params)) {
    if (ALLOWED_PARAMS.has(k) && v !== undefined && v !== '') {
      qp.set(k, v)
    }
  }

  const url = `${QB_BASE_URL}/v3/company/${realm_id}/reports/${report}?${qp}`
  console.log(`[qb-report] ${report} for user ${user.id}`)

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: 'application/json',
    },
  })

  const data = await res.json()

  if (!res.ok) {
    console.error(`[qb-report] QB API error ${res.status}:`, JSON.stringify(data))
    const qbError = data?.Fault?.Error?.[0]
    
    return json({ error: data }, res.status)
  }

  return json(data)
})
