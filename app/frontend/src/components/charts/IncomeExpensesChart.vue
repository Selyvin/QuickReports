<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { QBAccount } from '@/stores/quickbooks'

use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{ accounts: QBAccount[] }>()

const option = computed(() => {
  const totalIncome = props.accounts
    .filter((a) => a.account_type === 'Income')
    .reduce((s, a) => s + a.current_balance, 0)

  const totalExpenses = props.accounts
    .filter((a) => a.account_type === 'Expense')
    .reduce((s, a) => s + a.current_balance, 0)

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.name}<br/>$${p.value.toLocaleString()} (${p.percent}%)`,
    },
    legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        data: [
          { value: totalIncome, name: 'Total Income', itemStyle: { color: '#10b981' } },
          { value: totalExpenses, name: 'Total Expenses', itemStyle: { color: '#ef4444' } },
        ],
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      },
    ],
  }
})
</script>

<template>
  <v-chart :option="option" autoresize class="h-full w-full" />
</template>
