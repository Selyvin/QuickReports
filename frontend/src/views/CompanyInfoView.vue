<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useQBConnect } from '@/composables/useQBConnect'

const router = useRouter()
const { connected, connecting, error: connectError, connect } = useQBConnect()

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  CompanyName: string
  LegalName?: string
  CompanyAddr?: { Line1?: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string; Country?: string }
  CustomerCommunicationAddr?: { Line1?: string; City?: string }
  Email?: { Address?: string }
  PrimaryPhone?: { FreeFormNumber?: string }
  WebAddr?: { URI?: string }
  FiscalYearStartMonth?: string
  TaxYearStartMonth?: string
  Country?: string
  SupportedLanguages?: string
  domain?: string
}

interface Preferences {
  ProductAndServicesPrefs?: {
    ForPurchase?: boolean
    ForSales?: boolean
    QuantityOnHand?: boolean
    QuantityWithPriceAndRate?: boolean
  }
  SalesFormsPrefs?: {
    AllowShipping?: boolean
    DefaultTerms?: { value?: string }
    UsingPriceLevels?: boolean
    AllowDeposit?: boolean
    AllowDiscount?: boolean
    CustomField?: unknown[]
    ETransactionPaymentEnabled?: boolean
    ETransactionEnabledStatus?: string
  }
  VendorAndPurchasesPrefs?: {
    TrackingByCustomer?: boolean
    BillableExpenseTracking?: boolean
    POEnabled?: boolean
  }
  TimeTrackingPrefs?: {
    WorkWeekStartDate?: string
    MarkTimeEntriesBillable?: boolean
    ShowBillRateToAll?: boolean
    UseServices?: boolean
    BillCustomers?: boolean
  }
  TaxPrefs?: {
    PartnerTaxEnabled?: boolean
    TaxGroupCodeRef?: { value?: string }
  }
  AccountingInfoPrefs?: {
    FirstMonthOfFiscalYear?: string
    UseAccountNumbers?: boolean
    ClassTrackingPerTxn?: boolean
    ClassTrackingPerTxnLine?: boolean
    TrackDepartments?: boolean
    DepartmentTerminology?: string
    CustomerTerminology?: string
  }
  CurrencyPrefs?: {
    MultiCurrencyEnabled?: boolean
    HomeCurrency?: { value?: string }
  }
  OtherPrefs?: {
    NameValue?: Array<{ Name: string; Value: string }>
  }
}

// ── State ────────────────────────────────────────────────────────────────────

const loading = ref(false)
const error = ref<string | null>(null)
const companyInfo = ref<CompanyInfo | null>(null)
const preferences = ref<Preferences | null>(null)

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCompanyInfo() {
  loading.value = true
  error.value = null

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const res = await supabase.functions.invoke('qb-company-info')

    if (res.error) throw new Error(res.error.message)
    if (res.data?.error) throw new Error(typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error))

    companyInfo.value = res.data.companyInfo
    preferences.value = res.data.preferences
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}

onMounted(fetchCompanyInfo)

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAddress(addr?: CompanyInfo['CompanyAddr']): string {
  if (!addr) return '—'
  return [addr.Line1, addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(', ') || '—'
}

function featureLabel(enabled?: boolean): string {
  return enabled ? 'Enabled' : 'Disabled'
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
              class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition">
              Create Bill
            </router-link>
            <router-link to="/company"
              class="rounded-md px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-700 transition">
              Company
            </router-link>
          </nav>
        </div>
        <div class="flex items-center gap-3">
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
          <button class="text-sm text-gray-400 hover:text-gray-600 transition" @click="signOut">
            Sign out
          </button>
        </div>
      </div>
    </header>

    <div v-if="connectError" class="bg-red-50 px-6 py-3 text-sm text-red-700 border-b border-red-100">
      {{ connectError }}
    </div>

    <!-- Main -->
    <main class="mx-auto max-w-7xl px-6 py-8 space-y-6">

      <!-- Error -->
      <div v-if="error" class="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div class="rounded-xl bg-white border border-gray-100 shadow-sm p-6 space-y-3 animate-pulse">
          <div class="h-4 w-1/3 rounded bg-gray-100" />
          <div class="h-4 w-1/2 rounded bg-gray-100" />
          <div class="h-4 w-2/5 rounded bg-gray-100" />
        </div>
        <div class="rounded-xl bg-white border border-gray-100 shadow-sm p-6 space-y-3 animate-pulse">
          <div class="h-4 w-1/4 rounded bg-gray-100" />
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div v-for="i in 6" :key="i" class="h-16 rounded-lg bg-gray-100" />
          </div>
        </div>
      </template>

      <template v-if="!loading && companyInfo">
        <!-- Company Info Card -->
        <div class="rounded-xl bg-white border border-gray-100 shadow-sm">
          <div class="border-b border-gray-100 px-6 py-4">
            <h2 class="text-sm font-semibold text-gray-900">Company Information</h2>
          </div>
          <div class="px-6 py-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Company Name</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.CompanyName || '—' }}</p>
            </div>
            <div v-if="companyInfo.LegalName">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Legal Name</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.LegalName }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Address</p>
              <p class="mt-1 text-sm text-gray-900">{{ formatAddress(companyInfo.CompanyAddr) }}</p>
            </div>
            <div v-if="companyInfo.Email?.Address">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Email</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.Email.Address }}</p>
            </div>
            <div v-if="companyInfo.PrimaryPhone?.FreeFormNumber">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Phone</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.PrimaryPhone.FreeFormNumber }}</p>
            </div>
            <div v-if="companyInfo.WebAddr?.URI">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Website</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.WebAddr.URI }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Fiscal Year Start</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.FiscalYearStartMonth || '—' }}</p>
            </div>
            <div v-if="companyInfo.Country">
              <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">Country</p>
              <p class="mt-1 text-sm text-gray-900">{{ companyInfo.Country }}</p>
            </div>
          </div>
        </div>

        <!-- Features / Permissions Card -->
        <div v-if="preferences" class="rounded-xl bg-white border border-gray-100 shadow-sm">
          <div class="border-b border-gray-100 px-6 py-4">
            <h2 class="text-sm font-semibold text-gray-900">Features &amp; Permissions</h2>
            <p class="text-xs text-gray-400 mt-0.5">Reflects your QuickBooks subscription and company settings</p>
          </div>
          <div class="px-6 py-5 space-y-6">

            <!-- Products & Services -->
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Products &amp; Services</h3>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">For Sales</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.ProductAndServicesPrefs?.ForSales ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.ProductAndServicesPrefs?.ForSales) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">For Purchase</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.ProductAndServicesPrefs?.ForPurchase ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.ProductAndServicesPrefs?.ForPurchase) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Inventory Tracking</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.ProductAndServicesPrefs?.QuantityOnHand ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.ProductAndServicesPrefs?.QuantityOnHand) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Price &amp; Rate</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.ProductAndServicesPrefs?.QuantityWithPriceAndRate ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.ProductAndServicesPrefs?.QuantityWithPriceAndRate) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Accounting -->
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Accounting</h3>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Account Numbers</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.AccountingInfoPrefs?.UseAccountNumbers ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.AccountingInfoPrefs?.UseAccountNumbers) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Class Tracking</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.AccountingInfoPrefs?.ClassTrackingPerTxn ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.AccountingInfoPrefs?.ClassTrackingPerTxn) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Department Tracking</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.AccountingInfoPrefs?.TrackDepartments ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.AccountingInfoPrefs?.TrackDepartments) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Multi-Currency</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.CurrencyPrefs?.MultiCurrencyEnabled ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.CurrencyPrefs?.MultiCurrencyEnabled) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Time Tracking -->
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Time Tracking</h3>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Time Tracking</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.TimeTrackingPrefs?.UseServices ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.TimeTrackingPrefs?.UseServices) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Bill Customers</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.TimeTrackingPrefs?.BillCustomers ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.TimeTrackingPrefs?.BillCustomers) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Billable Time</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.TimeTrackingPrefs?.MarkTimeEntriesBillable ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.TimeTrackingPrefs?.MarkTimeEntriesBillable) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Work Week Start</p>
                  <p class="mt-1 text-sm font-medium text-gray-700">
                    {{ preferences.TimeTrackingPrefs?.WorkWeekStartDate || '—' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Vendor & Purchases -->
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Vendor &amp; Purchases</h3>
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Purchase Orders</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.VendorAndPurchasesPrefs?.POEnabled ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.VendorAndPurchasesPrefs?.POEnabled) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Billable Expenses</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.VendorAndPurchasesPrefs?.BillableExpenseTracking ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.VendorAndPurchasesPrefs?.BillableExpenseTracking) }}
                  </p>
                </div>
                <div class="rounded-lg border border-gray-100 p-3">
                  <p class="text-xs text-gray-400">Track by Customer</p>
                  <p class="mt-1 text-sm font-medium"
                    :class="preferences.VendorAndPurchasesPrefs?.TrackingByCustomer ? 'text-emerald-600' : 'text-gray-400'">
                    {{ featureLabel(preferences.VendorAndPurchasesPrefs?.TrackingByCustomer) }}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </template>

    </main>
  </div>
</template>
