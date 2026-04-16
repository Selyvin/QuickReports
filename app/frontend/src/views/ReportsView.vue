<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader.vue'

const router = useRouter()

// ── Report catalog ──────────────────────────────────────────────────────────

interface ReportDef {
  id: string
  name: string
  category: string
}

const REPORTS: ReportDef[] = [
  { id: 'ProfitAndLoss',       name: 'Profit and Loss',         category: 'Profit & Loss' },
  { id: 'ProfitAndLossDetail', name: 'Profit and Loss Detail',  category: 'Profit & Loss' },
  { id: 'BalanceSheet',        name: 'Balance Sheet',           category: 'Balance Sheet & Cash' },
  { id: 'CashFlow',            name: 'Cash Flow',               category: 'Balance Sheet & Cash' },
  { id: 'TrialBalance',        name: 'Trial Balance',           category: 'Balance Sheet & Cash' },
  { id: 'ARAgingSummary',      name: 'A/R Aging Summary',       category: 'Accounts Receivable' },
  { id: 'ARAgingDetail',       name: 'A/R Aging Detail',        category: 'Accounts Receivable' },
  { id: 'CustomerBalance',     name: 'Customer Balance',        category: 'Accounts Receivable' },
  { id: 'CustomerBalanceDetail', name: 'Customer Balance Detail', category: 'Accounts Receivable' },
  { id: 'CustomerIncome',      name: 'Customer Income',         category: 'Accounts Receivable' },
  { id: 'APAgingSummary',      name: 'A/P Aging Summary',       category: 'Accounts Payable' },
  { id: 'APAgingDetail',       name: 'A/P Aging Detail',        category: 'Accounts Payable' },
  { id: 'VendorBalance',       name: 'Vendor Balance',          category: 'Accounts Payable' },
  { id: 'VendorBalanceDetail', name: 'Vendor Balance Detail',   category: 'Accounts Payable' },
  { id: 'VendorExpenses',      name: 'Vendor Expenses',         category: 'Accounts Payable' },
  { id: 'CustomerSales',     name: 'Sales by Customer',       category: 'Sales' },
  { id: 'ItemSales',      name: 'Sales by Product',        category: 'Sales' },
  { id: 'SalesByProductMonthly', name: 'Sales by Product/Service (Monthly)', category: 'Sales' },
  { id: 'SalesByDepartment',   name: 'Sales by Department',     category: 'Sales' },
  { id: 'SalesByClassSummary', name: 'Sales by Class Summary',  category: 'Sales' },
  { id: 'TransactionList',            name: 'Transaction List',              category: 'Transactions' },
  { id: 'TransactionListByCustomer',  name: 'Transaction List by Customer',  category: 'Transactions' },
  { id: 'TransactionListByVendor',    name: 'Transaction List by Vendor',    category: 'Transactions' },
  { id: 'TransactionListWithSplits',  name: 'Transaction List with Splits',  category: 'Transactions' },
  { id: 'GeneralLedger',              name: 'General Ledger',                category: 'Transactions' },
  { id: 'JournalReport',              name: 'Journal',                       category: 'Transactions' },
  { id: 'InventoryValuationSummary',  name: 'Inventory Valuation Summary',   category: 'Inventory' },
  { id: 'InventoryValuationDetail',   name: 'Inventory Valuation Detail',    category: 'Inventory' },
  { id: 'AccountListDetail',  name: 'Account List Detail',  category: 'Other' },
  { id: 'TaxSummary',         name: 'Tax Summary',          category: 'Other' },
]

const CATEGORIES = [...new Set(REPORTS.map((r) => r.category))]

// Reports that support the summarize_column_by parameter
const REPORTS_WITH_COLUMN_BY = new Set([
  'ProfitAndLoss',
  'BalanceSheet',
  'CashFlow',
  'TrialBalance',
  'VendorExpenses',
  'CustomerIncome',
  'CustomerSales',
  'ItemSales',
  'SalesByDepartment',
  'SalesByClassSummary',
])

const COLUMN_BY_OPTIONS = [
  { value: 'Total', label: 'Total Only' },
  { value: 'Month', label: 'Month' },
  { value: 'Quarter', label: 'Quarter' },
  { value: 'Year', label: 'Year' },
  { value: 'Customers', label: 'Customer' },
  { value: 'Vendors', label: 'Vendor' },
  { value: 'Classes', label: 'Class' },
  { value: 'Departments', label: 'Department' },
  { value: 'ProductsAndServices', label: 'Product/Service' },
]

// Custom reports: map to the underlying QB report ID and define special behaviours
const CUSTOM_REPORT_QB_ID: Record<string, string> = {
  SalesByProductMonthly: 'ItemSales',
}

// Reports that are locked to Month column breakdown and show only Money columns
const AMOUNT_ONLY_MONTHLY_REPORTS = new Set(['SalesByProductMonthly'])

// ── Sidebar state ───────────────────────────────────────────────────────────

const search = ref('')
const selectedCategory = ref<string | null>(null)
const selectedReport = ref<ReportDef | null>(null)

const filteredReports = computed(() => {
  const q = search.value.toLowerCase()
  return REPORTS.filter((r) => {
    const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    const matchesCat = !selectedCategory.value || r.category === selectedCategory.value
    return matchesSearch && matchesCat
  })
})

const supportsColumnBy = computed(() =>
  selectedReport.value ? REPORTS_WITH_COLUMN_BY.has(selectedReport.value.id) : false
)

function selectReport(report: ReportDef) {
  selectedReport.value = report
  reportData.value = null
  error.value = null
  drillDown.value = null
  drillDownData.value = null
  summarizeColumnBy.value = AMOUNT_ONLY_MONTHLY_REPORTS.has(report.id) ? 'Month' : 'Total'
}

// ── Period presets ───────────────────────────────────────────────────────────

type PeriodPreset = { label: string; start: string; end: string }

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getPeriodPresets(): PeriodPreset[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  return [
    { label: 'This Month', start: toISO(new Date(y, m, 1)), end: toISO(new Date(y, m + 1, 0)) },
    { label: 'This Quarter', start: toISO(new Date(y, Math.floor(m / 3) * 3, 1)), end: toISO(new Date(y, Math.floor(m / 3) * 3 + 3, 0)) },
    { label: 'This Year', start: `${y}-01-01`, end: `${y}-12-31` },
    { label: 'Last Month', start: toISO(new Date(y, m - 1, 1)), end: toISO(new Date(y, m, 0)) },
    { label: 'Last Quarter', start: toISO(new Date(y, Math.floor(m / 3) * 3 - 3, 1)), end: toISO(new Date(y, Math.floor(m / 3) * 3, 0)) },
    { label: 'Last Year', start: `${y - 1}-01-01`, end: `${y - 1}-12-31` },
  ]
}

const periodPresets = getPeriodPresets()

// ── Report params state ─────────────────────────────────────────────────────

const startDate = ref('')
const endDate = ref('')
const accountingMethod = ref<'Accrual' | 'Cash'>('Accrual')
const summarizeColumnBy = ref('Total')
const loading = ref(false)
const error = ref<string | null>(null)
const reportData = ref<QBReport | null>(null)
const companyName = ref('Your Company')

// Drill-down state
const drillDown = ref<{ accountName: string; accountId: string } | null>(null)
const drillDownData = ref<QBReport | null>(null)
const drillDownLoading = ref(false)
const savedScrollY = ref(0)

// ── QB Report response types ─────────────────────────────────────────────────

interface ColData {
  value: string
  id?: string
}

interface DataRow {
  type: 'Data'
  ColData: ColData[]
}

interface SectionRow {
  type: 'Section'
  group?: string
  Header?: { ColData: ColData[] }
  Rows?: { Row: QBRow[] }
  Summary?: { ColData: ColData[] }
}

type QBRow = DataRow | SectionRow

interface QBColumnDef {
  ColTitle: string
  ColType: string
  MetaData?: { Name: string; Value: string }[]
  Columns?: { Column: QBColumnDef[] }
}

interface QBReport {
  Header: {
    ReportName: string
    StartPeriod?: string
    EndPeriod?: string
    Currency?: string
    ReportBasis?: string
  }
  Columns: {
    Column: QBColumnDef[]
  }
  Rows: {
    Row: QBRow[]
  }
}

// ── Flat table rendering ─────────────────────────────────────────────────────

interface FlatRow {
  cells: { value: string; id?: string }[]
  depth: number
  kind: 'header' | 'data' | 'summary'
}

function flattenRows(rows: QBRow[], depth = 0): FlatRow[] {
  const result: FlatRow[] = []
  for (const row of rows) {
    if (row.type === 'Section') {
      if (row.Header?.ColData) {
        result.push({ cells: row.Header.ColData.map((c) => ({ value: c.value, id: c.id })), depth, kind: 'header' })
      }
      if (row.Rows?.Row) {
        result.push(...flattenRows(row.Rows.Row, depth + 1))
      }
      if (row.Summary?.ColData) {
        result.push({ cells: row.Summary.ColData.map((c) => ({ value: c.value, id: c.id })), depth, kind: 'summary' })
      }
    } else if (row.type === 'Data') {
      result.push({ cells: row.ColData.map((c) => ({ value: c.value, id: c.id })), depth, kind: 'data' })
    }
  }
  return result
}

const flatRows = computed(() => {
  if (!reportData.value?.Rows?.Row) return []
  return flattenRows(reportData.value.Rows.Row)
})

// ── Column structure ─────────────────────────────────────────────────────────

// Descriptor for each leaf column (maps to one positional cell in a row)
interface FlatColDef {
  parentIdx: number    // index in top-level Columns.Column
  parentTitle: string  // e.g. "Jan 2026" or "" for label
  subTitle: string     // e.g. "Quantity", "" when no nesting
  colType: string
  rowIdx: number       // positional index into row.cells
}

// Whether the response uses nested sub-columns (e.g. Month breakdown)
const hasNestedColumns = computed(() =>
  (reportData.value?.Columns.Column ?? []).some(c => c.Columns?.Column?.length)
)

// Flat list of all leaf columns mapped to their row cell index
const flatColDefs = computed((): FlatColDef[] => {
  if (!reportData.value) return []
  const result: FlatColDef[] = []
  let rowIdx = 0
  const topCols = reportData.value.Columns.Column
  for (let pi = 0; pi < topCols.length; pi++) {
    const col = topCols[pi]
    if (col.Columns?.Column?.length) {
      for (const sub of col.Columns.Column) {
        result.push({ parentIdx: pi, parentTitle: col.ColTitle, subTitle: sub.ColTitle, colType: sub.ColType, rowIdx })
        rowIdx++
      }
    } else {
      result.push({ parentIdx: pi, parentTitle: col.ColTitle, subTitle: '', colType: col.ColType, rowIdx })
      rowIdx++
    }
  }
  return result
})

// Unique sub-metric names (Quantity, Amount, % of Sales, Avg Price …) for visibility UI
const uniqueSubMetrics = computed((): string[] => {
  if (!hasNestedColumns.value) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const d of flatColDefs.value) {
    if (d.subTitle && !seen.has(d.subTitle)) {
      seen.add(d.subTitle)
      result.push(d.subTitle)
    }
  }
  return result
})

const isAmountOnlyReport = computed(() =>
  !!selectedReport.value && AMOUNT_ONLY_MONTHLY_REPORTS.has(selectedReport.value.id)
)

// ── Column visibility ────────────────────────────────────────────────────────

const showColumnsPanel = ref(false)
// Nested case: track hidden sub-metric titles (Quantity, % of Sales, …)
const hiddenSubMetrics = ref<Set<string>>(new Set())
// Flat case: track hidden column rowIdx values
const hiddenFlatIndices = ref<Set<number>>(new Set())

watch(reportData, () => {
  hiddenSubMetrics.value = new Set()
  hiddenFlatIndices.value = new Set()
  showColumnsPanel.value = false
})

function toggleSubMetric(metric: string) {
  const s = new Set(hiddenSubMetrics.value)
  if (s.has(metric)) s.delete(metric)
  else s.add(metric)
  hiddenSubMetrics.value = s
}

function toggleFlatCol(rowIdx: number) {
  const s = new Set(hiddenFlatIndices.value)
  if (s.has(rowIdx)) s.delete(rowIdx)
  else s.add(rowIdx)
  hiddenFlatIndices.value = s
}

// Leaf columns to actually render (after applying visibility)
const visibleFlatColDefs = computed((): FlatColDef[] => {
  if (!reportData.value) return []
  if (hasNestedColumns.value) {
    return flatColDefs.value.filter(d =>
      d.parentIdx === 0 || !hiddenSubMetrics.value.has(d.subTitle)
    )
  }
  return flatColDefs.value.filter(d =>
    d.rowIdx === 0 || !hiddenFlatIndices.value.has(d.rowIdx)
  )
})

// Parent group spans for the 2-row header (nested columns only)
const visibleParentGroups = computed(() => {
  if (!hasNestedColumns.value) return []
  const groups: { parentIdx: number; parentTitle: string; count: number }[] = []
  for (const d of visibleFlatColDefs.value) {
    const last = groups[groups.length - 1]
    if (last && last.parentIdx === d.parentIdx) {
      last.count++
    } else {
      groups.push({ parentIdx: d.parentIdx, parentTitle: d.parentTitle, count: 1 })
    }
  }
  return groups
})

// ── Format helpers ───────────────────────────────────────────────────────────

function formatMoney(value: string, currency = 'USD'): string {
  if (!value || isNaN(Number(value))) return value || ''
  const num = Number(value)
  const abs = Math.abs(num)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(abs)
  return num < 0 ? `(${formatted})` : formatted
}

function formatCell(value: string, colType: string): string {
  if (!value) return ''
  if (colType === 'Money') return formatMoney(value, reportData.value?.Header.Currency ?? 'USD')
  return value
}

// Used only for the drill-down table which is always flat
const drillDownColTypes = computed(() => drillDownColumns.value.map(c => c.ColType))
function isDrillDownMoneyColumn(index: number): boolean {
  return (drillDownColTypes.value[index] ?? '') === 'Money'
}

function formatDateRange(): string {
  if (!reportData.value?.Header) return ''
  const h = reportData.value.Header
  if (h.StartPeriod && h.EndPeriod) return `${h.StartPeriod} to ${h.EndPeriod}`
  if (h.EndPeriod) return `As of ${h.EndPeriod}`
  return ''
}

function applyPeriod(preset: PeriodPreset) {
  startDate.value = preset.start
  endDate.value = preset.end
}

// ── Run report ───────────────────────────────────────────────────────────────

async function runReport() {
  if (!selectedReport.value) return
  loading.value = true
  error.value = null
  reportData.value = null
  drillDown.value = null
  drillDownData.value = null

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const reportId = selectedReport.value.id
    const qbReportId = CUSTOM_REPORT_QB_ID[reportId] ?? reportId
    const isAmountMonthly = AMOUNT_ONLY_MONTHLY_REPORTS.has(reportId)

    const params: Record<string, string> = {
      accounting_method: accountingMethod.value,
    }
    if (startDate.value) params.start_date = startDate.value
    if (endDate.value) params.end_date = endDate.value
    if (isAmountMonthly) {
      params.summarize_column_by = 'Month'
    } else if (summarizeColumnBy.value && summarizeColumnBy.value !== 'Total' && supportsColumnBy.value) {
      params.summarize_column_by = summarizeColumnBy.value
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${supabaseUrl}/functions/v1/qb-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ report: qbReportId, params }),
    })

    const json = await res.json()
    if (!res.ok) {
      error.value = json?.error?.Fault?.Error?.[0]?.Message ?? json?.error ?? 'Request failed'
      return
    }

    reportData.value = json as QBReport
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

// ── Drill-down ───────────────────────────────────────────────────────────────

async function handleDrillDown(accountName: string, accountId: string | undefined) {
  if (!accountId) return

  savedScrollY.value = window.scrollY
  drillDown.value = { accountName, accountId }
  drillDownData.value = null
  drillDownLoading.value = true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const params: Record<string, string> = {
      accounting_method: accountingMethod.value,
    }
    if (startDate.value) params.start_date = startDate.value
    if (endDate.value) params.end_date = endDate.value

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const res = await fetch(`${supabaseUrl}/functions/v1/qb-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ report: 'TransactionList', params }),
    })

    const json = await res.json()
    if (!res.ok) {
      error.value = json?.error?.Fault?.Error?.[0]?.Message ?? json?.error ?? 'Drill-down failed'
      drillDown.value = null
      return
    }

    drillDownData.value = json as QBReport
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
    drillDown.value = null
  } finally {
    drillDownLoading.value = false
  }
}

const drillDownColumns = computed(() => drillDownData.value?.Columns.Column ?? [])
const drillDownRows = computed(() => {
  if (!drillDownData.value?.Rows?.Row) return []
  return flattenRows(drillDownData.value.Rows.Row)
})

function backToReport() {
  drillDown.value = null
  drillDownData.value = null
  nextTick(() => {
    window.scrollTo(0, savedScrollY.value)
  })
}

// ── Export / Print ───────────────────────────────────────────────────────────

function exportCSV() {
  if (!reportData.value) return
  const defs = visibleFlatColDefs.value
  const headers = defs.map(d => d.subTitle ? `${d.parentTitle} ${d.subTitle}` : (d.parentTitle || 'Name'))
  const rows = flatRows.value.map((r) =>
    defs.map((def, i) => {
      const cell = r.cells[def.rowIdx]
      const val = i === 0 ? (cell?.value ?? '') : formatCell(cell?.value ?? '', def.colType)
      return `"${val.replace(/"/g, '""')}"`
    })
  )
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedReport.value?.id ?? 'report'}_${startDate.value || 'all'}_${endDate.value || 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function printReport() {
  window.print()
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <AppHeader class="no-print" />

    <div class="mx-auto max-w-7xl px-6 py-8 flex gap-6">
      <!-- Sidebar: report picker -->
      <aside class="w-72 shrink-0 space-y-4 no-print">
        <!-- Search -->
        <div class="relative">
          <svg class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            v-model="search"
            type="text"
            placeholder="Search reports…"
            class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
          />
        </div>

        <!-- Category pills -->
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="cat in CATEGORIES"
            :key="cat"
            class="rounded-full px-2.5 py-0.5 text-xs font-medium transition"
            :class="selectedCategory === cat
              ? 'bg-green-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-green-300'"
            @click="selectedCategory = selectedCategory === cat ? null : cat"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Report list -->
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          <template v-if="filteredReports.length">
            <button
              v-for="r in filteredReports"
              :key="r.id"
              class="w-full px-4 py-2.5 text-left text-sm transition"
              :class="selectedReport?.id === r.id
                ? 'bg-green-50 text-green-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'"
              @click="selectReport(r)"
            >
              {{ r.name }}
              <span class="block text-xs font-normal" :class="selectedReport?.id === r.id ? 'text-green-400' : 'text-gray-400'">
                {{ r.category }}
              </span>
            </button>
          </template>
          <p v-else class="px-4 py-6 text-center text-sm text-gray-400">No reports match your search.</p>
        </div>
      </aside>

      <!-- Main panel -->
      <div class="flex-1 min-w-0">
        <!-- Empty state -->
        <div v-if="!selectedReport" class="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-24 text-center">
          <svg class="h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-sm font-medium text-gray-500">Select a report from the list</p>
          <p class="mt-1 text-xs text-gray-400">29 QuickBooks reports available</p>
        </div>

        <template v-else>
          <!-- Drill-down view -->
          <template v-if="drillDown">
            <div class="qb-breadcrumb">
              <a href="#" @click.prevent="backToReport">&larr; Back to {{ selectedReport.name }}</a>
            </div>

            <div class="qb-report-header">
              <div class="qb-company">{{ companyName }}</div>
              <div class="qb-report-title">Transaction List by Account</div>
              <div class="qb-report-subtitle">{{ drillDown.accountName }}</div>
              <div v-if="formatDateRange()" class="qb-report-dates">{{ formatDateRange() }}</div>
            </div>

            <div v-if="drillDownLoading" class="qb-loading">Loading transactions...</div>

            <div v-if="drillDownData" class="qb-table-scroll">
              <table class="qb-table">
                <thead>
                  <tr>
                    <th
                      v-for="(col, i) in drillDownColumns"
                      :key="i"
                      :class="{ 'text-right': i > 0 && col.ColType === 'Money' }"
                    >
                      {{ col.ColTitle }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, ri) in drillDownRows"
                    :key="ri"
                    :class="{
                      'qb-row-summary': row.kind === 'summary',
                      'qb-row-header': row.kind === 'header',
                      'qb-row-stripe': row.kind === 'data' && ri % 2 === 0,
                    }"
                  >
                    <td
                      v-for="(cell, ci) in row.cells"
                      :key="ci"
                      :class="{
                        'text-right': ci > 0 && isDrillDownMoneyColumn(ci),
                        'tabular-nums': isDrillDownMoneyColumn(ci),
                      }"
                      :style="ci === 0 ? `padding-left: ${row.depth * 16 + 8}px` : ''"
                    >
                      {{ ci === 0 ? cell.value : formatCell(cell.value, drillDownColumns[ci]?.ColType ?? '') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- Normal report view -->
          <template v-else>
            <!-- Action bar -->
            <div class="qb-action-bar">
              <div class="qb-action-group">
                <label>From</label>
                <input v-model="startDate" type="date" class="qb-input" />
              </div>
              <div class="qb-action-group">
                <label>To</label>
                <input v-model="endDate" type="date" class="qb-input" />
              </div>
              <div class="qb-action-group">
                <label>Period</label>
                <select class="qb-input" @change="($event.target as HTMLSelectElement).value && applyPeriod(periodPresets[Number(($event.target as HTMLSelectElement).value)])">
                  <option value="">Custom</option>
                  <option v-for="(p, i) in periodPresets" :key="i" :value="i">{{ p.label }}</option>
                </select>
              </div>
              <div v-if="supportsColumnBy && !isAmountOnlyReport" class="qb-action-group">
                <label>Display columns by</label>
                <select v-model="summarizeColumnBy" class="qb-input">
                  <option v-for="opt in COLUMN_BY_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div v-if="isAmountOnlyReport" class="qb-action-group">
                <label>Display columns by</label>
                <span class="qb-input qb-input-locked">Month</span>
              </div>
              <div class="qb-action-group">
                <label>Basis</label>
                <select v-model="accountingMethod" class="qb-input">
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <button class="qb-btn qb-btn-primary" :disabled="loading" @click="runReport">
                {{ loading ? 'Running...' : 'Run Report' }}
              </button>
              <div class="qb-action-spacer"></div>
              <div v-if="reportData" class="qb-dropdown-wrapper no-print">
                <button class="qb-btn" :class="{ 'qb-btn-active': showColumnsPanel }" @click.stop="showColumnsPanel = !showColumnsPanel">
                  Columns ▾
                </button>
                <div v-if="showColumnsPanel" class="qb-columns-dropdown">
                  <div class="qb-columns-dropdown-title">Show / Hide Columns</div>
                  <!-- Nested columns: toggle by sub-metric type -->
                  <template v-if="hasNestedColumns">
                    <label v-for="metric in uniqueSubMetrics" :key="metric" class="qb-col-toggle">
                      <input type="checkbox" :checked="!hiddenSubMetrics.has(metric)" @change="toggleSubMetric(metric)" />
                      {{ metric }}
                    </label>
                  </template>
                  <!-- Flat columns: toggle individually (skip index 0 = label column) -->
                  <template v-else>
                    <label v-for="def in flatColDefs.slice(1)" :key="def.rowIdx" class="qb-col-toggle">
                      <input type="checkbox" :checked="!hiddenFlatIndices.has(def.rowIdx)" @change="toggleFlatCol(def.rowIdx)" />
                      {{ def.parentTitle }}
                    </label>
                  </template>
                </div>
              </div>
              <!-- Transparent overlay to close dropdown on outside click -->
              <div v-if="showColumnsPanel" class="qb-dropdown-overlay" @click="showColumnsPanel = false"></div>
              <button v-if="reportData" class="qb-btn" @click="exportCSV">Export CSV</button>
              <button v-if="reportData" class="qb-btn" @click="printReport">Print</button>
            </div>

            <!-- Error -->
            <div v-if="error" class="qb-error">{{ error }}</div>

            <!-- Empty / waiting -->
            <div v-if="!reportData && !loading && !error" class="qb-empty">
              <p>{{ selectedReport.name }}</p>
              <p class="qb-empty-hint">Set your date range and click Run Report.</p>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="qb-loading">Loading report...</div>

            <!-- Report results -->
            <template v-if="reportData">
              <div class="qb-report-header">
                <div class="qb-company">{{ companyName }}</div>
                <div class="qb-report-title">{{ reportData.Header.ReportName }}</div>
                <div v-if="formatDateRange()" class="qb-report-dates">{{ formatDateRange() }}</div>
                <div v-if="reportData.Header.ReportBasis" class="qb-report-basis">{{ reportData.Header.ReportBasis }} Basis</div>
              </div>

              <div class="qb-table-scroll">
                <table class="qb-table">
                  <thead>
                    <!-- Two-row header for nested columns (e.g. Month breakdown) -->
                    <template v-if="hasNestedColumns">
                      <tr>
                        <th
                          v-for="group in visibleParentGroups"
                          :key="group.parentIdx"
                          :colspan="group.count"
                          :class="{ 'text-center': group.count > 1 }"
                        >
                          {{ group.parentTitle }}
                        </th>
                      </tr>
                      <tr>
                        <th
                          v-for="(def, vi) in visibleFlatColDefs"
                          :key="vi"
                          :class="{ 'text-right': vi > 0 }"
                        >
                          {{ def.subTitle }}
                        </th>
                      </tr>
                    </template>
                    <!-- Single-row header for flat columns -->
                    <template v-else>
                      <tr>
                        <th
                          v-for="(def, vi) in visibleFlatColDefs"
                          :key="vi"
                          :class="{ 'text-right': vi > 0 }"
                        >
                          {{ def.parentTitle }}
                        </th>
                      </tr>
                    </template>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, ri) in flatRows"
                      :key="ri"
                      :class="{
                        'qb-row-summary': row.kind === 'summary',
                        'qb-row-header': row.kind === 'header',
                        'qb-row-stripe': row.kind === 'data' && ri % 2 === 0,
                      }"
                    >
                      <td
                        v-for="(def, vi) in visibleFlatColDefs"
                        :key="vi"
                        :class="{
                          'text-right': vi > 0 && def.colType === 'Money',
                          'tabular-nums': vi > 0 && def.colType === 'Money',
                        }"
                        :style="vi === 0 ? `padding-left: ${row.depth * 16 + 8}px` : ''"
                      >
                        <template v-if="vi > 0 && def.colType === 'Money'">
                          <a
                            v-if="row.cells[def.rowIdx]?.id || row.cells[def.rowIdx]?.value"
                            href="#"
                            class="qb-amount-link"
                            @click.prevent="handleDrillDown(row.cells[0]?.value ?? '', row.cells[def.rowIdx]?.id)"
                          >
                            {{ formatCell(row.cells[def.rowIdx]?.value ?? '', def.colType) || '$0.00' }}
                          </a>
                          <span v-else>{{ formatCell(row.cells[def.rowIdx]?.value ?? '', def.colType) }}</span>
                        </template>
                        <template v-else>
                          {{ vi === 0 ? (row.cells[def.rowIdx]?.value ?? '') : formatCell(row.cells[def.rowIdx]?.value ?? '', def.colType) }}
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Action bar ────────────────────────────────────────────────────────────── */

.qb-action-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.qb-action-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.qb-action-group label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.qb-action-spacer {
  flex: 1;
}

.qb-input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #333;
  outline: none;
}

.qb-input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 1px #4f46e533;
}

.qb-input-locked {
  display: inline-block;
  background: #f3f4f6;
  color: #6b7280;
  cursor: default;
  user-select: none;
}

.qb-btn {
  padding: 5px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}

.qb-btn:hover {
  background: #f3f4f6;
}

.qb-btn-primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4f46e5;
  font-weight: 600;
}

.qb-btn-primary:hover {
  background: #4338ca;
}

.qb-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Report header ─────────────────────────────────────────────────────────── */

.qb-report-header {
  text-align: center;
  padding: 20px 16px 12px;
}

.qb-company {
  font-size: 14px;
  font-weight: 700;
  color: #333;
}

.qb-report-title {
  font-size: 16px;
  font-weight: 700;
  color: #333;
  margin-top: 2px;
}

.qb-report-subtitle {
  font-size: 13px;
  color: #555;
  margin-top: 2px;
}

.qb-report-dates {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.qb-report-basis {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

/* ── Breadcrumb ────────────────────────────────────────────────────────────── */

.qb-breadcrumb {
  padding: 10px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 12px 12px 0 0;
}

.qb-breadcrumb a {
  color: #4f46e5;
  text-decoration: none;
  font-size: 13px;
}

.qb-breadcrumb a:hover {
  text-decoration: underline;
}

/* ── Table ─────────────────────────────────────────────────────────────────── */

.qb-table-scroll {
  overflow-x: auto;
  margin-bottom: 32px;
  -webkit-overflow-scrolling: touch;
}

.qb-table {
  width: 100%;
  border-collapse: collapse;
}

/* Sticky first column when table overflows horizontally */
.qb-table-scroll .qb-table th:first-child,
.qb-table-scroll .qb-table td:first-child {
  position: sticky;
  left: 0;
  background: inherit;
  z-index: 1;
}

.qb-table-scroll .qb-table thead th:first-child {
  background: #f9fafb;
  z-index: 2;
}

.qb-table thead tr {
  border-bottom: 2px solid #d1d5db;
}

.qb-table th {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-align: left;
  white-space: nowrap;
}

.qb-table td {
  padding: 4px 12px;
  font-size: 13px;
  color: #333;
  border-bottom: 1px solid #f3f4f6;
}

.qb-row-stripe {
  background: #f9fafb;
}

.qb-row-stripe td:first-child {
  background: #f9fafb;
}

.qb-row-header td {
  font-weight: 700;
  color: #333;
  padding-top: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.qb-row-summary td {
  font-weight: 700;
  color: #333;
  border-top: 1px solid #d1d5db;
  border-bottom: 1px solid #d1d5db;
  padding-top: 6px;
  padding-bottom: 6px;
  background: #fff;
}

/* Non-stripe data rows need white bg for sticky column */
.qb-table tbody tr:not(.qb-row-stripe):not(.qb-row-header):not(.qb-row-summary) td {
  background: #fff;
}

.text-right {
  text-align: right;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* ── Amount links ──────────────────────────────────────────────────────────── */

.qb-amount-link {
  color: #4f46e5;
  text-decoration: underline;
  cursor: pointer;
}

.qb-amount-link:hover {
  color: #3730a3;
}

/* ── States ────────────────────────────────────────────────────────────────── */

.qb-loading {
  text-align: center;
  padding: 48px 16px;
  color: #6b7280;
  font-size: 14px;
}

.qb-error {
  margin: 0 0 12px;
  padding: 10px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  font-size: 13px;
}

.qb-empty {
  text-align: center;
  padding: 64px 16px;
  color: #6b7280;
}

.qb-empty p:first-child {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.qb-empty-hint {
  font-size: 13px;
  margin-top: 4px;
  color: #9ca3af;
}

/* ── Print ─────────────────────────────────────────────────────────────────── */

@media print {
  .no-print {
    display: none !important;
  }

  .qb-table td,
  .qb-table th {
    padding: 2px 8px;
  }

  .qb-report-header {
    padding: 8px 0;
  }
}

/* ── Columns dropdown ──────────────────────────────────────────────────────── */

.qb-dropdown-wrapper {
  position: relative;
}

.qb-dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 49;
}

.qb-columns-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 50;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 8px 0;
  min-width: 180px;
  max-height: 320px;
  overflow-y: auto;
}

.qb-columns-dropdown-title {
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 12px 8px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 4px;
}

.qb-col-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
}

.qb-col-toggle:hover {
  background: #f9fafb;
}

.qb-col-toggle input[type='checkbox'] {
  accent-color: #4f46e5;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.qb-btn-active {
  background: #eef2ff;
  border-color: #a5b4fc;
  color: #4f46e5;
}
</style>
