<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const status = ref<'processing' | 'error'>('processing')
const errorMessage = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const realmId = params.get('realmId')
  const error = params.get('error')

  if (error) {
    status.value = 'error'
    errorMessage.value = `QuickBooks denied access: ${error}`
    return
  }

  if (!code || !state || !realmId) {
    status.value = 'error'
    errorMessage.value = 'Missing required parameters from QuickBooks.'
    return
  }

  const { error: fnError } = await supabase.functions.invoke('qb-oauth-callback', {
    body: { code, state, realmId },
  })

  if (fnError) {
    status.value = 'error'
    errorMessage.value = fnError.message ?? 'Something went wrong.'
    return
  }

  router.replace('/?qb_connected=true')
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <div class="text-center space-y-3">
      <template v-if="status === 'processing'">
        <svg class="mx-auto h-8 w-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p class="text-sm text-gray-500">Connecting QuickBooks…</p>
      </template>
      <template v-else>
        <p class="text-sm font-medium text-red-600">{{ errorMessage }}</p>
        <button class="text-sm text-indigo-600 hover:underline" @click="$router.replace('/')">
          Back to dashboard
        </button>
      </template>
    </div>
  </div>
</template>
