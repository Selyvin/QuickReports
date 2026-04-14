import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface QBAccount {
  id: string
  name: string
  account_type: string
  account_sub_type: string
  current_balance: number
  currency_ref: string
  active: boolean
}

export interface QBTransaction {
  id: string
  date: string
  amount: number
  type: 'income' | 'expense'
  description: string
  account_name: string
}

export const useQuickBooksStore = defineStore('quickbooks', () => {
  const accounts = ref<QBAccount[]>([])
  const transactions = ref<QBTransaction[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAccounts() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('qb_accounts')
        .select('*')
        .order('account_type')
      if (err) throw err
      accounts.value = data ?? []
    } catch (e) {
      error.value = (e as Error).message
      // Fall back to demo data so the UI is always usable
      accounts.value = getDemoAccounts()
    } finally {
      loading.value = false
    }
  }

  async function fetchTransactions() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('qb_transactions')
        .select('*')
        .order('date', { ascending: false })
        .limit(100)
      if (err) throw err
      transactions.value = data ?? []
    } catch (e) {
      error.value = (e as Error).message
      transactions.value = getDemoTransactions()
    } finally {
      loading.value = false
    }
  }

  return { accounts, transactions, loading, error, fetchAccounts, fetchTransactions }
})

function getDemoAccounts(): QBAccount[] {
  return [
    { id: '1', name: 'Checking', account_type: 'Bank', account_sub_type: 'Checking', current_balance: 24580.5, currency_ref: 'USD', active: true },
    { id: '2', name: 'Savings', account_type: 'Bank', account_sub_type: 'Savings', current_balance: 51200.0, currency_ref: 'USD', active: true },
    { id: '3', name: 'Accounts Receivable', account_type: 'Accounts Receivable', account_sub_type: 'AccountsReceivable', current_balance: 18340.75, currency_ref: 'USD', active: true },
    { id: '4', name: 'Accounts Payable', account_type: 'Accounts Payable', account_sub_type: 'AccountsPayable', current_balance: -9200.0, currency_ref: 'USD', active: true },
    { id: '5', name: 'Sales Revenue', account_type: 'Income', account_sub_type: 'SalesOfProductIncome', current_balance: 142000.0, currency_ref: 'USD', active: true },
    { id: '6', name: 'Service Revenue', account_type: 'Income', account_sub_type: 'ServiceFeeIncome', current_balance: 38500.0, currency_ref: 'USD', active: true },
    { id: '7', name: 'Office Supplies', account_type: 'Expense', account_sub_type: 'OfficeGeneralAdministrativeExpenses', current_balance: 3200.0, currency_ref: 'USD', active: true },
    { id: '8', name: 'Payroll Expenses', account_type: 'Expense', account_sub_type: 'PayrollExpenses', current_balance: 62000.0, currency_ref: 'USD', active: true },
    { id: '9', name: 'Rent', account_type: 'Expense', account_sub_type: 'Rent', current_balance: 18000.0, currency_ref: 'USD', active: true },
    { id: '10', name: 'Utilities', account_type: 'Expense', account_sub_type: 'Utilities', current_balance: 4800.0, currency_ref: 'USD', active: true },
  ]
}

function getDemoTransactions(): QBTransaction[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  const data: QBTransaction[] = []
  months.forEach((_m, i) => {
    data.push({ id: `i${i}`, date: `2025-${String(i + 1).padStart(2, '0')}-01`, amount: 25000 + Math.random() * 10000, type: 'income', description: 'Revenue', account_name: 'Sales Revenue' })
    data.push({ id: `e${i}`, date: `2025-${String(i + 1).padStart(2, '0')}-01`, amount: 14000 + Math.random() * 4000, type: 'expense', description: 'Operating costs', account_name: 'Payroll Expenses' })
  })
  return data
}
