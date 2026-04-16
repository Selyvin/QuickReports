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
    } finally {
      loading.value = false
    }
  }

  return { accounts, transactions, loading, error, fetchAccounts, fetchTransactions }
})
