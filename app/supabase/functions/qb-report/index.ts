import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'
import { getValidToken } from '../_shared/qb-token.ts'

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
