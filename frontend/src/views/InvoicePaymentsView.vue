<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()

// ── Types ────────────────────────────────────────────────────────────────────

interface InvoicePaymentRow {
  customer: string
  invoiceNumber: string
  invoiceDate: string
  datePaid: string
  amount: number
}

// ── State ────────────────────────────────────────────────────────────────────

const startDate = ref('')
const endDate = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<InvoicePaymentRow[]>([])

// ── Period presets ────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function setPreset(preset: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (preset === 'this-month') {
    startDate.value = toISO(new Date(y, m, 1))
    endDate.value = toISO(new Date(y, m + 1, 0))
  } else if (preset === 'last-month') {
    startDate.value = toISO(new Date(y, m - 1, 1))
    endDate.value = toISO(new Date(y, m, 0))
  } else if (preset === 'this-quarter') {
    const q = Math.floor(m / 3)
    startDate.value = toISO(new Date(y, q * 3, 1))
    endDate.value = toISO(new Date(y, q * 3 + 3, 0))
  } else if (preset === 'last-quarter') {
    const q = Math.floor(m / 3) - 1
    const qy = q < 0 ? y - 1 : y
    const qi = ((q % 4) + 4) % 4
    startDate.value = toISO(new Date(qy, qi * 3, 1))
    endDate.value = toISO(new Date(qy, qi * 3 + 3, 0))
  } else if (preset === 'this-year') {
    startDate.value = `${y}-01-01`
    endDate.value = `${y}-12-31`
  }
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchReport() {
  if (!startDate.value || !endDate.value) {
    error.value = 'Please select a start and end date.'
    return
  }

  loading.value = true
  error.value = null
  rows.value = []

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await supabase.functions.invoke('qb-invoice-payments', {
      body: { start_date: startDate.value, end_date: endDate.value },
    })

    if (res.error) throw new Error(res.error.message)
    if (res.data?.error) throw new Error(typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error))

    rows.value = res.data.rows ?? []
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred.'
  } finally {
    loading.value = false
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV() {
  const header = ['Customer', 'Invoice #', 'Invoice Date', 'Date Paid', 'Amount']
  const csvRows = [
    header.join(','),
    ...rows.value.map((r) => [
      `"${r.customer.replace(/"/g, '""')}"`,
      `"${r.invoiceNumber}"`,
      r.invoiceDate,
      r.datePaid,
      r.amount.toFixed(2),
    ].join(',')),
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `invoice-payments-${startDate.value}-to-${endDate.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="border-b border-gray-200 bg-white px-6 py-4">
      <div class="mx-auto max-w-7xl flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
            <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 class="text-lg font-semibold text-gray-900">QuickReports</h1>
            <p class="text-xs text-gray-500">QuickBooks Financial Dashboard</p>
          </div>
          <nav class="ml-6 flex items-center gap-1">
            <router-link to="/"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Dashboard
            </router-link>
            <router-link to="/reports"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Reports
            </router-link>
            <router-link to="/estimates"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Estimates
            </router-link>
            <router-link to="/wages"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Wages
            </router-link>
            <router-link to="/invoice-payments"
              class="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 transition">
              Invoice Payments
            </router-link>
            <router-link to="/create-bill"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Create Bill
            </router-link>
            <router-link to="/company"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Company
            </router-link>
          </nav>
        </div>
        <button class="text-sm text-gray-400 hover:text-gray-600 transition" @click="signOut">
          Sign out
        </button>
      </div>
    </header>

    <!-- Content -->
    <div class="mx-auto max-w-7xl px-6 py-6 space-y-4">

      <!-- Controls -->
      <div class="bg-white border border-gray-200 rounded-lg px-5 py-4 flex flex-wrap items-end gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">Start Date</label>
          <input v-model="startDate" type="date" class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">End Date</label>
          <input v-model="endDate" type="date" class="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">Quick Select</label>
          <div class="flex gap-1.5">
            <button @click="setPreset('this-month')" class="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition">This Month</button>
            <button @click="setPreset('last-month')" class="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition">Last Month</button>
            <button @click="setPreset('this-quarter')" class="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition">This Quarter</button>
            <button @click="setPreset('last-quarter')" class="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition">Last Quarter</button>
            <button @click="setPreset('this-year')" class="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition">This Year</button>
          </div>
        </div>
        <button
          @click="fetchReport"
          :disabled="loading"
          class="px-4 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition">
          {{ loading ? 'Loading...' : 'Run Report' }}
        </button>
        <button
          v-if="rows.length"
          @click="exportCSV"
          class="px-4 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
          Export CSV
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
        {{ error }}
      </div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="animate-pulse space-y-px">
          <div v-for="i in 8" :key="i" class="h-10 bg-gray-100" :class="i % 2 === 0 ? 'opacity-50' : ''" />
        </div>
      </div>

      <!-- Table -->
      <div v-else-if="rows.length" class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p class="text-sm font-medium text-gray-700">
            Invoice Payments
            <span class="ml-1 text-gray-400 font-normal">{{ startDate }} – {{ endDate }}</span>
          </p>
          <p class="text-sm text-gray-500">{{ rows.length }} {{ rows.length === 1 ? 'row' : 'rows' }}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice #</th>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice Date</th>
                <th class="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date Paid</th>
                <th class="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="(row, i) in rows"
                :key="i"
                class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2.5 text-gray-900 font-medium">{{ row.customer }}</td>
                <td class="px-4 py-2.5 text-gray-700">{{ row.invoiceNumber }}</td>
                <td class="px-4 py-2.5 text-gray-600">{{ fmtDate(row.invoiceDate) }}</td>
                <td class="px-4 py-2.5 text-gray-600">{{ fmtDate(row.datePaid) }}</td>
                <td class="px-4 py-2.5 text-right text-gray-900 tabular-nums">{{ fmtMoney(row.amount) }}</td>
              </tr>
            </tbody>
            <tfoot class="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colspan="4" class="px-4 py-2.5 text-sm font-semibold text-gray-700">Total</td>
                <td class="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 tabular-nums">
                  {{ fmtMoney(rows.reduce((s, r) => s + r.amount, 0)) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loading && startDate && !error" class="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center">
        <p class="text-gray-500 text-sm">No invoice payments found for this period.</p>
      </div>

    </div>
  </div>
</template>
