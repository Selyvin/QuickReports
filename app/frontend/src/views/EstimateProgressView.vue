<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader.vue'

const router = useRouter()

// ── Types ────────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  invoiceId: string
  docNumber: string
  date: string
  amount: number
  balance: number
}

interface LineProgress {
  itemId: string | null
  itemName: string
  description: string
  estimated: number
  invoiced: number
  remaining: number
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

// ── State ────────────────────────────────────────────────────────────────────

const loading = ref(false)
const error = ref<string | null>(null)
const estimates = ref<EstimateProgress[]>([])
const expandedEstimate = ref<string | null>(null)
const search = ref('')
const showLines = ref<string | null>(null)

// ── Computed ─────────────────────────────────────────────────────────────────

const filteredEstimates = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return estimates.value
  return estimates.value.filter(
    (e) =>
      e.customer.toLowerCase().includes(q) ||
      e.docNumber.toLowerCase().includes(q),
  )
})

const summary = computed(() => {
  const list = estimates.value
  return {
    count: list.length,
    totalEstimated: list.reduce((s, e) => s + e.estimateTotal, 0),
    totalInvoiced: list.reduce((s, e) => s + e.invoicedTotal, 0),
    totalRemaining: list.reduce((s, e) => s + e.remaining, 0),
  }
})

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchEstimates() {
  loading.value = true
  error.value = null
  estimates.value = []

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${supabaseUrl}/functions/v1/qb-estimate-progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ status: 'Pending' }),
    })

    const data = await res.json()
    if (!res.ok) {
      error.value = data?.error ?? 'Request failed'
      return
    }

    estimates.value = data.estimates
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

function pct(invoiced: number, total: number) {
  if (total === 0) return 0
  return Math.min(Math.round((invoiced / total) * 100), 100)
}

function toggleExpand(id: string) {
  expandedEstimate.value = expandedEstimate.value === id ? null : id
}

function toggleLines(id: string) {
  showLines.value = showLines.value === id ? null : id
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <AppHeader />

    <!-- Content -->
    <div class="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <!-- Title + actions -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">Estimate Progress</h2>
          <p class="mt-1 text-sm text-gray-500">Track invoicing progress against open estimates</p>
        </div>
        <button
          :disabled="loading"
          class="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-60"
          @click="fetchEstimates"
        >
          <svg v-if="loading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {{ loading ? 'Loading…' : 'Load Estimates' }}
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- Summary cards -->
      <div v-if="estimates.length" class="grid grid-cols-4 gap-4">
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-xs font-medium text-gray-500">Open Estimates</p>
          <p class="mt-1 text-2xl font-semibold text-gray-900">{{ summary.count }}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-xs font-medium text-gray-500">Total Estimated</p>
          <p class="mt-1 text-2xl font-semibold text-gray-900">{{ fmt(summary.totalEstimated) }}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-xs font-medium text-gray-500">Total Invoiced</p>
          <p class="mt-1 text-2xl font-semibold text-emerald-600">{{ fmt(summary.totalInvoiced) }}</p>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <p class="text-xs font-medium text-gray-500">Remaining</p>
          <p class="mt-1 text-2xl font-semibold text-amber-600">{{ fmt(summary.totalRemaining) }}</p>
        </div>
      </div>

      <!-- Search -->
      <div v-if="estimates.length" class="relative max-w-sm">
        <svg class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Search by customer or estimate #…"
          class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
        />
      </div>

      <!-- Empty state -->
      <div v-if="!loading && !estimates.length && !error" class="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-24 text-center">
        <svg class="h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm font-medium text-gray-500">Click "Load Estimates" to fetch progress data</p>
        <p class="mt-1 text-xs text-gray-400">Shows all open estimates with linked invoices from QuickBooks</p>
      </div>

      <!-- Estimate cards -->
      <div v-if="estimates.length" class="space-y-4">
        <div
          v-for="est in filteredEstimates"
          :key="est.estimateId"
          class="rounded-xl border border-gray-200 bg-white overflow-hidden"
        >
          <!-- Estimate header row -->
          <button
            class="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition"
            @click="toggleExpand(est.estimateId)"
          >
            <!-- Expand chevron -->
            <svg
              class="h-4 w-4 text-gray-400 shrink-0 transition-transform"
              :class="{ 'rotate-90': expandedEstimate === est.estimateId }"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>

            <!-- Customer + estimate info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-sm font-semibold text-gray-900">{{ est.customer }}</span>
                <span class="text-xs text-gray-400">Est #{{ est.docNumber || est.estimateId }}</span>
                <span class="text-xs text-gray-400">{{ est.date }}</span>
              </div>
              <!-- Progress bar -->
              <div class="mt-2 flex items-center gap-3">
                <div class="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="pct(est.invoicedTotal, est.estimateTotal) === 100 ? 'bg-emerald-500' : 'bg-green-500'"
                    :style="{ width: pct(est.invoicedTotal, est.estimateTotal) + '%' }"
                  />
                </div>
                <span class="text-xs font-medium text-gray-500 tabular-nums w-10 text-right">
                  {{ pct(est.invoicedTotal, est.estimateTotal) }}%
                </span>
              </div>
            </div>

            <!-- Amounts -->
            <div class="flex items-center gap-6 shrink-0 text-right">
              <div>
                <p class="text-xs text-gray-400">Estimated</p>
                <p class="text-sm font-semibold text-gray-900 tabular-nums">{{ fmt(est.estimateTotal) }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400">Invoiced</p>
                <p class="text-sm font-semibold text-emerald-600 tabular-nums">{{ fmt(est.invoicedTotal) }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-400">Remaining</p>
                <p class="text-sm font-semibold text-amber-600 tabular-nums">{{ fmt(est.remaining) }}</p>
              </div>
            </div>
          </button>

          <!-- Expanded: invoices + line items -->
          <div v-if="expandedEstimate === est.estimateId" class="border-t border-gray-100">
            <!-- Invoices -->
            <div class="px-5 py-4">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Linked Invoices ({{ est.invoices.length }})
              </h4>
              <div v-if="est.invoices.length" class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-100">
                      <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Invoice #</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="inv in est.invoices" :key="inv.invoiceId" class="border-b border-gray-50 last:border-0">
                      <td class="px-3 py-2 text-gray-900">#{{ inv.docNumber || inv.invoiceId }}</td>
                      <td class="px-3 py-2 text-gray-600">{{ inv.date }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-gray-900">{{ fmt(inv.amount) }}</td>
                      <td class="px-3 py-2 text-right tabular-nums" :class="inv.balance > 0 ? 'text-amber-600' : 'text-gray-400'">
                        {{ fmt(inv.balance) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-sm text-gray-400">No invoices linked to this estimate yet.</p>
            </div>

            <!-- Line item progress toggle -->
            <div class="border-t border-gray-100 px-5 py-3">
              <button
                class="text-xs font-medium text-green-600 hover:text-green-800 transition"
                @click.stop="toggleLines(est.estimateId)"
              >
                {{ showLines === est.estimateId ? 'Hide' : 'Show' }} line item breakdown
              </button>
            </div>

            <!-- Line item progress table -->
            <div v-if="showLines === est.estimateId && est.lines.length" class="border-t border-gray-100 px-5 py-4">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Line Item Progress
              </h4>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-100">
                      <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Estimated</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Invoiced</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">Remaining</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(line, li) in est.lines" :key="li" class="border-b border-gray-50 last:border-0">
                      <td class="px-3 py-2 text-gray-900 font-medium">{{ line.itemName }}</td>
                      <td class="px-3 py-2 text-gray-600 max-w-xs truncate">{{ line.description }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-gray-900">{{ fmt(line.estimated) }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-emerald-600">{{ fmt(line.invoiced) }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-amber-600">{{ fmt(line.remaining) }}</td>
                      <td class="px-3 py-2">
                        <div class="flex items-center gap-2">
                          <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              class="h-full rounded-full"
                              :class="pct(line.invoiced, line.estimated) === 100 ? 'bg-emerald-500' : 'bg-green-500'"
                              :style="{ width: pct(line.invoiced, line.estimated) + '%' }"
                            />
                          </div>
                          <span class="text-xs text-gray-400 tabular-nums w-8 text-right">{{ pct(line.invoiced, line.estimated) }}%</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- No search results -->
        <p v-if="filteredEstimates.length === 0" class="text-center text-sm text-gray-400 py-8">
          No estimates match your search.
        </p>
      </div>
    </div>
  </div>
</template>
