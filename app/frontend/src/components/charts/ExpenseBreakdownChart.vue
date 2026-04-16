<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { QBAccount } from '@/stores/quickbooks'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ accounts: QBAccount[] }>()

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6']

const option = computed(() => {
  const expenses = props.accounts.filter((a) => a.account_type === 'Expense')
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => `${p[0].name}<br/>$${Number(p[0].value).toLocaleString()}`,
    },
    grid: { left: 16, right: 16, bottom: 8, top: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    yAxis: { type: 'category', data: expenses.map((a) => a.name), axisLabel: { fontSize: 12 } },
    series: [
      {
        type: 'bar',
        data: expenses.map((a, i) => ({
          value: a.current_balance,
          itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 40,
      },
    ],
  }
})
</script>

<template>
  <v-chart :option="option" autoresize class="h-full w-full" />
</template>
