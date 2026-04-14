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

// ── QB Query helpers ──────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function qbQuery(realmId: string, accessToken: string, query: string): Promise<any> {
  const url = `${QB_BASE_URL}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`QB query failed (${res.status}): ${JSON.stringify(data)}`)
  return data.QueryResponse
}

// deno-lint-ignore no-explicit-any
async function qbQueryAll(realmId: string, accessToken: string, baseQuery: string, entity: string): Promise<any[]> {
  const PAGE_SIZE = 1000
  // deno-lint-ignore no-explicit-any
  const results: any[] = []
  let startPos = 1
  while (true) {
    const response = await qbQuery(realmId, accessToken, `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${PAGE_SIZE}`)
    const rows = response[entity] ?? []
    results.push(...rows)
    if (rows.length < PAGE_SIZE) break
    startPos += PAGE_SIZE
  }
  return results
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoicePaymentRow {
  customer: string
  invoiceNumber: string
  invoiceDate: string
  datePaid: string
  amount: number
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    let body: { start_date?: string; end_date?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const { start_date, end_date } = body
    if (!start_date || !end_date) {
      return json({ error: 'start_date and end_date are required' }, 400)
    }

    const { access_token, realm_id } = await getValidToken(supabase, user.id)
    console.log(`[qb-invoice-payments] ${start_date} to ${end_date} for user ${user.id}`)

    // 1. Fetch all payments in the date range
    const payments = await qbQueryAll(
      realm_id,
      access_token,
      `SELECT * FROM Payment WHERE TxnDate >= '${start_date}' AND TxnDate <= '${end_date}'`,
      'Payment',
    )

    // 2. Collect all unique invoice IDs referenced by these payments
    const invoiceIds = new Set<string>()
    for (const p of payments) {
      for (const line of p.Line ?? []) {
        for (const txn of line.LinkedTxn ?? []) {
          if (txn.TxnType === 'Invoice') invoiceIds.add(txn.TxnId)
        }
      }
    }

    // 3. Batch-fetch invoice details (DocNumber + TxnDate)
    const invoiceMap = new Map<string, { docNumber: string; txnDate: string }>()
    const idsArray = [...invoiceIds]
    const BATCH = 100
    for (let i = 0; i < idsArray.length; i += BATCH) {
      const batch = idsArray.slice(i, i + BATCH)
      const idList = batch.map((id) => `'${id}'`).join(', ')
      const response = await qbQuery(realm_id, access_token, `SELECT * FROM Invoice WHERE Id IN (${idList})`)
      for (const inv of response['Invoice'] ?? []) {
        invoiceMap.set(inv.Id, { docNumber: inv.DocNumber ?? '', txnDate: inv.TxnDate ?? '' })
      }
    }

    // 4. Assemble flat rows: one row per invoice line within each payment
    const rows: InvoicePaymentRow[] = []
    for (const p of payments) {
      const datePaid: string = p.TxnDate ?? ''
      const customer: string = p.CustomerRef?.name ?? ''
      for (const line of p.Line ?? []) {
        for (const txn of line.LinkedTxn ?? []) {
          if (txn.TxnType !== 'Invoice') continue
          const inv = invoiceMap.get(txn.TxnId)
          rows.push({
            customer,
            invoiceNumber: inv?.docNumber ?? txn.TxnId,
            invoiceDate: inv?.txnDate ?? '',
            datePaid,
            amount: line.Amount ?? 0,
          })
        }
      }
    }

    // Sort by customer, then by date paid
    rows.sort((a, b) => {
      const c = a.customer.localeCompare(b.customer)
      return c !== 0 ? c : a.datePaid.localeCompare(b.datePaid)
    })

    return json({ rows })
  } catch (e: unknown) {
    console.error('[qb-invoice-payments] Error:', e)
    const message = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
