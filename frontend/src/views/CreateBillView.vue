<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()

// ── Types ────────────────────────────────────────────────────────────────────

interface Vendor   { id: string; name: string }
interface Account  { id: string; name: string; type: string }
interface Item     { id: string; name: string; sku: string; description: string; category: string; type: string }
interface Customer { id: string; name: string }

interface LineItem {
  lineType: 'account' | 'item'
  // account-based
  accountId: string
  // item-based
  itemId: string
  qty: string
  unitPrice: string
  customerId: string
  // shared
  description: string
  amount: string // used for account lines; for item lines auto-computed from qty*unitPrice
}

// ── State ────────────────────────────────────────────────────────────────────

const refsLoading = ref(true)
const refsError   = ref<string | null>(null)
const vendors     = ref<Vendor[]>([])
const accounts    = ref<Account[]>([])
const items       = ref<Item[]>([])
const customers   = ref<Customer[]>([])

const vendorId = ref('')
const txnDate  = ref(new Date().toISOString().slice(0, 10))
const dueDate  = ref('')

function blankLine(): LineItem {
  return { lineType: 'account', accountId: '', itemId: '', qty: '', unitPrice: '', customerId: '', description: '', amount: '' }
}

const lines = ref<LineItem[]>([blankLine()])

// ── Item dropdown state ───────────────────────────────────────────────────────

const openItemDropdownIdx = ref<number | null>(null)
const itemSearch = ref('')

function openItemDropdown(i: number) {
  openItemDropdownIdx.value = i
  itemSearch.value = ''
}

function closeItemDropdown() {
  openItemDropdownIdx.value = null
  itemSearch.value = ''
}

function selectItem(line: LineItem, item: Item) {
  line.itemId = item.id
  closeItemDropdown()
}

const filteredItems = computed(() => {
  const q = itemSearch.value.toLowerCase()
  if (!q) return items.value
  return items.value.filter((it) =>
    it.name.toLowerCase().includes(q) ||
    it.sku.toLowerCase().includes(q) ||
    it.description.toLowerCase().includes(q) ||
    it.category.toLowerCase().includes(q),
  )
})

function selectedItemLabel(line: LineItem): string {
  return items.value.find((it) => it.id === line.itemId)?.name ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────

const submitting  = ref(false)
const submitError = ref<string | null>(null)
const success     = ref<{ id: string; docNumber: string; totalAmt: number; vendorName: string } | null>(null)

// ── Load reference data ───────────────────────────────────────────────────────

async function loadRefs() {
  refsLoading.value = true
  refsError.value = null

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await supabase.functions.invoke('qb-create-bill', {
      body: { action: 'fetch-refs' },
    })

    if (res.error) throw new Error(res.error.message)
    if (res.data?.error) throw new Error(typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error))

    vendors.value   = res.data.vendors   ?? []
    accounts.value  = res.data.accounts  ?? []
    items.value     = res.data.items     ?? []
    customers.value = res.data.customers ?? []
  } catch (e: unknown) {
    refsError.value = e instanceof Error ? e.message : 'Failed to load reference data.'
  } finally {
    refsLoading.value = false
  }
}

onMounted(loadRefs)

// ── Line helpers ──────────────────────────────────────────────────────────────

function addLine() {
  lines.value.push(blankLine())
}

function removeLine(i: number) {
  lines.value.splice(i, 1)
}

function setLineType(line: LineItem, type: 'account' | 'item') {
  line.lineType = type
}

// Computed amount for item lines (qty × unitPrice); falls back to manual amount field
function itemLineAmount(line: LineItem): number {
  const q = parseFloat(line.qty)
  const p = parseFloat(line.unitPrice)
  if (!isNaN(q) && !isNaN(p)) return q * p
  return parseFloat(line.amount) || 0
}

function resolvedAmount(line: LineItem): number {
  return line.lineType === 'item' ? itemLineAmount(line) : (parseFloat(line.amount) || 0)
}

// ── Validation ────────────────────────────────────────────────────────────────

const lineErrors = computed(() =>
  lines.value.map((l) => {
    if (l.lineType === 'account') {
      if (!l.accountId) return 'Account is required'
      if (resolvedAmount(l) <= 0) return 'Amount must be a positive number'
    } else {
      if (!l.itemId) return 'Product/Service is required'
      if (resolvedAmount(l) <= 0) return 'Enter qty × unit price or an amount'
    }
    return null
  }),
)

const formValid = computed(() =>
  vendorId.value &&
  txnDate.value &&
  lines.value.length > 0 &&
  lineErrors.value.every((e) => e === null),
)

const total = computed(() => lines.value.reduce((s, l) => s + resolvedAmount(l), 0))

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitBill() {
  if (!formValid.value) return

  submitting.value  = true
  submitError.value = null
  success.value     = null

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await supabase.functions.invoke('qb-create-bill', {
      body: {
        action: 'create',
        vendorId: vendorId.value,
        txnDate:  txnDate.value,
        dueDate:  dueDate.value || undefined,
        lines: lines.value.map((l) => {
          const amt = resolvedAmount(l)
          if (l.lineType === 'item') {
            const q = parseFloat(l.qty)
            const p = parseFloat(l.unitPrice)
            return {
              lineType:    'item',
              itemId:      l.itemId,
              description: l.description,
              amount:      amt,
              qty:         isNaN(q) ? undefined : q,
              unitPrice:   isNaN(p) ? undefined : p,
              customerId:  l.customerId || undefined,
            }
          }
          return {
            lineType:    'account',
            accountId:   l.accountId,
            description: l.description,
            amount:      amt,
          }
        }),
      },
    })

    if (res.error) throw new Error(res.error.message)
    if (res.data?.error) throw new Error(typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error))

    success.value = res.data
    vendorId.value = ''
    txnDate.value  = new Date().toISOString().slice(0, 10)
    dueDate.value  = ''
    lines.value    = [blankLine()]
  } catch (e: unknown) {
    submitError.value = e instanceof Error ? e.message : 'An unexpected error occurred.'
  } finally {
    submitting.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
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
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Invoice Payments
            </router-link>
            <router-link to="/create-bill"
              class="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 transition">
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

    <div class="mx-auto max-w-3xl px-6 py-8 space-y-6">

      <div>
        <h2 class="text-xl font-semibold text-gray-900">Create Bill</h2>
        <p class="mt-1 text-sm text-gray-500">Enter a new bill into QuickBooks Online.</p>
      </div>

      <!-- Success banner -->
      <div v-if="success" class="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-4 flex items-start gap-3">
        <svg class="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <div class="text-sm text-emerald-800">
          <p class="font-semibold">Bill created successfully</p>
          <p class="mt-0.5">
            Bill #{{ success.docNumber }} for {{ success.vendorName }} —
            <span class="font-medium">{{ fmtMoney(success.totalAmt) }}</span>
          </p>
        </div>
      </div>

      <!-- Refs loading skeleton -->
      <div v-if="refsLoading" class="bg-white border border-gray-200 rounded-lg p-6 space-y-4 animate-pulse">
        <div class="h-4 bg-gray-200 rounded w-1/3" />
        <div class="h-9 bg-gray-100 rounded" />
        <div class="h-4 bg-gray-200 rounded w-1/4 mt-4" />
        <div class="h-9 bg-gray-100 rounded" />
      </div>

      <!-- Refs error -->
      <div v-else-if="refsError" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center justify-between">
        <span>{{ refsError }}</span>
        <button @click="loadRefs" class="ml-4 text-red-600 underline hover:no-underline text-xs">Retry</button>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="submitBill" class="space-y-6">

        <!-- Vendor + dates -->
        <div class="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h3 class="text-sm font-semibold text-gray-700">Bill Details</h3>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2 flex flex-col gap-1">
              <label class="text-xs font-medium text-gray-500">Vendor <span class="text-red-500">*</span></label>
              <select
                v-model="vendorId"
                class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="" disabled>Select a vendor…</option>
                <option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-gray-500">Bill Date <span class="text-red-500">*</span></label>
              <input
                v-model="txnDate"
                type="date"
                class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-gray-500">Due Date <span class="text-gray-400 font-normal">(optional)</span></label>
              <input
                v-model="dueDate"
                type="date"
                class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        <!-- Line items -->
        <div class="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">Line Items</h3>
            <button
              type="button"
              @click="addLine"
              class="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add line
            </button>
          </div>

          <div
            v-for="(line, i) in lines"
            :key="i"
            class="space-y-3 pb-5 border-b border-gray-100 last:border-0 last:pb-0">

            <!-- Type toggle + remove -->
            <div class="flex items-center justify-between">
              <div class="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  @click="setLineType(line, 'account')"
                  :class="line.lineType === 'account'
                    ? 'bg-indigo-600 text-white px-3 py-1'
                    : 'bg-white text-gray-500 hover:bg-gray-50 px-3 py-1 transition'">
                  Account
                </button>
                <button
                  type="button"
                  @click="setLineType(line, 'item')"
                  :class="line.lineType === 'item'
                    ? 'bg-indigo-600 text-white px-3 py-1'
                    : 'bg-white text-gray-500 hover:bg-gray-50 px-3 py-1 transition'">
                  Product/Service
                </button>
              </div>

              <button
                v-if="lines.length > 1"
                type="button"
                @click="removeLine(i)"
                class="p-1.5 text-gray-400 hover:text-red-500 transition rounded-md hover:bg-red-50">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Error -->
            <p v-if="lineErrors[i]" class="text-xs text-red-500">{{ lineErrors[i] }}</p>

            <!-- ── Account-based fields ── -->
            <template v-if="line.lineType === 'account'">
              <div class="grid grid-cols-12 gap-3">
                <div class="col-span-12 sm:col-span-5 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Account <span class="text-red-500">*</span></label>
                  <select
                    v-model="line.accountId"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="" disabled>Select account…</option>
                    <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                  </select>
                </div>

                <div class="col-span-12 sm:col-span-5 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Description</label>
                  <input
                    v-model="line.description"
                    type="text"
                    placeholder="Optional"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div class="col-span-12 sm:col-span-2 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Amount <span class="text-red-500">*</span></label>
                  <input
                    v-model="line.amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums" />
                </div>
              </div>
            </template>

            <!-- ── Item-based fields ── -->
            <template v-else>
              <div class="grid grid-cols-12 gap-3">
                <!-- Product/Service custom dropdown -->
                <div class="col-span-12 sm:col-span-5 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Product/Service <span class="text-red-500">*</span></label>
                  <div class="relative">
                    <!-- Trigger -->
                    <button
                      type="button"
                      @click="openItemDropdown(i)"
                      class="w-full flex items-center justify-between border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left">
                      <span :class="selectedItemLabel(line) ? 'text-gray-900' : 'text-gray-400'">
                        {{ selectedItemLabel(line) || 'Select item…' }}
                      </span>
                      <svg class="h-4 w-4 text-gray-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <!-- Overlay -->
                    <div
                      v-if="openItemDropdownIdx === i"
                      class="fixed inset-0 z-10"
                      @click="closeItemDropdown" />

                    <!-- Panel -->
                    <div
                      v-if="openItemDropdownIdx === i"
                      class="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden"
                      style="min-width: 420px">
                      <!-- Search -->
                      <div class="px-3 py-2 border-b border-gray-100">
                        <input
                          v-model="itemSearch"
                          type="text"
                          placeholder="Search items…"
                          autofocus
                          @click.stop
                          class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>

                      <!-- Options -->
                      <div class="max-h-64 overflow-y-auto divide-y divide-gray-50">
                        <div
                          v-for="it in filteredItems"
                          :key="it.id"
                          @click="selectItem(line, it)"
                          class="flex gap-4 px-3 py-2.5 cursor-pointer hover:bg-indigo-50 transition-colors"
                          :class="line.itemId === it.id ? 'bg-indigo-50' : ''">
                          <!-- Left column: name + sku -->
                          <div class="min-w-0 flex-1">
                            <div class="text-sm font-medium text-gray-900 truncate">{{ it.name }}</div>
                            <div v-if="it.sku" class="text-xs text-gray-400 truncate">{{ it.sku }}</div>
                          </div>
                          <!-- Right column: description + category -->
                          <div class="min-w-0 flex-1 text-right">
                            <div v-if="it.description" class="text-sm text-gray-600 truncate">{{ it.description }}</div>
                            <div v-if="it.category" class="text-xs text-gray-400 truncate">{{ it.category }}</div>
                          </div>
                        </div>
                        <div v-if="filteredItems.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
                          No items match "{{ itemSearch }}"
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Description -->
                <div class="col-span-12 sm:col-span-7 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Description</label>
                  <input
                    v-model="line.description"
                    type="text"
                    placeholder="Optional"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <!-- Qty -->
                <div class="col-span-4 sm:col-span-2 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Qty</label>
                  <input
                    v-model="line.qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="1"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums" />
                </div>

                <!-- Unit Price -->
                <div class="col-span-4 sm:col-span-3 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Unit Price</label>
                  <input
                    v-model="line.unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums" />
                </div>

                <!-- Amount (manual fallback if no qty×price) -->
                <div class="col-span-4 sm:col-span-3 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">
                    Amount <span class="text-red-500">*</span>
                    <span v-if="line.qty && line.unitPrice" class="text-gray-400 font-normal ml-1">(computed)</span>
                  </label>
                  <input
                    v-if="line.qty && line.unitPrice"
                    :value="fmtMoney(itemLineAmount(line))"
                    type="text"
                    readonly
                    class="border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 tabular-nums cursor-default" />
                  <input
                    v-else
                    v-model="line.amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums" />
                </div>

                <!-- Customer/Project -->
                <div class="col-span-12 sm:col-span-4 flex flex-col gap-1">
                  <label class="text-xs font-medium text-gray-500">Customer/Project <span class="text-gray-400 font-normal">(optional)</span></label>
                  <select
                    v-model="line.customerId"
                    class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">None</option>
                    <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
              </div>
            </template>

          </div>

          <!-- Total -->
          <div class="flex justify-end pt-1 border-t border-gray-100">
            <div class="text-sm text-gray-700 pt-3">
              Total: <span class="font-semibold tabular-nums text-gray-900">{{ fmtMoney(total) }}</span>
            </div>
          </div>
        </div>

        <!-- Submit error -->
        <div v-if="submitError" class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {{ submitError }}
        </div>

        <!-- Submit -->
        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="!formValid || submitting"
            class="px-6 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm">
            {{ submitting ? 'Creating bill…' : 'Create Bill in QuickBooks' }}
          </button>
        </div>

      </form>
    </div>
  </div>
</template>
