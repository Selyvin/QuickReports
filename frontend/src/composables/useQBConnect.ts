import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

export function useQBConnect() {
  const connected = ref<boolean | null>(null) // null = loading
  const connecting = ref(false)
  const error = ref<string | null>(null)

  async function checkConnection() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { connected.value = false; return }

    const { data } = await supabase
      .from('qb_connections')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    connected.value = !!data
  }

  async function connect() {
    error.value = null
    connecting.value = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('You must be logged in to connect QuickBooks.')

      const { data, error: fnError } = await supabase.functions.invoke('qb-oauth-start')
      if (fnError) throw fnError
      if (!data?.url) throw new Error('No redirect URL returned from server.')

      window.location.href = data.url
    } catch (e) {
      error.value = (e as Error).message
      connecting.value = false
    }
  }

  // Handle return from Intuit (check URL params)
  function handleOAuthReturn() {
    const params = new URLSearchParams(window.location.search)
    if (params.has('qb_connected')) {
      connected.value = true
      // Clean the URL without a page reload
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.has('qb_error')) {
      error.value = `QuickBooks connection failed: ${params.get('qb_error')}`
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  onMounted(async () => {
    handleOAuthReturn()
    await checkConnection()
  })

  return { connected, connecting, error, connect }
}
