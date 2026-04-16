<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const anonLoading = ref(false)
const error = ref<string | null>(null)
const mode = ref<'login' | 'signup'>('login')

async function submit() {
  error.value = null
  loading.value = true
  try {
    const { error: err } =
      mode.value === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
        : await supabase.auth.signUp({ email: email.value, password: password.value })

    if (err) throw err
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function continueAnon() {
  error.value = null
  anonLoading.value = true
  try {
    const { error: err } = await supabase.auth.signInAnonymously()
    if (err) throw err
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    anonLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600">
          <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">KeeprKit</h1>
        <p class="mt-1 text-sm text-gray-500">{{ mode === 'login' ? 'Sign in to your account' : 'Create an account' }}</p>
      </div>

      <form class="rounded-xl bg-white p-6 shadow-sm border border-gray-100 space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</div>

        <button
          type="submit"
          :disabled="loading || anonLoading"
          class="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition"
        >
          {{ loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up' }}
        </button>

        <p class="text-center text-sm text-gray-500">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="text-green-600 font-medium hover:underline" @click="mode = mode === 'login' ? 'signup' : 'login'">
            {{ mode === 'login' ? 'Sign up' : 'Sign in' }}
          </button>
        </p>

        <div class="relative flex items-center gap-3">
          <div class="h-px flex-1 bg-gray-200" />
          <span class="text-xs text-gray-400">or</span>
          <div class="h-px flex-1 bg-gray-200" />
        </div>

        <button
          type="button"
          :disabled="loading || anonLoading"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition"
          @click="continueAnon"
        >
          {{ anonLoading ? 'Please wait…' : 'Continue without account' }}
        </button>
      </form>
    </div>
  </div>
</template>
