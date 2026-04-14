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

// ── QB Query helper ──────────────────────────────────────────────────────────

async function qbQuery(
  realmId: string,
  accessToken: string,
  query: string,
): Promise<unknown[]> {
  const url = `${QB_BASE_URL}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`QB query failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data.QueryResponse
}

// ── Pagination helper ────────────────────────────────────────────────────────

async function qbQueryAll(
  realmId: string,
  accessToken: string,
  baseQuery: string,
): Promise<unknown[]> {
  const PAGE_SIZE = 1000
  const results: unknown[] = []
  let startPos = 1

  // Extract the entity name from "SELECT * FROM EntityName ..."
  const entityMatch = baseQuery.match(/FROM\s+(\w+)/i)
  const entity = entityMatch?.[1] ?? ''

  while (true) {
    const query = `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${PAGE_SIZE}`
    const response = await qbQuery(realmId, accessToken, query) as Record<string, unknown>
    const rows = (response[entity] ?? []) as unknown[]
    results.push(...rows)
    if (rows.length < PAGE_SIZE) break
    startPos += PAGE_SIZE
  }

  return results
}

// ── Types ────────────────────────────────────────────────────────────────────

interface QBLineItem {
  Id: string
  LineNum?: number
  Amount: number
  DetailType: string
  SalesItemLineDetail?: {
    ItemRef?: { value: string; name: string }
    Qty?: number
    UnitPrice?: number
  }
  Description?: string
}

interface QBLinkedTxn {
  TxnId: string
  TxnType: string
}

interface QBEstimate {
  Id: string
  DocNumber?: string
  TxnDate: string
  TotalAmt: number
  TxnStatus: string
  CustomerRef: { value: string; name: string }
  Line: QBLineItem[]
  LinkedTxn?: QBLinkedTxn[]
}

interface QBInvoice {
  Id: string
  DocNumber?: string
  TxnDate: string
  TotalAmt: number
  Balance: number
  CustomerRef: { value: string; name: string }
  Line: QBLineItem[]
  LinkedTxn?: QBLinkedTxn[]
}

// ── Response types ───────────────────────────────────────────────────────────

interface LineProgress {
  itemId: string | null
  itemName: string
  description: string
  estimated: number
  invoiced: number
  remaining: number
}

interface InvoiceSummary {
  invoiceId: string
  docNumber: string
  date: string
  amount: number
  balance: number
}

interface EstimateProgress {
  estimateId: string
  docNumber: string
  date: string
  customer: string
  customerId: string
  estimateTotal: number
  invoicedTotal: number
  remaining: number
  status: string
  invoices: InvoiceSummary[]
  lines: LineProgress[]
}

// ── Main handler ─────────────────────────────────────────────────────────────

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

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { access_token, realm_id } = await getValidToken(supabase, user.id)

    console.log(`[qb-estimate-progress] Fetching for user ${user.id}`)

    // Parse optional filters from request body (POST) or use defaults (GET)
    let statusFilter = 'Pending'
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.status) statusFilter = body.status
      } catch { /* empty body is fine */ }
    }

    // Step 1: Fetch all estimates (TxnStatus is not queryable, so filter client-side)
    const allEstimates = await qbQueryAll(
      realm_id,
      access_token,
      `SELECT * FROM Estimate`,
    ) as QBEstimate[]

    const estimates = statusFilter === 'All'
      ? allEstimates
      : allEstimates.filter((e) => e.TxnStatus === statusFilter)

    if (estimates.length === 0) {
      return json({ estimates: [] })
    }

    // Step 2: Fetch invoices for customers that have estimates.
    // We query by customer to find linked invoices.
    const customerIds = [...new Set(estimates.map((e) => e.CustomerRef.value))]

    const allInvoices: QBInvoice[] = []
    // Query in batches of 30 customer IDs to avoid URL length limits
    const BATCH_SIZE = 30
    for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
      const batch = customerIds.slice(i, i + BATCH_SIZE)
      const inClause = batch.map((id) => `'${id}'`).join(',')
      const invoices = await qbQueryAll(
        realm_id,
        access_token,
        `SELECT * FROM Invoice WHERE CustomerRef IN (${inClause})`,
      ) as QBInvoice[]
      allInvoices.push(...invoices)
    }

    // Step 3: Build a map of estimateId -> invoices
    const invoicesByEstimate = new Map<string, QBInvoice[]>()
    for (const inv of allInvoices) {
      if (!inv.LinkedTxn) continue
      for (const link of inv.LinkedTxn) {
        if (link.TxnType === 'Estimate') {
          const list = invoicesByEstimate.get(link.TxnId) ?? []
          list.push(inv)
          invoicesByEstimate.set(link.TxnId, list)
        }
      }
    }

    // Step 4: Build the response
    const result: EstimateProgress[] = estimates.map((est) => {
      const linkedInvoices = invoicesByEstimate.get(est.Id) ?? []
      const invoicedTotal = linkedInvoices.reduce((sum, inv) => sum + inv.TotalAmt, 0)

      // Build per-line progress
      const estimateLines = est.Line.filter(
        (l) => l.DetailType === 'SalesItemLineDetail' && l.SalesItemLineDetail,
      )

      // Collect all invoice line items keyed by ItemRef.value
      const invoicedByItem = new Map<string, number>()
      for (const inv of linkedInvoices) {
        for (const line of inv.Line) {
          if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail?.ItemRef) {
            const key = line.SalesItemLineDetail.ItemRef.value
            invoicedByItem.set(key, (invoicedByItem.get(key) ?? 0) + line.Amount)
          }
        }
      }

      const lines: LineProgress[] = estimateLines.map((line) => {
        const itemId = line.SalesItemLineDetail?.ItemRef?.value ?? null
        const itemName = line.SalesItemLineDetail?.ItemRef?.name ?? 'Unknown'
        const invoiced = itemId ? (invoicedByItem.get(itemId) ?? 0) : 0
        return {
          itemId,
          itemName,
          description: line.Description ?? '',
          estimated: line.Amount,
          invoiced,
          remaining: line.Amount - invoiced,
        }
      })

      return {
        estimateId: est.Id,
        docNumber: est.DocNumber ?? '',
        date: est.TxnDate,
        customer: est.CustomerRef.name,
        customerId: est.CustomerRef.value,
        estimateTotal: est.TotalAmt,
        invoicedTotal,
        remaining: est.TotalAmt - invoicedTotal,
        status: est.TxnStatus,
        invoices: linkedInvoices.map((inv) => ({
          invoiceId: inv.Id,
          docNumber: inv.DocNumber ?? '',
          date: inv.TxnDate,
          amount: inv.TotalAmt,
          balance: inv.Balance,
        })),
        lines,
      }
    })

    return json({ estimates: result })
  } catch (e: unknown) {
    console.error('[qb-estimate-progress] Error:', e)
    const message = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
