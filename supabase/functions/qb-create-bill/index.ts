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

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountBillLine {
  lineType: 'account'
  accountId: string
  description?: string
  amount: number
}

interface ItemBillLine {
  lineType: 'item'
  itemId: string
  description?: string
  qty?: number
  unitPrice?: number
  amount: number
  customerId?: string
}

type BillLine = AccountBillLine | ItemBillLine

interface CreateBillPayload {
  vendorId: string
  txnDate: string
  dueDate?: string
  lines: BillLine[]
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

    // deno-lint-ignore no-explicit-any
    let body: Record<string, any>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const { access_token, realm_id } = await getValidToken(supabase, user.id)
    const action: string = body.action ?? 'create'

    // ── Action: fetch vendors, accounts, items, customers ─────────────────────
    if (action === 'fetch-refs') {
      const [vendorRes, expenseRes, otherExpenseRes, cogsRes, itemRes, customerRes] = await Promise.all([
        qbQuery(realm_id, access_token, `SELECT Id, DisplayName FROM Vendor WHERE Active = true ORDERBY DisplayName STARTPOSITION 1 MAXRESULTS 1000`),
        qbQuery(realm_id, access_token, `SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Expense' AND Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000`),
        qbQuery(realm_id, access_token, `SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Other Expense' AND Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000`),
        qbQuery(realm_id, access_token, `SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Cost of Goods Sold' AND Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000`),
        qbQuery(realm_id, access_token, `SELECT Id, Name, FullyQualifiedName, Type, Sku, Description FROM Item WHERE Active = true ORDERBY Name STARTPOSITION 1 MAXRESULTS 1000`),
        qbQuery(realm_id, access_token, `SELECT Id, DisplayName FROM Customer WHERE Active = true ORDERBY DisplayName STARTPOSITION 1 MAXRESULTS 1000`),
      ])

      const vendors = (vendorRes['Vendor'] ?? []).map((v: { Id: string; DisplayName: string }) => ({
        id: v.Id,
        name: v.DisplayName,
      }))

      type QBAccount = { Id: string; Name: string; AccountType: string }
      const allAccounts: QBAccount[] = [
        ...(expenseRes['Account'] ?? []),
        ...(otherExpenseRes['Account'] ?? []),
        ...(cogsRes['Account'] ?? []),
      ]
      allAccounts.sort((a, b) => a.Name.localeCompare(b.Name))
      const accounts = allAccounts.map((a) => ({ id: a.Id, name: a.Name, type: a.AccountType }))

      const items = (itemRes['Item'] ?? []).map((it: { Id: string; Name: string; FullyQualifiedName: string; Type: string; Sku?: string; Description?: string }) => {
        const fqnParts = (it.FullyQualifiedName ?? '').split(':')
        const category = fqnParts.length > 1 ? fqnParts.slice(0, -1).join(' > ') : ''
        return {
          id: it.Id,
          name: it.Name,
          sku: it.Sku ?? '',
          description: it.Description ?? '',
          category,
          type: it.Type,
        }
      })

      const customers = (customerRes['Customer'] ?? []).map((c: { Id: string; DisplayName: string }) => ({
        id: c.Id,
        name: c.DisplayName,
      }))

      return json({ vendors, accounts, items, customers })
    }

    // ── Action: create bill ────────────────────────────────────────────────────
    if (action === 'create') {
      const payload = body as CreateBillPayload & { action: string }

      if (!payload.vendorId) return json({ error: 'vendorId is required' }, 400)
      if (!payload.txnDate) return json({ error: 'txnDate is required' }, 400)
      if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
        return json({ error: 'At least one line item is required' }, 400)
      }

      // deno-lint-ignore no-explicit-any
      const qbLines: any[] = payload.lines.map((line, i) => {
        if (line.lineType === 'item') {
          // deno-lint-ignore no-explicit-any
          const detail: Record<string, any> = {
            ItemRef: { value: line.itemId },
            BillableStatus: 'NotBillable',
          }
          if (line.qty != null) detail['Qty'] = line.qty
          if (line.unitPrice != null) detail['UnitPrice'] = line.unitPrice
          if (line.customerId) detail['CustomerRef'] = { value: line.customerId }

          return {
            Id: String(i + 1),
            Amount: line.amount,
            DetailType: 'ItemBasedExpenseLineDetail',
            Description: line.description ?? '',
            ItemBasedExpenseLineDetail: detail,
          }
        } else {
          return {
            Id: String(i + 1),
            Amount: line.amount,
            DetailType: 'AccountBasedExpenseLineDetail',
            Description: line.description ?? '',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: (line as AccountBillLine).accountId },
              BillableStatus: 'NotBillable',
            },
          }
        }
      })

      const billBody: Record<string, unknown> = {
        VendorRef: { value: payload.vendorId },
        TxnDate: payload.txnDate,
        Line: qbLines,
      }
      if (payload.dueDate) billBody['DueDate'] = payload.dueDate

      const url = `${QB_BASE_URL}/v3/company/${realm_id}/bill?minorversion=65`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(billBody),
      })

      const data = await res.json()
      if (!res.ok) {
        const msg = data?.Fault?.Error?.[0]?.Detail ?? data?.Fault?.Error?.[0]?.Message ?? JSON.stringify(data)
        throw new Error(`QB create bill failed (${res.status}): ${msg}`)
      }

      const bill = data.Bill
      return json({
        id: bill.Id,
        docNumber: bill.DocNumber ?? bill.Id,
        txnDate: bill.TxnDate,
        dueDate: bill.DueDate ?? null,
        totalAmt: bill.TotalAmt,
        vendorName: bill.VendorRef?.name ?? '',
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e: unknown) {
    console.error('[qb-create-bill] Error:', e)
    const message = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
