import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'
import DashboardView from '@/views/DashboardView.vue'
import LoginView from '@/views/LoginView.vue'
import CallbackView from '@/views/CallbackView.vue'
import ReportsView from '@/views/ReportsView.vue'
import EstimateProgressView from '@/views/EstimateProgressView.vue'
import WagesByServiceItemView from '@/views/WagesByServiceItemView.vue'
import InvoicePaymentsView from '@/views/InvoicePaymentsView.vue'
import CompanyInfoView from '@/views/CompanyInfoView.vue'
import CreateBillView from '@/views/CreateBillView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/estimates',
      name: 'estimates',
      component: EstimateProgressView,
      meta: { requiresAuth: true },
    },
    {
      path: '/wages',
      name: 'wages',
      component: WagesByServiceItemView,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoice-payments',
      name: 'invoice-payments',
      component: InvoicePaymentsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/create-bill',
      name: 'create-bill',
      component: CreateBillView,
      meta: { requiresAuth: true },
    },
    {
      path: '/company',
      name: 'company',
      component: CompanyInfoView,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/callback',
      name: 'callback',
      component: CallbackView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { name: 'login' }

  return true
})

export default router
