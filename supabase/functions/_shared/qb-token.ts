/**
 * Shared helper: get a valid QuickBooks access token for a user.
 * Automatically refreshes if the token is expired or about to expire.
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
 * Pass the service-role Supabase client.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ access_token: string; realm_id: string }> {
  const { data: conn, error } = await supabase
    .from('qb_connections')
    .select('access_token, refresh_token, token_expires_at, realm_id')
    .eq('user_id', userId)
    .single<QBConnection>()

  if (error || !conn) throw new Error('No QuickBooks connection found for this user')

  const expiresAt = new Date(conn.token_expires_at).getTime()
  const needsRefresh = expiresAt - Date.now() < REFRESH_BUFFER_MS

  if (!needsRefresh) {
    return { access_token: conn.access_token, realm_id: conn.realm_id }
  }

  // Refresh the access token.
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

  const tokens: {
    access_token: string
    refresh_token: string
    expires_in: number
  } = await res.json()

  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('qb_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: newExpiresAt,
    })
    .eq('user_id', userId)

  return { access_token: tokens.access_token, realm_id: conn.realm_id }
}
