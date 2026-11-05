<!-- MyLineChart.vue -->
<template>
  <div
    class="chart-wrapper"
    :style="{
      height: typeof height === 'number' ? `${height}px` : height,
      width: typeof width === 'number' ? `${width}px` : width
    }"
  >
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

// Register Chart.js parts once
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type Dataset = {
  label: string
  data: number[]
  backgroundColor?: string
  borderColor?: string
  fill?: boolean | 'start' | 'end' | string
  tension?: number
  pointRadius?: number
}

interface Props {
  labels: string[]
  datasets: Dataset[]
  responsive?: boolean
  maintainAspectRatio?: boolean
  height?: number | string
  width?: number | string
  showLegend?: boolean
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  // defaults mirror your example
  labels: () => ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
  datasets: () => [
    {
      label: 'Data One',
      backgroundColor: '#f87979',
      borderColor: '#f87979',
      data: [40, 39, 10, 40, 39, 80, 40],
      fill: false,
      tension: 0.3
    }
  ],
  responsive: true,
  maintainAspectRatio: false,
  height: '300px',
  width: '100%',
  showLegend: true,
  title: ''
})

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets
}))

const chartOptions = computed((): any => ({
  responsive: props.responsive,
  maintainAspectRatio: props.maintainAspectRatio,
  plugins: {
    legend: {
      display: props.showLegend
    },
    title: {
      display: !!props.title,
      text: props.title
    },
    tooltip: {
      intersect: false,
      mode: 'index'
    }
  },
  interaction: { intersect: false, mode: 'nearest' },
  scales: {
    x: { display: true },
    y: { display: true, beginAtZero: true }
  }
}))
</script>

<style scoped>
.chart-wrapper {
  position: relative; /* required when maintainAspectRatio: false */
}
</style>
