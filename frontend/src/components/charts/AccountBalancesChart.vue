<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { QBAccount } from '@/stores/quickbooks'

use([BarChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer])

const props = defineProps<{ accounts: QBAccount[] }>()

const option = computed(() => {
  const bankAccounts = props.accounts.filter(
    (a) => a.account_type === 'Bank' || a.account_type === 'Accounts Receivable',
  )
  return {
    tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}<br/>$${p[0].value.toLocaleString()}` },
    grid: { left: 16, right: 16, bottom: 8, top: 8, containLabel: true },
    xAxis: { type: 'category', data: bankAccounts.map((a) => a.name), axisLabel: { fontSize: 12 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    series: [
      {
        type: 'bar',
        data: bankAccounts.map((a) => a.current_balance),
        itemStyle: { color: '#4f46e5', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 60,
      },
    ],
  }
})
</script>

<template>
  <v-chart :option="option" autoresize class="h-full w-full" />
</template>
