<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { QBTransaction } from '@/stores/quickbooks'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{ transactions: QBTransaction[] }>()

const option = computed(() => {
  const byMonth: Record<string, { income: number; expense: number }> = {}

  for (const tx of props.transactions) {
    const month = tx.date.slice(0, 7) // YYYY-MM
    if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 }
    if (tx.type === 'income') byMonth[month].income += tx.amount
    else byMonth[month].expense += tx.amount
  }

  const months = Object.keys(byMonth).sort()
  const labels = months.map((m) => {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'short', year: '2-digit' })
  })

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) =>
        params.map((p: any) => `${p.seriesName}: $${Number(p.value).toLocaleString()}`).join('<br/>'),
    },
    legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 12 } },
    grid: { left: 16, right: 16, bottom: 32, top: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    series: [
      {
        name: 'Income',
        type: 'line',
        smooth: true,
        data: months.map((m) => byMonth[m].income),
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16,185,129,0.1)' },
      },
      {
        name: 'Expenses',
        type: 'line',
        smooth: true,
        data: months.map((m) => byMonth[m].expense),
        itemStyle: { color: '#ef4444' },
        areaStyle: { color: 'rgba(239,68,68,0.1)' },
      },
    ],
  }
})
</script>

<template>
  <v-chart :option="option" autoresize class="h-full w-full" />
</template>
