<script setup lang="ts">
const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/reports', label: 'Reports' },
  { to: '/estimates', label: 'Estimates' },
  { to: '/wages', label: 'Wages' },
  { to: '/invoice-payments', label: 'Invoice Payments' },
  { to: '/create-bill', label: 'Create Bill' },
  { to: '/company', label: 'Company' },
]
</script>

<template>
  <header class="border-b border-gray-200 bg-white px-6 py-4">
    <div class="mx-auto max-w-7xl flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600">
          <svg class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-semibold text-gray-900">KeeprKit</h1>
          <p class="text-xs text-gray-500">QuickBooks, the way it should work.</p>
        </div>
        <nav class="ml-6 flex items-center gap-1">
          <router-link
            v-for="link in links"
            :key="link.to"
            v-slot="{ isExactActive, href, navigate }"
            :to="link.to"
            custom
          >
            <a
              :href="href"
              :class="isExactActive
                ? 'rounded-md px-3 py-1.5 text-sm font-medium bg-green-50 text-green-700 transition'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition'"
              @click="navigate"
            >{{ link.label }}</a>
          </router-link>
        </nav>
      </div>
      <slot />
    </div>
  </header>
</template>
