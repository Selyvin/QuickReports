<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()

// ── Types ────────────────────────────────────────────────────────────────────

interface RawActivity {
  employeeName: string
  serviceItem: string
  date: string
  rawHours: number
  rawMinutes: number
  totalHours: number // rawHours + rawMinutes / 60
}

interface TimeActivity extends RawActivity {
  hourlyRate: number | null
  grossWages: number
  missingRate: boolean
}

interface GroupedRows {
  serviceItem: string
  rows: TimeActivity[]
  subtotalDecimalHours: number
  subtotalWages: number
}

interface RateEntry {
  employeeName: string
  serviceItem: string
  hourlyRate: string // string for v-model
  dirty: boolean
}

interface PayrollLine {
  jeId: string
  payDate: string
  employeeName: string
  amount: number
}

interface Paycheck {
  jeId: string
  payDate: string
  amount: number
}

interface EmployeeSummary {
  employeeName: string
  calculatedWages: number
  hasMissingRate: boolean
  paychecks: Paycheck[]
  actualWages: number
  difference: number // calculatedWages - actualWages
  hasActual: boolean
}

// ── State ────────────────────────────────────────────────────────────────────

const startDate = ref('')
const endDate = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const rawActivities = ref<RawActivity[]>([])
const activities = ref<TimeActivity[]>([])
const rateEntries = ref<RateEntry[]>([])
const saveSuccess = ref(false)
const showRates = ref(false)
const ratesExpanded = ref(true)
const journalLines = ref<PayrollLine[]>([])
const jeUnavailable = ref(false) // true when the JE fetch failed
let currentUserId = ''

// ── localStorage helpers ─────────────────────────────────────────────────────

function storageKey(userId: string) {
  return `qr_employee_rates_${userId}`
}

function loadRatesFromStorage(userId: string): Map<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return new Map()
    const obj: Record<string, number> = JSON.parse(raw)
    return new Map(Object.entries(obj))
  } catch {
    return new Map()
  }
}

function saveRatesToStorage(userId: string, rates: Map<string, number>) {
  const obj: Record<string, number> = {}
  rates.forEach((v, k) => { obj[k] = v })
  localStorage.setItem(storageKey(userId), JSON.stringify(obj))
}

function rateKey(employeeName: string, serviceItem: string) {
  return `${employeeName}||${serviceItem}`
}

// ── Rate management ───────────────────────────────────────────────────────────

function applyRates(raws: RawActivity[], rates: Map<string, number>): TimeActivity[] {
  return raws.map((a) => {
    const rate = rates.get(rateKey(a.employeeName, a.serviceItem)) ?? null
    const grossWages = rate != null ? Math.round(a.totalHours * rate * 100) / 100 : 0
    return { ...a, hourlyRate: rate, grossWages, missingRate: rate == null }
  })
}

function buildRateEntries(raws: RawActivity[], rates: Map<string, number>) {
  // Collect distinct (employee, serviceItem) pairs — preserve any in-progress edits
  const existingByKey = new Map<string, RateEntry>()
  for (const e of rateEntries.value) {
    existingByKey.set(rateKey(e.employeeName, e.serviceItem), e)
  }

  const seen = new Map<string, RateEntry>()
  for (const a of raws) {
    const key = rateKey(a.employeeName, a.serviceItem)
    if (seen.has(key)) continue
    if (existingByKey.has(key)) {
      seen.set(key, existingByKey.get(key)!)
    } else {
      const rate = rates.get(key)
      seen.set(key, {
        employeeName: a.employeeName,
        serviceItem: a.serviceItem,
        hourlyRate: rate != null ? String(rate) : '',
        dirty: false,
      })
    }
  }

  rateEntries.value = [...seen.values()].sort((a, b) => {
    if (a.serviceItem !== b.serviceItem) return a.serviceItem.localeCompare(b.serviceItem)
    return a.employeeName.localeCompare(b.employeeName)
  })
}

function saveRates() {
  const dirty = rateEntries.value.filter((e) => e.dirty)
  if (!dirty.length) return

  const rates = loadRatesFromStorage(currentUserId)
  for (const e of dirty) {
    const v = parseFloat(e.hourlyRate)
    if (!isNaN(v) && v >= 0) {
      rates.set(rateKey(e.employeeName, e.serviceItem), v)
    }
  }
  saveRatesToStorage(currentUserId, rates)

  for (const e of rateEntries.value) e.dirty = false

  saveSuccess.value = true
  setTimeout(() => { saveSuccess.value = false }, 2000)

  // Re-apply updated rates to displayed activities
  activities.value = applyRates(rawActivities.value, rates)
}

// ── Journal entry parsing ─────────────────────────────────────────────────────

function parsePayrollLines(entries: Record<string, unknown>[]): PayrollLine[] {
  const lines: PayrollLine[] = []
  for (const je of entries) {
    const jeId = String(je.Id ?? '')
    const payDate = String(je.TxnDate ?? '')
    const rawLines = (je.Line as Array<Record<string, unknown>>) ?? []
    for (const line of rawLines) {
      const detail = line.JournalEntryLineDetail as Record<string, unknown> | undefined
      if (!detail) continue
      if (detail.PostingType !== 'Debit') continue
      const entity = detail.Entity as Record<string, unknown> | undefined
      if (!entity || entity.Type !== 'Employee') continue
      const entityRef = entity.EntityRef as { name?: string } | undefined
      const employeeName = entityRef?.name ?? 'Unknown'
      const amount = Number(line.Amount ?? 0)
      if (amount > 0) lines.push({ jeId, payDate, employeeName, amount })
    }
  }
  return lines
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function runReport() {
  if (!startDate.value || !endDate.value) {
    error.value = 'Please select both a start and end date.'
    return
  }

  loading.value = true
  error.value = null
  activities.value = []
  rawActivities.value = []
  journalLines.value = []
  jeUnavailable.value = false

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    currentUserId = session.user.id

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    }
    const body = JSON.stringify({ start_date: startDate.value, end_date: endDate.value })

    // Fire both QBO requests in parallel; JE failure is non-fatal
    const [taRes, jeRes] = await Promise.all([
      fetch(`${supabaseUrl}/functions/v1/qb-time-activities`, { method: 'POST', headers, body }),
      fetch(`${supabaseUrl}/functions/v1/qb-journal-entries`, { method: 'POST', headers, body })
        .catch(() => null),
    ])

    // ── Time activities (required) ──────────────────────────────────────────
    const taJson = await taRes.json()
    if (!taRes.ok) { error.value = taJson?.error ?? 'Request failed'; return }

    const raw: Record<string, unknown>[] = taJson?.QueryResponse?.TimeActivity ?? []

    rawActivities.value = raw
      .filter((t) => t.ItemRef != null)
      .map((t) => {
        const rawHours = Number(t.Hours ?? 0)
        const rawMinutes = Number(t.Minutes ?? 0)
        return {
          employeeName: (t.EmployeeRef as { name?: string })?.name ?? 'Unknown',
          serviceItem: (t.ItemRef as { name?: string })?.name ?? 'Unknown',
          date: String(t.TxnDate ?? ''),
          rawHours,
          rawMinutes,
          totalHours: rawHours + rawMinutes / 60,
        }
      })

    const rates = loadRatesFromStorage(currentUserId)
    buildRateEntries(rawActivities.value, rates)
    activities.value = applyRates(rawActivities.value, rates)

    if (rawActivities.value.length > 0) showRates.value = true

    // ── Journal entries (optional) ──────────────────────────────────────────
    if (jeRes && jeRes.ok) {
      const jeJson = await jeRes.json()
      const rawJEs: Record<string, unknown>[] = jeJson?.QueryResponse?.JournalEntry ?? []
      journalLines.value = parsePayrollLines(rawJEs)
    } else {
      jeUnavailable.value = true
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

// ── Computed ─────────────────────────────────────────────────────────────────

const grouped = computed<GroupedRows[]>(() => {
  const sorted = [...activities.value].sort((a, b) => {
    if (a.serviceItem !== b.serviceItem) return a.serviceItem.localeCompare(b.serviceItem)
    if (a.employeeName !== b.employeeName) return a.employeeName.localeCompare(b.employeeName)
    return a.date.localeCompare(b.date)
  })

  const groups: GroupedRows[] = []
  let current: GroupedRows | null = null

  for (const row of sorted) {
    if (!current || current.serviceItem !== row.serviceItem) {
      current = { serviceItem: row.serviceItem, rows: [], subtotalDecimalHours: 0, subtotalWages: 0 }
      groups.push(current)
    }
    current.rows.push(row)
    current.subtotalDecimalHours += row.totalHours
    if (!row.missingRate) current.subtotalWages += row.grossWages
  }

  return groups
})

const grandTotalHours = computed(() => activities.value.reduce((s, a) => s + a.totalHours, 0))
const grandTotalWages = computed(() =>
  activities.value.filter((a) => !a.missingRate).reduce((s, a) => s + a.grossWages, 0),
)
const rateEntriesGrouped = computed(() => {
  const groups: { serviceItem: string; entries: RateEntry[] }[] = []
  let current: { serviceItem: string; entries: RateEntry[] } | null = null
  for (const entry of rateEntries.value) {
    if (!current || current.serviceItem !== entry.serviceItem) {
      current = { serviceItem: entry.serviceItem, entries: [] }
      groups.push(current)
    }
    current.entries.push(entry)
  }
  return groups
})

const hasDirtyRates = computed(() => rateEntries.value.some((e) => e.dirty))
const hasMissingRates = computed(() => activities.value.some((a) => a.missingRate))

const employeeSummaries = computed<EmployeeSummary[]>(() => {
  if (!activities.value.length) return []

  // Calculated wages and missing-rate flag per employee (across all service items)
  const calcWages = new Map<string, number>()
  const missingRateFlag = new Map<string, boolean>()
  for (const a of activities.value) {
    calcWages.set(a.employeeName, (calcWages.get(a.employeeName) ?? 0) + (a.missingRate ? 0 : a.grossWages))
    if (a.missingRate) missingRateFlag.set(a.employeeName, true)
  }

  // Group payroll lines by employee → list of paychecks (one per JE id)
  const paychecksByEmployee = new Map<string, Map<string, Paycheck>>()
  for (const line of journalLines.value) {
    if (!paychecksByEmployee.has(line.employeeName)) {
      paychecksByEmployee.set(line.employeeName, new Map())
    }
    const byJe = paychecksByEmployee.get(line.employeeName)!
    const existing = byJe.get(line.jeId)
    if (existing) {
      existing.amount += line.amount
    } else {
      byJe.set(line.jeId, { jeId: line.jeId, payDate: line.payDate, amount: line.amount })
    }
  }

  // Build one summary per employee that appears in the time activities
  const employeeNames = [...new Set(activities.value.map((a) => a.employeeName))].sort()
  return employeeNames.map((name) => {
    const calculatedWages = calcWages.get(name) ?? 0
    const paychecks = paychecksByEmployee.has(name)
      ? [...paychecksByEmployee.get(name)!.values()].sort((a, b) => a.payDate.localeCompare(b.payDate))
      : []
    const actualWages = paychecks.reduce((s, p) => s + p.amount, 0)
    return {
      employeeName: name,
      calculatedWages,
      hasMissingRate: missingRateFlag.get(name) ?? false,
      paychecks,
      actualWages,
      difference: calculatedWages - actualWages,
      hasActual: paychecks.length > 0,
    }
  })
})

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtDuration(decimalHours: number) {
  const totalMins = Math.round(decimalHours * 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return ''
  const [, month, day] = d.split('-')
  return `${month}/${day}`
}

function fmtPayDate(d: string) {
  if (!d) return ''
  const [year, month, day] = d.split('-')
  return `${month}/${day}/${(year ?? '').slice(2)}`
}

// ── Export CSV ────────────────────────────────────────────────────────────────

function exportCSV() {
  if (!activities.value.length) return

  const headers = ['Service Item', 'Employee', 'Date', 'Duration', 'Rate', 'Amount']
  const rows = grouped.value.flatMap((g) =>
    g.rows.map((r) => [
      `"${r.serviceItem.replace(/"/g, '""')}"`,
      `"${r.employeeName.replace(/"/g, '""')}"`,
      fmtDate(r.date),
      fmtDuration(r.totalHours),
      r.hourlyRate != null ? r.hourlyRate.toFixed(2) : '',
      !r.missingRate ? r.grossWages.toFixed(2) : '',
    ]),
  )

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wages_by_service_item_${startDate.value}_${endDate.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function setPreset(preset: 'last-month' | 'last-3-months' | 'last-year') {
  const today = new Date()
  let start: Date, end: Date

  if (preset === 'last-month') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    end = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === 'last-3-months') {
    start = new Date(today.getFullYear(), today.getMonth() - 3, 1)
    end = new Date(today.getFullYear(), today.getMonth(), 0)
  } else {
    start = new Date(today.getFullYear() - 1, 0, 1)
    end = new Date(today.getFullYear() - 1, 11, 31)
  }

  startDate.value = start.toISOString().slice(0, 10)
  endDate.value = end.toISOString().slice(0, 10)
}

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) currentUserId = session.user.id
})
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
              class="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 transition">
              Wages
            </router-link>
            <router-link to="/invoice-payments"
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
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
    <div class="mx-auto max-w-7xl px-6 py-4 space-y-3">
      <!-- Action bar -->
      <div class="wages-action-bar">
        <div class="wages-action-group">
          <label>Start Date</label>
          <input v-model="startDate" type="date" class="wages-input" />
        </div>
        <div class="wages-action-group">
          <label>End Date</label>
          <input v-model="endDate" type="date" class="wages-input" />
        </div>
        <div class="wages-action-group">
          <label>Quick Select</label>
          <div class="wages-presets">
            <button class="wages-preset-btn" @click="setPreset('last-month')">Last Month</button>
            <button class="wages-preset-btn" @click="setPreset('last-3-months')">Last 3 Months</button>
            <button class="wages-preset-btn" @click="setPreset('last-year')">Last Year</button>
          </div>
        </div>
        <button class="wages-btn wages-btn-primary" :disabled="loading" @click="runReport">
          {{ loading ? 'Running...' : 'Run Report' }}
        </button>
        <div class="wages-action-spacer"></div>
        <button v-if="activities.length" class="wages-btn" @click="exportCSV">Export CSV</button>
      </div>

      <!-- Error -->
      <div v-if="error" class="wages-error">{{ error }}</div>

      <!-- Loading -->
      <div v-if="loading" class="wages-loading">
        <svg class="inline-block h-5 w-5 animate-spin text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading time activities...
      </div>

      <!-- Empty state -->
      <div v-if="!loading && !error && !activities.length && !showRates" class="wages-empty">
        <p>Select a date range and click Run Report</p>
      </div>

      <!-- Employee Rates panel -->
      <div v-if="showRates && rateEntries.length" class="rates-panel">
        <div class="rates-panel-header" @click="ratesExpanded = !ratesExpanded">
          <div class="flex items-center gap-2">
            <svg
              class="rates-chevron"
              :class="{ 'rates-chevron-open': ratesExpanded }"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm font-semibold text-gray-700">Employee Hourly Rates</span>
            <span v-if="hasMissingRates" class="rates-missing-badge">Missing rates — rows highlighted below</span>
          </div>
          <div class="flex items-center gap-2" @click.stop>
            <span v-if="saveSuccess" class="text-xs text-green-600 font-medium">Saved!</span>
            <button
              class="wages-btn wages-btn-primary"
              :disabled="!hasDirtyRates"
              @click="saveRates"
            >
              Save Rates
            </button>
          </div>
        </div>
        <div v-show="ratesExpanded" class="rates-table-scroll">
          <table class="rates-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="text-right">Hourly Rate</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in rateEntriesGrouped" :key="group.serviceItem">
                <tr class="rates-group-header">
                  <td colspan="2">{{ group.serviceItem }}</td>
                </tr>
                <tr
                  v-for="entry in group.entries"
                  :key="`${entry.serviceItem}||${entry.employeeName}`"
                  :class="{ 'rates-row-dirty': entry.dirty }"
                >
                  <td class="pl-8">{{ entry.employeeName }}</td>
                  <td class="text-right">
                    <div class="rate-input-wrap">
                      <span class="rate-dollar">$</span>
                      <input
                        v-model="entry.hourlyRate"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        class="rate-input"
                        @input="entry.dirty = true"
                      />
                      <span class="rate-suffix">/hr</span>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Missing-rate warning banner -->
      <div v-if="activities.length && hasMissingRates" class="wages-warn">
        <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        Some employees have no rate saved. Their rows are highlighted and excluded from totals. Enter rates above and click Save Rates.
      </div>

      <!-- Results table -->
      <div v-if="activities.length" class="wages-table-scroll">
        <table class="wages-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th class="text-right">Duration</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in grouped" :key="group.serviceItem">
              <!-- Group header -->
              <tr class="wages-group-header">
                <td colspan="5">{{ group.serviceItem }}</td>
              </tr>
              <!-- Data rows -->
              <tr
                v-for="(row, ri) in group.rows"
                :key="`${group.serviceItem}-${ri}`"
                :class="[ri % 2 === 0 ? 'wages-row-stripe' : '', row.missingRate ? 'wages-row-missing' : '']"
              >
                <td class="pl-8">
                  <span v-if="row.missingRate" class="warn-icon" title="No hourly rate set for this employee">⚠</span>
                  {{ row.employeeName }}
                </td>
                <td>{{ fmtDate(row.date) }}</td>
                <td class="text-right tabular-nums">{{ fmtDuration(row.totalHours) }}</td>
                <td class="text-right tabular-nums">
                  <span v-if="row.hourlyRate != null">{{ fmtMoney(row.hourlyRate) }}/hr</span>
                  <span v-else class="text-amber-600 text-xs">—</span>
                </td>
                <td class="text-right tabular-nums">
                  <span v-if="!row.missingRate">{{ fmtMoney(row.grossWages) }}</span>
                  <span v-else class="text-amber-600 text-xs">—</span>
                </td>
              </tr>
              <!-- Subtotal -->
              <tr class="wages-subtotal">
                <td colspan="2" class="pl-8">Total:</td>
                <td class="text-right tabular-nums">{{ fmtDuration(group.subtotalDecimalHours) }}</td>
                <td></td>
                <td class="text-right tabular-nums">{{ fmtMoney(group.subtotalWages) }}</td>
              </tr>
            </template>
            <!-- Grand total -->
            <tr class="wages-grand-total">
              <td colspan="2">Grand Total:</td>
              <td class="text-right tabular-nums">{{ fmtDuration(grandTotalHours) }}</td>
              <td></td>
              <td class="text-right tabular-nums">{{ fmtMoney(grandTotalWages) }}</td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Action bar ────────────────────────────────────────────────────────────── */

.wages-action-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  flex-wrap: wrap;
}

.wages-action-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wages-action-group label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.wages-action-spacer {
  flex: 1;
}

.wages-presets {
  display: flex;
  gap: 4px;
}

.wages-preset-btn {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
}

.wages-preset-btn:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
  color: #3730a3;
}

.wages-input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #333;
  outline: none;
}

.wages-input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 1px #4f46e533;
}

.wages-btn {
  padding: 5px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}

.wages-btn:hover {
  background: #f3f4f6;
}

.wages-btn-primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
  font-weight: 600;
}

.wages-btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.wages-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Employee Rates panel ───────────────────────────────────────────────────── */

.rates-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.rates-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  gap: 8px;
  flex-wrap: wrap;
  cursor: pointer;
  user-select: none;
}

.rates-panel-header:hover {
  background: #f3f4f6;
}

.rates-chevron {
  width: 14px;
  height: 14px;
  color: #9ca3af;
  flex-shrink: 0;
  transition: transform 0.2s ease;
  transform: rotate(0deg);
}

.rates-chevron-open {
  transform: rotate(90deg);
}

.rates-missing-badge {
  font-size: 11px;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 999px;
  padding: 1px 8px;
}

.rates-table-scroll {
  overflow-x: auto;
}

.rates-table {
  width: 100%;
  border-collapse: collapse;
}

.rates-table thead tr {
  border-bottom: 1px solid #e5e7eb;
}

.rates-table th {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rates-table td {
  padding: 3px 10px;
  font-size: 12px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}

.rates-group-header td {
  padding: 4px 10px 2px;
  font-size: 11px;
  font-weight: 700;
  color: #374151;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.rates-group-header:first-child td {
  border-top: none;
}

.rates-row-dirty td {
  background: #eff6ff;
}

.rate-input-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 2px 6px;
  background: #fff;
}

.rate-input-wrap:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 1px #4f46e533;
}

.rate-dollar {
  font-size: 12px;
  color: #6b7280;
}

.rate-suffix {
  font-size: 12px;
  color: #6b7280;
}

.rate-input {
  width: 72px;
  border: none;
  outline: none;
  font-size: 13px;
  color: #111827;
  text-align: right;
  background: transparent;
}

/* ── Warning banner ─────────────────────────────────────────────────────────── */

.wages-warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 8px;
  font-size: 13px;
}

/* ── Results table ──────────────────────────────────────────────────────────── */

.wages-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.wages-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.wages-table thead tr {
  border-bottom: 2px solid #d1d5db;
  background: #f9fafb;
}

.wages-table th {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-align: left;
  white-space: nowrap;
}

.wages-table td {
  padding: 4px 10px;
  font-size: 12px;
  color: #333;
  border-bottom: 1px solid #f3f4f6;
}

.wages-group-header td {
  font-weight: 700;
  color: #333;
  padding-top: 7px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
}

.wages-row-stripe {
  background: #f9fafb;
}

.wages-row-missing td {
  background: #fffbeb !important;
  color: #78350f;
}

.warn-icon {
  margin-right: 4px;
  color: #d97706;
  font-size: 12px;
}

.wages-subtotal td {
  font-weight: 600;
  color: #374151;
  border-top: 1px solid #d1d5db;
  border-bottom: 1px solid #d1d5db;
  padding-top: 4px;
  padding-bottom: 4px;
  background: #fafafa;
  font-size: 12px;
}

.wages-grand-total td {
  font-weight: 700;
  color: #111827;
  border-top: 2px solid #6b7280;
  padding-top: 5px;
  padding-bottom: 5px;
  background: #f3f4f6;
  font-size: 13px;
}

.text-right {
  text-align: right;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* ── States ─────────────────────────────────────────────────────────────────── */

.wages-loading {
  text-align: center;
  padding: 24px 16px;
  color: #6b7280;
  font-size: 13px;
}

.wages-error {
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  font-size: 13px;
}

.wages-empty {
  text-align: center;
  padding: 64px 16px;
  color: #9ca3af;
  font-size: 14px;
}

</style>
