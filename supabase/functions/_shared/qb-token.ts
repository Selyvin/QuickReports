/**
 * Shared helper: get a valid QuickBooks access token for a user.
 * Automatically refreshes if the token is expired or about to expire.
 * Falls back to a sandbox connection when the user has not connected their account.
 */
import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('INTUIT_CLIENT_ID')!
const CLIENT_SECRET = Deno.env.get('INTUIT_CLIENT_SECRET')!

// Refresh the token 5 minutes before it actually expires.
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface QBConnection {
  realm_id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
}

/**
 * Returns a fresh access_token + realm_id for the given user.
 * If the user has no QB connection, falls back to the sandbox account.
 * Pass the service-role Supabase client.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ access_token: string; realm_id: string }> {
  // Try the user's own connection first.
  const { data: userConn } = await supabase
    .from('qb_connections')
    .select('access_token, refresh_token, token_expires_at, realm_id')
    .eq('user_id', userId)
    .maybeSingle<QBConnection>()

  if (userConn) {
    return getOrRefreshToken(supabase, userConn, async (tokens, newExpiresAt) => {
      await supabase
        .from('qb_connections')
        .update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: newExpiresAt })
        .eq('user_id', userId)
    })
  }

  return getSandboxToken(supabase)
}

async function getOrRefreshToken(
  _supabase: SupabaseClient,
  conn: QBConnection,
  saveRefreshed: (tokens: { access_token: string; refresh_token: string }, newExpiresAt: string) => Promise<void>,
): Promise<{ access_token: string; realm_id: string }> {
  const expiresAt = new Date(conn.token_expires_at).getTime()
  if (expiresAt - Date.now() >= REFRESH_BUFFER_MS) {
    return { access_token: conn.access_token, realm_id: conn.realm_id }
  }

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${body}`)
  }

  const tokens: { access_token: string; refresh_token: string; expires_in: number } = await res.json()
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await saveRefreshed(tokens, newExpiresAt)

  return { access_token: tokens.access_token, realm_id: conn.realm_id }
}

async function getSandboxToken(supabase: SupabaseClient): Promise<{ access_token: string; realm_id: string }> {
  // Check if a live sandbox row exists in qb_sandbox_connections (persisted from a prior refresh).
  const { data: existing } = await supabase
    .from('qb_sandbox_connections')
    .select('access_token, refresh_token, token_expires_at, realm_id')
    .limit(1)
    .maybeSingle<QBConnection>()

  if (existing) {
    return getOrRefreshToken(supabase, existing, async (tokens, newExpiresAt) => {
      await supabase
        .from('qb_sandbox_connections')
        .update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: newExpiresAt })
        .eq('realm_id', existing.realm_id)
    })
  }

  // First use: seed from environment variables.
  const realm_id = Deno.env.get('QB_SANDBOX_REALM_ID')
  const access_token = Deno.env.get('QB_SANDBOX_ACCESS_TOKEN')
  const refresh_token = Deno.env.get('QB_SANDBOX_REFRESH_TOKEN')
  // Default to epoch so the refresh flow always runs on first use.
  const token_expires_at = Deno.env.get('QB_SANDBOX_TOKEN_EXPIRES_AT') ?? new Date(0).toISOString()

  if (!realm_id || !access_token || !refresh_token) {
    throw new Error('No QuickBooks connection found and no sandbox credentials configured (QB_SANDBOX_REALM_ID, QB_SANDBOX_ACCESS_TOKEN, QB_SANDBOX_REFRESH_TOKEN)')
  }

  const conn: QBConnection = { realm_id, access_token, refresh_token, token_expires_at }

  // Refresh immediately (epoch token is always expired) and persist the live tokens.
  return getOrRefreshToken(supabase, conn, async (tokens, newExpiresAt) => {
    await supabase
      .from('qb_sandbox_connections')
      .insert({ realm_id, access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires_at: newExpiresAt })
  })
}
