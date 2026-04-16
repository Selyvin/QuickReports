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

async function qbQuery(
  realmId: string,
  accessToken: string,
  query: string,
): Promise<Record<string, unknown>> {
  const url = `${QB_BASE_URL}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`QB query failed (${res.status}): ${JSON.stringify(data)}`)
  return data.QueryResponse
}

async function qbQueryAll(
  realmId: string,
  accessToken: string,
  baseQuery: string,
): Promise<unknown[]> {
  const PAGE_SIZE = 1000
  const results: unknown[] = []
  let startPos = 1

  const entityMatch = baseQuery.match(/FROM\s+(\w+)/i)
  const entity = entityMatch?.[1] ?? ''

  while (true) {
    const query = `${baseQuery} STARTPOSITION ${startPos} MAXRESULTS ${PAGE_SIZE}`
    const response = await qbQuery(realmId, accessToken, query)
    const rows = (response[entity] ?? []) as unknown[]
    results.push(...rows)
    if (rows.length < PAGE_SIZE) break
    startPos += PAGE_SIZE
  }

  return results
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

    console.log(`[qb-journal-entries] ${start_date} to ${end_date} for user ${user.id}`)

    const query = `SELECT * FROM JournalEntry WHERE TxnDate >= '${start_date}' AND TxnDate <= '${end_date}'`
    const rows = await qbQueryAll(realm_id, access_token, query)

    return json({ QueryResponse: { JournalEntry: rows } })
  } catch (e: unknown) {
    console.error('[qb-journal-entries] Error:', e)
    const message = e instanceof Error ? e.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
