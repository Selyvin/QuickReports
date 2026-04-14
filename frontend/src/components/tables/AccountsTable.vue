<script setup lang="ts">
import type { QBAccount } from '@/stores/quickbooks'

defineProps<{ accounts: QBAccount[] }>()

const typeColor: Record<string, string> = {
  Bank: 'bg-blue-100 text-blue-800',
  'Accounts Receivable': 'bg-green-100 text-green-800',
  'Accounts Payable': 'bg-red-100 text-red-800',
  Income: 'bg-emerald-100 text-emerald-800',
  Expense: 'bg-orange-100 text-orange-800',
}

function badgeClass(type: string) {
  return typeColor[type] ?? 'bg-gray-100 text-gray-800'
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <th class="py-3 pr-4">Account Name</th>
          <th class="py-3 pr-4">Type</th>
          <th class="py-3 pr-4">Sub-Type</th>
          <th class="py-3 pr-4 text-right">Balance</th>
          <th class="py-3 text-center">Status</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="account in accounts" :key="account.id" class="hover:bg-gray-50 transition-colors">
          <td class="py-3 pr-4 font-medium text-gray-900">{{ account.name }}</td>
          <td class="py-3 pr-4">
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="badgeClass(account.account_type)">
              {{ account.account_type }}
            </span>
          </td>
          <td class="py-3 pr-4 text-gray-500">{{ account.account_sub_type }}</td>
          <td
            class="py-3 pr-4 text-right font-mono font-medium"
            :class="account.current_balance >= 0 ? 'text-gray-900' : 'text-red-600'"
          >
            {{ fmt(account.current_balance) }}
          </td>
          <td class="py-3 text-center">
            <span
              class="inline-block h-2 w-2 rounded-full"
              :class="account.active ? 'bg-emerald-500' : 'bg-gray-300'"
              :title="account.active ? 'Active' : 'Inactive'"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
