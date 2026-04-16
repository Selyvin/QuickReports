<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useQuickBooksStore, type QBAccount } from '@/stores/quickbooks'
import { useQBConnect } from '@/composables/useQBConnect'
import AccountBalancesChart from '@/components/charts/AccountBalancesChart.vue'
import IncomeExpensesChart from '@/components/charts/IncomeExpensesChart.vue'
import CashFlowChart from '@/components/charts/CashFlowChart.vue'
import ExpenseBreakdownChart from '@/components/charts/ExpenseBreakdownChart.vue'
import AccountsTable from '@/components/tables/AccountsTable.vue'
import AppHeader from '@/components/AppHeader.vue'

const router = useRouter()
const store = useQuickBooksStore()
const { connected, connecting, error: connectError, connect } = useQBConnect()

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}

onMounted(() => {
  store.fetchAccounts()
  store.fetchTransactions()
})

const totalAssets = computed(() =>
  store.accounts.filter((a: QBAccount) => a.account_type === 'Bank').reduce((s: number, a: QBAccount) => s + a.current_balance, 0),
)
const totalIncome = computed(() =>
  store.accounts.filter((a: QBAccount) => a.account_type === 'Income').reduce((s: number, a: QBAccount) => s + a.current_balance, 0),
)
const totalExpenses = computed(() =>
  store.accounts.filter((a: QBAccount) => a.account_type === 'Expense').reduce((s: number, a: QBAccount) => s + a.current_balance, 0),
)
const netProfit = computed(() => totalIncome.value - totalExpenses.value)

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <AppHeader>
      <div class="flex items-center gap-3">
        <!-- QB connection status / button -->
        <div v-if="connected === null" class="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
        <span v-else-if="connected" class="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <span class="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          QuickBooks connected
        </span>
        <button
          v-else
          :disabled="connecting"
          class="flex items-center gap-2 rounded-lg bg-[#2CA01C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#248016] disabled:opacity-60"
          @click="connect"
        >
          <svg v-if="connecting" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {{ connecting ? 'Redirecting…' : 'Connect QuickBooks' }}
        </button>

        <!-- loading indicator -->
        <div v-if="store.loading" class="flex items-center gap-2 text-sm text-gray-500">
          <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <button
          class="text-sm text-gray-400 hover:text-gray-600 transition"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </AppHeader>

    <div v-if="connectError" class="bg-red-50 px-6 py-3 text-sm text-red-700 border-b border-red-100">
      {{ connectError }}
    </div>

    <main class="mx-auto max-w-7xl px-6 py-8 space-y-8">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Bank Assets</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ fmt(totalAssets) }}</p>
        </div>
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Total Income</p>
          <p class="mt-1 text-2xl font-bold text-emerald-600">{{ fmt(totalIncome) }}</p>
        </div>
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Total Expenses</p>
          <p class="mt-1 text-2xl font-bold text-red-500">{{ fmt(totalExpenses) }}</p>
        </div>
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Net Profit</p>
          <p class="mt-1 text-2xl font-bold" :class="netProfit >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ fmt(netProfit) }}
          </p>
        </div>
      </div>

      <!-- Charts Row 1 -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 class="mb-4 text-sm font-semibold text-gray-700">Account Balances</h2>
          <div class="h-56">
            <AccountBalancesChart :accounts="store.accounts" />
          </div>
        </div>
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 class="mb-4 text-sm font-semibold text-gray-700">Income vs Expenses</h2>
          <div class="h-56">
            <IncomeExpensesChart :accounts="store.accounts" />
          </div>
        </div>
      </div>

      <!-- Charts Row 2 -->
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 class="mb-4 text-sm font-semibold text-gray-700">Cash Flow (6 months)</h2>
          <div class="h-56">
            <CashFlowChart :transactions="store.transactions" />
          </div>
        </div>
        <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h2 class="mb-4 text-sm font-semibold text-gray-700">Expense Breakdown</h2>
          <div class="h-56">
            <ExpenseBreakdownChart :accounts="store.accounts" />
          </div>
        </div>
      </div>

      <!-- Accounts Table -->
      <div class="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
        <h2 class="mb-4 text-sm font-semibold text-gray-700">All Accounts</h2>
        <AccountsTable :accounts="store.accounts" />
      </div>
    </main>
  </div>
</template>
